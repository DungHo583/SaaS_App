import { connection } from "next/server";
import AuditViewer from "@/components/admin/AuditViewer";
import { requirePageActor } from "@/lib/page-auth";

export const instant = false;

export default async function AdminAuditPage() {
    await connection();
    await requirePageActor("admin");
    return <AuditViewer />;
}
