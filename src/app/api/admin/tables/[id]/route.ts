import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
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

    const result = await db.query(
        `UPDATE restaurant_tables
     SET name = $1, area = $2, capacity = $3, status = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, area, capacity, status, created_at, updated_at`,
        [name, area, capacity, status, Number(id)],
    );

    if (result.rowCount === 0) return NextResponse.json({ error: "Không tìm thấy bàn." }, { status: 404 });
    return NextResponse.json({ table: result.rows[0] });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const result = await db.query("DELETE FROM restaurant_tables WHERE id = $1", [Number(id)]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Không tìm thấy bàn." }, { status: 404 });
    return NextResponse.json({ ok: true });
}
