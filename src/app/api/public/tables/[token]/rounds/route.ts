import { audit } from "@/lib/audit";
import { withTransaction } from "@/lib/db";
import { guestActor, joinActiveSession, tableByToken } from "@/lib/guest";
import { HttpError, ok, readJson, route, text } from "@/lib/http";
import { insertItems, parseCart, snapshotMenu } from "@/lib/ops";
import { loadSettings } from "@/lib/settings";
import { getTenantDb } from "@/lib/tenant";

/**
 * Khách gửi lượt gọi món. Luôn ở trạng thái CHỜ NHÂN VIÊN XÁC NHẬN rồi mới vào bếp:
 * - bàn chưa có phiên: lượt đầu, phiên chỉ được tạo khi nhân viên xác nhận (4.2);
 * - bàn đã có phiên: config confirm_all_customer_orders (mặc định BẬT) → vẫn chờ xác nhận.
 *   Chế độ TẮT chưa chốt quy trình (BUSINESS_PROCESS Q4) nên hiện cũng chờ xác nhận.
 */
export const POST = route<{ token: string }>(async (request, params) => {
    const { db } = await getTenantDb();
    const settings = await loadSettings(db);
    const table = await tableByToken(db, params.token);
    const actor = await guestActor();
    const body = await readJson(request);
    const lines = parseCart(body.items);
    const idempotencyKey = text(body.idempotencyKey, { max: 100, required: true, label: "Mã xác nhận lượt gọi" });

    const result = await withTransaction(db, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [idempotencyKey]);
        const existing = (await client.query("SELECT id FROM order_rounds WHERE idempotency_key = $1", [idempotencyKey])).rows[0];
        if (existing) return { roundId: existing.id, duplicate: true };

        const recent = await client.query(
            `SELECT count(*)::int AS count FROM order_rounds
             WHERE customer_device_key_hash = $1 AND status = 'pending' AND created_at > now() - interval '10 minutes'`,
            [actor.deviceKeyHash],
        );
        if (recent.rows[0].count >= 5) throw new HttpError(429, "Bạn có nhiều lượt gọi đang chờ xác nhận. Vui lòng đợi nhân viên.");

        const { sessionId, kicked } = await joinActiveSession(client, table.id, actor);
        if (kicked) throw new HttpError(403, "Thiết bị này đã bị nhân viên loại khỏi bàn. Vui lòng gọi nhân viên.");

        const menu = await snapshotMenu(client, settings, lines);
        const round = (await client.query(
            `INSERT INTO order_rounds (session_id, table_id, source, idempotency_key, customer_device_key_hash)
             VALUES ($1, $2, 'customer', $3, $4) RETURNING id`,
            [sessionId, table.id, idempotencyKey, actor.deviceKeyHash],
        )).rows[0];
        // Món của lượt chờ xác nhận chưa gắn phiên; gắn khi nhân viên xác nhận.
        await insertItems(client, round.id, null, lines, menu);
        await audit(client, actor, {
            action: "round.created",
            entityType: "order_round",
            entityId: round.id,
            sessionId,
            after: { table: table.name, items: lines.map((line) => ({ name: menu.get(line.menuItemId)?.name, quantity: line.quantity })) },
        });
        return { roundId: round.id, duplicate: false };
    });
    return ok({ ...result, status: "pending" }, result.duplicate ? 200 : 201);
});
