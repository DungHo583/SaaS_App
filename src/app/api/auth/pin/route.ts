import { audit } from "@/lib/audit";
import { auditActor, confirmPin, getActor } from "@/lib/auth";
import { HttpError, ok, readJson, route } from "@/lib/http";

/** Mở khoá màn hình bằng PIN (cửa sổ PIN = idle_logout_seconds). */
export const POST = route(async (request) => {
    const actor = await getActor();
    if (!actor) throw new HttpError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "login_required");
    if (actor.account.must_change_password) throw new HttpError(428, "Cần đổi mật khẩu và đặt PIN trước.", "first_login_required");
    const body = await readJson(request);
    await confirmPin(actor, body.pin);
    await audit(actor.db, auditActor(actor), { action: "auth.pin_unlocked", entityType: "shift", entityId: actor.shift.id });
    return ok({ ok: true });
});
