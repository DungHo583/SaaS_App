import { connection } from "next/server";
import KitchenBoard from "@/components/staff/KitchenBoard";
import { requirePageActor } from "@/lib/page-auth";

export const instant = false;

export default async function KitchenPage() {
    await connection();
    await requirePageActor("kitchen");
    return <KitchenBoard />;
}
