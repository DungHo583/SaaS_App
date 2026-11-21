import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Định dạng hash dùng cho schema mới (accounts.password_hash, pin_hash, platform_admins.password_hash):
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 * Salt ngẫu nhiên cho TỪNG giá trị (khác code cũ dùng salt cố định).
 * Thư viện auth TypeScript ở giai đoạn P0 phải dùng đúng định dạng này.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export function hashSecret(secret) {
    const salt = randomBytes(16);
    const hash = scryptSync(secret, salt, KEY_LENGTH, { N, r: R, p: P });
    return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifySecret(secret, stored) {
    const [algorithm, n, r, p, salt, hash] = stored.split("$");
    if (algorithm !== "scrypt") return false;
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(secret, Buffer.from(salt, "base64url"), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
    });
    return timingSafeEqual(expected, actual);
}

/** Mật khẩu tạm ngẫu nhiên 12 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt; bỏ ký tự dễ nhầm (0/O, 1/l/I). */
export function generateTemporaryPassword(length = 12) {
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
