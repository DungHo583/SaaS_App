"use client";

import { faArrowsRotate, faPen, faPlus, faPrint, faQrcode, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { api, errorMessage } from "@/components/ui/api";
import Dialog from "@/components/ui/Dialog";
import { ui } from "@/components/ui/styles";

export type RestaurantTable = {
    id: string; name: string; area: string; capacity: number; qr_token: string; is_active: boolean; session_id: string | null;
};

function tableUrl(token: string) {
    return `${window.location.origin}/?t=${token}`;
}

function QrPreview({ table }: { table: RestaurantTable }) {
    const [dataUrl, setDataUrl] = useState("");
    useEffect(() => {
        QRCode.toDataURL(tableUrl(table.qr_token), { width: 480, margin: 2, errorCorrectionLevel: "M" }).then(setDataUrl);
    }, [table.qr_token]);

    function print() {
        const popup = window.open("", "_blank", "width=480,height=640");
        if (!popup) return;
        popup.document.title = `QR ${table.name}`;
        popup.document.body.innerHTML = `<div style="font-family:system-ui;text-align:center;padding:24px"><h1 style="margin:0 0 8px">${table.name.replace(/[<>&]/g, "")}</h1><p style="margin:0 0 16px">Quét mã để xem thực đơn và gọi món</p><img src="${dataUrl}" style="width:320px;height:320px" alt=""></div>`;
        // Đợi ảnh QR (data URL) được vẽ rồi mới mở hộp thoại in.
        window.setTimeout(() => popup.print(), 300);
    }

    return (
        <div className="grid justify-items-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR sinh tại trình duyệt (data URL) */}
            {dataUrl ? <img src={dataUrl} alt={`Mã QR gọi món ${table.name}`} className="size-64 rounded-xl border border-[#eee3d7]" /> : <div className="size-64 rounded-xl bg-[#f7f3ed]" />}
            <p className="break-all text-xs text-[#806d62]">{tableUrl(table.qr_token)}</p>
            <button type="button" onClick={print} disabled={!dataUrl} className={ui.primary}><FontAwesomeIcon icon={faPrint} /> In mã QR</button>
        </div>
    );
}

export default function TablesManager({ initialTables }: { initialTables: RestaurantTable[] }) {
    const [tables, setTables] = useState(initialTables);
    const [editing, setEditing] = useState<RestaurantTable | null>(null);
    const [qrTable, setQrTable] = useState<RestaurantTable | null>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const replace = (table: RestaurantTable) => setTables((current) => current.map((row) => row.id === table.id ? table : row));

    async function saveTable(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const payload = {
            name: String(form.get("name") ?? ""),
            area: String(form.get("area") ?? ""),
            capacity: Number(form.get("capacity")),
            ...(editing ? { isActive: form.get("isActive") === "on" } : {}),
        };
        try {
            const data = await api<{ table: RestaurantTable }>(editing ? `/api/admin/tables/${editing.id}` : "/api/admin/tables", {
                method: editing ? "PATCH" : "POST",
                body: payload,
            });
            if (editing) replace(data.table);
            else setTables((current) => [...current, data.table]);
            setOpen(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    async function removeTable(table: RestaurantTable) {
        if (!confirm(`Xoá ${table.name}? Mã QR của bàn sẽ không dùng được nữa.`)) return;
        try {
            await api(`/api/admin/tables/${table.id}`, { method: "DELETE" });
            setTables((current) => current.filter((row) => row.id !== table.id));
        } catch (err) {
            alert(errorMessage(err));
        }
    }

    async function rotateQr(table: RestaurantTable) {
        if (!confirm(`Tạo mã QR mới cho ${table.name}? Mã QR đang dán trên bàn sẽ mất hiệu lực, cần in lại.`)) return;
        try {
            const data = await api<{ table: RestaurantTable }>(`/api/admin/tables/${table.id}/rotate-qr`, { method: "POST" });
            replace(data.table);
            setQrTable(data.table);
        } catch (err) {
            alert(errorMessage(err));
        }
    }

    return (
        <AdminShell
            title="Quản lý bàn ăn"
            actions={<button type="button" onClick={() => { setEditing(null); setError(""); setOpen(true); }} className={`${ui.primary} min-h-11 text-sm`}><FontAwesomeIcon icon={faPlus} /> Thêm bàn</button>}
        >
            <p className="mb-5 text-sm text-[#806d62]">{tables.length} bàn · {tables.filter((table) => table.session_id).length} đang phục vụ</p>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tables.map((table) => (
                    <article key={table.id} className={`${ui.card} p-4`}>
                        <div className="mb-3 flex items-start justify-between gap-2">
                            <div><h2 className="font-bold">{table.name}</h2><p className="text-sm text-[#806d62]">{table.area || "Chưa đặt khu vực"} · {table.capacity} khách</p></div>
                            <span className={`${ui.badge} ${!table.is_active ? "bg-gray-100 text-gray-600" : table.session_id ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                {!table.is_active ? "Tạm ngưng" : table.session_id ? "Đang phục vụ" : "Trống"}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setQrTable(table)} className={ui.small}><FontAwesomeIcon icon={faQrcode} /> Mã QR</button>
                            <button type="button" onClick={() => { setEditing(table); setError(""); setOpen(true); }} className={ui.small} aria-label={`Sửa ${table.name}`}><FontAwesomeIcon icon={faPen} /> Sửa</button>
                            <button type="button" onClick={() => rotateQr(table)} className={ui.small} aria-label={`Tạo mã QR mới cho ${table.name}`}><FontAwesomeIcon icon={faArrowsRotate} /></button>
                            <button type="button" onClick={() => removeTable(table)} disabled={Boolean(table.session_id)} className={ui.danger} aria-label={`Xoá ${table.name}`}><FontAwesomeIcon icon={faTrash} /></button>
                        </div>
                    </article>
                ))}
            </section>

            <Dialog open={Boolean(qrTable)} onClose={() => setQrTable(null)} title={qrTable ? `Mã QR ${qrTable.name}` : "Mã QR"}>
                {qrTable && <QrPreview table={qrTable} />}
            </Dialog>

            <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Sửa ${editing.name}` : "Thêm bàn mới"}>
                {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}
                <form onSubmit={saveTable} className="grid gap-4">
                    <div><label htmlFor="table-name" className={ui.label}>Tên bàn</label><input id="table-name" name="name" defaultValue={editing?.name ?? ""} required maxLength={50} className={ui.input} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label htmlFor="table-area" className={ui.label}>Khu vực</label><input id="table-area" name="area" defaultValue={editing?.area ?? "Tầng 1"} maxLength={50} className={ui.input} /></div>
                        <div><label htmlFor="table-capacity" className={ui.label}>Sức chứa</label><input id="table-capacity" name="capacity" type="number" min="1" max="100" inputMode="numeric" defaultValue={editing?.capacity ?? 4} required className={ui.input} /></div>
                    </div>
                    {editing && (
                        <label className="flex min-h-12 items-center gap-3">
                            <input name="isActive" type="checkbox" defaultChecked={editing.is_active} disabled={Boolean(editing.session_id)} className="size-5 accent-[#ef7d32]" />
                            <span className="text-sm font-semibold">Đang sử dụng (bỏ chọn để tạm ngưng bàn)</span>
                        </label>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setOpen(false)} className={ui.secondary}>Huỷ</button>
                        <button type="submit" disabled={saving} className={ui.primary}>{saving ? "Đang lưu..." : "Lưu bàn"}</button>
                    </div>
                </form>
            </Dialog>
        </AdminShell>
    );
}
