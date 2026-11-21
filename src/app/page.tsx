"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { categories, dishes, formatPrice } from "@/data/menu";
import type { Dish, DishCategory } from "@/types/menu";
import AppHeader from "@/components/AppHeader";
import CategoryNav from "@/components/CategoryNav";
import MenuList from "@/components/MenuList";

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<DishCategory>("Tất cả");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [hasOrdered, setHasOrdered] = useState(false);
  const [activeDishes, setActiveDishes] = useState<Dish[]>([...dishes]);
  const [tableId, setTableId] = useState<number | null>(null);
  const [tableName, setTableName] = useState("Chưa xác định bàn");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState("pending");
  const navDialogRef = useRef<HTMLDialogElement>(null);
  const cartDialogRef = useRef<HTMLDialogElement>(null);

  const filteredDishes = useMemo(
    () =>
      activeCategory === "Tất cả"
        ? activeDishes
        : activeDishes.filter((dish) => dish.category === activeCategory),
    [activeCategory, activeDishes],
  );

  const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const total = activeDishes.reduce((sum, dish) => sum + (cart[dish.id] ?? 0) * dish.price, 0);

  const changeQuantity = (id: number, delta: number) => {
    setCart((current) => {
      const quantity = Math.max(0, (current[id] ?? 0) + delta);
      const next = { ...current };
      if (quantity === 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = Number(url.searchParams.get("tableId"));
    if (Number.isInteger(id) && id > 0) setTableId(id);

    fetch("/api/menu")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (Array.isArray(data.dishes) && data.dishes.length > 0) setActiveDishes(data.dishes);
      })
      .catch(() => setActiveDishes([...dishes]));

    if (Number.isInteger(id) && id > 0) {
      fetch(`/api/tables/${id}`)
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data) => {
          if (data.table?.name) setTableName(data.table.name);
        })
        .catch(() => setTableName(`Bàn ${id}`));
    }
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 pb-24 pt-4 sm:px-8">
      <AppHeader itemCount={itemCount} navDialogRef={navDialogRef} cartDialogRef={cartDialogRef} />

      <section className="relative min-h-42 overflow-hidden rounded-3xl bg-linear-to-br from-[#df6528] to-[#f39a56] p-5 text-white sm:min-h-48 sm:px-8" aria-label="Ưu đãi hôm nay">
        <div>
          <p className="mb-2 text-xs opacity-90">Ưu đãi hôm nay</p>
          <h2 className="mb-4 text-[clamp(1.35rem,6vw,2.2rem)] font-bold leading-tight">
            Giảm 15%
            <br />
            cho món đầu tiên
          </h2>
          <button type="button" className="min-h-11 rounded-full bg-white px-4 font-bold text-[#b84d1d]">Đặt ngay</button>
        </div>
        <span className="absolute -bottom-4 right-2 text-[clamp(6rem,28vw,9rem)] drop-shadow-lg -rotate-8" aria-hidden="true">🍜</span>
      </section>

      <CategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onChange={setActiveCategory}
      />

      <MenuList
        activeCategory={activeCategory}
        dishes={filteredDishes}
        cart={cart}
        onAdd={(id) => {
          setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
        }}
        onQuantityChange={changeQuantity}
      />

      <dialog
        ref={navDialogRef}
        className="nav-dialog"
        aria-labelledby="nav-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) navDialogRef.current?.close();
        }}
      >
        <div className="h-full w-full bg-white shadow-[1rem_0_3rem_rgba(74,45,34,0.16)]">
          <header className="flex min-h-[76px] items-center justify-between border-b border-[#eee3d7] p-4">
            <div>
              <p className="mb-0.5 text-xs text-[#806d62]">Nhà hàng</p>
              <h2 id="nav-dialog-title" className="text-xl font-bold">Bếp Nhà</h2>
            </div>
            <button type="button" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-[#fffaf3] text-2xl" aria-label="Đóng menu" onClick={() => navDialogRef.current?.close()}>×</button>
          </header>
          <nav className="flex flex-col gap-1 p-3" aria-label="Điều hướng nhà hàng">
            <button type="button" className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#4a2d22] hover:bg-[#fffaf3]" onClick={() => navDialogRef.current?.close()}><span className="w-7 text-center">🍽️</span> Menu</button>
            <button type="button" className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#4a2d22] hover:bg-[#fffaf3]" onClick={() => { navDialogRef.current?.close(); cartDialogRef.current?.showModal(); }}><span className="w-7 text-center">🛒</span> Giỏ hàng</button>
            {hasOrdered && tableId ? (
              <>
                <a className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-[#4a2d22] hover:bg-[#fffaf3]" href={`/orders?tableId=${tableId}`}><span className="w-7 text-center">🧾</span> Lịch sử gọi món</a>
                {orderId && <a className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-[#4a2d22] hover:bg-[#fffaf3]" href={`/orders/${orderId}`}><span className="w-7 text-center">🍳</span> Theo dõi món ăn</a>}
                {orderId && <a className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-[#4a2d22] hover:bg-[#fffaf3]" href={`/orders/${orderId}/bill`}><span className="w-7 text-center">💳</span> Hoá đơn</a>}
              </>
            ) : (
              <>
                <button type="button" disabled className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#b9aca2] cursor-not-allowed"><span className="w-7 text-center">🧾</span> Lịch sử gọi món</button>
                <button type="button" disabled className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#b9aca2] cursor-not-allowed"><span className="w-7 text-center">🍳</span> Theo dõi món ăn</button>
                <button type="button" disabled className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#b9aca2] cursor-not-allowed"><span className="w-7 text-center">💳</span> Hoá đơn</button>
              </>
            )}
            <button type="button" className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#4a2d22] hover:bg-[#fffaf3]"><span className="w-7 text-center">🏪</span> Thông tin cửa hàng</button>
            <button type="button" className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[#4a2d22] hover:bg-[#fffaf3]"><span className="w-7 text-center">🔔</span> Gọi nhân viên</button>
          </nav>
        </div>
      </dialog>

      <dialog
        ref={cartDialogRef}
        className="fixed inset-[1dvh_1vw] m-auto h-[98dvh] w-[98vw] max-h-none max-w-none overflow-hidden rounded-2xl border-0 p-0"
        aria-labelledby="cart-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) cartDialogRef.current?.close();
        }}
      >
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-[#fffaf3]">
          <header className="flex min-h-[76px] items-center justify-between border-b border-[#eee3d7] bg-white p-4">
            <div>
              <p className="mb-0.5 text-xs text-[#806d62]">{tableName}</p>
              <h2 id="cart-dialog-title" className="text-xl font-bold">
                Giỏ hàng <span className="ml-1 inline-grid size-7 place-items-center rounded-full bg-[#ef7d32] text-xs text-white">{itemCount}</span>
              </h2>
            </div>
            <button type="button" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-[#fffaf3] text-2xl" aria-label="Đóng giỏ hàng" onClick={() => cartDialogRef.current?.close()}>×</button>
          </header>

          <div className="overflow-y-auto p-3">
            {itemCount === 0 ? (
              <div className="grid h-full place-content-center justify-items-center text-center">
                <span className="text-5xl opacity-45" aria-hidden="true">🛒</span>
                <h3 className="mt-3 mb-1 font-bold">Giỏ hàng đang trống</h3>
                <p className="text-sm text-[#806d62]">Hãy chọn món bạn yêu thích.</p>
              </div>
            ) : activeDishes.filter((dish) => (cart[dish.id] ?? 0) > 0).map((dish) => {
              const quantity = cart[dish.id];
              return (
                <article className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[#eee3d7] bg-white p-3 first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 sm:grid-cols-[64px_minmax(0,1fr)_auto]" key={dish.id}>
                  <div className="grid size-13 place-items-center rounded-xl bg-[#f6e8d7] text-3xl max-sm:size-13" aria-hidden="true">{dish.icon}</div>
                  <div className="min-w-0">
                    <h3 className="mb-1 truncate text-sm font-bold">{dish.name}</h3>
                    <strong className="text-[#b84d1d]">{formatPrice(dish.price * quantity)}</strong>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="size-11 rounded-full border border-[#eee3d7] bg-white text-lg text-[#b84d1d]" onClick={() => changeQuantity(dish.id, -1)} aria-label={`Giảm ${dish.name}`}>−</button>
                    <span className="min-w-[1ch] text-center font-bold">{quantity}</span>
                    <button type="button" className="size-11 cursor-pointer rounded-full border border-[#ef7d32] bg-[#ef7d32] text-lg text-white" onClick={() => changeQuantity(dish.id, 1)} aria-label={`Tăng ${dish.name}`}>+</button>
                  </div>
                </article>
              );
            })}
          </div>

          <footer className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,40%)] items-center gap-3 border-t border-[#eee3d7] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex flex-col">
              <span className="text-xs text-[#806d62]">Tổng cộng</span>
              <strong className="text-lg text-[#b84d1d]">{formatPrice(total)}</strong>
            </div>
            <button
              className="min-h-[52px] rounded-[0.9rem] bg-[#ef7d32] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d8cdc4]"
              type="button"
              disabled={itemCount === 0 || submitting}
              onClick={async () => {
                if (!tableId) {
                  window.alert("Vui lòng quét mã QR bàn trước khi gọi món.");
                  return;
                }
                setSubmitting(true);
                try {
                  const idempotencyKey = crypto.randomUUID();
                  const response = await fetch("/api/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
                    body: JSON.stringify({
                      tableId,
                      idempotencyKey,
                      items: activeDishes
                        .filter((dish) => (cart[dish.id] ?? 0) > 0)
                        .map((dish) => ({ id: dish.id, quantity: cart[dish.id] })),
                    }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error ?? "Không thể gọi món.");
                  setOrderId(data.order.id);
                  setOrderStatus(data.order.status);
                  setHasOrdered(true);
                  setCart({});
                  cartDialogRef.current?.close();
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "Không thể gọi món.");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Đang gọi..." : "Gọi món"}
            </button>
          </footer>
        </div>
      </dialog>
      <div className="sr-only" aria-live="polite">
        {hasOrdered ? "Đã ghi nhận đơn gọi món." : ""}
      </div>
    </main>
  );
}
