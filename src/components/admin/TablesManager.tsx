"use client";

import { useState } from "react";

export type RestaurantTable = {
    id: number;
    name: string;
    area: string;
    capacity: number;
    status: "available" | "occupied" | "cleaning";
};

const statusLabels = {
    available: "Trống",
    occupied: "Đang dùng",
    cleaning: "Cần dọn",
};

export default function TablesManager({
    initialTables,
    user,
}: {
    initialTables: RestaurantTable[];
    user: { name: string; email: string };
}) {
    const [tables, setTables] = useState(initialTables);
    const [editing, setEditing] = useState<RestaurantTable | null>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function saveTable(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const payload = {
            name: String(form.get("name") ?? ""),
            area: String(form.get("area") ?? ""),
            capacity: Number(form.get("capacity")),
            status: String(form.get("status") ?? "available"),
        };

        const response = await fetch(editing ? `/api/admin/tables/${editing.id}` : "/api/admin/tables", {
            method: editing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            setError(data.error ?? "Không thể lưu bàn.");
            setSaving(false);
            return;
        }

        setTables((current) => editing
            ? current.map((table) => table.id === editing.id ? data.table : table)
            : [...current, data.table]);
        setOpen(false);
        setEditing(null);
        setSaving(false);
    }

    async function deleteTable(table: RestaurantTable) {
        if (!confirm(`Xoá ${table.name}?`)) return;
        const response = await fetch(`/api/admin/tables/${table.id}`, { method: "DELETE" });
        if (response.ok) setTables((current) => current.filter((item) => item.id !== table.id));
    }

    async function logout() {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.assign("/admin/login");
    }

    return (
        <main className="min-h-dvh bg-[#f7f3ed] text-[#4a2d22]">
            <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#eee3d7] bg-white p-4 lg:block">
                <a href="/admin/dashboard" className="mb-8 flex items-center gap-3 px-2 py-3">
                    <div className="grid size-11 place-items-center rounded-xl bg-[#4a2d22] text-xl" aria-hidden="true">🍜</div>
                    <div><p className="font-bold">Bếp Nhà</p><p className="text-xs text-[#806d62]">Quản trị</p></div>
                </a>
                <nav className="flex flex-col gap-1" aria-label="Điều hướng quản trị">
                    <a className="flex min-h-12 items-center rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]" href="/admin/dashboard">Tổng quan</a>
                    <a className="flex min-h-12 items-center rounded-xl bg-[#4a2d22] px-4 text-sm font-semibold text-white" href="/admin/tables">Bàn ăn</a>
                    <a className="flex min-h-12 items-center rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]" href="/admin/staff">Nhân viên</a>
                </nav>
                <button type="button" onClick={logout} className="absolute bottom-4 left-4 right-4 min-h-12 rounded-xl border border-[#eee3d7] text-sm font-semibold">Đăng xuất</button>
            </aside>

            <section className="lg:ml-64">
                <header className="flex min-h-20 items-center justify-between border-b border-[#eee3d7] bg-white px-4 sm:px-8">
                    <div><p className="text-xs text-[#806d62]">Quản trị nhà hàng</p><h1 className="text-xl font-bold">Quản lý bàn ăn</h1></div>
                    <div className="hidden text-right sm:block"><p className="text-sm font-bold">{user.name}</p><p className="text-xs text-[#806d62]">{user.email}</p></div>
                </header>

                <div className="p-4 sm:p-8">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <p className="text-sm text-[#806d62]">{tables.length} bàn đang có trong hệ thống</p>
                        <button type="button" onClick={() => { setEditing(null); setError(""); setOpen(true); }} className="min-h-11 rounded-xl bg-[#ef7d32] px-4 text-sm font-bold text-white">+ Thêm bàn</button>
                    </div>

                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {tables.map((table) => (
                            <article key={table.id} className="rounded-2xl border border-[#eee3d7] bg-white p-5">
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div><h2 className="font-bold">{table.name}</h2><p className="mt-1 text-xs text-[#806d62]">{table.area}</p></div>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${table.status === "available" ? "bg-green-100 text-green-700" : table.status === "occupied" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                        {statusLabels[table.status]}
                                    </span>
                                </div>
                                <p className="mb-5 text-sm text-[#806d62]">Sức chứa: {table.capacity} khách</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => { setEditing(table); setError(""); setOpen(true); }} className="min-h-11 rounded-xl border border-[#eee3d7] text-sm font-semibold">Chỉnh sửa</button>
                                    <button type="button" onClick={() => deleteTable(table)} className="min-h-11 rounded-xl border border-red-200 text-sm font-semibold text-red-700">Xoá</button>
                                </div>
                            </article>
                        ))}
                    </section>
                </div>
            </section>

            {open && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[#4a2d22]/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="table-form-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                        <h2 id="table-form-title" className="mb-5 text-xl font-bold">{editing ? "Chỉnh sửa bàn" : "Thêm bàn mới"}</h2>
                        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                        <form onSubmit={saveTable}>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Tên bàn</span><input name="name" defaultValue={editing?.name ?? ""} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Khu vực</span><input name="area" defaultValue={editing?.area ?? "Tầng 1"} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Sức chứa</span><input name="capacity" type="number" min="1" max="99" defaultValue={editing?.capacity ?? 4} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            <label className="mb-6 block"><span className="mb-2 block text-sm font-semibold">Trạng thái</span><select name="status" defaultValue={editing?.status ?? "available"} className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3"><option value="available">Trống</option><option value="occupied">Đang dùng</option><option value="cleaning">Cần dọn</option></select></label>
                            <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl border border-[#eee3d7] font-semibold">Huỷ</button><button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-[#ef7d32] font-bold text-white disabled:opacity-60">{saving ? "Đang lưu..." : "Lưu bàn"}</button></div>
                        </form>
                    </section>
                </div>
            )}
        </main>
    );
}
