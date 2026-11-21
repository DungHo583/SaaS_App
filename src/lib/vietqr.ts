/**
 * Payload VietQR (chuẩn EMVCo QR, NAPAS 247) — app ngân hàng quét được và điền sẵn số tiền + nội dung.
 * Mô phỏng thanh toán chuyển khoản (BUSINESS_PROCESS 6.4): chưa có webhook xác nhận, thu ngân xác nhận thủ công.
 */
function tlv(id: string, value: string) {
    return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) theo yêu cầu của EMVCo. */
export function crc16(input: string) {
    let crc = 0xffff;
    // TextEncoder thay cho Buffer: chạy được cả trên server lẫn trình duyệt (thu ngân dựng lại QR).
    for (const byte of new TextEncoder().encode(input)) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nội dung chuyển khoản: chỉ chữ/số không dấu, tối đa 25 ký tự (nhiều ngân hàng cắt dài hơn). */
export function transferContent(text: string) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d")
        .replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 25);
}

export function buildVietQrPayload({ bankBin, accountNo, amount, content }: {
    bankBin: string;
    accountNo: string;
    amount: number;
    content: string;
}) {
    const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bankBin) + tlv("01", accountNo)) + tlv("02", "QRIBFTTA");
    const body = [
        tlv("00", "01"),
        tlv("01", "12"), // QR động: dùng 1 lần cho 1 khoản thanh toán
        tlv("38", merchant),
        tlv("53", "704"), // VND
        tlv("54", String(Math.round(amount))),
        tlv("58", "VN"),
        tlv("62", tlv("08", transferContent(content))),
    ].join("") + "6304";
    return body + crc16(body);
}
