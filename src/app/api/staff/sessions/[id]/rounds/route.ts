import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, text, uuid } from "@/lib/http";
import { insertItems, parseCart, snapshotMenu } from "@/lib/ops";
import { confirmRound } from "@/lib/ops";

/** Nhân viên gọi món cho phiên: lượt gọi xác nhận ngay, món vào bếp. Idempotency key chống gửi trùng. */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("order");
    const sessionId = uuid(params.id, "Mã phiên");
    const body = await readJson(request);
    const lines = parseCart(body.items);
    const idempotencyKey = text(body.idempotencyKey, { max: 100, required: true, label: "Mã xác nhận lượt gọi" });
    const actorForAudit = auditActor(actor, "order");

    const result = await withTransaction(actor.db, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [idempotencyKey]);
        const existing = (await client.query("SELECT id FROM order_rounds WHERE idempotency_key = $1", [idempotencyKey])).rows[0];
        if (existing) return { roundId: existing.id, duplicate: true };

        const session = (await client.query("SELECT status FROM table_sessions WHERE id = $1 FOR UPDATE", [sessionId])).rows[0];
        if (!session) throw new HttpError(404, "Không tìm thấy phiên.");
        if (session.status !== "open") throw new HttpError(409, "Phiên đã đóng.");

        const menu = await snapshotMenu(client, actor.settings, lines);
        const round = (await client.query(
            "INSERT INTO order_rounds (session_id, source, idempotency_key, created_by) VALUES ($1, 'staff', $2, $3) RETURNING id",
            [sessionId, idempotencyKey, actor.account.id],
        )).rows[0];
        await insertItems(client, round.id, sessionId, lines, menu);
        await audit(client, actorForAudit, {
            action: "round.created",
            entityType: "order_round",
            entityId: round.id,
            sessionId,
            after: { items: lines.map((line) => ({ ...line, name: menu.get(line.menuItemId)?.name })) },
        });
        await confirmRound(client, actor.settings, round.id, actor.account.id, actorForAudit);
        return { roundId: round.id, duplicate: false };
    });
    return ok(result, result.duplicate ? 200 : 201);
});
