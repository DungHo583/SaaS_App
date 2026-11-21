"use client";

import { useState } from "react";

export type Staff = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role_id: number;
    role_name: string;
    is_active: boolean;
};

export type StaffRole = { id: number; name: string; display_name: string; permissions: string[] };

export default function StaffManager({
    initialStaff,
    initialRoles,
    user,
}: {
    initialStaff: Staff[];
    initialRoles: StaffRole[];
    user: { name: string; email: string };
}) {
    const [staff, setStaff] = useState(initialStaff);
    const [roles] = useState(initialRoles);
    const [editing, setEditing] = useState<Staff | null>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function saveStaff(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const payload = {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            phone: String(form.get("phone") ?? ""),
            roleId: Number(form.get("roleId")),
            isActive: form.get("isActive") === "on",
            password: String(form.get("password") ?? ""),
        };

        const response = await fetch(editing ? `/api/admin/staff/${editing.id}` : "/api/admin/staff", {
            method: editing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            setError(data.error ?? "Không thể lưu nhân viên.");
            setSaving(false);
            return;
        }

        setStaff((current) => editing
            ? current.map((item) => item.id === editing.id ? data.staff : item)
            : [...current, data.staff]);
        setOpen(false);
        setEditing(null);
        setSaving(false);
    }

    async function deactivateStaff(item: Staff) {
        if (!confirm(`Vô hiệu hoá tài khoản ${item.name}?`)) return;
        const response = await fetch(`/api/admin/staff/${item.id}`, { method: "DELETE" });
        if (response.ok) setStaff((current) => current.map((row) => row.id === item.id ? { ...row, is_active: false } : row));
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
                    <a className="flex min-h-12 items-center rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]" href="/admin/tables">Bàn ăn</a>
                    <a className="flex min-h-12 items-center rounded-xl bg-[#4a2d22] px-4 text-sm font-semibold text-white" href="/admin/staff">Nhân viên</a>
                </nav>
                <button type="button" onClick={logout} className="absolute bottom-4 left-4 right-4 min-h-12 rounded-xl border border-[#eee3d7] text-sm font-semibold">Đăng xuất</button>
            </aside>

            <section className="lg:ml-64">
                <header className="flex min-h-20 items-center justify-between border-b border-[#eee3d7] bg-white px-4 sm:px-8">
                    <div><p className="text-xs text-[#806d62]">Quản trị nhà hàng</p><h1 className="text-xl font-bold">Quản lý nhân viên</h1></div>
                    <div className="hidden text-right sm:block"><p className="text-sm font-bold">{user.name}</p><p className="text-xs text-[#806d62]">{user.email}</p></div>
                </header>

                <div className="p-4 sm:p-8">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <p className="text-sm text-[#806d62]">{staff.length} tài khoản nhân viên</p>
                        <button type="button" onClick={() => { setEditing(null); setError(""); setOpen(true); }} className="min-h-11 rounded-xl bg-[#ef7d32] px-4 text-sm font-bold text-white">+ Thêm nhân viên</button>
                    </div>

                    <section className="overflow-hidden rounded-2xl border border-[#eee3d7] bg-white">
                        <div className="divide-y divide-[#eee3d7]">
                            {staff.map((item) => (
                                <article key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_180px_100px_auto] sm:items-center">
                                    <div><h2 className="font-bold">{item.name}</h2><p className="text-sm text-[#806d62]">{item.email}</p><p className="text-xs text-[#806d62]">{item.phone || "Chưa có số điện thoại"}</p></div>
                                    <span className="text-sm">{item.role_name}</span>
                                    <span className={`justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:justify-self-auto ${item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{item.is_active ? "Hoạt động" : "Vô hiệu"}</span>
                                    <div className="flex gap-2"><button type="button" onClick={() => { setEditing(item); setError(""); setOpen(true); }} className="min-h-11 rounded-xl border border-[#eee3d7] px-3 text-sm font-semibold">Sửa</button><button type="button" disabled={!item.is_active} onClick={() => deactivateStaff(item)} className="min-h-11 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-40">Vô hiệu</button></div>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            </section>

            {open && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[#4a2d22]/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="staff-form-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                        <h2 id="staff-form-title" className="mb-5 text-xl font-bold">{editing ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}</h2>
                        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                        <form onSubmit={saveStaff}>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Họ tên</span><input name="name" defaultValue={editing?.name ?? ""} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Email</span><input name="email" type="email" defaultValue={editing?.email ?? ""} required autoComplete="username" className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Số điện thoại</span><input name="phone" type="tel" defaultValue={editing?.phone ?? ""} className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">Vai trò</span><select name="roleId" defaultValue={editing?.role_id ?? roles.find((role) => role.name === "waiter")?.id} required className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3">{roles.map((role) => <option key={role.id} value={role.id}>{role.display_name}</option>)}</select></label>
                            <label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">{editing ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu ban đầu"}</span><input name="password" type="password" minLength={editing ? 0 : 8} required={!editing} autoComplete="new-password" className="min-h-12 w-full rounded-xl border border-[#d9cbbf] px-3" /></label>
                            {editing && <label className="mb-6 flex min-h-12 items-center gap-3"><input name="isActive" type="checkbox" defaultChecked={editing.is_active} className="size-5 accent-[#ef7d32]" /><span className="text-sm font-semibold">Tài khoản đang hoạt động</span></label>}
                            <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl border border-[#eee3d7] font-semibold">Huỷ</button><button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-[#ef7d32] font-bold text-white disabled:opacity-60">{saving ? "Đang lưu..." : "Lưu nhân viên"}</button></div>
                        </form>
                    </section>
                </div>
            )}
        </main>
    );
}
