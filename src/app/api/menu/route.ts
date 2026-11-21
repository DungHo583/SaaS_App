import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.query(`
      SELECT mi.id, mi.name, mi.description, mi.price, mi.icon, mi.tag,
             mi.stock, mi.is_available, c.name AS category
      FROM menu_items mi
      JOIN menu_categories c ON c.id = mi.category_id
      WHERE mi.is_available = TRUE AND c.is_active = TRUE
      ORDER BY c.sort_order, mi.sort_order, mi.id
    `);
    return NextResponse.json({ dishes: result.rows });
  } catch (error) {
    console.error("Menu query failed:", error);
    return NextResponse.json({ error: "Không thể tải thực đơn." }, { status: 503 });
  }
}
