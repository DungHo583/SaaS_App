import { getActor, pinIsFresh, publicAccount } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { capabilities } from "@/lib/permissions";

/** Trạng thái đăng nhập cho client: tài khoản, quyền, PIN còn hiệu lực không. */
export const GET = route(async () => {
    const actor = await getActor();
    if (!actor) throw new HttpError(401, "Chưa đăng nhập.", "login_required");
    return ok({
        account: publicAccount(actor.account),
        capabilities: capabilities(actor.account),
        mustChangePassword: actor.account.must_change_password,
        pinFresh: pinIsFresh(actor),
        idleSeconds: actor.settings.idle_logout_seconds,
        restaurantName: actor.settings.display_name,
    });
});
