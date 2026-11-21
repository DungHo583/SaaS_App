"use client";

import {
    faBellConcierge, faChair, faChartPie, faClipboardList, faGear, faRightFromBracket, faUsers, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PinGate, { useSession } from "@/components/ui/PinGate";

const NAV = [
    { href: "/admin/dashboard", label: "Tổng quan", icon: faChartPie },
    { href: "/admin/menu", label: "Thực đơn", icon: faUtensils },
    { href: "/admin/tables", label: "Bàn ăn", icon: faChair },
    { href: "/admin/staff", label: "Nhân viên", icon: faUsers },
    { href: "/admin/settings", label: "Cài đặt", icon: faGear },
    { href: "/admin/audit", label: "Nhật ký", icon: faClipboardList },
    { href: "/staff", label: "Vận hành", icon: faBellConcierge },
];

function Shell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
    const pathname = usePathname();
    const { me, logout } = useSession();

    return (
        <main className="min-h-dvh bg-[#f7f3ed] pb-24 text-[#4a2d22] lg:pb-0">
            <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-[#eee3d7] bg-white p-4 lg:flex">
                <Link href="/admin/dashboard" className="mb-8 flex items-center gap-3 px-2 py-3">
                    <div className="grid size-11 place-items-center rounded-xl bg-[#4a2d22] text-xl" aria-hidden="true">🍜</div>
                    <div><p className="font-bold">{me.restaurantName}</p><p className="text-xs text-[#806d62]">Quản trị</p></div>
                </Link>
                <nav className="flex flex-col gap-1" aria-label="Điều hướng quản trị">
                    {NAV.map((item) => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={active
                                    ? "flex min-h-12 items-center gap-3 rounded-xl bg-[#4a2d22] px-4 text-sm font-semibold text-white"
                                    : "flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm text-[#806d62] hover:bg-[#fffaf3]"}
                            >
                                <FontAwesomeIcon icon={item.icon} className="w-5" />{item.label}
                            </Link>
                        );
                    })}
                </nav>
                <button type="button" onClick={logout} className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#eee3d7] text-sm font-semibold hover:bg-[#fffaf3]">
                    <FontAwesomeIcon icon={faRightFromBracket} /> Đăng xuất
                </button>
            </aside>

            <section className="lg:ml-64">
                <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-[#eee3d7] bg-white px-4 py-3 sm:px-8">
                    <div>
                        <p className="text-xs text-[#806d62]">{subtitle ?? "Quản trị nhà hàng"}</p>
                        <h1 className="text-xl font-bold">{title}</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {actions}
                        <div className="hidden text-right sm:block">
                            <p className="text-sm font-bold">{me.account.fullName}</p>
                            <p className="text-xs text-[#806d62]">@{me.account.username}</p>
                        </div>
                        <div className="grid size-11 place-items-center rounded-full bg-[#ef7d32] font-bold text-white" aria-hidden="true">
                            {me.account.fullName.slice(0, 1).toUpperCase()}
                        </div>
                    </div>
                </header>
                <div className="p-4 sm:p-8">{children}</div>
            </section>

            <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-2xl border border-[#eee3d7] bg-white p-1.5 shadow-lg lg:hidden" aria-label="Điều hướng quản trị di động">
                {NAV.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        aria-current={pathname === item.href ? "page" : undefined}
                        className={`grid min-h-12 min-w-11 place-items-center rounded-xl text-lg ${pathname === item.href ? "bg-[#4a2d22] text-white" : "text-[#806d62]"}`}
                    >
                        <FontAwesomeIcon icon={item.icon} />
                    </Link>
                ))}
            </nav>
        </main>
    );
}

/** Khung trang quản trị của owner: điều hướng + khoá PIN. */
export default function AdminShell(props: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
    return <PinGate><Shell {...props} /></PinGate>;
}
