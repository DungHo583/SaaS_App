import { amountInWords } from "./amount-in-words";
import type { ReceiptLine } from "./layout";

/** Thông tin người mua khi khách yêu cầu (khách công ty). Chuẩn bị sẵn cho hoá đơn điện tử. */
export type BuyerInfo = {
    name?: string | null;
    company?: string | null;
    taxCode?: string | null;
    address?: string | null;
    email?: string | null;
};

export type SellerInfo = { name: string; address: string; phone: string; taxCode: string };

/** Dữ liệu dựng phiếu — lấy từ bills + bill_lines (xem load.ts). */
export type ReceiptData = {
    seller: SellerInfo;
    buyer?: BuyerInfo;
    issued: boolean;
    number: string | null;
    tableName: string;
    sessionCode: string;
    at: Date;
    lines: Array<{ name: string; unit: string; quantity: number; unitPrice: number; lineTotal: number }>;
    subtotal: number;
    discount: number;
    total: number;
    payments?: Array<{ method: "cash" | "bank_transfer"; amount: number; cashReceived: number | null; changeGiven: number | null }>;
};

export type Receipt = { title: string; number: string | null; total: number; lines: ReceiptLine[] };

const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

/** Ngày giờ theo giờ Việt Nam, dạng 22/11/2026 14:05 (server có thể chạy UTC). */
export function formatReceiptTime(value: Date) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Ho_Chi_Minh",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(value).map((part) => [part.type, part.value]),
    );
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function buildReceipt(data: ReceiptData): Receipt {
    const title = data.issued ? "PHIẾU THANH TOÁN" : "PHIẾU TẠM TÍNH";
    const { seller } = data;
    const lines: ReceiptLine[] = [
        { kind: "text", text: seller.name.toUpperCase(), align: "center", bold: true, size: 2 },
    ];
    if (seller.address) lines.push({ kind: "text", text: seller.address, align: "center" });
    if (seller.phone) lines.push({ kind: "text", text: `ĐT: ${seller.phone}`, align: "center" });
    if (seller.taxCode) lines.push({ kind: "text", text: `MST: ${seller.taxCode}`, align: "center" });

    lines.push(
        { kind: "rule", char: "=" },
        { kind: "text", text: title, align: "center", bold: true },
        { kind: "feed" },
    );
    if (data.number) lines.push({ kind: "row", left: "Số phiếu:", right: data.number });
    lines.push(
        { kind: "row", left: "Bàn:", right: data.tableName },
        { kind: "row", left: "Mã phiên:", right: data.sessionCode },
        { kind: "row", left: data.issued ? "Thời điểm thanh toán:" : "Thời điểm in:", right: formatReceiptTime(data.at) },
        { kind: "rule" },
        { kind: "row", left: "Món  (SL x Đơn giá)", right: "Thành tiền", bold: true },
        { kind: "rule" },
    );

    for (const item of data.lines) {
        lines.push(
            { kind: "text", text: item.name },
            { kind: "row", left: `  ${item.quantity} ${item.unit} x ${money(item.unitPrice)}`, right: money(item.lineTotal) },
        );
    }

    lines.push(
        { kind: "rule" },
        { kind: "row", left: "Tổng tiền hàng", right: money(data.subtotal) },
    );
    if (data.discount > 0) lines.push({ kind: "row", left: "Giảm giá", right: `-${money(data.discount)}` });
    lines.push(
        { kind: "row", left: "TỔNG THANH TOÁN", right: `${money(data.total)}đ`, bold: true },
        { kind: "text", text: `Bằng chữ: ${amountInWords(data.total)}.` },
    );

    for (const payment of data.payments ?? []) {
        if (payment.method === "cash") {
            lines.push({ kind: "row", left: "Tiền mặt khách đưa", right: money(payment.cashReceived ?? payment.amount) });
            if (payment.changeGiven) lines.push({ kind: "row", left: "Tiền thối lại", right: money(payment.changeGiven) });
        } else {
            lines.push({ kind: "row", left: "Chuyển khoản", right: money(payment.amount) });
        }
    }

    const buyer = data.buyer;
    const buyerRows: Array<[string, string | null | undefined]> = [
        ["Người mua", buyer?.name],
        ["Đơn vị", buyer?.company],
        ["MST", buyer?.taxCode],
        ["Địa chỉ", buyer?.address],
    ];
    if (buyerRows.some(([, value]) => value)) {
        lines.push({ kind: "rule" });
        for (const [label, value] of buyerRows) {
            if (value) lines.push({ kind: "text", text: `${label}: ${value}` });
        }
    }

    lines.push(
        { kind: "rule", char: "=" },
        { kind: "text", text: "Cảm ơn quý khách, hẹn gặp lại!", align: "center", bold: true },
        {
            kind: "text",
            text: data.issued ? "Phiếu nội bộ, không thay thế hoá đơn điện tử." : "Phiếu tạm tính - chưa thanh toán.",
            align: "center",
        },
        { kind: "feed" },
    );

    return { title, number: data.number, total: data.total, lines };
}
