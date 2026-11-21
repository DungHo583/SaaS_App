import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import StaffManager from "@/components/admin/StaffManager";

export const instant = false;

export default async function StaffPage() {
    await connection();
    const session = await getSession();
    if (!session) redirect("/admin/login");

    const [staffResult, roleResult] = await Promise.all([
        db.query(`SELECT s.id, s.name, s.email, s.phone, s.role_id, r.display_name AS role_name,
                     s.is_active, s.created_at, s.updated_at
              FROM staff_users s JOIN staff_roles r ON r.id = s.role_id ORDER BY s.id`),
        db.query("SELECT id, name, display_name, permissions FROM staff_roles ORDER BY id"),
    ]);

    return <StaffManager initialStaff={staffResult.rows} initialRoles={roleResult.rows} user={session} />;
}
