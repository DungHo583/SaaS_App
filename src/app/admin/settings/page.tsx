import { connection } from "next/server";
import SettingsManager from "@/components/admin/SettingsManager";
import { requirePageActor } from "@/lib/page-auth";

export const instant = false;

export default async function AdminSettingsPage() {
    await connection();
    const actor = await requirePageActor("admin");
    return (
        <SettingsManager
            initialSettings={JSON.parse(JSON.stringify(actor.settings))}
            owner={{ fullName: actor.account.full_name, email: actor.account.email, phone: actor.account.phone }}
        />
    );
}
