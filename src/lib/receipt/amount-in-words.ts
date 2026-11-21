const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const GROUP_NAMES = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

/** Đọc một nhóm 3 chữ số. `full` = đọc đủ "không trăm", "linh" (nhóm không đứng đầu). */
function readTriple(value: number, full: boolean): string[] {
    const hundreds = Math.floor(value / 100);
    const tens = Math.floor((value % 100) / 10);
    const units = value % 10;
    const words: string[] = [];

    if (full || hundreds > 0) words.push(DIGITS[hundreds], "trăm");

    if (tens === 0) {
        if (units > 0 && (full || hundreds > 0)) words.push("linh");
    } else if (tens === 1) {
        words.push("mười");
    } else {
        words.push(DIGITS[tens], "mươi");
    }

    if (units === 1 && tens > 1) words.push("mốt");
    else if (units === 5 && tens > 0) words.push("lăm");
    else if (units > 0) words.push(DIGITS[units]);

    return words;
}

/** Số tiền VND bằng chữ, ví dụ 129000 -> "Một trăm hai mươi chín nghìn đồng". */
export function amountInWords(amount: number): string {
    const value = Math.round(Math.abs(amount));
    if (!Number.isSafeInteger(value)) throw new RangeError("Số tiền quá lớn.");

    const groups: number[] = [];
    for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);

    const words: string[] = [];
    for (let index = groups.length - 1; index >= 0; index--) {
        const group = groups[index];
        if (group === 0) continue;
        words.push(...readTriple(group, index < groups.length - 1));
        if (GROUP_NAMES[index]) words.push(GROUP_NAMES[index]);
    }

    const text = words.length === 0 ? "không" : words.join(" ");
    const sign = amount < 0 ? "âm " : "";
    const sentence = `${sign}${text} đồng`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
