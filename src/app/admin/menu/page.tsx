import { connection } from "next/server";
import MenuManager from "@/components/admin/MenuManager";
import { listMenuAdmin } from "@/lib/menu";
import { requirePageActor } from "@/lib/page-auth";

export const instant = false;

export default async function AdminMenuPage() {
    await connection();
    const actor = await requirePageActor("admin");
    const { items, categories } = await listMenuAdmin(actor.db);
    return (
        <MenuManager
            initialItems={items.map((item) => ({ ...item, sold_out_at: item.sold_out_at?.toISOString() ?? null }))}
            initialCategories={categories}
        />
    );
}
