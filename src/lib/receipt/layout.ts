/**
 * Layout hoá đơn dạng dòng cho máy in nhiệt 80mm.
 *
 * Khổ giấy 80mm, vùng in ~72mm = 576 điểm ở 203dpi. Font A (12x24 điểm) => 48 ký tự/dòng.
 * Cỡ chữ 2 (double width) => 24 ký tự/dòng.
 *
 * Preview trên web, email và lệnh ESC/POS sau này đều render từ CÙNG danh sách dòng này,
 * nên bản in luôn giống bản xem trước.
 */
export const RECEIPT_COLUMNS = 48;

export type ReceiptAlign = "left" | "center" | "right";
export type ReceiptSize = 1 | 2;

export type ReceiptLine =
    | { kind: "text"; text: string; align?: ReceiptAlign; bold?: boolean; size?: ReceiptSize }
    | { kind: "row"; left: string; right: string; bold?: boolean; size?: ReceiptSize }
    | { kind: "rule"; char?: "-" | "=" }
    | { kind: "feed" };

/** Một dòng đã căn chỉnh, đúng bằng số cột (48 hoặc 24 nếu cỡ 2). */
export type PrintedLine = { text: string; bold: boolean; size: ReceiptSize };

function normalize(text: string) {
    // NFC: mỗi chữ tiếng Việt có dấu = 1 ký tự => đếm cột chính xác.
    return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Ngắt dòng theo từ; từ dài hơn độ rộng thì cắt cứng. */
export function wrap(text: string, width: number): string[] {
    const words = normalize(text).split(" ").filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (let word of words) {
        while (word.length > width) {
            if (current) {
                lines.push(current);
                current = "";
            }
            lines.push(word.slice(0, width));
            word = word.slice(width);
        }
        if (!current) current = word;
        else if (current.length + 1 + word.length <= width) current += ` ${word}`;
        else {
            lines.push(current);
            current = word;
        }
    }
    if (current || lines.length === 0) lines.push(current);
    return lines;
}

/** Giữ lại thụt lề đầu dòng (tối đa 1/4 độ rộng) vì normalize() xoá khoảng trắng đầu. */
function leadingSpaces(text: string, width: number) {
    const count = text.length - text.trimStart().length;
    return " ".repeat(Math.min(count, Math.floor(width / 4)));
}

function align(text: string, width: number, mode: ReceiptAlign) {
    const space = Math.max(0, width - text.length);
    if (mode === "right") return " ".repeat(space) + text;
    if (mode === "center") {
        const left = Math.floor(space / 2);
        return " ".repeat(left) + text + " ".repeat(space - left);
    }
    return text + " ".repeat(space);
}

export function layoutReceipt(lines: readonly ReceiptLine[], columns = RECEIPT_COLUMNS): PrintedLine[] {
    const output: PrintedLine[] = [];
    for (const line of lines) {
        if (line.kind === "feed") {
            output.push({ text: " ".repeat(columns), bold: false, size: 1 });
            continue;
        }
        if (line.kind === "rule") {
            output.push({ text: (line.char ?? "-").repeat(columns), bold: false, size: 1 });
            continue;
        }

        const size = line.size ?? 1;
        const width = Math.floor(columns / size);
        const bold = line.bold ?? false;

        if (line.kind === "text") {
            const indent = leadingSpaces(line.text, width);
            for (const part of wrap(line.text, width - indent.length)) {
                output.push({ text: align(indent + part, width, line.align ?? "left"), bold, size });
            }
            continue;
        }

        const right = normalize(line.right);
        const indent = leadingSpaces(line.left, width);
        const leftWidth = Math.max(1, width - right.length - 1);
        const leftParts = wrap(line.left, Math.max(1, leftWidth - indent.length)).map((part) => indent + part);
        output.push({ text: align(leftParts[0], leftWidth, "left") + " " + right, bold, size });
        for (const part of leftParts.slice(1)) {
            output.push({ text: align(part, width, "left"), bold, size });
        }
    }
    return output;
}

/** Bản text thuần (dùng cho email text/plain, log, và làm nguồn cho ESC/POS sau này). */
export function receiptToText(lines: readonly ReceiptLine[], columns = RECEIPT_COLUMNS) {
    return layoutReceipt(lines, columns)
        .map((line) => {
            // Dòng cỡ 2 chỉ rộng 24 ký tự (máy in nhân đôi chiều ngang); trong text thuần thì căn giữa 48 cột.
            if (line.size === 2) return align(line.text.trim(), columns, "center").trimEnd();
            return line.text.trimEnd();
        })
        .join("\n");
}
