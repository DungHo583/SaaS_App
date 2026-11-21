import { audit } from "@/lib/audit";
import { auditActor, getActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, text } from "@/lib/http";
import { hashSecret, passwordPolicyError, pinPolicyError, verifySecret } from "@/lib/password";

/** Lần đăng nhập đầu: đổi mật khẩu tạm + đặt PIN 6 số (BUSINESS_PROCESS 3.1). */
export const POST = route(async (request) => {
    const actor = await getActor();
    if (!actor) throw new HttpError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "login_required");
    if (!actor.account.must_change_password) throw new HttpError(409, "Tài khoản đã hoàn tất đăng nhập lần đầu.");

    const body = await readJson(request);
    const newPassword = text(body.newPassword, { max: 128, required: true, label: "Mật khẩu mới" });
    const pin = text(body.pin, { max: 6, required: true, label: "PIN" });
    const passwordError = passwordPolicyError(newPassword);
    if (passwordError) throw new HttpError(400, passwordError);
    if (verifySecret(newPassword, actor.account.password_hash)) throw new HttpError(400, "Mật khẩu mới phải khác mật khẩu tạm.");
    const pinError = pinPolicyError(pin);
    if (pinError) throw new HttpError(400, pinError);

    await withTransaction(actor.db, async (client) => {
        await client.query(
            `UPDATE accounts SET password_hash = $2, pin_hash = $3, must_change_password = false, pin_failed_attempts = 0
             WHERE id = $1`,
            [actor.account.id, hashSecret(newPassword), hashSecret(pin)],
        );
        await client.query("UPDATE shifts SET pin_verified_at = now() WHERE id = $1", [actor.shift.id]);
        await audit(client, auditActor(actor), { action: "auth.first_login_completed", entityType: "account", entityId: actor.account.id });
    });
    return ok({ ok: true });
});
