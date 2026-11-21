import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { hasOtpGrant } from "@/lib/otp";

/** Xem log (chỉ owner, cần OTP trong 15 phút). Bản thân việc xem cũng được ghi log. */
export const GET = route(async (request) => {
    const actor = await requireActor("admin");
    if (!await hasOtpGrant(actor, "view_audit")) {
        throw new HttpError(403, "Xem log cần mã OTP gửi về email owner.", "otp_required");
    }
    const params = request.nextUrl.searchParams;
    const category = params.get("category") === "customer" ? "customer" : "shop";
    const before = Number(params.get("before")) || null;
    const action = params.get("action")?.trim() || null;

    const [rows, chain] = await Promise.all([
        actor.db.query(
            `SELECT l.id, l.occurred_at, l.actor_type, l.actor_label, l.role_context, l.is_elevated, l.action,
                    l.entity_type, l.entity_id, l.session_id, l.before_data, l.after_data, l.reason, host(l.ip) AS ip
             FROM audit_log l
             WHERE l.category = $1 AND ($2::bigint IS NULL OR l.id < $2) AND ($3::text IS NULL OR l.action LIKE $3 || '%')
             ORDER BY l.id DESC LIMIT 100`,
            [category, before, action],
        ),
        actor.db.query("SELECT audit_verify_chain() AS broken_at"),
    ]);
    await audit(actor.db, auditActor(actor, "admin"), { action: "audit.viewed", after: { category, before, action } });
    return ok({ entries: rows.rows, chainBrokenAt: chain.rows[0].broken_at });
});
