import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const roleId = Number(body.roleId);
    const isActive = Boolean(body.isActive);
    const password = String(body.password ?? "");

    if (!name || !email || !Number.isInteger(roleId)) {
        return NextResponse.json({ error: "Họ tên, email và vai trò là bắt buộc." }, { status: 400 });
    }
    if (password && password.length < 8) {
        return NextResponse.json({ error: "Mật khẩu mới tối thiểu 8 ký tự." }, { status: 400 });
    }

    const passwordHash = password ? hashPassword(password) : null;
    const result = await db.query(
        `UPDATE staff_users
     SET name = $1, email = $2, phone = NULLIF($3, ''), role_id = $4,
         is_active = $5,
         password_hash = COALESCE($6, password_hash),
         updated_at = NOW()
     WHERE id = $7
     RETURNING id`,
        [name, email, phone, roleId, isActive, passwordHash, Number(id)],
    );

    if (result.rowCount === 0) return NextResponse.json({ error: "Không tìm thấy nhân viên." }, { status: 404 });

    const staff = await db.query(
        `SELECT s.id, s.name, s.email, s.phone, s.role_id, r.display_name AS role_name,
            s.is_active, s.created_at, s.updated_at
     FROM staff_users s JOIN staff_roles r ON r.id = s.role_id WHERE s.id = $1`,
        [Number(id)],
    );

    return NextResponse.json({ staff: staff.rows[0] });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const result = await db.query(
        "UPDATE staff_users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id",
        [Number(id)],
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Không tìm thấy nhân viên." }, { status: 404 });
    return NextResponse.json({ ok: true });
}
