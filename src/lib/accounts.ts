import type { Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";

export const ACCOUNT_COLUMNS = `id, username, full_name, email, phone, account_type, roles, must_change_password,
    is_active, last_login_at, created_at, deactivated_at`;

export async function listAccounts(db: Queryable) {
    const [accounts, devices] = await Promise.all([
        db.query(`SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY (account_type = 'owner') DESC, is_active DESC, created_at`),
        db.query(
            `SELECT id, account_id, user_agent, label, first_ip::text AS first_ip, last_ip::text AS last_ip,
                    first_seen_at, last_seen_at, approved_at, revoked_at
             FROM devices ORDER BY last_seen_at DESC`,
        ),
    ]);
    return accounts.rows.map((account) => ({ ...account, devices: devices.rows.filter((device) => device.account_id === account.id) }));
}

/** Kiểm tra loại tài khoản + vai trò theo luật ghép (DB cũng chặn bằng CHECK accounts_roles_valid). */
export function parseAccountType(body: Record<string, unknown>) {
    const accountType = String(body.accountType ?? "");
    if (!["manager", "staff", "kitchen"].includes(accountType)) throw new HttpError(400, "Loại tài khoản không hợp lệ.");
    const roles = accountType === "kitchen" ? ["kitchen"]
        : accountType === "manager" ? []
            : [...new Set((Array.isArray(body.roles) ? body.roles : []).map(String))];
    if (accountType === "staff") {
        if (roles.length < 1 || roles.length > 2) throw new HttpError(400, "Nhân viên phải có 1 hoặc 2 vai trò.");
        if (roles.some((role) => !["order", "runner", "cashier"].includes(role))) {
            throw new HttpError(400, "Vai trò bếp luôn đứng riêng (dùng loại tài khoản Bếp).");
        }
    }
    return { accountType, roles };
}
