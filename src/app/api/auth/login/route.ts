import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { cookieOptions, DEVICE_COOKIE, randomToken, requestMeta, sha256, SHIFT_COOKIE } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, text } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { verifySecret } from "@/lib/password";
import { loadSettings } from "@/lib/settings";
import { getTenantDb } from "@/lib/tenant";

/** Bắt đầu ca: username + mật khẩu (BUSINESS_PROCESS 3.2). PIN nhập ở bước tiếp theo. */
export const POST = route(async (request) => {
    const body = await readJson(request);
    const username = text(body.username, { max: 32, required: true, label: "Username" }).toLowerCase();
    const password = text(body.password, { max: 128, required: true, label: "Mật khẩu" });
    const { tenant, db } = await getTenantDb();
    const settings = await loadSettings(db);
    const meta = await requestMeta();

    const failures = await db.query(
        `SELECT count(*)::int AS count FROM audit_log
         WHERE action = 'auth.login_failed' AND entity_id = $1 AND occurred_at > now() - interval '15 minutes'`,
        [username],
    );
    if (failures.rows[0].count >= 10) throw new HttpError(429, "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.");

    const account = (await db.query("SELECT * FROM accounts WHERE username = $1", [username])).rows[0];
    if (!account || !account.is_active || !verifySecret(password, account.password_hash)) {
        await audit(db, { type: "system" }, {
            action: "auth.login_failed",
            entityType: "account",
            entityId: username,
            after: { ip: meta.ip, user_agent: meta.userAgent.slice(0, 200) },
        });
        throw new HttpError(401, "Sai username hoặc mật khẩu.");
    }

    const store = await cookies();
    let deviceToken = store.get(DEVICE_COOKIE)?.value;
    if (!deviceToken) deviceToken = randomToken();
    const shiftToken = randomToken();

    const result = await withTransaction(db, async (client) => {
        let device = (await client.query(
            "SELECT * FROM devices WHERE account_id = $1 AND token_hash = $2",
            [account.id, sha256(deviceToken)],
        )).rows[0];
        const hadDevices = (await client.query("SELECT 1 FROM devices WHERE account_id = $1 LIMIT 1", [account.id])).rowCount;
        const isNewDevice = !device;
        if (!device) {
            device = (await client.query(
                `INSERT INTO devices (account_id, token_hash, user_agent, first_ip, last_ip)
                 VALUES ($1, $2, $3, $4, $4) RETURNING *`,
                [account.id, sha256(deviceToken), meta.userAgent.slice(0, 300), meta.ip],
            )).rows[0];
        } else {
            await client.query("UPDATE devices SET last_seen_at = now(), last_ip = $2 WHERE id = $1", [device.id, meta.ip]);
        }
        const actor = { type: "account" as const, accountId: account.id, label: account.username, deviceId: device.id, ip: meta.ip, userAgent: meta.userAgent };

        if (device.revoked_at) {
            await audit(client, actor, { action: "auth.login_blocked", entityType: "device", entityId: device.id, reason: "Thiết bị đã bị thu hồi" });
            return { blocked: "Thiết bị này đã bị owner thu hồi quyền đăng nhập." };
        }
        if (settings.require_device_approval && account.account_type !== "owner" && !device.approved_at) {
            await audit(client, actor, { action: "auth.login_pending_device", entityType: "device", entityId: device.id });
            return { blocked: "Thiết bị mới cần owner duyệt trước khi đăng nhập. Hãy báo owner duyệt trong mục Nhân viên." };
        }

        const shift = (await client.query(
            `INSERT INTO shifts (account_id, device_id, token_hash, expires_at)
             VALUES ($1, $2, $3, now() + make_interval(hours => $4)) RETURNING id`,
            [account.id, device.id, sha256(shiftToken), settings.shift_max_hours],
        )).rows[0];
        await client.query("UPDATE accounts SET last_login_at = now() WHERE id = $1", [account.id]);
        await audit(client, actor, {
            action: "auth.login",
            entityType: "shift",
            entityId: shift.id,
            after: { new_device: isNewDevice, first_login: account.must_change_password },
        });
        return { alert: isNewDevice && Boolean(hadDevices) };
    });

    if ("blocked" in result && result.blocked) {
        store.set(DEVICE_COOKIE, deviceToken, cookieOptions(60 * 60 * 24 * 365));
        throw new HttpError(403, result.blocked);
    }

    store.set(DEVICE_COOKIE, deviceToken, cookieOptions(60 * 60 * 24 * 365));
    store.set(SHIFT_COOKIE, shiftToken, cookieOptions(settings.shift_max_hours * 3600));

    if (result.alert) {
        // Cảnh báo đăng nhập trên thiết bị mới cho owner và nhân viên (best effort: không chặn đăng nhập nếu lỗi mail).
        const owner = (await db.query("SELECT email FROM accounts WHERE account_type = 'owner'")).rows[0];
        const recipients = [...new Set([owner?.email, account.email].filter(Boolean))] as string[];
        const message = `Tài khoản ${account.username} (${account.full_name}) vừa đăng nhập trên một thiết bị mới.\nTrình duyệt: ${meta.userAgent || "không rõ"}\nIP: ${meta.ip ?? "không rõ"}\nNếu không phải bạn, owner hãy khoá tài khoản hoặc thu hồi thiết bị trong mục Nhân viên.`;
        await Promise.all(recipients.map((to) => sendMail({
            to,
            subject: `[${tenant.displayName}] Cảnh báo đăng nhập thiết bị mới: ${account.username}`,
            text: message,
            html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
        }).catch((error) => console.error("New-device alert email failed:", error))));
    }

    return ok({
        mustChangePassword: account.must_change_password,
        redirectTo: account.account_type === "owner" ? "/admin/dashboard" : account.account_type === "kitchen" ? "/staff/kitchen" : "/staff",
    });
});
