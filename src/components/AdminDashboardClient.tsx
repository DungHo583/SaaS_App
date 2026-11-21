"use client";

import { faCheck, faReceipt, faSackDollar, faTriangleExclamation, faUtensils, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { api, errorMessage } from "@/components/ui/api";
import { ui } from "@/components/ui/styles";
import { formatDateTime, formatPrice } from "@/lib/format";

type Approval = {
    id: string; approval_type: string; amount: number | null; reason: string; requested_at: string;
    requested_by: string; table_names: string | null;
};
type TableTile = { id: string; name: string; area: string; capacity: number; busy: boolean; isActive: boolean };

export default function AdminDashboardClient({ stats, approvals: initialApprovals, tables }: {
    stats: { revenue: number; bills: number; openSessions: number; wasted: number; junkRounds: number; tables: number };
    approvals: Approval[];
    tables: TableTile[];
}) {
    const [approvals, setApprovals] = useState(initialApprovals);
    const [error, setError] = useState("");

    async function decide(approval: Approval, decision: "approved" | "rejected") {
        const note = decision === "rejected"
            ? window.prompt("Lý do từ chối (nhân viên sẽ phải giải trình):")?.trim()
            : window.prompt("Ghi chú duyệt (không bắt buộc):", "")?.trim();
        if (decision === "rejected" && !note) return;
        setError("");
        try {
            await api(`/api/admin/approvals/${approval.id}`, { body: { decision, note: note || null } });
            setApprovals((current) => current.filter((item) => item.id !== approval.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    }

    const cards = [
        { label: "Doanh thu hôm nay", value: formatPrice(stats.revenue), icon: faSackDollar },
        { label: "Phiếu đã thanh toán", value: stats.bills, icon: faReceipt },
        { label: "Bàn đang phục vụ", value: `${stats.openSessions} / ${stats.tables}`, icon: faUtensils },
        { label: "Huỷ sau khi nấu / order rác", value: `${stats.wasted} / ${stats.junkRounds}`, icon: faTriangleExclamation },
    ];

    return (
        <AdminShell title="Tổng quan" subtitle="Bảng điều khiển">
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <article key={card.label} className={`${ui.card} p-5`}>
                        <p className="flex items-center gap-2 text-sm text-[#806d62]"><FontAwesomeIcon icon={card.icon} />{card.label}</p>
                        <strong className="mt-2 block text-3xl">{card.value}</strong>
                    </article>
                ))}
            </div>

            <section className={`${ui.card} mb-6 overflow-hidden`} aria-labelledby="approvals-title">
                <header className="flex items-center justify-between border-b border-[#eee3d7] px-5 py-4">
                    <h2 id="approvals-title" className="font-bold">Chờ owner duyệt</h2>
                    <span className={`${ui.badge} ${approvals.length ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}`}>{approvals.length}</span>
                </header>
                {error && <p role="alert" className={`${ui.error} m-4`}>{error}</p>}
                {approvals.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-[#806d62]">Không có yêu cầu nào.</p>
                ) : (
                    <ul className="divide-y divide-[#eee3d7]">
                        {approvals.map((approval) => (
                            <li key={approval.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                <div>
                                    <p className="font-bold">
                                        Đóng phiên bất thường · {approval.table_names ?? "Mang về"} · <span className="text-[#b84d1d]">{formatPrice(approval.amount ?? 0)}</span>
                                    </p>
                                    <p className="text-sm">{approval.reason}</p>
                                    <p className="text-xs text-[#806d62]">@{approval.requested_by} · {formatDateTime(approval.requested_at)}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => decide(approval, "approved")} className={ui.small}>
                                        <FontAwesomeIcon icon={faCheck} /> Duyệt (ghi thất thoát)
                                    </button>
                                    <button type="button" onClick={() => decide(approval, "rejected")} className={ui.danger}>
                                        <FontAwesomeIcon icon={faXmark} /> Từ chối
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className={`${ui.card} overflow-hidden`} aria-labelledby="tables-title">
                <header className="flex items-center justify-between border-b border-[#eee3d7] px-5 py-4">
                    <h2 id="tables-title" className="font-bold">Trạng thái bàn</h2>
                    <Link href="/admin/tables" className={`${ui.primary} min-h-11 text-sm`}>Quản lý bàn</Link>
                </header>
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    {tables.length === 0 ? (
                        <p className="col-span-full py-10 text-center text-sm text-[#806d62]">Chưa có bàn. Thêm bàn trong mục Bàn ăn.</p>
                    ) : tables.map((table) => (
                        <article key={table.id} className="rounded-xl border border-[#eee3d7] p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <strong>{table.name}</strong>
                                <span className={`${ui.badge} ${!table.isActive ? "bg-gray-100 text-gray-600" : table.busy ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                    {!table.isActive ? "Tạm ngưng" : table.busy ? "Đang phục vụ" : "Trống"}
                                </span>
                            </div>
                            <p className="text-sm text-[#806d62]">{table.area || "Chưa đặt khu vực"} · {table.capacity} khách</p>
                        </article>
                    ))}
                </div>
            </section>
        </AdminShell>
    );
}
