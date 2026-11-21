import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const tableId = Number(id);
    if (!Number.isInteger(tableId) || tableId < 1) {
        return NextResponse.json({ error: "Bàn không hợp lệ." }, { status: 400 });
    }

    try {
        const result = await db.query(
            "SELECT id, name, area, capacity, status FROM restaurant_tables WHERE id = $1",
            [tableId],
        );
        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Không tìm thấy bàn." }, { status: 404 });
        }
        return NextResponse.json({ table: result.rows[0] });
    } catch (error) {
        console.error("Table lookup failed:", error);
        return NextResponse.json({ error: "Không thể tải thông tin bàn." }, { status: 503 });
    }
}
