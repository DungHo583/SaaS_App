import { randomInt } from "node:crypto";
import type { Actor } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { hashSecret, verifySecret } from "@/lib/password";

/**
 * OTP gửi email cho owner (BUSINESS_PROCESS mục 8): mở log audit, đổi tài khoản ngân hàng.
 * Mã 6 số, hết hạn 5 phút, tối đa 5 lần nhập sai. Sau khi xác thực, quyền có hiệu lực 15 phút (grant).
 */
export type OtpPurpose = "view_audit" | "change_bank_account";

const PURPOSE_LABELS: Record<OtpPurpose, string> = {
    view_audit: "xem log hoạt động",
    change_bank_account: "đổi tài khoản nhận chuyển khoản",
};

export async function sendOtp(actor: Actor, purpose: OtpPurpose) {
    const email = actor.account.email;
    if (!email) throw new HttpError(400, "Tài khoản owner chưa có email để nhận OTP. Cập nhật email trong Cài đặt trước.");
    const recent = await actor.db.query(
        "SELECT count(*)::int AS count FROM otp_challenges WHERE account_id = $1 AND created_at > now() - interval '10 minutes'",
        [actor.account.id],
    );
    if (recent.rows[0].count >= 5) throw new HttpError(429, "Đã gửi quá nhiều mã. Vui lòng thử lại sau 10 phút.");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const result = await actor.db.query(
        `INSERT INTO otp_challenges (account_id, purpose, channel, sent_to, code_hash, expires_at, ip)
         VALUES ($1, $2, 'email', $3, $4, now() + interval '5 minutes', $5) RETURNING id`,
        [actor.account.id, purpose, email, hashSecret(code), actor.ip],
    );
    await sendMail({
        to: email,
        subject: `Mã xác thực ${code} - ${actor.settings.display_name}`,
        text: `Mã xác thực để ${PURPOSE_LABELS[purpose]}: ${code}\nMã hết hạn sau 5 phút. Nếu bạn không yêu cầu, hãy đổi mật khẩu ngay.`,
        html: `<p>Mã xác thực để <b>${PURPOSE_LABELS[purpose]}</b>:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Mã hết hạn sau 5 phút. Nếu bạn không yêu cầu, hãy đổi mật khẩu ngay.</p>`,
    });
    const masked = email.replace(/^(.).*(@.*)$/, "$1***$2");
    return { otpId: result.rows[0].id as string, sentTo: masked };
}

/** Xác thực mã; thành công thì cấp quyền 15 phút cho mục đích đó. */
export async function verifyOtp(actor: Actor, purpose: OtpPurpose, otpId: string, code: string) {
    const result = await actor.db.query(
        `SELECT id, code_hash, attempts, expires_at, consumed_at FROM otp_challenges
         WHERE id = $1 AND account_id = $2 AND purpose = $3`,
        [otpId, actor.account.id, purpose],
    );
    const row = result.rows[0];
    if (!row || row.consumed_at || new Date(row.expires_at) < new Date() || row.attempts >= 5) {
        throw new HttpError(400, "Mã xác thực đã hết hạn. Vui lòng gửi mã mới.");
    }
    if (!verifySecret(code, row.code_hash)) {
        await actor.db.query("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1", [otpId]);
        throw new HttpError(400, "Mã xác thực không đúng.");
    }
    await actor.db.query(
        "UPDATE otp_challenges SET consumed_at = now(), grant_expires_at = now() + interval '15 minutes' WHERE id = $1",
        [otpId],
    );
}

/** Còn quyền (đã xác thực OTP trong 15 phút) cho mục đích này không. */
export async function hasOtpGrant(actor: Actor, purpose: OtpPurpose) {
    const result = await actor.db.query(
        `SELECT 1 FROM otp_challenges WHERE account_id = $1 AND purpose = $2 AND grant_expires_at > now() LIMIT 1`,
        [actor.account.id, purpose],
    );
    return (result.rowCount ?? 0) > 0;
}
