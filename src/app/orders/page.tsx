"use client";

import { useEffect, useState } from "react";

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<Array<{ id: number; status: string; total: number; created_at: string; table_name: string; items: Array<{ name: string; quantity: number }> }>>([]);

  useEffect(() => {
    const tableId = new URL(window.location.href).searchParams.get("tableId");
    if (!tableId) return;
    fetch(`/api/orders?tableId=${tableId}`).then((response) => response.json()).then((data) => setOrders(data.orders ?? []));
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl p-4 bg-[#fffaf3] text-[#4a2d22]">
      <header className="mb-6 flex items-center justify-between"><div><p className="text-xs text-[#806d62]">Theo dõi đơn</p><h1 className="text-2xl font-bold">Lịch sử gọi món</h1></div><a href="/" className="min-h-11 rounded-xl border border-[#eee3d7] px-4 py-3 text-sm">Về thực đơn</a></header>
      <div className="space-y-3">{orders.length === 0 ? <p className="rounded-2xl border border-[#eee3d7] bg-white p-6 text-center text-[#806d62]">Chưa có đơn nào.</p> : orders.map((order) => <article key={order.id} className="rounded-2xl border border-[#eee3d7] bg-white p-5"><div className="mb-3 flex justify-between"><strong>Đơn #{order.id}</strong><span className="rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700">{order.status}</span></div><p className="mb-2 text-sm text-[#806d62]">{order.table_name} • {new Date(order.created_at).toLocaleString("vi-VN")}</p><p className="text-sm">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(" • ")}</p><strong className="mt-3 block text-[#b84d1d]">{new Intl.NumberFormat("vi-VN").format(order.total)}đ</strong></article>)}</div>
    </main>
  );
}
