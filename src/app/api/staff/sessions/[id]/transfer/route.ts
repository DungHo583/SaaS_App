import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, uuid } from "@/lib/http";
import { activeSessionForTable } from "@/lib/ops";

/** Chuyển bàn: DI CHUYỂN chính phiên sang bàn mới (Q5) — không sao chép món. */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("order");
    const sessionId = uuid(params.id, "Mã phiên");
    const tableId = uuid((await readJson(request)).tableId, "Bàn chuyển đến");

    await withTransaction(actor.db, async (client) => {
        const session = (await client.query("SELECT status FROM table_sessions WHERE id = $1 FOR UPDATE", [sessionId])).rows[0];
        if (session?.status !== "open") throw new HttpError(409, "Phiên không còn mở.");
        if (await activeSessionForTable(client, tableId)) throw new HttpError(409, "Bàn chuyển đến đang có khách.");
        const from = (await client.query(
            `UPDATE session_tables SET detached_at = now(), detached_by = $2
             WHERE session_id = $1 AND detached_at IS NULL RETURNING table_id`,
            [sessionId, actor.account.id],
        )).rows;
        await client.query(
            "INSERT INTO session_tables (session_id, table_id, reason, attached_by) VALUES ($1, $2, 'transfer', $3)",
            [sessionId, tableId, actor.account.id],
        );
        await audit(client, auditActor(actor, "order"), {
            action: "session.transferred",
            entityType: "table_session",
            entityId: sessionId,
            sessionId,
            before: { tables: from.map((row) => row.table_id) },
            after: { tables: [tableId] },
        });
    });
    return ok({ ok: true });
});
