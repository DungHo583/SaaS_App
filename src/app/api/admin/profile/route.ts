import { audit } from "@/lib/audit";
import { auditActor, publicAccount, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, text } from "@/lib/http";
import { hashSecret, passwordPolicyError, pinPolicyError, verifySecret } from "@/lib/password";

/**
 * Hồ sơ owner: họ tên, điện thoại, email nhận OTP, đổi mật khẩu / PIN.
 * Mọi thay đổi bắt buộc nhập mật khẩu hiện tại (email OTP là kênh bảo vệ log và tài khoản ngân hàng).
 */
export const PATCH = route(async (request) => {
    const actor = await requireActor("admin");
    const body = await readJson(request);
    const currentPassword = text(body.currentPassword, { max: 128, required: true, label: "Mật khẩu hiện tại" });
    if (!verifySecret(currentPassword, actor.account.password_hash)) throw new HttpError(400, "Mật khẩu hiện tại không đúng.");

    const changes: Record<string, unknown> = {};
    if ("fullName" in body) changes.full_name = text(body.fullName, { max: 100, required: true, label: "Họ tên" });
    if ("phone" in body) changes.phone = optionalText(body.phone, { max: 20, label: "Số điện thoại" });
    if ("email" in body) changes.email = optionalText(body.email, { max: 254, label: "Email" })?.toLowerCase() ?? null;
    if (body.newPassword) {
        const password = text(body.newPassword, { max: 128, label: "Mật khẩu mới" });
        const error = passwordPolicyError(password);
        if (error) throw new HttpError(400, error);
        changes.password_hash = hashSecret(password);
    }
    if (body.newPin) {
        const pin = text(body.newPin, { max: 6, label: "PIN mới" });
        const error = pinPolicyError(pin);
        if (error) throw new HttpError(400, error);
        changes.pin_hash = hashSecret(pin);
    }
    const columns = Object.keys(changes);
    if (columns.length === 0) return ok({ account: publicAccount(actor.account) });

    const account = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            `UPDATE accounts SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(", ")} WHERE id = $1 RETURNING *`,
            [actor.account.id, ...columns.map((column) => changes[column])],
        );
        await audit(client, auditActor(actor, "admin"), {
            action: "account.profile_updated",
            entityType: "account",
            entityId: actor.account.id,
            before: { full_name: actor.account.full_name, phone: actor.account.phone, email: actor.account.email },
            after: {
                full_name: changes.full_name,
                phone: changes.phone,
                email: changes.email,
                password_changed: "password_hash" in changes,
                pin_changed: "pin_hash" in changes,
            },
        });
        return result.rows[0];
    });
    return ok({ account: publicAccount(account) });
});
