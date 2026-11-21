import { audit } from "@/lib/audit";
import { auditActor, confirmPin, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, integer, ok, readJson, route, uuid } from "@/lib/http";
import { buildVietQrPayload, transferContent } from "@/lib/vietqr";

/**
 * Ghi nhận khoản thanh toán cho phiếu tạm tính.
 * - Tiền mặt: nhập tiền khách đưa + PIN → xác nhận ngay, tính tiền thối.
 * - Chuyển khoản: tạo khoản 'pending' + mã VietQR (số tiền, nội dung chứa mã phiếu); thu ngân xác nhận khi nhận tiền.
 */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("cashier");
    const billId = uuid(params.id, "Mã phiếu");
    const body = await readJson(request);
    const method = String(body.method ?? "");
    if (!["cash", "bank_transfer"].includes(method)) throw new HttpError(400, "Hình thức thanh toán không hợp lệ.");
    if (method === "cash") await confirmPin(actor, body.pin);

    const result = await withTransaction(actor.db, async (client) => {
        const bill = (await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [billId])).rows[0];
        if (!bill) throw new HttpError(404, "Không tìm thấy phiếu.");
        if (bill.status !== "draft") throw new HttpError(409, "Phiếu đã phát hành.");
        const collected = (await client.query(
            "SELECT coalesce(sum(amount), 0)::int AS total FROM payments WHERE bill_id = $1 AND status IN ('confirmed', 'pending')",
            [billId],
        )).rows[0].total;
        const due = bill.total - collected;
        if (due <= 0) throw new HttpError(409, "Phiếu đã đủ tiền. Huỷ khoản chờ xác nhận nếu muốn đổi hình thức.");
        const amount = body.amount === undefined ? due : integer(body.amount, { min: 1, max: due, label: "Số tiền" });

        if (method === "cash") {
            const cashReceived = integer(body.cashReceived ?? amount, { min: amount, max: 1_000_000_000, label: "Tiền khách đưa" });
            const payment = (await client.query(
                `INSERT INTO payments (bill_id, method, amount, cash_received, status, created_by, confirmed_at, confirmed_by)
                 VALUES ($1, 'cash', $2, $3, 'confirmed', $4, now(), $4) RETURNING *`,
                [billId, amount, cashReceived, actor.account.id],
            )).rows[0];
            await audit(client, auditActor(actor, "cashier"), {
                action: "payment.cash_received", entityType: "payment", entityId: payment.id, sessionId: bill.session_id,
                after: { amount, cash_received: cashReceived, change_given: payment.change_given }, retention: "financial",
            });
            return { payment };
        }

        const settings = actor.settings;
        if (!settings.bank_bin || !settings.bank_account_no) {
            throw new HttpError(409, "Owner chưa cấu hình tài khoản nhận chuyển khoản (Cài đặt → Thanh toán).");
        }
        const content = transferContent(`${settings.display_name.slice(0, 8)} ${billId.slice(0, 8)}`);
        const payment = (await client.query(
            `INSERT INTO payments (bill_id, method, amount, transfer_content, created_by)
             VALUES ($1, 'bank_transfer', $2, $3, $4) RETURNING *`,
            [billId, amount, content, actor.account.id],
        )).rows[0];
        await audit(client, auditActor(actor, "cashier"), {
            action: "payment.transfer_requested", entityType: "payment", entityId: payment.id, sessionId: bill.session_id,
            after: { amount, transfer_content: content }, retention: "financial",
        });
        return {
            payment,
            vietqr: {
                payload: buildVietQrPayload({ bankBin: settings.bank_bin, accountNo: settings.bank_account_no, amount, content }),
                bankBin: settings.bank_bin,
                accountNo: settings.bank_account_no,
                accountName: settings.bank_account_name,
                amount,
                content,
            },
        };
    });
    return ok(result, 201);
});
