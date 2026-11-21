import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, route, uuid } from "@/lib/http";
import { generateTemporaryPassword, hashSecret } from "@/lib/password";

/**
 * Cấp lại mật khẩu tạm (nhân viên quên mật khẩu/PIN). Mật khẩu cũ và PIN mất hiệu lực,
 * mọi ca đang mở bị kết thúc; nhân viên phải đổi mật khẩu + đặt PIN mới khi đăng nhập.
 */
export const POST = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã tài khoản");
    const temporaryPassword = generateTemporaryPassword();
    await withTransaction(actor.db, async (client) => {
        const current = (await client.query("SELECT account_type, username FROM accounts WHERE id = $1 FOR UPDATE", [id])).rows[0];
        if (!current) throw new HttpError(404, "Không tìm thấy tài khoản.");
        if (current.account_type === "owner") throw new HttpError(400, "Owner đổi mật khẩu trong mục Cài đặt.");
        await client.query(
            `UPDATE accounts SET password_hash = $2, must_change_password = true, pin_hash = NULL, pin_failed_attempts = 0
             WHERE id = $1`,
            [id, hashSecret(temporaryPassword)],
        );
        await client.query("UPDATE shifts SET ended_at = now(), end_reason = 'password_changed' WHERE account_id = $1 AND ended_at IS NULL", [id]);
        await audit(client, auditActor(actor, "admin"), { action: "account.password_reset", entityType: "account", entityId: id, after: { username: current.username } });
    });
    return ok({ temporaryPassword });
});
