"use client";

import { faArrowLeft, faReceipt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ITEM_STATUS_STYLES } from "@/components/ui/styles";
import { formatDateTime, formatPrice, ITEM_STATUS_LABELS, ROUND_STATUS_LABELS } from "@/lib/format";

type State = {
    table: { name: string };
    items: Array<{ id: string; name: string; quantity: number; line_total: number; note: string | null; status: string; created_at: string; cancel_stage: string | null }>;
    rounds: Array<{ id: string; status: string; created_at: string; reject_reason: string | null; items: Array<{ name: string; quantity: number }> }>;
};

/** Lịch sử gọi món + theo dõi trạng thái từng món của bàn (cập nhật mỗi 10 giây). */
function OrderHistory() {
    const token = useSearchParams().get("t") ?? "";
    const [state, setState] = useState<State | null>(null);
    const [error, setError] = useState("");

    const fetchState = useCallback(async () => {
        const response = await fetch(`/api/public/tables/${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Không tải được đơn.");
        return data as State;
    }, [token]);

    useEffect(() => {
        const tick = () => fetchState().then(
            (data) => { setState(data); setError(""); },
            (err: unknown) => setError(err instanceof Error ? err.message : "Không tải được đơn."),
        );
        tick();
        const timer = window.setInterval(() => { if (document.visibilityState === "visible") tick(); }, 10_000);
        return () => window.clearInterval(timer);
    }, [fetchState]);

    const total = state?.items.filter((item) => item.status !== "cancelled").reduce((sum, item) => sum + item.line_total, 0) ?? 0;

    return (
        <main className="mx-auto min-h-dvh max-w-3xl bg-[#fffaf3] p-4 text-[#4a2d22]">
            <header className="mb-6 flex items-center justify-between gap-3">
                <div><p className="text-xs text-[#806d62]">{state?.table.name ?? "Theo dõi đơn"}</p><h1 className="text-2xl font-bold">Lịch sử gọi món</h1></div>
                <Link href={`/?t=${token}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#eee3d7] bg-white px-4 text-sm"><FontAwesomeIcon icon={faArrowLeft} /> Về thực đơn</Link>
            </header>
            {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            {state?.rounds.length ? (
                <section className="mb-4 grid gap-2" aria-label="Lượt gọi của bạn">
                    {state.rounds.map((round) => (
                        <article key={round.id} className={`rounded-2xl border p-4 ${round.status === "pending" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
                            <p className="font-semibold">{ROUND_STATUS_LABELS[round.status]}</p>
                            <p className="text-sm">{round.items.map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</p>
                            <p className="text-xs text-[#806d62]">{formatDateTime(round.created_at)}{round.reject_reason ? ` · ${round.reject_reason}` : ""}{round.status === "junk" ? " · vui lòng gọi nhân viên nếu bạn vẫn muốn gọi" : ""}</p>
                        </article>
                    ))}
                </section>
            ) : null}

            <section className="rounded-2xl border border-[#eee3d7] bg-white" aria-label="Món của bàn">
                {!state || state.items.length === 0 ? (
                    <p className="p-6 text-center text-[#806d62]">{state ? "Bàn chưa có món nào được xác nhận." : "Đang tải..."}</p>
                ) : (
                    <ul className="divide-y divide-[#eee3d7]">
                        {state.items.map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-3 p-4">
                                <span className="min-w-0">
                                    <b>{item.quantity}× {item.name}</b>
                                    {item.note && <span className="block text-xs text-[#806d62]">{item.note}</span>}
                                    <span className="block text-xs text-[#806d62]">{formatDateTime(item.created_at)}</span>
                                </span>
                                <span className="grid justify-items-end gap-1">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ITEM_STATUS_STYLES[item.status]}`}>{item.cancel_stage === "sold_out" ? "Hết món" : ITEM_STATUS_LABELS[item.status]}</span>
                                    <span className="text-sm text-[#b84d1d]">{formatPrice(item.line_total)}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                <footer className="flex items-center justify-between border-t border-[#eee3d7] p-4">
                    <span>Tạm tính</span><strong className="text-lg text-[#b84d1d]">{formatPrice(total)}</strong>
                </footer>
            </section>
            <Link href={`/orders/bill?t=${token}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ef7d32] font-bold text-white"><FontAwesomeIcon icon={faReceipt} /> Xem hoá đơn</Link>
        </main>
    );
}

export default function OrderHistoryPage() {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center text-[#806d62]">Đang tải...</main>}><OrderHistory /></Suspense>;
}
