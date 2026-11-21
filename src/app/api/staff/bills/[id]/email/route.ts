import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { HttpError, ok, readJson, route, text, uuid } from "@/lib/http";
import { isValidEmail, MailNotConfiguredError, sendMail } from "@/lib/mailer";
import { loadReceipt } from "@/lib/receipt/load";
import { renderReceiptEmail } from "@/lib/receipt/render-html";

/** Gửi phiếu 80mm qua email (khách cần lưu / xuất hoá đơn công ty). */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("cashier");
    const billId = uuid(params.id, "Mã phiếu");
    const email = text((await readJson(request)).email, { max: 254, required: true, label: "Email" }).toLowerCase();
    if (!isValidEmail(email)) throw new HttpError(400, "Email không hợp lệ.");

    const bill = (await actor.db.query("SELECT session_id FROM bills WHERE id = $1", [billId])).rows[0];
    if (!bill) throw new HttpError(404, "Không tìm thấy phiếu.");
    const loaded = await loadReceipt(actor.db, bill.session_id);
    if (!loaded) throw new HttpError(404, "Không tìm thấy phiếu.");
    const subject = `${loaded.receipt.title}${loaded.receipt.number ? ` số ${loaded.receipt.number}` : ""} - ${actor.settings.display_name}`;
    try {
        await sendMail({ to: email, subject, html: renderReceiptEmail(loaded.receipt.lines, subject), text: loaded.text });
    } catch (error) {
        if (error instanceof MailNotConfiguredError) throw new HttpError(503, "Máy chủ chưa cấu hình gửi email.");
        console.error("Receipt email failed:", error);
        throw new HttpError(502, "Không gửi được email. Vui lòng thử lại.");
    }
    await audit(actor.db, auditActor(actor, "cashier"), {
        action: "bill.emailed", entityType: "bill", entityId: billId, sessionId: bill.session_id,
        after: { email: email.replace(/^(.).*(@.*)$/, "$1***$2") }, retention: "financial",
    });
    return ok({ ok: true });
});
