import { audit } from "@/lib/audit";
import { auditActor, confirmPin, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, uuid } from "@/lib/http";

/** Xác nhận đã nhận chuyển khoản / huỷ khoản thanh toán đang chờ (bắt buộc PIN). */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("cashier");
    const paymentId = uuid(params.id, "Mã thanh toán");
    const body = await readJson(request);
    const action = String(body.action ?? "");
    if (!["confirm", "cancel"].includes(action)) throw new HttpError(400, "Thao tác không hợp lệ.");
    const reason = optionalText(body.reason, { max: 300, label: "Lý do" });
    if (action === "cancel" && !reason) throw new HttpError(400, "Huỷ khoản thanh toán phải ghi lý do.");
    await confirmPin(actor, body.pin);

    await withTransaction(actor.db, async (client) => {
        const payment = (await client.query(
            action === "confirm"
                ? "UPDATE payments SET status = 'confirmed', confirmed_at = now(), confirmed_by = $2 WHERE id = $1 AND status = 'pending' RETURNING *"
                : "UPDATE payments SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1 AND status = 'pending' RETURNING *",
            action === "confirm" ? [paymentId, actor.account.id] : [paymentId, actor.account.id, reason],
        )).rows[0];
        if (!payment) throw new HttpError(409, "Khoản thanh toán không còn ở trạng thái chờ.");
        const bill = (await client.query("SELECT session_id FROM bills WHERE id = $1", [payment.bill_id])).rows[0];
        await audit(client, auditActor(actor, "cashier"), {
            action: action === "confirm" ? "payment.transfer_confirmed" : "payment.cancelled",
            entityType: "payment", entityId: paymentId, sessionId: bill.session_id,
            after: { amount: payment.amount, method: payment.method }, reason, retention: "financial",
        });
    });
    return ok({ ok: true });
});
