"use client";

import { faArrowLeft, faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Receipt = { title: string; number: string | null; total: number; html: string };

/** Phiếu tạm tính / phiếu thanh toán khổ 80mm của bàn (khách xem trên điện thoại). */
function Bill() {
    const token = useSearchParams().get("t") ?? "";
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/public/tables/${encodeURIComponent(token)}/bill`, { cache: "no-store" })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error ?? "Không tải được hoá đơn.");
                setReceipt(data);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được hoá đơn."));
    }, [token]);

    return (
        <main className="receipt-page mx-auto min-h-dvh max-w-xl bg-[#fffaf3] p-4 text-[#4a2d22]">
            <header className="mb-6 flex items-center justify-between gap-3">
                <div><p className="text-xs text-[#806d62]">Thanh toán · khổ 80mm</p><h1 className="text-2xl font-bold">{receipt?.title ?? "Hoá đơn"}</h1></div>
                <Link href={`/orders?t=${token}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#eee3d7] bg-white px-4 text-sm"><FontAwesomeIcon icon={faArrowLeft} /> Quay lại</Link>
            </header>
            {error ? (
                <p className="rounded-2xl border border-[#eee3d7] bg-white p-6 text-center text-[#806d62]" role="alert">{error}</p>
            ) : !receipt ? (
                <p className="rounded-2xl border border-[#eee3d7] bg-white p-6 text-center text-[#806d62]">Đang tải hoá đơn...</p>
            ) : (
                <>
                    {/* HTML do server render từ layout 48 cột, mọi nội dung đã được escape. */}
                    <div className="overflow-x-auto rounded-2xl bg-[#efe8de] p-3 shadow-inner" dangerouslySetInnerHTML={{ __html: receipt.html }} />
                    <button type="button" onClick={() => window.print()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#4a2d22] bg-white font-bold">
                        <FontAwesomeIcon icon={faPrint} /> In / lưu PDF
                    </button>
                </>
            )}
        </main>
    );
}

export default function BillPage() {
    return <Suspense fallback={<main className="grid min-h-dvh place-items-center text-[#806d62]">Đang tải...</main>}><Bill /></Suspense>;
}
