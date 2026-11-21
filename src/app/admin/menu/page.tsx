import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import MenuManager from "@/components/admin/MenuManager";

export const instant = false;

export default async function AdminMenuPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [items, categories] = await Promise.all([
    db.query(`SELECT mi.*, c.name AS category_name FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id ORDER BY c.sort_order, mi.sort_order, mi.id`),
    db.query("SELECT * FROM menu_categories ORDER BY sort_order, id"),
  ]);

  return <MenuManager initialItems={items.rows} initialCategories={categories.rows} user={session} />;
}
