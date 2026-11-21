import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, uuid } from "@/lib/http";

/**
 * Gộp bàn: phiên này (B) gộp VÀO phiên đích (A). Món, lượt gọi, máy khách chuyển sang A;
 * bàn của B gắn vào A → 2 mã QR cùng trỏ 1 phiên. B chuyển trạng thái 'merged'.
 */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("order");
    const sourceId = uuid(params.id, "Mã phiên");
    const targetId = uuid((await readJson(request)).targetSessionId, "Phiên gộp vào");
    if (sourceId === targetId) throw new HttpError(400, "Không thể gộp phiên vào chính nó.");

    await withTransaction(actor.db, async (client) => {
        const sessions = (await client.query(
            "SELECT id, status FROM table_sessions WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
            [[sourceId, targetId]],
        )).rows;
        if (sessions.length !== 2 || sessions.some((session) => session.status !== "open")) throw new HttpError(409, "Cả hai phiên phải đang mở.");
        const bills = await client.query("SELECT 1 FROM bills WHERE session_id = ANY($1::uuid[])", [[sourceId, targetId]]);
        if (bills.rowCount) throw new HttpError(409, "Một trong hai bàn đã lập phiếu thanh toán. Huỷ phiếu tạm tính trước khi gộp.");

        await client.query("UPDATE order_items SET session_id = $2 WHERE session_id = $1", [sourceId, targetId]);
        await client.query("UPDATE order_rounds SET session_id = $2 WHERE session_id = $1", [sourceId, targetId]);
        await client.query(
            `INSERT INTO session_devices (session_id, device_key_hash, user_agent, joined_at)
             SELECT $2, device_key_hash, user_agent, joined_at FROM session_devices WHERE session_id = $1 AND kicked_at IS NULL
             ON CONFLICT (session_id, device_key_hash) DO NOTHING`,
            [sourceId, targetId],
        );
        const tables = (await client.query(
            "SELECT table_id FROM session_tables WHERE session_id = $1 AND detached_at IS NULL",
            [sourceId],
        )).rows.map((row) => row.table_id);
        // Trigger tự tháo bàn của B khi B rời trạng thái 'open'.
        await client.query(
            "UPDATE table_sessions SET status = 'merged', merged_into_id = $2, closed_at = now(), closed_by = $3 WHERE id = $1",
            [sourceId, targetId, actor.account.id],
        );
        for (const tableId of tables) {
            await client.query(
                "INSERT INTO session_tables (session_id, table_id, reason, attached_by) VALUES ($1, $2, 'merge', $3)",
                [targetId, tableId, actor.account.id],
            );
        }
        await audit(client, auditActor(actor, "order"), {
            action: "session.merged",
            entityType: "table_session",
            entityId: sourceId,
            sessionId: targetId,
            after: { merged_into: targetId, tables },
        });
    });
    return ok({ sessionId: targetId });
});
