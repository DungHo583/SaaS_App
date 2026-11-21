"use client";

import { useEffect, useState } from "react";

export default function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const [orderId, setOrderId] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => { params.then(({ id }) => setOrderId(id)); }, [params]);
  useEffect(() => {
    if (!orderId) return;
    const load = () => fetch(`/api/orders/${orderId}`).then((response) => response.json()).then(setData);
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [orderId]);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl p-4 bg-[#fffaf3] text-[#4a2d22]">
      <header className="mb-6 flex items-center justify-between"><div><p className="text-xs text-[#806d62]">Thời gian thực</p><h1 className="text-2xl font-bold">Theo dõi đơn #{orderId}</h1></div><a href="/" className="min-h-11 rounded-xl border border-[#eee3d7] px-4 py-3 text-sm">Về thực đơn</a></header>
      {!data?.order ? <p className="rounded-2xl border border-[#eee3d7] bg-white p-6 text-center text-[#806d62]">Đang tải đơn...</p> : <><section className="mb-4 rounded-2xl border border-[#eee3d7] bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-[#806d62]">{data.order.table_name}</p><strong className="text-xl">Đơn #{data.order.id}</strong></div><span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">{data.order.status}</span></div></section><section className="mb-4 rounded-2xl border border-[#eee3d7] bg-white p-5"><h2 className="mb-3 font-bold">Món đã gọi</h2>{data.items.map((item: any) => <div key={item.id} className="flex justify-between border-t border-[#eee3d7] py-3"><span>{item.quantity}× {item.name}</span><strong>{new Intl.NumberFormat("vi-VN").format(item.line_total)}đ</strong></div>)}</section><section className="rounded-2xl border border-[#eee3d7] bg-white p-5"><h2 className="mb-3 font-bold">Tiến trình</h2>{data.history.map((event: any, index: number) => <div key={index} className="border-l-2 border-[#ef7d32] pl-4 pb-4"><strong className="text-sm">{event.status}</strong><p className="text-xs text-[#806d62]">{new Date(event.created_at).toLocaleString("vi-VN")}</p></div>)}</section></>}
    </main>
  );
}
