"use client";

import { useEffect, useState } from "react";

export default function BillPage({ params }: { params: Promise<{ id: string }> }) {
    const [orderId, setOrderId] = useState("");
    const [data, setData] = useState<any>(null);

    useEffect(() => { params.then(({ id }) => setOrderId(id)); }, [params]);
    useEffect(() => { if (orderId) fetch(`/api/orders/${orderId}`).then((response) => response.json()).then(setData); }, [orderId]);

    return (
        <main className="mx-auto min-h-dvh max-w-xl p-4 bg-[#fffaf3] text-[#4a2d22]">
            <header className="mb-6 flex items-center justify-between"><div><p className="text-xs text-[#806d62]">Thanh toán</p><h1 className="text-2xl font-bold">Hoá đơn #{orderId}</h1></div><a href="/" className="min-h-11 rounded-xl border border-[#eee3d7] px-4 py-3 text-sm">Về thực đơn</a></header>
            {!data?.order ? <p className="rounded-2xl border border-[#eee3d7] bg-white p-6 text-center text-[#806d62]">Đang tải hoá đơn...</p> : <section className="rounded-2xl border border-[#eee3d7] bg-white p-5"><p className="mb-4 text-sm text-[#806d62]">{data.order.table_name}</p>{data.items.map((item: any) => <div key={item.id} className="flex justify-between border-b border-[#eee3d7] py-3"><span>{item.quantity}× {item.name}</span><strong>{new Intl.NumberFormat("vi-VN").format(item.line_total)}đ</strong></div>)}<div className="mt-5 flex justify-between text-xl"><strong>Tổng cộng</strong><strong className="text-[#b84d1d]">{new Intl.NumberFormat("vi-VN").format(data.order.total)}đ</strong></div><p className="mt-4 rounded-xl bg-[#fffaf3] p-3 text-center text-sm text-[#806d62]">{data.bill ? `Trạng thái: ${data.bill.status}` : "Hoá đơn đang chờ thanh toán"}</p></section>}
        </main>
    );
}
