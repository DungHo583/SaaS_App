import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { ACCOUNT_COLUMNS, listAccounts, parseAccountType } from "@/lib/accounts";
import { withTransaction } from "@/lib/db";
import { ok, optionalText, readJson, route, text } from "@/lib/http";
import { generateTemporaryPassword, hashSecret } from "@/lib/password";

export const GET = route(async () => {
    const actor = await requireActor("admin");
    return ok({ accounts: await listAccounts(actor.db) });
});

/** Owner cấp tài khoản. Mật khẩu tạm ngẫu nhiên chỉ trả về MỘT lần. */
export const POST = route(async (request) => {
    const actor = await requireActor("admin");
    const body = await readJson(request);
    const username = text(body.username, { max: 32, required: true, label: "Username" }).toLowerCase();
    const fullName = text(body.fullName, { max: 100, required: true, label: "Họ tên" });
    const email = optionalText(body.email, { max: 254, label: "Email" })?.toLowerCase() ?? null;
    const phone = optionalText(body.phone, { max: 20, label: "Số điện thoại" });
    const { accountType, roles } = parseAccountType(body);
    const temporaryPassword = generateTemporaryPassword();

    const account = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            `INSERT INTO accounts (username, full_name, email, phone, account_type, roles, password_hash, must_change_password, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING ${ACCOUNT_COLUMNS}`,
            [username, fullName, email, phone, accountType, roles, hashSecret(temporaryPassword), actor.account.id],
        );
        await audit(client, auditActor(actor, "admin"), {
            action: "account.created",
            entityType: "account",
            entityId: result.rows[0].id,
            after: { username, full_name: fullName, account_type: accountType, roles },
        });
        return result.rows[0];
    });
    return ok({ account: { ...account, devices: [] }, temporaryPassword }, 201);
});
