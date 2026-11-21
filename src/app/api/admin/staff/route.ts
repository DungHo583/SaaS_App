import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

export async function GET() {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [staffResult, roleResult] = await Promise.all([
        db.query(`SELECT s.id, s.name, s.email, s.phone, s.role_id, r.display_name AS role_name,
                     s.is_active, s.created_at, s.updated_at
              FROM staff_users s JOIN staff_roles r ON r.id = s.role_id
              ORDER BY s.id`),
        db.query("SELECT id, name, display_name, permissions FROM staff_roles ORDER BY id"),
    ]);

    return NextResponse.json({ staff: staffResult.rows, roles: roleResult.rows });
}

export async function POST(request: NextRequest) {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const roleId = Number(body.roleId);
    const password = String(body.password ?? "");

    if (!name || !email || !Number.isInteger(roleId) || password.length < 8) {
        return NextResponse.json({ error: "Nhập đầy đủ họ tên, email, vai trò và mật khẩu tối thiểu 8 ký tự." }, { status: 400 });
    }

    try {
        const result = await db.query(
            `INSERT INTO staff_users (name, email, phone, role_id, password_hash)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5)
       RETURNING id, name, email, phone, role_id, is_active, created_at, updated_at`,
            [name, email, phone, roleId, hashPassword(password)],
        );

        const staff = await db.query(
            `SELECT s.id, s.name, s.email, s.phone, s.role_id, r.display_name AS role_name,
              s.is_active, s.created_at, s.updated_at
       FROM staff_users s JOIN staff_roles r ON r.id = s.role_id WHERE s.id = $1`,
            [result.rows[0].id],
        );

        return NextResponse.json({ staff: staff.rows[0] }, { status: 201 });
    } catch (error: any) {
        if (error?.code === "23505") {
            return NextResponse.json({ error: "Email nhân viên đã tồn tại." }, { status: 409 });
        }
        throw error;
    }
}
