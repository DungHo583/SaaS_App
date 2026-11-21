"use client";

import { useState } from "react";

export type MenuCategory = { id: number; name: string; sort_order: number; is_active: boolean };
export type MenuItem = {
    id: number; category_id: number; category_name: string; name: string; description: string;
    price: number; icon: string; tag: string; stock: number; is_available: boolean;
};

export default function MenuManager({ initialItems, initialCategories, user }: {
    initialItems: MenuItem[]; initialCategories: MenuCategory[]; user: { name: string; email: string };
}) {
    const [items, setItems] = useState(initialItems);
    const [categories] = useState(initialCategories);
    const [editing, setEditing] = useState<MenuItem | null>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function saveItem(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true); setError("");
        const form = new FormData(event.currentTarget);
        const payload = {
            categoryId: Number(form.get("categoryId")), name: String(form.get("name") ?? ""),
            description: String(form.get("description") ?? ""), price: Number(form.get("price")),
            stock: Number(form.get("stock")), icon: String(form.get("icon") ?? "🍽️"),
            tag: String(form.get("tag") ?? ""), isAvailable: form.get("isAvailable") === "on" || !editing,
        };
        const response = await fetch(editing ? `/api/admin/menu/${editing.id}` : "/api/admin/menu", {
            method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) { setError(data.error ?? "Không thể lưu món."); setSaving(false); return; }
        setItems((current) => editing ? current.map((item) => item.id === editing.id ? data.item : item) : [...current, data.item]);
        setOpen(false); setEditing(null); setSaving(false);
    }

    async function removeItem(item: MenuItem) {
        if (!confirm(`Ngừng bán ${item.name}?`)) return;
        const response = await fetch(`/api/admin/menu/${item.id}`, { method: "DELETE" });
        if (response.ok) setItems((current) => current.map((row) => row.id === item.id ? { ...row, is_available: false } : row));
    }

    async function logout() {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.assign("/admin/login");
    }

    return (
        <main className="min-h-dvh bg-[#f7f3ed] text-[#4a2d22]">
            <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#eee3d7] bg-white p-4 lg:block">
                <a href="/admin/dashboard" className="mb-8 flex items-center gap-3 px-2 py-3"><div className="grid size-11 place-items-center rounded-xl bg-[#4a2d22] text-xl">🍜</div><div><p className="font-bold">Bếp Nhà</p><p className="text-xs text-[#806d62]">Quản trị</p></div></a>
                <nav className="flex flex-col gap-1" aria-label="Điều hướng quản trị">
                    <a href="/admin/dashboard" className="flex min-h-12 items-center rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]">Tổng quan</a>
                    <a href="/admin/menu" className="flex min-h-12 items-center rounded-xl bg-[#4a2d22] px-4 text-sm font-semibold text-white">Thực đơn</a>
                    <a href="/admin/tables" className="flex min-h-12 items-center rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]">Bàn ăn</a>
                    <a href="/admin/staff" className="flex min-h-12 items-center rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]">Nhân viên</a>
                </nav>
                <button type="button" onClick={logout} className="absolute bottom-4 left-4 right-4 min-h-12 rounded-xl border border-[#eee3d7] text-sm font-semibold">Đăng xuất</button>
            </aside>

            <section className="lg:ml-64">
                <header className="flex min-h-20 items-center justify-between border-b border-[#eee3d7] bg-white px-4 sm:px-8">
                    <div><p className="text-xs text-[#806d62]">Quản trị nhà hàng</p><h1 className="text-xl font-bold">Quản lý thực đơn</h1></div>
                    <div className="hidden text-right sm:block"><p className="text-sm font-bold">{user.name}</p><p className="text-xs text-[#806d62]">{user.email}</p></div>
                </header>

                <div className="p-4 sm:p-8">
                    <div className="mb-5 flex items-center justify-between"><p className="text-sm text-[#806d62]">{items.length} món trong thực đơn</p><button type="button" onClick={() => { setEditing(null); setError(""); setOpen(true); }} className="min-h-11 rounded-xl bg-[#ef7d32] px-4 text-sm font-bold text-white">+ Thêm món</button></div>
                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => (
                            <article key={item.id} className="grid grid-cols-[45%_55%] overflow-hidden rounded-2xl border border-[#eee3d7] bg-white">
                                <div className="grid place-items-center bg-[#f6e8d7] text-6xl">{item.icon}</div>
                                <div className="min-w-0 p-4"><div className="mb-2 flex justify-between gap-2"><span className="text-xs text-[#806d62]">{item.category_name}</span><span className={`text-xs ${item.is_available ? "text-green-700" : "text-gray-500"}`}>{item.is_available ? "Đang bán" : "Ngưng bán"}</span></div><h2 className="mb-1 font-bold">{item.name}</h2><p className="mb-3 min-h-10 text-xs text-[#806d62]">{item.description}</p><strong className="text-[#b84d1d]">{new Intl.NumberFormat("vi-VN").format(item.price)}đ</strong><p className="mt-1 text-xs text-[#806d62]">Tồn kho: {item.stock}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setEditing(item); setError(""); setOpen(true); }} className="min-h-10 rounded-xl border border-[#eee3d7] text-xs font-semibold">Sửa</button><button type="button" disabled={!item.is_available} onClick={() => removeItem(item)} className="min-h-10 rounded-xl border border-red-200 text-xs font-semibold text-red-700 disabled:opacity-40">Ngưng bán</button></div></div>
                            </article>
                        ))}
                    </section>
                </div>
            </section>

            {open && <div className="fixed inset-0 z-50 grid place-items-center bg-[#4a2d22]/40 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5"><h2 className="mb-5 text-xl font-bold">{editing ? "Chỉnh sửa món" : "Thêm món mới"}</h2>{error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<form onSubmit={saveItem}><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Tên món</span><input name="name" defaultValue={editing?.name ?? ""} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Danh mục</span><select name="categoryId" defaultValue={editing?.category_id ?? categories[0]?.id} className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Mô tả</span><textarea name="description" defaultValue={editing?.description ?? ""} className="min-h-20 w-full rounded-xl border border-[#d9cbbf] p-3" /></label><div className="mb-4 grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-semibold">Giá</span><input name="price" type="number" min="0" defaultValue={editing?.price ?? 0} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label><label><span className="mb-2 block text-sm font-semibold">Tồn kho</span><input name="stock" type="number" min="0" defaultValue={editing?.stock ?? 999} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label></div><div className="mb-6 grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-semibold">Icon</span><input name="icon" defaultValue={editing?.icon ?? "🍽️"} className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label><label><span className="mb-2 block text-sm font-semibold">Nhãn</span><input name="tag" defaultValue={editing?.tag ?? ""} className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label></div>{editing && <label className="mb-6 flex items-center gap-3"><input name="isAvailable" type="checkbox" defaultChecked={editing.is_available} className="size-5 accent-[#ef7d32]" /><span className="text-sm font-semibold">Đang bán</span></label>}<div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl border border-[#eee3d7] font-semibold">Huỷ</button><button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-[#ef7d32] font-bold text-white disabled:opacity-60">{saving ? "Đang lưu..." : "Lưu món"}</button></div></form></section></div>}
        </main>
    );
}
