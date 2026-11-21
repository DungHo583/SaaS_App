import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { auditActor, getActor, SHIFT_COOKIE } from "@/lib/auth";
import { ok, route } from "@/lib/http";

/** Kết thúc ca đăng nhập. */
export const POST = route(async () => {
    const actor = await getActor();
    if (actor) {
        await actor.db.query("UPDATE shifts SET ended_at = now(), end_reason = 'logout' WHERE id = $1", [actor.shift.id]);
        await audit(actor.db, auditActor(actor), { action: "auth.logout", entityType: "shift", entityId: actor.shift.id });
    }
    (await cookies()).delete(SHIFT_COOKIE);
    return ok({ ok: true });
});
