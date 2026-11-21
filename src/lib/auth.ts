import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Pool } from "pg";
import type { AuditActor } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { verifySecret } from "@/lib/password";
import { can, isElevated, roleContext, type AccountType, type Capability } from "@/lib/permissions";
import { loadSettings, type RestaurantSettings } from "@/lib/settings";
import { getTenantDb, type Tenant } from "@/lib/tenant";

/**
 * Xác thực nhân viên (BUSINESS_PROCESS mục 3):
 * - Ca đăng nhập: username + mật khẩu → bản ghi `shifts`, cookie bn_shift (token ngẫu nhiên, DB chỉ lưu SHA-256).
 * - Thiết bị: cookie bn_device dài hạn → `devices` (cảnh báo khi đăng nhập trên thiết bị mới).
 * - PIN: mỗi thao tác cần PIN đã xác thực trong `idle_logout_seconds` (shifts.pin_verified_at, trượt).
 * Cookie chỉ gắn với host (subdomain của quán), nên không dùng chéo giữa các quán.
 */
export const SHIFT_COOKIE = "bn_shift";
export const DEVICE_COOKIE = "bn_device";
export const GUEST_COOKIE = "bn_guest";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

export type AccountRow = {
    id: string;
    username: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    account_type: AccountType;
    roles: string[];
    password_hash: string;
    must_change_password: boolean;
    pin_hash: string | null;
    pin_failed_attempts: number;
    is_active: boolean;
};

export type Actor = {
    tenant: Tenant;
    db: Pool;
    account: AccountRow;
    shift: { id: string; device_id: string; pin_verified_at: Date | null; expires_at: Date };
    settings: RestaurantSettings;
    ip: string | null;
    userAgent: string;
};

export async function requestMeta() {
    const list = await headers();
    const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || null;
    return { ip: ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null, userAgent: list.get("user-agent") ?? "" };
}

export function cookieOptions(maxAge: number) {
    return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

/** Ca đăng nhập hiện tại (null nếu chưa đăng nhập / hết hạn / bị khoá). Không kiểm tra PIN. */
export async function getActor(): Promise<Actor | null> {
    const token = (await cookies()).get(SHIFT_COOKIE)?.value;
    if (!token) return null;
    const { tenant, db } = await getTenantDb();
    const result = await db.query(
        `SELECT s.id AS shift_id, s.device_id, s.pin_verified_at, s.expires_at, a.*
         FROM shifts s JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = $1 AND s.ended_at IS NULL AND s.expires_at > now() AND a.is_active`,
        [sha256(token)],
    );
    const row = result.rows[0];
    if (!row) return null;
    const { shift_id, device_id, pin_verified_at, expires_at, ...account } = row;
    const meta = await requestMeta();
    return {
        tenant,
        db,
        account: account as AccountRow,
        shift: { id: shift_id, device_id, pin_verified_at, expires_at },
        settings: await loadSettings(db),
        ...meta,
    };
}

export function pinIsFresh(actor: Actor) {
    const verified = actor.shift.pin_verified_at;
    return Boolean(verified) && Date.now() - new Date(verified as Date).getTime() < actor.settings.idle_logout_seconds * 1000;
}

/**
 * Bắt buộc đăng nhập (+ PIN còn hiệu lực, + quyền). Gia hạn cửa sổ PIN khi hợp lệ.
 * 401 = cần đăng nhập, 428 = cần đổi mật khẩu & đặt PIN, 423 = cần nhập PIN, 403 = không có quyền.
 */
export async function requireActor(capability?: Capability, { requirePin = true } = {}): Promise<Actor> {
    const actor = await getActor();
    if (!actor) throw new HttpError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "login_required");
    if (actor.account.must_change_password) {
        throw new HttpError(428, "Cần đổi mật khẩu và đặt PIN trước khi làm việc.", "first_login_required");
    }
    if (requirePin) {
        if (!pinIsFresh(actor)) throw new HttpError(423, "Nhập PIN để tiếp tục.", "pin_required");
        await actor.db.query("UPDATE shifts SET pin_verified_at = now() WHERE id = $1", [actor.shift.id]);
    }
    if (capability && !can(actor.account, capability)) {
        throw new HttpError(403, "Tài khoản của bạn không có quyền thực hiện thao tác này.", "forbidden");
    }
    return actor;
}

/** Người thực hiện cho audit_log, kèm vai trò đang dùng. */
export function auditActor(actor: Actor, capability?: Capability): AuditActor {
    return {
        type: "account",
        accountId: actor.account.id,
        label: actor.account.username,
        deviceId: actor.shift.device_id,
        ip: actor.ip,
        userAgent: actor.userAgent,
        roleContext: capability ? roleContext(actor.account, capability) : actor.account.account_type === "owner" ? "owner" : null,
        isElevated: capability ? isElevated(actor.account, capability) : false,
    };
}

/** Thông tin an toàn để trả cho client. */
export function publicAccount(account: AccountRow) {
    return {
        id: account.id,
        username: account.username,
        fullName: account.full_name,
        email: account.email,
        accountType: account.account_type,
        roles: account.roles,
    };
}

/**
 * Xác nhận lại PIN cho thao tác nhạy cảm (thu tiền, phát hành phiếu, đóng bất thường...).
 * Sai quá `pin_max_attempts` → kết thúc ca, phải đăng nhập lại bằng mật khẩu.
 */
export async function confirmPin(actor: Actor, pin: unknown) {
    const value = typeof pin === "string" ? pin : "";
    if (verifySecret(value, actor.account.pin_hash)) {
        await actor.db.query("UPDATE accounts SET pin_failed_attempts = 0 WHERE id = $1", [actor.account.id]);
        await actor.db.query("UPDATE shifts SET pin_verified_at = now() WHERE id = $1", [actor.shift.id]);
        return;
    }
    const result = await actor.db.query(
        "UPDATE accounts SET pin_failed_attempts = pin_failed_attempts + 1 WHERE id = $1 RETURNING pin_failed_attempts",
        [actor.account.id],
    );
    if (result.rows[0].pin_failed_attempts >= actor.settings.pin_max_attempts) {
        await actor.db.query(
            "UPDATE shifts SET ended_at = now(), end_reason = 'pin_locked' WHERE account_id = $1 AND ended_at IS NULL",
            [actor.account.id],
        );
        await actor.db.query("UPDATE accounts SET pin_failed_attempts = 0, pin_locked_at = now() WHERE id = $1", [actor.account.id]);
        (await cookies()).delete(SHIFT_COOKIE);
        throw new HttpError(401, "Sai PIN quá số lần cho phép. Vui lòng đăng nhập lại bằng mật khẩu.", "login_required");
    }
    throw new HttpError(400, `PIN không đúng (còn ${actor.settings.pin_max_attempts - result.rows[0].pin_failed_attempts} lần thử).`, "pin_wrong");
}

/** Khoá thiết bị khách (ẩn danh) — cookie bn_guest dài hạn; DB chỉ lưu hash. */
export async function guestKeyHash({ create }: { create: boolean }) {
    const store = await cookies();
    let token = store.get(GUEST_COOKIE)?.value;
    if (!token && create) {
        token = randomToken();
        store.set(GUEST_COOKIE, token, cookieOptions(60 * 60 * 24 * 365));
    }
    return token ? sha256(token) : null;
}
