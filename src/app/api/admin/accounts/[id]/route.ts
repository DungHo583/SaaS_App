import { ACCOUNT_COLUMNS, parseAccountType } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, text, uuid } from "@/lib/http";

/** Sửa tài khoản nhân viên / quản lý / bếp. Owner tự sửa hồ sơ ở /api/admin/profile. */
export const PATCH = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã tài khoản");
    const body = await readJson(request);

    const account = await withTransaction(actor.db, async (client) => {
        const current = (await client.query(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!current) throw new HttpError(404, "Không tìm thấy tài khoản.");
        if (current.account_type === "owner") throw new HttpError(400, "Sửa thông tin owner trong mục Cài đặt.");

        const fullName = "fullName" in body ? text(body.fullName, { max: 100, required: true, label: "Họ tên" }) : current.full_name;
        const email = "email" in body ? optionalText(body.email, { max: 254, label: "Email" })?.toLowerCase() ?? null : current.email;
        const phone = "phone" in body ? optionalText(body.phone, { max: 20, label: "Số điện thoại" }) : current.phone;
        const { accountType, roles } = "accountType" in body ? parseAccountType(body) : { accountType: current.account_type, roles: current.roles };
        const isActive = "isActive" in body ? body.isActive === true : current.is_active;

        const result = await client.query(
            `UPDATE accounts SET full_name = $2, email = $3, phone = $4, account_type = $5, roles = $6,
                    is_active = $7, deactivated_at = CASE WHEN $7 THEN NULL ELSE coalesce(deactivated_at, now()) END
             WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`,
            [id, fullName, email, phone, accountType, roles, isActive],
        );
        if (!isActive) {
            // Khoá tài khoản: kết thúc mọi ca đang mở.
            await client.query("UPDATE shifts SET ended_at = now(), end_reason = 'revoked' WHERE account_id = $1 AND ended_at IS NULL", [id]);
        }
        await audit(client, auditActor(actor, "admin"), {
            action: current.is_active && !isActive ? "account.deactivated" : !current.is_active && isActive ? "account.reactivated" : "account.updated",
            entityType: "account",
            entityId: id,
            before: { full_name: current.full_name, email: current.email, phone: current.phone, account_type: current.account_type, roles: current.roles, is_active: current.is_active },
            after: { full_name: fullName, email, phone, account_type: accountType, roles, is_active: isActive },
        });
        return result.rows[0];
    });
    return ok({ account });
});
