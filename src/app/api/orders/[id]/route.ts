import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId < 1) {
        return NextResponse.json({ error: "Mã đơn không hợp lệ." }, { status: 400 });
    }

    try {
        const orderResult = await db.query(`
      SELECT o.id, o.table_id, o.status, o.subtotal, o.discount, o.total, o.created_at,
             t.name AS table_name
      FROM orders o JOIN restaurant_tables t ON t.id = o.table_id
      WHERE o.id = $1
    `, [orderId]);
        if (orderResult.rows.length === 0) {
            return NextResponse.json({ error: "Không tìm thấy đơn." }, { status: 404 });
        }

        const [itemsResult, historyResult, billResult] = await Promise.all([
            db.query("SELECT id, name, unit_price, quantity, line_total, status FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]),
            db.query("SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at", [orderId]),
            db.query("SELECT id, status, subtotal, discount, total, paid_at FROM bills WHERE order_id = $1", [orderId]),
        ]);

        return NextResponse.json({
            order: orderResult.rows[0],
            items: itemsResult.rows,
            history: historyResult.rows,
            bill: billResult.rows[0] ?? null,
        });
    } catch (error) {
        console.error("Order detail failed:", error);
        return NextResponse.json({ error: "Không thể tải đơn." }, { status: 500 });
    }
}
