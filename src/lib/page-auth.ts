import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { can, type Capability } from "@/lib/permissions";

/**
 * Bảo vệ trang server-side: chưa đăng nhập → /admin/login; chưa đổi mật khẩu → bước đăng nhập lần đầu;
 * không đủ quyền → về màn hình phù hợp với tài khoản. PIN do <PinGate> phía client + API kiểm tra.
 */
export async function requirePageActor(capability: Capability | Capability[]) {
    let actor;
    try {
        actor = await getActor();
    } catch (error) {
        if (error instanceof HttpError) redirect("/admin/login");
        throw error;
    }
    if (!actor) redirect("/admin/login");
    if (actor.account.must_change_password) redirect("/admin/login?step=first");
    const allowed = Array.isArray(capability) ? capability : [capability];
    if (!allowed.some((value) => can(actor.account, value))) {
        redirect(actor.account.account_type === "kitchen" ? "/staff/kitchen" : "/staff");
    }
    return actor;
}
