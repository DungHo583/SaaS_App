import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await db.query(
        "SELECT id, name, area, capacity, status, created_at, updated_at FROM restaurant_tables ORDER BY id",
    );
    return NextResponse.json({ tables: result.rows });
}

export async function POST(request: NextRequest) {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const area = String(body.area ?? "Tầng 1").trim();
    const capacity = Number(body.capacity);
    const status = String(body.status ?? "available");

    if (!name || !Number.isInteger(capacity) || capacity < 1) {
        return NextResponse.json({ error: "Tên bàn và sức chứa hợp lệ là bắt buộc." }, { status: 400 });
    }

    if (!["available", "occupied", "cleaning"].includes(status)) {
        return NextResponse.json({ error: "Trạng thái bàn không hợp lệ." }, { status: 400 });
    }

    try {
        const result = await db.query(
            `INSERT INTO restaurant_tables (name, area, capacity, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, area, capacity, status, created_at, updated_at`,
            [name, area, capacity, status],
        );
        return NextResponse.json({ table: result.rows[0] }, { status: 201 });
    } catch (error: any) {
        if (error?.code === "23505") {
            return NextResponse.json({ error: "Tên bàn đã tồn tại." }, { status: 409 });
        }
        throw error;
    }
}
