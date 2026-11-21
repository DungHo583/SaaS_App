import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [items, categories] = await Promise.all([
      db.query(`SELECT mi.*, c.name AS category_name FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id ORDER BY c.sort_order, mi.sort_order, mi.id`),
      db.query("SELECT * FROM menu_categories ORDER BY sort_order, id"),
    ]);
    return NextResponse.json({ items: items.rows, categories: categories.rows });
  } catch (error) {
    console.error("Admin menu GET failed:", error);
    return NextResponse.json({ error: "Không thể tải thực đơn." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const categoryId = Number(body.categoryId);
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const price = Number(body.price);
  const stock = Number(body.stock ?? 999);
  const icon = String(body.icon ?? "🍽️").trim();
  const tag = String(body.tag ?? "").trim();

  if (!name || !Number.isInteger(categoryId) || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return NextResponse.json({ error: "Thông tin món không hợp lệ." }, { status: 400 });
  }

  try {
    const result = await db.query(`
      INSERT INTO menu_items (category_id, name, description, price, icon, tag, stock, is_available)
      VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
      RETURNING *
    `, [categoryId, name, description, price, icon, tag, stock]);
    const item = await db.query("SELECT mi.*, c.name AS category_name FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id WHERE mi.id = $1", [result.rows[0].id]);
    return NextResponse.json({ item: item.rows[0] }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23503") return NextResponse.json({ error: "Danh mục không tồn tại." }, { status: 400 });
    throw error;
  }
}
