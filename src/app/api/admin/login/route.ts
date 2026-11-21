import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");

        if (!email || !password) {
            return NextResponse.json({ error: "Vui lòng nhập email và mật khẩu." }, { status: 400 });
        }

        const result = await db.query(
            "SELECT id, email, password_hash, name, is_active FROM admin_users WHERE email = $1",
            [email],
        );

        const user = result.rows[0];
        if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
            return NextResponse.json({ error: "Email hoặc mật khẩu không chính xác." }, { status: 401 });
        }

        await createSession({ id: user.id, email: user.email, name: user.name });
        return NextResponse.json({ ok: true, redirectTo: "/admin/dashboard" });
    } catch (error) {
        console.error("Admin login failed:", error);
        return NextResponse.json({ error: "Không thể kết nối cơ sở dữ liệu." }, { status: 503 });
    }
}
