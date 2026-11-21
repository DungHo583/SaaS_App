import { getActor } from "@/lib/auth";
import { ok, route } from "@/lib/http";

/** Khoá màn hình ngay (sau khi hoàn thành thao tác hoặc hết thời gian chờ). */
export const POST = route(async () => {
    const actor = await getActor();
    if (actor) await actor.db.query("UPDATE shifts SET pin_verified_at = NULL WHERE id = $1", [actor.shift.id]);
    return ok({ ok: true });
});
