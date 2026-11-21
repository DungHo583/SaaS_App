import type { Queryable } from "@/lib/db";
import { sessionTableNames } from "@/lib/ops";
import { loadSettings } from "@/lib/settings";
import { buildReceipt, type ReceiptData } from "./build";
import { receiptToText } from "./layout";
import { renderReceiptHtml } from "./render-html";

/** Mã phiên ngắn để in trên phiếu và đối chiếu (8 ký tự đầu UUID). */
export const sessionCode = (sessionId: string) => sessionId.slice(0, 8).toUpperCase();

/** Dựng phiếu từ bill gốc của phiên. Bill đã phát hành dùng snapshot người bán trên bill. */
export async function loadReceipt(db: Queryable, sessionId: string) {
    const bill = (await db.query(
        "SELECT * FROM bills WHERE session_id = $1 AND kind = 'original'",
        [sessionId],
    )).rows[0];
    if (!bill) return null;

    const [lines, payments, tables, settings] = await Promise.all([
        db.query("SELECT name, unit, quantity, unit_price, line_total FROM bill_lines WHERE bill_id = $1 ORDER BY line_no", [bill.id]),
        db.query(
            "SELECT method, amount, cash_received, change_given FROM payments WHERE bill_id = $1 AND status = 'confirmed' ORDER BY created_at",
            [bill.id],
        ),
        sessionTableNames(db, sessionId),
        loadSettings(db),
    ]);
    const issued = bill.status === "issued";
    const data: ReceiptData = {
        seller: issued
            ? { name: bill.seller_name, address: bill.seller_address ?? "", phone: bill.seller_phone ?? "", taxCode: bill.seller_tax_code ?? "" }
            : { name: settings.display_name, address: settings.address, phone: settings.phone, taxCode: settings.tax_code },
        buyer: {
            name: bill.buyer_name,
            company: bill.buyer_company,
            taxCode: bill.buyer_tax_code,
            address: bill.buyer_address,
            email: bill.buyer_email,
        },
        issued,
        number: issued ? `${bill.series}-${String(bill.number).padStart(7, "0")}` : null,
        tableName: tables ?? "Mang về",
        sessionCode: sessionCode(sessionId),
        at: issued ? new Date(bill.issued_at) : new Date(),
        lines: lines.rows.map((line) => ({
            name: line.name,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            lineTotal: line.line_total,
        })),
        subtotal: bill.subtotal,
        discount: bill.discount,
        total: bill.total,
        payments: payments.rows.map((payment) => ({
            method: payment.method,
            amount: payment.amount,
            cashReceived: payment.cash_received,
            changeGiven: payment.change_given,
        })),
    };
    const receipt = buildReceipt(data);
    return {
        bill,
        receipt,
        html: renderReceiptHtml(receipt.lines),
        text: receiptToText(receipt.lines),
    };
}
