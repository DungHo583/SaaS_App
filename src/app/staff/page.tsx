import { connection } from "next/server";
import StaffBoard from "@/components/staff/StaffBoard";
import { requirePageActor } from "@/lib/page-auth";

export const instant = false;

export default async function StaffPage() {
    await connection();
    await requirePageActor(["order", "runner", "cashier"]);
    return <StaffBoard />;
}
