import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, uuid } from "@/lib/http";
import { confirmRound } from "@/lib/ops";

/**
 * Xác nhận / khôi phục (order rác) / từ chối lượt gọi của khách (BUSINESS_PROCESS 4.2).
 * Xác nhận lượt đầu của bàn chưa có phiên sẽ tạo phiên.
 */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("order");
    const roundId = uuid(params.id, "Mã lượt gọi");
    const body = await readJson(request);
    const action = String(body.action ?? "");
    const actorForAudit = auditActor(actor, "order");

    if (action === "confirm") {
        const sessionId = await withTransaction(actor.db, (client) => confirmRound(client, actor.settings, roundId, actor.account.id, actorForAudit));
        return ok({ sessionId });
    }
    if (action === "reject") {
        const reason = optionalText(body.reason, { max: 300, label: "Lý do" });
        await withTransaction(actor.db, async (client) => {
            const result = await client.query(
                `UPDATE order_rounds SET status = 'rejected', rejected_at = now(), rejected_by = $2, reject_reason = $3
                 WHERE id = $1 AND status IN ('pending') RETURNING session_id`,
                [roundId, actor.account.id, reason],
            );
            if (!result.rows[0]) throw new HttpError(409, "Lượt gọi không còn ở trạng thái chờ xác nhận.");
            await audit(client, actorForAudit, { action: "round.rejected", entityType: "order_round", entityId: roundId, sessionId: result.rows[0].session_id, reason });
        });
        return ok({ ok: true });
    }
    throw new HttpError(400, "Thao tác không hợp lệ.");
});
