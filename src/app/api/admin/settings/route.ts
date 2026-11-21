import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, integer, ok, readJson, route, text } from "@/lib/http";
import { hasOtpGrant } from "@/lib/otp";
import { loadSettings } from "@/lib/settings";

const TEXT_FIELDS = {
    displayName: ["display_name", 120, "Tên quán"],
    legalName: ["legal_name", 200, "Tên hộ kinh doanh"],
    taxCode: ["tax_code", 14, "MST"],
    address: ["address", 300, "Địa chỉ"],
    phone: ["phone", 20, "Số điện thoại"],
    email: ["email", 254, "Email quán"],
} as const;

const BOOL_FIELDS = {
    confirmAllCustomerOrders: "confirm_all_customer_orders",
    requireDeviceApproval: "require_device_approval",
    inventoryEnabled: "inventory_enabled",
    inventoryBlocking: "inventory_blocking",
} as const;

const INT_FIELDS = {
    junkRoundMinutes: ["junk_round_minutes", 1, 120, "Thời gian chờ xác nhận"],
    idleLogoutSeconds: ["idle_logout_seconds", 15, 3600, "Thời gian tự khoá"],
    pinMaxAttempts: ["pin_max_attempts", 3, 10, "Số lần nhập sai PIN"],
    shiftMaxHours: ["shift_max_hours", 1, 24, "Thời lượng ca"],
} as const;

export const GET = route(async () => {
    const actor = await requireActor("admin");
    return ok({ settings: await loadSettings(actor.db), ownerEmail: actor.account.email });
});

/** Cập nhật cấu hình quán. Đổi tài khoản nhận chuyển khoản phải xác thực OTP trước. */
export const PATCH = route(async (request) => {
    const actor = await requireActor("admin");
    const body = await readJson(request);
    const current = await loadSettings(actor.db);
    const changes: Record<string, unknown> = {};

    for (const [key, [column, max, label]] of Object.entries(TEXT_FIELDS)) {
        if (key in body) changes[column] = text(body[key], { max, label, required: column === "display_name" });
    }
    for (const [key, column] of Object.entries(BOOL_FIELDS)) {
        if (key in body) changes[column] = body[key] === true;
    }
    for (const [key, [column, min, max, label]] of Object.entries(INT_FIELDS)) {
        if (key in body) changes[column] = integer(body[key], { min, max, label });
    }

    if ("bankBin" in body || "bankAccountNo" in body || "bankAccountName" in body) {
        const bankBin = text(body.bankBin, { max: 6, label: "Mã ngân hàng" }) || null;
        const bankAccountNo = text(body.bankAccountNo, { max: 19, label: "Số tài khoản" }) || null;
        const bankAccountName = text(body.bankAccountName, { max: 100, label: "Tên chủ tài khoản" }).toUpperCase() || null;
        const changed = bankBin !== current.bank_bin || bankAccountNo !== current.bank_account_no || bankAccountName !== current.bank_account_name;
        if (changed) {
            if (!await hasOtpGrant(actor, "change_bank_account")) {
                throw new HttpError(403, "Đổi tài khoản nhận tiền cần xác thực OTP gửi về email owner.", "otp_required");
            }
            Object.assign(changes, { bank_bin: bankBin, bank_account_no: bankAccountNo, bank_account_name: bankAccountName });
        }
    }

    const columns = Object.keys(changes);
    if (columns.length === 0) return ok({ settings: current });

    const settings = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            `UPDATE restaurant_settings SET ${columns.map((column, index) => `${column} = $${index + 1}`).join(", ")}, updated_by = $${columns.length + 1}
             WHERE id = 1 RETURNING *`,
            [...columns.map((column) => changes[column]), actor.account.id],
        );
        const before = Object.fromEntries(columns.map((column) => [column, current[column as keyof typeof current]]));
        await audit(client, auditActor(actor, "admin"), {
            action: columns.some((column) => column.startsWith("bank_")) ? "settings.bank_account_changed" : "settings.updated",
            entityType: "restaurant_settings",
            entityId: "1",
            before,
            after: changes,
            retention: columns.some((column) => column.startsWith("bank_")) ? "financial" : "general",
        });
        return result.rows[0];
    });
    return ok({ settings });
});
