"use client";

import { faEyeSlash, faEye, faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { api, errorMessage } from "@/components/ui/api";
import Dialog from "@/components/ui/Dialog";
import { ui } from "@/components/ui/styles";
import { BADGE_LABELS, formatPrice } from "@/lib/format";

type Badge = keyof typeof BADGE_LABELS;
export type MenuCategory = { id: string; name: string; sort_order: number; is_active: boolean };
export type MenuItem = {
    id: string; category_id: string; category_name: string; name: string; description: string; unit: string;
    price: number; image_url: string | null; highlight_badge: Badge | null; is_available: boolean;
    manual_portions: number | null; sold_out_at: string | null; sort_order: number;
};

export default function MenuManager({ initialItems, initialCategories }: { initialItems: MenuItem[]; initialCategories: MenuCategory[] }) {
    const [items, setItems] = useState(initialItems);
    const [categories, setCategories] = useState(initialCategories);
    const [editing, setEditing] = useState<MenuItem | null>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    const [categoryError, setCategoryError] = useState("");
    const [preview, setPreview] = useState({ name: "", description: "", price: "", unit: "phần", badge: "" as Badge | "", image: null as string | null });

    function openItemForm(item: MenuItem | null) {
        setEditing(item);
        setError("");
        setPreview({
            name: item?.name ?? "",
            description: item?.description ?? "",
            price: item ? String(item.price / 1000) : "",
            unit: item?.unit ?? "phần",
            badge: item?.highlight_badge ?? "",
            image: item?.image_url ?? null,
        });
        setOpen(true);
    }

    async function saveItem(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const portions = String(form.get("manualPortions") ?? "").trim();
        const payload = {
            categoryId: String(form.get("categoryId") ?? ""),
            name: preview.name,
            description: preview.description,
            unit: preview.unit,
            price: Math.round(Number(preview.price) * 1000),
            manualPortions: portions === "" ? null : Number(portions),
            imageUrl: preview.image,
            highlightBadge: preview.badge || null,
            isAvailable: form.get("isAvailable") === "on",
            sortOrder: editing?.sort_order ?? items.length + 1,
        };
        try {
            const data = await api<{ item: MenuItem }>(editing ? `/api/admin/menu/${editing.id}` : "/api/admin/menu", {
                method: editing ? "PATCH" : "POST",
                body: payload,
            });
            setItems((current) => editing ? current.map((item) => item.id === editing.id ? data.item : item) : [...current, data.item]);
            setOpen(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    async function removeItem(item: MenuItem) {
        if (!confirm(`Xoá món "${item.name}" khỏi thực đơn? Đơn và phiếu cũ vẫn giữ nguyên.`)) return;
        try {
            await api(`/api/admin/menu/${item.id}`, { method: "DELETE" });
            setItems((current) => current.filter((row) => row.id !== item.id));
        } catch (err) {
            alert(errorMessage(err));
        }
    }

    function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { setError("Chỉ nhận ảnh PNG, JPEG, WebP hoặc GIF."); return; }
        if (file.size > 2 * 1024 * 1024) { setError("Ảnh phải nhỏ hơn 2MB."); return; }
        const reader = new FileReader();
        reader.onload = () => setPreview((current) => ({ ...current, image: String(reader.result) }));
        reader.readAsDataURL(file);
    }

    async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setCategoryError("");
        const name = categoryName.trim();
        if (!name) return;
        try {
            const data = await api<{ category: MenuCategory }>("/api/admin/menu/categories", { body: { name } });
            setCategories((current) => [...current, data.category]);
            setCategoryName("");
        } catch (err) {
            setCategoryError(errorMessage(err));
        }
    }

    async function updateCategory(category: MenuCategory, patch: Partial<MenuCategory>) {
        try {
            const data = await api<{ category: MenuCategory }>(`/api/admin/menu/categories/${category.id}`, { method: "PATCH", body: patch });
            setCategories((current) => current.map((row) => row.id === category.id ? data.category : row));
            if (patch.name) setItems((current) => current.map((item) => item.category_id === category.id ? { ...item, category_name: data.category.name } : item));
        } catch (err) {
            setCategoryError(errorMessage(err));
        }
    }

    async function deleteCategory(category: MenuCategory) {
        if (!confirm(`Xoá danh mục ${category.name}?`)) return;
        try {
            await api(`/api/admin/menu/categories/${category.id}`, { method: "DELETE" });
            setCategories((current) => current.filter((row) => row.id !== category.id));
        } catch (err) {
            setCategoryError(errorMessage(err));
        }
    }

    const badgeLabel = (badge: Badge | "" | null) => badge ? BADGE_LABELS[badge] : null;

    return (
        <AdminShell
            title="Quản lý thực đơn"
            actions={<button type="button" onClick={() => openItemForm(null)} disabled={categories.length === 0} className={`${ui.primary} min-h-11 text-sm`}><FontAwesomeIcon icon={faPlus} /> Thêm món</button>}
        >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#806d62]">{items.length} món · {categories.length} danh mục</p>
                <button type="button" onClick={() => setCategoryManagerOpen(true)} className={ui.small}>Quản lý danh mục</button>
            </div>
            {categories.length === 0 && <p className={`${ui.error} mb-4`}>Chưa có danh mục. Tạo danh mục trước khi thêm món.</p>}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                    <article key={item.id} className="grid grid-cols-[45%_55%] overflow-hidden rounded-2xl border border-[#eee3d7] bg-white">
                        <div className="relative grid min-h-44 place-items-center overflow-hidden bg-[#f6e8d7]">
                            {item.image_url
                                ? /* eslint-disable-next-line @next/next/no-img-element -- ảnh do owner tải lên (data URL), không qua image optimizer */
                                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                                : <span className="text-6xl" aria-hidden="true">🍽️</span>}
                            {item.highlight_badge && <span className="absolute left-2 top-2 rounded-full bg-[#ef7d32] px-2 py-1 text-[0.65rem] font-bold text-white">{badgeLabel(item.highlight_badge)}</span>}
                        </div>
                        <div className="min-w-0 p-4">
                            <div className="mb-2 flex justify-between gap-2">
                                <span className="truncate text-xs text-[#806d62]">{item.category_name}</span>
                                <span className={`text-xs ${!item.is_available ? "text-gray-500" : item.sold_out_at ? "text-red-700" : "text-green-700"}`}>
                                    {!item.is_available ? "Ngưng bán" : item.sold_out_at ? "Bếp báo hết" : "Đang bán"}
                                </span>
                            </div>
                            <h2 className="mb-1 font-bold">{item.name}</h2>
                            <p className="mb-3 min-h-10 text-xs text-[#806d62]">{item.description}</p>
                            <strong className="text-[#b84d1d]">{formatPrice(item.price)}<span className="text-xs font-normal text-[#806d62]"> / {item.unit}</span></strong>
                            <p className="mt-1 text-xs text-[#806d62]">{item.manual_portions === null ? "Không giới hạn số phần" : `Còn ${item.manual_portions} phần`}</p>
                            <div className="mt-3 flex gap-2">
                                <button type="button" onClick={() => openItemForm(item)} className={ui.small} aria-label={`Sửa ${item.name}`}><FontAwesomeIcon icon={faPen} /> Sửa</button>
                                <button type="button" onClick={() => removeItem(item)} className={ui.danger} aria-label={`Xoá ${item.name}`}><FontAwesomeIcon icon={faTrash} /></button>
                            </div>
                        </div>
                    </article>
                ))}
            </section>

            <Dialog open={categoryManagerOpen} onClose={() => setCategoryManagerOpen(false)} title="Quản lý danh mục">
                {categoryError && <p role="alert" className={`${ui.error} mb-3`}>{categoryError}</p>}
                <form onSubmit={saveCategory} className="mb-4 flex gap-2">
                    <label htmlFor="category-name" className="sr-only">Tên danh mục mới</label>
                    <input id="category-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Tên danh mục mới" maxLength={100} className={`${ui.input} flex-1`} />
                    <button type="submit" className={ui.primary}><FontAwesomeIcon icon={faPlus} /> Thêm</button>
                </form>
                <ul className="space-y-2">
                    {categories.map((category) => (
                        <li key={category.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-xl border border-[#eee3d7] px-3 py-2">
                            <span className={`truncate text-sm ${category.is_active ? "" : "text-[#806d62] line-through"}`}>{category.name}</span>
                            <button type="button" onClick={() => { const name = window.prompt("Tên danh mục", category.name)?.trim(); if (name) updateCategory(category, { name }); }} className={ui.small} aria-label={`Đổi tên ${category.name}`}><FontAwesomeIcon icon={faPen} /></button>
                            <button type="button" onClick={() => updateCategory(category, { is_active: !category.is_active })} className={ui.small} aria-label={category.is_active ? `Ẩn ${category.name}` : `Hiện ${category.name}`}>
                                <FontAwesomeIcon icon={category.is_active ? faEyeSlash : faEye} />
                            </button>
                            <button type="button" onClick={() => deleteCategory(category)} className={ui.danger} aria-label={`Xoá ${category.name}`}><FontAwesomeIcon icon={faTrash} /></button>
                        </li>
                    ))}
                </ul>
            </Dialog>

            <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "Chỉnh sửa món" : "Thêm món mới"} wide>
                {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <form onSubmit={saveItem} className="grid gap-4">
                        <div>
                            <label htmlFor="item-name" className={ui.label}>Tên món</label>
                            <input id="item-name" value={preview.name} onChange={(event) => setPreview({ ...preview, name: event.target.value })} required maxLength={150} className={ui.input} />
                        </div>
                        <div>
                            <label htmlFor="item-category" className={ui.label}>Danh mục</label>
                            <select id="item-category" name="categoryId" defaultValue={editing?.category_id ?? categories.find((category) => category.is_active)?.id} required className={ui.input}>
                                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.is_active ? "" : " (đang ẩn)"}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="item-description" className={ui.label}>Mô tả</label>
                            <textarea id="item-description" value={preview.description} onChange={(event) => setPreview({ ...preview, description: event.target.value })} maxLength={500} className="min-h-20 w-full rounded-xl border border-[#d9cbbf] p-3" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                                <label htmlFor="item-price" className={ui.label}>Giá</label>
                                <div className="flex overflow-hidden rounded-xl border border-[#d9cbbf] bg-white focus-within:border-[#ef7d32]">
                                    <input id="item-price" type="number" min="0" step="1" inputMode="numeric" value={preview.price} onChange={(event) => setPreview({ ...preview, price: event.target.value })} required className="min-h-12 min-w-0 flex-1 px-3 outline-none" />
                                    <span className="grid place-items-center border-l border-[#eee3d7] px-3 font-semibold text-[#806d62]">.000đ</span>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="item-unit" className={ui.label}>Đơn vị tính</label>
                                <input id="item-unit" value={preview.unit} onChange={(event) => setPreview({ ...preview, unit: event.target.value })} required maxLength={20} list="unit-suggestions" className={ui.input} />
                                <datalist id="unit-suggestions"><option value="phần" /><option value="tô" /><option value="đĩa" /><option value="ly" /><option value="chai" /><option value="lon" /><option value="suất" /></datalist>
                            </div>
                            <div>
                                <label htmlFor="item-portions" className={ui.label}>Số phần còn bán</label>
                                <input id="item-portions" name="manualPortions" type="number" min="0" inputMode="numeric" defaultValue={editing?.manual_portions ?? ""} placeholder="Không giới hạn" className={ui.input} />
                            </div>
                        </div>
                        <p className={ui.hint}>Đơn vị tính bắt buộc trên phiếu thanh toán. Số phần còn bán để trống = không giới hạn; khi bật module kho, số phần tính theo định lượng nguyên liệu.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor="item-image" className={ui.label}>Ảnh món ăn</label>
                                <input id="item-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageUpload} className="block min-h-12 w-full rounded-xl border border-[#d9cbbf] px-2 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#ef7d32] file:px-3 file:py-2 file:font-semibold file:text-white" />
                                {preview.image && <button type="button" onClick={() => setPreview({ ...preview, image: null })} className="mt-1 text-xs text-red-700 underline">Bỏ ảnh</button>}
                            </div>
                            <div>
                                <label htmlFor="item-badge" className={ui.label}>Nhãn món nổi bật</label>
                                <select id="item-badge" value={preview.badge} onChange={(event) => setPreview({ ...preview, badge: event.target.value as Badge | "" })} className={ui.input}>
                                    <option value="">Không có</option>
                                    {Object.entries(BADGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                        </div>
                        <label className="flex min-h-12 items-center gap-3">
                            <input name="isAvailable" type="checkbox" defaultChecked={editing?.is_available ?? true} className="size-5 accent-[#ef7d32]" />
                            <span className="text-sm font-semibold">Đang bán (hiện trên thực đơn của khách)</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setOpen(false)} className={ui.secondary}>Huỷ</button>
                            <button type="submit" disabled={saving} className={ui.primary}>{saving ? "Đang lưu..." : "Lưu món"}</button>
                        </div>
                    </form>

                    <aside aria-label="Xem trước món ăn">
                        <p className="mb-2 text-sm font-semibold">Xem trước món ăn</p>
                        <article className="grid min-h-48 grid-cols-[45%_55%] overflow-hidden rounded-2xl border border-[#eee3d7] bg-white">
                            <div className="relative grid min-h-48 place-items-center overflow-hidden bg-[#f6e8d7]">
                                {preview.image
                                    ? /* eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh vừa chọn (data URL) */
                                    <img src={preview.image} alt={preview.name || "Xem trước món ăn"} className="h-full w-full object-cover" />
                                    : <span className="text-6xl" aria-hidden="true">🍽️</span>}
                                {preview.badge && <span className="absolute left-2 top-2 rounded-full bg-[#ef7d32] px-2 py-1 text-[0.65rem] font-bold text-white">{badgeLabel(preview.badge)}</span>}
                            </div>
                            <div className="p-3">
                                <h3 className="mb-1 font-bold">{preview.name || "Tên món ăn"}</h3>
                                <p className="min-h-10 text-xs text-[#806d62]">{preview.description || "Mô tả món ăn"}</p>
                                <strong className="mt-2 block text-lg text-[#b84d1d]">{preview.price ? formatPrice(Math.round(Number(preview.price) * 1000)) : "0đ"}</strong>
                                <span className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#ef7d32] text-sm font-bold text-white">+ Thêm</span>
                            </div>
                        </article>
                    </aside>
                </div>
            </Dialog>
        </AdminShell>
    );
}
