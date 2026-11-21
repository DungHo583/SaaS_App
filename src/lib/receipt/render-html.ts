import { layoutReceipt, RECEIPT_COLUMNS, type ReceiptLine } from "./layout";

const BASE_FONT_PX = 12;
// Font monospace có độ rộng ký tự ~0.6em => 48 cột * 12px * 0.6 ≈ 346px.
const RECEIPT_WIDTH_PX = Math.ceil(RECEIPT_COLUMNS * BASE_FONT_PX * 0.6) + 2;
const FONT_STACK = "'Courier New', Courier, monospace";

function escapeHtml(text: string) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Khối HTML của phiếu, chỉ dùng inline style để hiển thị đúng trong email client.
 * Class `receipt-80mm`, `rl`, `rl2` dùng cho CSS in trên trang preview.
 */
export function renderReceiptHtml(lines: readonly ReceiptLine[]) {
    const body = layoutReceipt(lines)
        .map((line) => {
            const style = [
                "white-space:pre",
                `font-size:${BASE_FONT_PX * line.size}px`,
                `line-height:${line.size === 2 ? 1.25 : 1.45}`,
                line.bold ? "font-weight:700" : "",
            ].filter(Boolean).join(";");
            return `<div class="${line.size === 2 ? "rl2" : "rl"}" style="${style}">${escapeHtml(line.text)}</div>`;
        })
        .join("");

    return `<div class="receipt-80mm" style="width:${RECEIPT_WIDTH_PX}px;margin:0 auto;padding:16px 14px;background:#ffffff;color:#111111;font-family:${FONT_STACK};border:1px solid #e5ded4;">${body}</div>`;
}

/** Email HTML đầy đủ: phiếu 80mm nằm giữa, nền xám nhạt. */
export function renderReceiptEmail(lines: readonly ReceiptLine[], heading: string) {
    return `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:24px 8px;background:#f3f0ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
${renderReceiptHtml(lines)}
</td></tr></table>
</body>
</html>`;
}
