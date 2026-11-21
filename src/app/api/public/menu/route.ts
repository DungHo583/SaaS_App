import { ok, route } from "@/lib/http";
import { listSellableMenu } from "@/lib/menu";
import { loadSettings, publicSettings } from "@/lib/settings";
import { getTenantDb } from "@/lib/tenant";

/** Thực đơn công khai của quán (theo subdomain). */
export const GET = route(async () => {
    const { db } = await getTenantDb();
    const settings = await loadSettings(db);
    return ok({ restaurant: publicSettings(settings), ...await listSellableMenu(db, settings.inventory_enabled) });
});
