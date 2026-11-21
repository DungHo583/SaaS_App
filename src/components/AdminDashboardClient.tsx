"use client";

import { useState } from "react";

const navItems = [
    { label: "Tổng quan", icon: "▦" },
    { label: "Đơn gọi món", icon: "▤", href: "/admin/dashboard" },
    { label: "Thực đơn", icon: "🍽", href: "/admin/menu" },
    { label: "Bàn ăn", icon: "♟", href: "/admin/tables" },
    { label: "Nhân viên", icon: "◉", href: "/admin/staff" },
];

export default function AdminDashboardClient({
    user,
    tables,
    orderCount,
    revenue,
}: {
    user: { name: string; email: string };
    tables: Array<{ id: number; name: string; capacity: number; status: string }>;
    orderCount: number;
    revenue: number;
}) {
    const [activeNav, setActiveNav] = useState("Tổng quan");

    async function logout() {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.assign("/admin/login");
    }

    return (
        <main className="min-h-dvh bg-[#f7f3ed] text-[#4a2d22]">
            <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-[#eee3d7] bg-white p-4 lg:block">
                <div className="mb-8 flex items-center gap-3 px-2 py-3">
                    <div className="grid size-11 place-items-center rounded-xl bg-[#4a2d22] text-xl" aria-hidden="true">🍜</div>
                    <div>
                        <p className="font-bold">Bếp Nhà</p>
                        <p className="text-xs text-[#806d62]">Quản trị</p>
                    </div>
                </div>

                <nav className="flex flex-col gap-1" aria-label="Điều hướng quản trị">
                    {navItems.map((item) => (
                        "href" in item ? (
                            <a
                                key={item.label}
                                href={item.href}
                                aria-current={activeNav === item.label ? "page" : undefined}
                                className={activeNav === item.label
                                    ? "flex min-h-12 items-center gap-3 rounded-xl bg-[#4a2d22] px-4 text-sm font-semibold text-white"
                                    : "flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]"}
                            >
                                <span className="w-5 text-center">{item.icon}</span>{item.label}
                            </a>
                        ) : (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => setActiveNav(item.label)}
                                aria-current={activeNav === item.label ? "page" : undefined}
                                className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]"
                            >
                                <span className="w-5 text-center">{item.icon}</span>{item.label}
                            </button>
                        )
                    ))}
                </nav>

                <button type="button" onClick={logout} className="absolute bottom-4 left-4 right-4 min-h-12 rounded-xl border border-[#eee3d7] text-sm font-semibold hover:bg-[#fffaf3]">
                    Đăng xuất
                </button>
            </aside>

            <section className="lg:ml-64">
                <header className="flex min-h-20 items-center justify-between border-b border-[#eee3d7] bg-white px-4 sm:px-8">
                    <div>
                        <p className="text-xs text-[#806d62]">Bảng điều khiển</p>
                        <h1 className="text-xl font-bold">{activeNav}</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden text-right sm:block">
                            <p className="text-sm font-bold">{user.name}</p>
                            <p className="text-xs text-[#806d62]">{user.email}</p>
                        </div>
                        <div className="grid size-11 place-items-center rounded-full bg-[#ef7d32] font-bold text-white" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</div>
                    </div>
                </header>

                <div className="p-4 sm:p-8">
                    <div className="mb-6 grid gap-4 sm:grid-cols-3">
                        <article className="rounded-2xl border border-[#eee3d7] bg-white p-5">
                            <p className="text-sm text-[#806d62]">Đơn gọi món</p>
                            <strong className="mt-2 block text-3xl">{orderCount}</strong>
                        </article>
                        <article className="rounded-2xl border border-[#eee3d7] bg-white p-5">
                            <p className="text-sm text-[#806d62]">Doanh thu</p>
                            <strong className="mt-2 block text-3xl">{new Intl.NumberFormat("vi-VN").format(revenue)}đ</strong>
                        </article>
                        <article className="rounded-2xl border border-[#eee3d7] bg-white p-5">
                            <p className="text-sm text-[#806d62]">Số bàn</p>
                            <strong className="mt-2 block text-3xl">{tables.length}</strong>
                        </article>
                    </div>

                    <section className="overflow-hidden rounded-2xl border border-[#eee3d7] bg-white">
                        <header className="flex items-center justify-between border-b border-[#eee3d7] px-5 py-4">
                            <h2 className="font-bold">Trạng thái bàn</h2>
                            <button type="button" className="min-h-11 rounded-xl bg-[#ef7d32] px-4 text-sm font-bold text-white">Thêm bàn</button>
                        </header>
                        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                            {tables.length === 0 ? (
                                <p className="col-span-full py-10 text-center text-sm text-[#806d62]">Chưa có dữ liệu bàn. Hãy chạy khởi tạo database.</p>
                            ) : tables.map((table) => (
                                <article key={table.id} className="rounded-xl border border-[#eee3d7] p-4">
                                    <div className="mb-4 flex items-center justify-between">
                                        <strong>{table.name}</strong>
                                        <span className={table.status === "available" ? "rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700" : "rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700"}>
                                            {table.status === "available" ? "Trống" : table.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[#806d62]">Sức chứa: {table.capacity} khách</p>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            </section>

            <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-2xl border border-[#eee3d7] bg-white p-2 shadow-lg lg:hidden" aria-label="Điều hướng quản trị di động">
                {navItems.slice(0, 4).map((item) => (
                    "href" in item ? (
                        <a key={item.label} href={item.href} className="grid min-h-12 min-w-12 place-items-center rounded-xl text-xs" aria-label={item.label}>{item.icon}</a>
                    ) : (
                        <button key={item.label} type="button" onClick={() => setActiveNav(item.label)} className="grid min-h-12 min-w-12 place-items-center rounded-xl text-xs" aria-label={item.label}>{item.icon}</button>
                    )
                ))}
            </nav>
        </main>
    );
}
