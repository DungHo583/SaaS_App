"use client";

import { faCircleCheck, faMagnifyingGlass, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import OtpPrompt from "@/components/admin/OtpPrompt";
import { api, ApiError, errorMessage } from "@/components/ui/api";
import { ui } from "@/components/ui/styles";
import { formatDateTime } from "@/lib/format";

type Entry = {
    id: string; occurred_at: string; actor_type: string; actor_label: string; role_context: string | null; is_elevated: boolean;
    action: string; entity_type: string | null; entity_id: string | null; before_data: unknown; after_data: unknown; reason: string | null; ip: string | null;
};

/** Nhật ký hoạt động: chỉ owner, mở bằng OTP; 2 loại log (quán / khách); không sửa, không xoá. */
export default function AuditViewer() {
    const [category, setCategory] = useState<"shop" | "customer">("shop");
    const [action, setAction] = useState("");
    const [entries, setEntries] = useState<Entry[]>([]);
    const [needOtp, setNeedOtp] = useState(false);
    const [chainBrokenAt, setChainBrokenAt] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    const load = useCallback((before?: string) => {
        const query = new URLSearchParams({ category, ...(action ? { action } : {}), ...(before ? { before } : {}) });
        return api<{ entries: Entry[]; chainBrokenAt: string | null }>(`/api/admin/audit?${query}`).then(
            (data) => {
                setEntries((current) => before ? [...current, ...data.entries] : data.entries);
                setChainBrokenAt(data.chainBrokenAt);
                setNeedOtp(false);
                setError("");
                setLoading(false);
            },
            (err: unknown) => {
                if (err instanceof ApiError && err.code === "otp_required") setNeedOtp(true);
                else setError(errorMessage(err));
                setLoading(false);
            },
        );
    }, [category, action]);

    useEffect(() => { void load(); }, [load]);

    return (
        <AdminShell title="Nhật ký hoạt động" subtitle="Log bất biến — không sửa, không xoá">
            {needOtp ? (
                <section className={`${ui.card} mx-auto max-w-md p-5`}>
                    <OtpPrompt purpose="view_audit" description="Nhật ký chỉ mở được bằng mã OTP gửi về email owner. Quyền xem có hiệu lực 15 phút; bản thân việc xem cũng được ghi lại." onVerified={() => load()} />
                </section>
            ) : (
                <>
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <div role="tablist" aria-label="Loại log" className="flex rounded-xl border border-[#eee3d7] bg-white p-1">
                            {(["shop", "customer"] as const).map((value) => (
                                <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => setCategory(value)}
                                    className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${category === value ? "bg-[#4a2d22] text-white" : "text-[#806d62]"}`}>
                                    {value === "shop" ? "Thao tác của quán" : "Thao tác của khách"}
                                </button>
                            ))}
                        </div>
                        <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="flex flex-1 gap-2">
                            <label htmlFor="audit-action" className="sr-only">Lọc theo hành động</label>
                            <input id="audit-action" value={action} onChange={(event) => setAction(event.target.value.trim())} placeholder="Lọc hành động, vd. bill. hoặc item.cancel" className={`${ui.input} flex-1`} />
                            <button type="submit" className={ui.secondary} aria-label="Lọc"><FontAwesomeIcon icon={faMagnifyingGlass} /></button>
                        </form>
                    </div>
                    <p className={`mb-4 ${chainBrokenAt ? ui.error : ui.success}`}>
                        <FontAwesomeIcon icon={chainBrokenAt ? faTriangleExclamation : faCircleCheck} />{" "}
                        {chainBrokenAt ? `Chuỗi log bị thay đổi tại dòng #${chainBrokenAt}. Liên hệ nhà cung cấp ngay.` : "Chuỗi băm toàn vẹn: log chưa bị chỉnh sửa."}
                    </p>
                    {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}
                    <section className={`${ui.card} overflow-x-auto`}>
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="border-b border-[#eee3d7] text-xs text-[#806d62]">
                                <tr><th className="p-3">Thời điểm</th><th className="p-3">Người thực hiện</th><th className="p-3">Hành động</th><th className="p-3">Chi tiết</th></tr>
                            </thead>
                            <tbody className="divide-y divide-[#eee3d7]">
                                {entries.map((entry) => (
                                    <tr key={entry.id} className="align-top">
                                        <td className="whitespace-nowrap p-3">{formatDateTime(entry.occurred_at)}<span className="block text-xs text-[#806d62]">#{entry.id}</span></td>
                                        <td className="p-3">
                                            {entry.actor_label}
                                            {entry.role_context && <span className="block text-xs text-[#806d62]">vai trò: {entry.role_context}</span>}
                                            {entry.is_elevated && <span className={`${ui.badge} mt-1 bg-orange-100 text-orange-800`}>Bất khả kháng</span>}
                                        </td>
                                        <td className="p-3 font-mono text-xs">{entry.action}{entry.reason && <span className="mt-1 block font-sans text-sm">Lý do: {entry.reason}</span>}</td>
                                        <td className="p-3">
                                            <details>
                                                <summary className="cursor-pointer text-xs text-[#806d62]">{entry.entity_type ?? "—"} {entry.ip ? `· IP ${entry.ip}` : ""}</summary>
                                                <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#fffaf3] p-2 text-xs">{JSON.stringify({ before: entry.before_data, after: entry.after_data }, null, 2)}</pre>
                                            </details>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!loading && entries.length === 0 && <p className="p-8 text-center text-sm text-[#806d62]">Chưa có log.</p>}
                    </section>
                    {entries.length >= 100 && entries.length % 100 === 0 && (
                        <button type="button" onClick={() => load(entries.at(-1)?.id)} disabled={loading} className={`${ui.secondary} mt-4 w-full`}>Tải thêm</button>
                    )}
                </>
            )}
        </AdminShell>
    );
}
