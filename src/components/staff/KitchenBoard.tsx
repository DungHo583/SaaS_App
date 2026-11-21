"use client";

import { faBan, faCheck, faFire, faLock, faRightFromBracket, faTableList, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/components/ui/api";
import Dialog from "@/components/ui/Dialog";
import PinGate, { useSession } from "@/components/ui/PinGate";
import { ui } from "@/components/ui/styles";

type KitchenItem = {
    id: string; name: string; unit: string; quantity: number; note: string | null; status: "queued" | "cooking" | "ready";
    queued_at: string; table_names: string | null; order_type: string; session_id: string;
};
type KitchenMenu = { id: string; name: string; category: string; sold_out: boolean };

const COLUMNS = [
    { status: "queued", title: "Chờ bếp", tone: "border-amber-300" },
    { status: "cooking", title: "Đang làm", tone: "border-orange-400" },
    { status: "ready", title: "Đã xong · chờ bưng", tone: "border-blue-300" },
] as const;

function minutesSince(value: string) {
    return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
}

/** Khu vực bếp (tài khoản bếp; owner/quản lý chỉ khi bất khả kháng — được đánh dấu trong log). */
function Kitchen() {
    const { me, lock, logout } = useSession();
    const [items, setItems] = useState<KitchenItem[]>([]);
    const [menu, setMenu] = useState<KitchenMenu[]>([]);
    const [error, setError] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [, setTick] = useState(0);
    const elevated = me.account.accountType !== "kitchen";

    const load = useCallback(() => api<{ items: KitchenItem[]; menu: KitchenMenu[] }>("/api/staff/kitchen").then(
        (data) => { setItems(data.items); setMenu(data.menu); setError(""); },
        (err: unknown) => setError(errorMessage(err)),
    ), []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); setTick((tick) => tick + 1); }, 5_000);
        return () => window.clearInterval(timer);
    }, [load]);

    async function act(item: KitchenItem, action: "start" | "ready" | "cancel" | "sold_out") {
        let reason: string | null = null;
        if (action === "cancel") {
            reason = window.prompt(`Lý do huỷ ${item.quantity}× ${item.name} (tính hao hụt):`)?.trim() ?? null;
            if (!reason) return;
        }
        if (action === "sold_out" && !confirm(`Báo hết món ${item.name}? Món sẽ bị huỷ và ẩn khỏi thực đơn đến khi bật lại.`)) return;
        try {
            await api(`/api/staff/items/${item.id}`, { body: { action, reason } });
            await load();
        } catch (err) {
            setError(errorMessage(err));
        }
    }

    async function toggleSoldOut(dish: KitchenMenu) {
        try {
            await api(`/api/staff/menu/${dish.id}/sold-out`, { body: { soldOut: !dish.sold_out } });
            setMenu((current) => current.map((row) => row.id === dish.id ? { ...row, sold_out: !dish.sold_out } : row));
        } catch (err) {
            setError(errorMessage(err));
        }
    }

    return (
        <main className="min-h-dvh bg-[#f7f3ed] px-4 pb-10 pt-4 text-[#4a2d22] sm:px-6">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs text-[#806d62]">{me.restaurantName}</p>
                    <h1 className="flex items-center gap-2 text-2xl font-bold"><FontAwesomeIcon icon={faFire} className="text-[#ef7d32]" /> Khu vực bếp</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setMenuOpen(true)} className={ui.secondary}><FontAwesomeIcon icon={faBan} /> Hết món / còn món</button>
                    {me.account.accountType !== "kitchen" && <Link href="/staff" className={ui.secondary}><FontAwesomeIcon icon={faTableList} /> Danh sách bàn</Link>}
                    <button type="button" onClick={lock} className={ui.secondary} aria-label="Khoá màn hình"><FontAwesomeIcon icon={faLock} /></button>
                    <button type="button" onClick={logout} className={ui.secondary} aria-label="Kết thúc ca"><FontAwesomeIcon icon={faRightFromBracket} /></button>
                </div>
            </header>
            {elevated && (
                <p className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                    <FontAwesomeIcon icon={faTriangleExclamation} /> Bạn đang thao tác bếp bằng tài khoản {me.account.accountType === "owner" ? "owner" : "quản lý"}. Chỉ dùng khi bất khả kháng — mọi thao tác được đánh dấu riêng trong nhật ký.
                </p>
            )}
            {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}

            <div className="grid gap-4 lg:grid-cols-3">
                {COLUMNS.map((column) => {
                    const list = items.filter((item) => item.status === column.status);
                    return (
                        <section key={column.status} aria-labelledby={`col-${column.status}`} className={`rounded-2xl border-t-4 bg-white p-3 ${column.tone}`}>
                            <h2 id={`col-${column.status}`} className="mb-3 flex items-center justify-between font-bold">{column.title}<span className={`${ui.badge} bg-[#f7f3ed]`}>{list.length}</span></h2>
                            <ul className="grid gap-2">
                                {list.map((item) => {
                                    const waited = minutesSince(item.queued_at);
                                    return (
                                        <li key={item.id} className="rounded-xl border border-[#eee3d7] p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-lg font-bold">{item.quantity}× {item.name}</p>
                                                <span className={`${ui.badge} ${waited >= 15 && column.status !== "ready" ? "bg-red-100 text-red-700" : "bg-[#f7f3ed]"}`}>{waited} phút</span>
                                            </div>
                                            <p className="text-sm text-[#806d62]">{item.table_names ?? (item.order_type === "takeaway" ? "Mang về" : "Ship")}</p>
                                            {item.note && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-900">{item.note}</p>}
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {item.status === "queued" && <button type="button" onClick={() => act(item, "start")} className={ui.primary}><FontAwesomeIcon icon={faFire} /> Bắt đầu làm</button>}
                                                {item.status === "cooking" && <button type="button" onClick={() => act(item, "ready")} className={ui.primary}><FontAwesomeIcon icon={faCheck} /> Đã xong</button>}
                                                {item.status === "queued" && <button type="button" onClick={() => act(item, "sold_out")} className={ui.danger}>Hết món</button>}
                                                {item.status !== "queued" && <button type="button" onClick={() => act(item, "cancel")} className={ui.danger}>Huỷ (hao hụt)</button>}
                                            </div>
                                        </li>
                                    );
                                })}
                                {list.length === 0 && <li className="py-6 text-center text-sm text-[#806d62]">Trống</li>}
                            </ul>
                        </section>
                    );
                })}
            </div>

            <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Báo hết món / còn món">
                <ul className="grid gap-2">
                    {menu.map((dish) => (
                        <li key={dish.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#eee3d7] px-3 py-2">
                            <span><b>{dish.name}</b><span className="block text-xs text-[#806d62]">{dish.category}</span></span>
                            <button type="button" onClick={() => toggleSoldOut(dish)} aria-pressed={dish.sold_out} className={dish.sold_out ? ui.danger : ui.small}>
                                {dish.sold_out ? "Đang hết · bật lại" : "Còn món · báo hết"}
                            </button>
                        </li>
                    ))}
                </ul>
            </Dialog>
        </main>
    );
}

export default function KitchenBoard() {
    return <PinGate><Kitchen /></PinGate>;
}
