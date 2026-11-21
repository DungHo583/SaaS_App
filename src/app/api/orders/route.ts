import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type CartItem = { id: number; quantity: number };

export async function POST(request: NextRequest) {
    const body = await request.json();
    const tableId = Number(body.tableId);
    const idempotencyKey = String(body.idempotencyKey ?? request.headers.get("idempotency-key") ?? "").trim();
    const items = Array.isArray(body.items) ? body.items as CartItem[] : [];

    if (!Number.isInteger(tableId) || tableId < 1) {
        return NextResponse.json({ error: "Vui lòng quét mã QR của bàn trước khi gọi món." }, { status: 400 });
    }
    if (!idempotencyKey) {
        return NextResponse.json({ error: "Thiếu mã xác nhận đơn." }, { status: 400 });
    }
    if (items.length === 0) {
        return NextResponse.json({ error: "Giỏ hàng đang trống." }, { status: 400 });
    }

    const normalized = new Map<number, number>();
    for (const item of items) {
        const id = Number(item.id);
        const quantity = Number(item.quantity);
        if (!Number.isInteger(id) || id < 1 || !Number.isInteger(quantity) || quantity < 1) {
            return NextResponse.json({ error: "Danh sách món không hợp lệ." }, { status: 400 });
        }
        normalized.set(id, (normalized.get(id) ?? 0) + quantity);
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");

        const existing = await client.query(
            "SELECT id, table_id, status, subtotal, discount, total, created_at FROM orders WHERE idempotency_key = $1",
            [idempotencyKey],
        );
        if (existing.rows.length > 0) {
            await client.query("COMMIT");
            return NextResponse.json({ order: existing.rows[0], duplicate: true }, { status: 200 });
        }

        const table = await client.query("SELECT id FROM restaurant_tables WHERE id = $1", [tableId]);
        if (table.rows.length === 0) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: "Không tìm thấy bàn." }, { status: 404 });
        }

        const ids = [...normalized.keys()];
        const menuResult = await client.query(
            `SELECT id, name, price, stock, is_available
       FROM menu_items
       WHERE id = ANY($1::int[])`,
            [ids],
        );

        const menuById = new Map(menuResult.rows.map((row) => [row.id, row]));
        let subtotal = 0;
        const validatedItems: Array<{ id: number; name: string; price: number; quantity: number }> = [];

        for (const [id, quantity] of normalized) {
            const menuItem = menuById.get(id);
            if (!menuItem || !menuItem.is_available) {
                await client.query("ROLLBACK");
                return NextResponse.json({ error: "Một món trong giỏ hiện không khả dụng." }, { status: 409 });
            }
            if (Number(menuItem.stock) < quantity) {
                await client.query("ROLLBACK");
                return NextResponse.json({ error: `Không đủ số lượng cho món ${menuItem.name}.` }, { status: 409 });
            }
            const price = Number(menuItem.price);
            subtotal += price * quantity;
            validatedItems.push({ id, name: menuItem.name, price, quantity });
        }

        const orderResult = await client.query(
            `INSERT INTO orders (table_id, status, subtotal, discount, total, idempotency_key)
       VALUES ($1, 'pending', $2, 0, $2, $3)
       RETURNING id, table_id, status, subtotal, discount, total, idempotency_key, created_at, updated_at`,
            [tableId, subtotal, idempotencyKey],
        );
        const order = orderResult.rows[0];

        for (const item of validatedItems) {
            await client.query(
                `INSERT INTO order_items (order_id, menu_item_id, name, unit_price, quantity, line_total, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
                [order.id, item.id, item.name, item.price, item.quantity, item.price * item.quantity],
            );
            await client.query(
                "UPDATE menu_items SET stock = stock - $1, updated_at = NOW() WHERE id = $2",
                [item.quantity, item.id],
            );
        }

        await client.query(
            "INSERT INTO order_status_history (order_id, status, note) VALUES ($1, 'pending', 'Khách tạo đơn')",
            [order.id],
        );

        await client.query(
            "UPDATE restaurant_tables SET status = 'occupied', updated_at = NOW() WHERE id = $1",
            [tableId],
        );

        await client.query("COMMIT");
        return NextResponse.json({ order, duplicate: false }, { status: 201 });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Create order failed:", error);
        return NextResponse.json({ error: "Không thể tạo đơn." }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function GET(request: NextRequest) {
    const tableId = Number(request.nextUrl.searchParams.get("tableId"));
    if (!Number.isInteger(tableId) || tableId < 1) {
        return NextResponse.json({ error: "Thiếu mã bàn." }, { status: 400 });
    }

    try {
        const result = await db.query(`
      SELECT o.id, o.status, o.subtotal, o.discount, o.total, o.created_at,
             t.name AS table_name,
             COALESCE(json_agg(json_build_object(
               'id', oi.id,
               'name', oi.name,
               'unit_price', oi.unit_price,
               'quantity', oi.quantity,
               'line_total', oi.line_total,
               'status', oi.status
             ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o
      JOIN restaurant_tables t ON t.id = o.table_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.table_id = $1
      GROUP BY o.id, t.name
      ORDER BY o.created_at DESC
    `, [tableId]);
        return NextResponse.json({ orders: result.rows });
    } catch (error) {
        console.error("Order history failed:", error);
        return NextResponse.json({ error: "Không thể tải lịch sử đơn." }, { status: 500 });
    }
}
