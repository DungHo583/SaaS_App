import { audit } from "@/lib/audit";
import { auditActor, confirmPin, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, text, uuid } from "@/lib/http";

/**
 * Đóng phiên bất thường (khách bỏ về...): nhân viên ghi lý do + PIN → bàn trống NGAY,
 * yêu cầu chờ owner duyệt → ghi nhận thất thoát (BUSINESS_PROCESS 4.1).
 */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("cashier");
    const sessionId = uuid(params.id, "Mã phiên");
    const body = await readJson(request);
    const reason = text(body.reason, { max: 500, required: true, label: "Lý do" });
    await confirmPin(actor, body.pin);

    await withTransaction(actor.db, async (client) => {
        const session = (await client.query("SELECT status FROM table_sessions WHERE id = $1 FOR UPDATE", [sessionId])).rows[0];
        if (session?.status !== "open") throw new HttpError(409, "Phiên không còn mở.");
        const total = (await client.query(
            "SELECT coalesce(sum(line_total), 0)::int AS total FROM order_items WHERE session_id = $1 AND status <> 'cancelled'",
            [sessionId],
        )).rows[0].total;
        await client.query(
            "UPDATE table_sessions SET status = 'abnormal_pending', closed_at = now(), closed_by = $2, abnormal_reason = $3 WHERE id = $1",
            [sessionId, actor.account.id, reason],
        );
        const approval = (await client.query(
            `INSERT INTO approvals (approval_type, session_id, amount, reason, requested_by)
             VALUES ('abnormal_close', $1, $2, $3, $4) RETURNING id`,
            [sessionId, total, reason, actor.account.id],
        )).rows[0];
        await audit(client, auditActor(actor, "cashier"), {
            action: "session.abnormal_requested",
            entityType: "approval",
            entityId: approval.id,
            sessionId,
            after: { amount: total },
            reason,
            retention: "financial",
        });
    });
    return ok({ ok: true });
});
