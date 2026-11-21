import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash mật khẩu / PIN: scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>, salt ngẫu nhiên cho từng giá trị.
 * PHẢI trùng định dạng với scripts/lib/password.mjs (script tạo quán).
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function hashSecret(secret: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(secret, salt, KEY_LENGTH, { N, r: R, p: P });
    return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifySecret(secret: string, stored: string | null): boolean {
    if (!stored) return false;
    const [algorithm, n, r, p, salt, hash] = stored.split("$");
    if (algorithm !== "scrypt" || !salt || !hash) return false;
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(secret, Buffer.from(salt, "base64url"), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Mật khẩu tạm 12 ký tự, đủ 4 loại ký tự, bỏ ký tự dễ nhầm. */
export function generateTemporaryPassword(length = 12): string {
    const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "@#$%&*!?"];
    const all = groups.join("");
    const chars = groups.map((group) => group[randomInt(group.length)]);
    while (chars.length < length) chars.push(all[randomInt(all.length)]);
    for (let index = chars.length - 1; index > 0; index--) {
        const swap = randomInt(index + 1);
        [chars[index], chars[swap]] = [chars[swap], chars[index]];
    }
    return chars.join("");
}

/** Chính sách mật khẩu (BUSINESS_PROCESS 3.1). Trả thông điệp lỗi hoặc null. */
export function passwordPolicyError(password: string): string | null {
    if (password.length < 8 || password.length > 128) return "Mật khẩu phải từ 8 đến 128 ký tự.";
    if (!/[A-Z]/.test(password)) return "Mật khẩu phải có ít nhất 1 chữ hoa.";
    if (!/[a-z]/.test(password)) return "Mật khẩu phải có ít nhất 1 chữ thường.";
    if (!/[0-9]/.test(password)) return "Mật khẩu phải có ít nhất 1 chữ số.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Mật khẩu phải có ít nhất 1 ký tự đặc biệt.";
    return null;
}

/** PIN 6 số, không quá dễ đoán. */
export function pinPolicyError(pin: string): string | null {
    if (!/^[0-9]{6}$/.test(pin)) return "PIN phải gồm đúng 6 chữ số.";
    if (/^(\d)\1{5}$/.test(pin)) return "PIN không được gồm 6 chữ số giống nhau.";
    if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "PIN không được là dãy số liên tiếp.";
    return null;
}
