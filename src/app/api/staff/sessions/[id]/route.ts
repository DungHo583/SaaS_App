import { requireActor } from "@/lib/auth";
import { HttpError, ok, route, uuid } from "@/lib/http";
import { listSellableMenu } from "@/lib/menu";
import { expireJunkRounds } from "@/lib/ops";
import { loadSessionDetail } from "@/lib/sessions";

export const GET = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor();
    await expireJunkRounds(actor.db, actor.settings);
    const detail = await loadSessionDetail(actor.db, uuid(params.id, "Mã phiên"));
    if (!detail) throw new HttpError(404, "Không tìm thấy phiên.");
    const menu = await listSellableMenu(actor.db, actor.settings.inventory_enabled);
    return ok({
        ...detail,
        menu,
        bank: actor.settings.bank_bin ? { bin: actor.settings.bank_bin, accountNo: actor.settings.bank_account_no, accountName: actor.settings.bank_account_name } : null,
    });
});
