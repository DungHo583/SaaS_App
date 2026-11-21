"use client";

import {
    faBellConcierge, faCartShopping, faClockRotateLeft, faMinus, faPlus, faReceipt, faStore, faUtensils, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import CategoryNav from "@/components/CategoryNav";
import MenuList from "@/components/MenuList";
import { newIdempotencyKey } from "@/components/ui/api";
import { formatPrice } from "@/lib/format";
import { ALL_CATEGORY, type Dish, type DishCategory } from "@/types/menu";

type Restaurant = { displayName: string; address: string; phone: string };
type TableState = {
    table: { name: string; area: string };
    session: { active: boolean } | null;
    kicked: boolean;
    items: Array<{ id: string; status: string }>;
    badges: Record<string, number>;
    rounds: Array<{ id: string; status: string }>;
};

function lightDismiss(event: React.MouseEvent<HTMLDialogElement>) {
    // Fallback light-dismiss cho trình duyệt chưa hỗ trợ <dialog closedby>.
    if ("closedBy" in HTMLDialogElement.prototype || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
}

function CustomerMenu() {
    const token = useSearchParams().get("t");
    const [activeCategory, setActiveCategory] = useState<DishCategory>(ALL_CATEGORY);
    const [categories, setCategories] = useState<DishCategory[]>([ALL_CATEGORY]);
    const [dishes, setDishes] = useState<Dish[]>([]);
    const [restaurant, setRestaurant] = useState<Restaurant>({ displayName: "Thực đơn", address: "", phone: "" });
    const [menuError, setMenuError] = useState("");
    const [tableState, setTableState] = useState<TableState | null>(null);
    const [tableError, setTableError] = useState("");
    const [cart, setCart] = useState<Record<string, number>>({});
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState("");
    const [showInfo, setShowInfo] = useState(false);
    const navDialogRef = useRef<HTMLDialogElement>(null);
    const cartDialogRef = useRef<HTMLDialogElement>(null);
    // Giữ nguyên khoá khi gửi lại sau lỗi mạng; đổi khi giỏ thay đổi hoặc gửi thành công (chống gọi trùng).
    const idempotencyKeyRef = useRef<string | null>(null);

    useEffect(() => {
        fetch("/api/public/menu")
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error ?? "Không thể tải thực đơn.");
                setDishes(data.dishes);
                setCategories([ALL_CATEGORY, ...data.categories]);
                setRestaurant(data.restaurant);
            })
            .catch((error: unknown) => setMenuError(error instanceof Error ? error.message : "Không thể tải thực đơn."));
    }, []);

    const fetchTable = useCallback(async () => {
        const response = await fetch(`/api/public/tables/${encodeURIComponent(token ?? "")}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Mã QR không hợp lệ.");
        return data as TableState;
    }, [token]);

    const refreshTable = useCallback(() => fetchTable().then(
        (data) => { setTableState(data); setTableError(""); },
        (error: unknown) => setTableError(error instanceof Error ? error.message : "Không tải được thông tin bàn."),
    ), [fetchTable]);

    useEffect(() => {
        if (!token) return;
        void refreshTable();
        const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshTable(); }, 15_000);
        return () => window.clearInterval(timer);
    }, [token, refreshTable]);

    const filteredDishes = useMemo(
        () => activeCategory === ALL_CATEGORY ? dishes : dishes.filter((dish) => dish.category === activeCategory),
        [activeCategory, dishes],
    );
    const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
    const total = dishes.reduce((sum, dish) => sum + (cart[dish.id] ?? 0) * dish.price, 0);
    const ordered = tableState?.badges ?? {};
    const hasHistory = Boolean(tableState && (tableState.items.length || tableState.rounds.length));

    const changeQuantity = (id: string, delta: number) => {
        idempotencyKeyRef.current = null;
        setCart((current) => {
            const quantity = Math.max(0, Math.min(50, (current[id] ?? 0) + delta));
            const next = { ...current };
            if (quantity === 0) delete next[id];
            else next[id] = quantity;
            return next;
        });
    };

    async function submitOrder() {
        if (!token) {
            window.alert("Vui lòng quét mã QR trên bàn để gọi món.");
            return;
        }
        setSubmitting(true);
        try {
            idempotencyKeyRef.current ??= newIdempotencyKey();
            const response = await fetch(`/api/public/tables/${encodeURIComponent(token)}/rounds`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idempotencyKey: idempotencyKeyRef.current,
                    items: Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Không thể gọi món.");
            idempotencyKeyRef.current = null;
            setCart({});
            cartDialogRef.current?.close();
            setNotice("Đã gửi yêu cầu gọi món. Nhân viên sẽ xác nhận rồi chuyển xuống bếp.");
            await refreshTable();
        } catch (error) {
            window.alert(error instanceof Error ? error.message : "Không thể gọi món.");
        } finally {
            setSubmitting(false);
        }
    }

    const navLink = "flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-[#4a2d22] hover:bg-[#fffaf3]";
    const navDisabled = "flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#b9aca2] cursor-not-allowed";

    return (
        <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 pb-24 pt-4 sm:px-8">
            <AppHeader restaurantName={restaurant.displayName} tableName={tableState?.table.name ?? null} itemCount={itemCount} navDialogRef={navDialogRef} cartDialogRef={cartDialogRef} />

            <section className="relative min-h-42 overflow-hidden rounded-3xl bg-linear-to-br from-[#df6528] to-[#f39a56] p-5 text-white sm:min-h-48 sm:px-8" aria-label="Thông tin bàn">
                <div className="relative z-10 max-w-[70%]">
                    <p className="mb-2 text-xs opacity-90">{tableState ? `${tableState.table.name}${tableState.table.area ? ` · ${tableState.table.area}` : ""}` : "Chào mừng quý khách"}</p>
                    <h2 className="mb-4 text-[clamp(1.35rem,6vw,2.2rem)] font-bold leading-tight">
                        {token ? "Chọn món và gửi yêu cầu" : "Quét mã QR trên bàn để gọi món"}
                    </h2>
                    <p className="text-sm opacity-90">{token ? "Nhân viên xác nhận rồi món sẽ được chuyển xuống bếp." : "Bạn vẫn có thể xem thực đơn."}</p>
                </div>
                <span className="absolute -bottom-4 right-2 text-[clamp(6rem,28vw,9rem)] drop-shadow-lg -rotate-8" aria-hidden="true">🍜</span>
            </section>

            {tableError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{tableError}</p>}
            {tableState?.kicked && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Thiết bị này đã bị nhân viên loại khỏi bàn. Vui lòng gọi nhân viên.</p>}
            {notice && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
            {menuError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{menuError}</p>}

            <CategoryNav categories={categories} activeCategory={activeCategory} onChange={setActiveCategory} />

            <MenuList
                activeCategory={activeCategory}
                dishes={filteredDishes}
                cart={cart}
                ordered={ordered}
                onAdd={(id) => changeQuantity(id, 1)}
                onQuantityChange={changeQuantity}
            />

            <dialog ref={navDialogRef} className="nav-dialog" aria-labelledby="nav-dialog-title" onClick={lightDismiss} {...{ closedby: "any" }}>
                <div className="h-full w-full bg-white shadow-[1rem_0_3rem_rgba(74,45,34,0.16)]">
                    <header className="flex min-h-[76px] items-center justify-between border-b border-[#eee3d7] p-4">
                        <div>
                            <p className="mb-0.5 text-xs text-[#806d62]">Nhà hàng</p>
                            <h2 id="nav-dialog-title" className="text-xl font-bold">{restaurant.displayName}</h2>
                        </div>
                        <button type="button" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-[#fffaf3] text-xl" aria-label="Đóng menu" onClick={() => navDialogRef.current?.close()}><FontAwesomeIcon icon={faXmark} /></button>
                    </header>
                    <nav className="flex flex-col gap-1 p-3" aria-label="Điều hướng nhà hàng">
                        <button type="button" className={`${navLink} text-left`} onClick={() => navDialogRef.current?.close()}><FontAwesomeIcon icon={faUtensils} className="w-7" /> Menu</button>
                        <button type="button" className={`${navLink} text-left`} onClick={() => { navDialogRef.current?.close(); cartDialogRef.current?.showModal(); }}><FontAwesomeIcon icon={faCartShopping} className="w-7" /> Giỏ hàng</button>
                        {token && hasHistory ? (
                            <>
                                <Link className={navLink} href={`/orders?t=${token}`}><FontAwesomeIcon icon={faClockRotateLeft} className="w-7" /> Lịch sử & theo dõi món</Link>
                                <Link className={navLink} href={`/orders/bill?t=${token}`}><FontAwesomeIcon icon={faReceipt} className="w-7" /> Hoá đơn</Link>
                            </>
                        ) : (
                            <>
                                <button type="button" disabled className={navDisabled}><FontAwesomeIcon icon={faClockRotateLeft} className="w-7" /> Lịch sử & theo dõi món</button>
                                <button type="button" disabled className={navDisabled}><FontAwesomeIcon icon={faReceipt} className="w-7" /> Hoá đơn</button>
                            </>
                        )}
                        <button type="button" aria-expanded={showInfo} onClick={() => setShowInfo((value) => !value)} className={`${navLink} text-left`}><FontAwesomeIcon icon={faStore} className="w-7" /> Thông tin cửa hàng</button>
                        {showInfo && <p className="px-3 pb-2 text-sm text-[#806d62]">{restaurant.address || "Chưa cập nhật địa chỉ"}{restaurant.phone ? ` · ĐT ${restaurant.phone}` : ""}</p>}
                        {restaurant.phone
                            ? <a className={navLink} href={`tel:${restaurant.phone.replace(/\s/g, "")}`}><FontAwesomeIcon icon={faBellConcierge} className="w-7" /> Gọi nhân viên</a>
                            : <button type="button" disabled className={navDisabled}><FontAwesomeIcon icon={faBellConcierge} className="w-7" /> Gọi nhân viên</button>}
                    </nav>
                </div>
            </dialog>

            <dialog
                ref={cartDialogRef}
                className="fixed inset-[1dvh_1vw] m-auto h-[98dvh] w-[98vw] max-h-none max-w-none overflow-hidden rounded-2xl border-0 p-0"
                aria-labelledby="cart-dialog-title"
                onClick={lightDismiss}
                {...{ closedby: "any" }}
            >
                <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-[#fffaf3]">
                    <header className="flex min-h-[76px] items-center justify-between border-b border-[#eee3d7] bg-white p-4">
                        <div>
                            <p className="mb-0.5 text-xs text-[#806d62]">{tableState?.table.name ?? "Chưa quét QR bàn"}</p>
                            <h2 id="cart-dialog-title" className="text-xl font-bold">
                                Giỏ hàng <span className="ml-1 inline-grid size-7 place-items-center rounded-full bg-[#ef7d32] text-xs text-white">{itemCount}</span>
                            </h2>
                        </div>
                        <button type="button" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-[#fffaf3] text-xl" aria-label="Đóng giỏ hàng" onClick={() => cartDialogRef.current?.close()}><FontAwesomeIcon icon={faXmark} /></button>
                    </header>

                    <div className="overflow-y-auto p-3">
                        {itemCount === 0 ? (
                            <div className="grid h-full place-content-center justify-items-center text-center">
                                <FontAwesomeIcon icon={faCartShopping} className="text-5xl opacity-45" />
                                <h3 className="mt-3 mb-1 font-bold">Giỏ hàng đang trống</h3>
                                <p className="text-sm text-[#806d62]">Hãy chọn món bạn yêu thích.</p>
                            </div>
                        ) : dishes.filter((dish) => (cart[dish.id] ?? 0) > 0).map((dish) => {
                            const quantity = cart[dish.id];
                            return (
                                <article className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[#eee3d7] bg-white p-3 first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 sm:grid-cols-[64px_minmax(0,1fr)_auto]" key={dish.id}>
                                    <div className="grid size-13 place-items-center overflow-hidden rounded-xl bg-[#f6e8d7] text-3xl" aria-hidden="true">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh món (data URL) */}
                                        {dish.image_url ? <img src={dish.image_url} alt="" className="size-full object-cover" /> : "🍽️"}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="mb-1 truncate text-sm font-bold">{dish.name}</h3>
                                        <strong className="text-[#b84d1d]">{formatPrice(dish.price * quantity)}</strong>
                                        {ordered[dish.id] ? <p className="text-xs text-amber-800">Bàn đã gọi ×{ordered[dish.id]} món này, chưa ra</p> : null}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button type="button" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-white text-[#b84d1d]" onClick={() => changeQuantity(dish.id, -1)} aria-label={`Giảm ${dish.name}`}><FontAwesomeIcon icon={faMinus} /></button>
                                        <span className="min-w-[1ch] text-center font-bold">{quantity}</span>
                                        <button type="button" className="grid size-11 cursor-pointer place-items-center rounded-full border border-[#ef7d32] bg-[#ef7d32] text-white" onClick={() => changeQuantity(dish.id, 1)} aria-label={`Tăng ${dish.name}`}><FontAwesomeIcon icon={faPlus} /></button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    <footer className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,40%)] items-center gap-3 border-t border-[#eee3d7] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <div className="flex flex-col">
                            <span className="text-xs text-[#806d62]">Tạm tính</span>
                            <strong className="text-lg text-[#b84d1d]">{formatPrice(total)}</strong>
                        </div>
                        <button
                            className="min-h-[52px] rounded-[0.9rem] bg-[#ef7d32] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d8cdc4]"
                            type="button"
                            disabled={itemCount === 0 || submitting || Boolean(tableState?.kicked)}
                            onClick={submitOrder}
                        >
                            {submitting ? "Đang gửi..." : "Gọi món"}
                        </button>
                    </footer>
                </div>
            </dialog>
            <div className="sr-only" aria-live="polite">{notice}</div>
        </main>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<main className="grid min-h-dvh place-items-center text-[#806d62]">Đang tải thực đơn...</main>}>
            <CustomerMenu />
        </Suspense>
    );
}
