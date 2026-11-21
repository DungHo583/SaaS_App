import { connection } from "next/server";
import StaffManager from "@/components/admin/StaffManager";
import { listAccounts } from "@/lib/accounts";
import { requirePageActor } from "@/lib/page-auth";

export const instant = false;

export default async function AdminStaffPage() {
    await connection();
    const actor = await requirePageActor("admin");
    const accounts = await listAccounts(actor.db);
    return <StaffManager initialAccounts={JSON.parse(JSON.stringify(accounts))} requireDeviceApproval={actor.settings.require_device_approval} />;
}
