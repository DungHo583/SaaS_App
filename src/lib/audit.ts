import type { Queryable } from "@/lib/db";

/** Người thực hiện thao tác, ghi vào audit_log. */
export type AuditActor =
    | {
        type: "account";
        accountId: string;
        label: string;
        deviceId?: string | null;
        ip?: string | null;
        userAgent?: string | null;
        roleContext?: string | null;
        isElevated?: boolean;
    }
    | { type: "customer_device"; deviceKeyHash: string; ip?: string | null; userAgent?: string | null }
    | { type: "platform_admin"; label: string; ip?: string | null; userAgent?: string | null }
    | { type: "system" };

export type AuditEntry = {
    action: string;
    entityType?: string;
    entityId?: string | null;
    sessionId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
    /** financial: tiền, chứng từ (lưu 10 năm); general: còn lại (2 năm). */
    retention?: "financial" | "general";
};

/**
 * Ghi 1 dòng audit_log (chỉ thêm; chuỗi băm do trigger tính).
 * Gọi TRONG cùng transaction với thay đổi dữ liệu để log và dữ liệu luôn khớp nhau.
 */
export async function audit(db: Queryable, actor: AuditActor, entry: AuditEntry) {
    const isCustomer = actor.type === "customer_device";
    await db.query(
        `INSERT INTO audit_log (
            category, retention, actor_type, actor_account_id, actor_label, role_context, is_elevated,
            device_id, customer_device_key_hash, ip, user_agent,
            action, entity_type, entity_id, session_id, before_data, after_data, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
            isCustomer ? "customer" : "shop",
            entry.retention ?? "general",
            actor.type,
            actor.type === "account" ? actor.accountId : null,
            actor.type === "account" || actor.type === "platform_admin" ? actor.label : actor.type === "customer_device" ? "khách" : "system",
            actor.type === "account" ? actor.roleContext ?? null : null,
            actor.type === "account" ? actor.isElevated ?? false : false,
            actor.type === "account" ? actor.deviceId ?? null : null,
            isCustomer ? actor.deviceKeyHash : null,
            "ip" in actor ? actor.ip ?? null : null,
            "userAgent" in actor ? actor.userAgent?.slice(0, 300) ?? null : null,
            entry.action,
            entry.entityType ?? null,
            entry.entityId ?? null,
            entry.sessionId ?? null,
            entry.before === undefined ? null : JSON.stringify(entry.before),
            entry.after === undefined ? null : JSON.stringify(entry.after),
            entry.reason ?? null,
        ],
    );
}
