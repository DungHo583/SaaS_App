import { audit } from "@/lib/audit";
import { auditActor, confirmPin, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, uuid } from "@/lib/http";
import { amountInWords } from "@/lib/receipt/amount-in-words";
import { loadReceipt } from "@/lib/receipt/load";

/**
 * Xác nhận cuối của thu ngân (PIN): phát hành phiếu (cấp số liên tục, khoá vĩnh viễn) rồi đóng phiên.
 * DB chặn nếu còn món chưa phục vụ hoặc chưa thu đủ tiền.
 */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("cashier");
    const billId = uuid(params.id, "Mã phiếu");
    const body = await readJson(request);
    await confirmPin(actor, body.pin);
    const buyer = (typeof body.buyer === "object" && body.buyer ? body.buyer : {}) as Record<string, unknown>;
    const buyerFields = {
        buyer_name: optionalText(buyer.name, { max: 100, label: "Tên người mua" }),
        buyer_company: optionalText(buyer.company, { max: 200, label: "Tên đơn vị" }),
        buyer_tax_code: optionalText(buyer.taxCode, { max: 14, label: "MST người mua" }),
        buyer_address: optionalText(buyer.address, { max: 300, label: "Địa chỉ người mua" }),
        buyer_email: optionalText(buyer.email, { max: 254, label: "Email người mua" }),
    };
    if (buyerFields.buyer_tax_code && !/^([0-9]{10}|[0-9]{10}-[0-9]{3}|[0-9]{12})$/.test(buyerFields.buyer_tax_code)) {
        throw new HttpError(400, "MST người mua không hợp lệ.");
    }

    const sessionId = await withTransaction(actor.db, async (client) => {
        const bill = (await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [billId])).rows[0];
        if (!bill) throw new HttpError(404, "Không tìm thấy phiếu.");
        if (bill.status !== "draft") throw new HttpError(409, "Phiếu đã được phát hành.");
        const pending = await client.query("SELECT 1 FROM payments WHERE bill_id = $1 AND status = 'pending'", [billId]);
        if (pending.rowCount) throw new HttpError(409, "Còn khoản chuyển khoản chưa xác nhận. Xác nhận hoặc huỷ trước.");

        const issued = (await client.query(
            `UPDATE bills SET status = 'issued', issued_by = $2, total_in_words = $3,
                    buyer_name = $4, buyer_company = $5, buyer_tax_code = $6, buyer_address = $7, buyer_email = $8
             WHERE id = $1 RETURNING series, number, total, session_id`,
            [billId, actor.account.id, amountInWords(bill.total), buyerFields.buyer_name, buyerFields.buyer_company,
                buyerFields.buyer_tax_code, buyerFields.buyer_address, buyerFields.buyer_email],
        )).rows[0];
        await client.query(
            "UPDATE table_sessions SET status = 'closed', closed_at = now(), closed_by = $2 WHERE id = $1",
            [issued.session_id, actor.account.id],
        );
        await audit(client, auditActor(actor, "cashier"), {
            action: "bill.issued",
            entityType: "bill",
            entityId: billId,
            sessionId: issued.session_id,
            after: { number: `${issued.series}-${issued.number}`, total: issued.total, buyer: buyerFields },
            retention: "financial",
        });
        await audit(client, auditActor(actor, "cashier"), { action: "session.closed", entityType: "table_session", entityId: issued.session_id, sessionId: issued.session_id });
        return issued.session_id as string;
    });
    const receipt = await loadReceipt(actor.db, sessionId);
    return ok({ sessionId, number: receipt?.receipt.number, html: receipt?.html, text: receipt?.text });
});
