import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  const categoryId = Number(body.categoryId);
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const price = Number(body.price);
  const stock = Number(body.stock);
  const icon = String(body.icon ?? "🍽️").trim();
  const tag = String(body.tag ?? "").trim();
  const isAvailable = Boolean(body.isAvailable);

  if (!name || !Number.isInteger(categoryId) || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return NextResponse.json({ error: "Thông tin món không hợp lệ." }, { status: 400 });
  }

  const result = await db.query(`
    UPDATE menu_items SET category_id=$1,name=$2,description=$3,price=$4,icon=$5,tag=$6,stock=$7,is_available=$8,updated_at=NOW()
    WHERE id=$9
    RETURNING *
  `, [categoryId, name, description, price, icon, tag, stock, isAvailable, Number(id)]);
  if (result.rows.length === 0) return NextResponse.json({ error: "Không tìm thấy món." }, { status: 404 });

  const item = await db.query("SELECT mi.*, c.name AS category_name FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id WHERE mi.id = $1", [id]);
  return NextResponse.json({ item: item.rows[0] });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await db.query("UPDATE menu_items SET is_available=FALSE, updated_at=NOW() WHERE id=$1", [Number(id)]);
  return NextResponse.json({ ok: true });
}
