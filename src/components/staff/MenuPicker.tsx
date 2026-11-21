"use client";

import { faMinus, faPaperPlane, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useRef, useState } from "react";
import { newIdempotencyKey } from "@/components/ui/api";
import { ui } from "@/components/ui/styles";
import { formatPrice } from "@/lib/format";
import type { Menu } from "./types";

export type CartLine = { menuItemId: string; quantity: number; note: string | null };

/**
 * Gọi món cho bàn (vai trò Gọi món). Nhãn "Đã gọi ×N" = số phần đã gọi mà chưa phục vụ (BUSINESS_PROCESS 4.3);
 * gọi trùng sau khi thấy nhãn vẫn hợp lệ, chỉ cảnh báo.
 */
export default function MenuPicker({ menu, ordered, onSubmit, submitLabel = "Gửi bếp" }: {
    menu: Menu;
    ordered: Record<string, number>;
    onSubmit: (lines: CartLine[], idempotencyKey: string) => Promise<boolean>;
    submitLabel?: string;
}) {
    const [category, setCategory] = useState("Tất cả");
    const [cart, setCart] = useState<Record<string, number>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    // Giữ nguyên khoá khi gửi lại sau lỗi mạng; đổi khi giỏ thay đổi hoặc gửi thành công.
    const keyRef = useRef<string | null>(null);

    const dishes = useMemo(() => category === "Tất cả" ? menu.dishes : menu.dishes.filter((dish) => dish.category === category), [menu, category]);
    const count = Object.values(cart).reduce((sum, value) => sum + value, 0);
    const total = menu.dishes.reduce((sum, dish) => sum + (cart[dish.id] ?? 0) * dish.price, 0);
    const duplicates = menu.dishes.filter((dish) => cart[dish.id] && ordered[dish.id]);

    function change(id: string, delta: number) {
        keyRef.current = null;
        setCart((current) => {
            const quantity = Math.max(0, Math.min(50, (current[id] ?? 0) + delta));
            const next = { ...current };
            if (quantity === 0) delete next[id];
            else next[id] = quantity;
            return next;
        });
    }

    async function submit() {
        setSending(true);
        keyRef.current ??= newIdempotencyKey();
        const lines = Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity, note: notes[menuItemId]?.trim() || null }));
        const success = await onSubmit(lines, keyRef.current);
        if (success) {
            keyRef.current = null;
            setCart({});
            setNotes({});
        }
        setSending(false);
    }

    return (
        <div className="grid gap-3">
            <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Danh mục">
                {["Tất cả", ...menu.categories].map((name) => (
                    <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}
                        className={`min-h-11 flex-none rounded-full border px-4 text-sm ${category === name ? "border-[#4a2d22] bg-[#4a2d22] text-white" : "border-[#eee3d7] bg-white text-[#806d62]"}`}>
                        {name}
                    </button>
                ))}
            </nav>
            <ul className="grid max-h-[45dvh] gap-2 overflow-y-auto pr-1">
                {dishes.map((dish) => {
                    const quantity = cart[dish.id] ?? 0;
                    return (
                        <li key={dish.id} className={`grid gap-2 rounded-xl border p-3 ${quantity ? "border-[#ef7d32] bg-[#fffaf3]" : "border-[#eee3d7]"}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-bold">{dish.name}</p>
                                    <p className="text-sm text-[#b84d1d]">{formatPrice(dish.price)} / {dish.unit}
                                        {dish.remaining !== null && !dish.sold_out && <span className="text-xs text-[#806d62]"> · còn {dish.remaining}</span>}
                                    </p>
                                    {ordered[dish.id] ? <span className={`${ui.badge} mt-1 bg-amber-100 text-amber-800`}>Đã gọi ×{ordered[dish.id]} chưa ra</span> : null}
                                </div>
                                {dish.sold_out ? (
                                    <span className={`${ui.badge} bg-red-100 text-red-700`}>Hết món</span>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => change(dish.id, -1)} disabled={!quantity} aria-label={`Bớt ${dish.name}`} className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-white text-[#b84d1d] disabled:opacity-30"><FontAwesomeIcon icon={faMinus} /></button>
                                        <span className="min-w-[2ch] text-center font-bold" aria-live="polite">{quantity}</span>
                                        <button type="button" onClick={() => change(dish.id, 1)} aria-label={`Thêm ${dish.name}`} className="grid size-11 place-items-center rounded-full bg-[#ef7d32] text-white"><FontAwesomeIcon icon={faPlus} /></button>
                                    </div>
                                )}
                            </div>
                            {quantity > 0 && (
                                <>
                                    <label htmlFor={`note-${dish.id}`} className="sr-only">Ghi chú cho {dish.name}</label>
                                    <input id={`note-${dish.id}`} value={notes[dish.id] ?? ""} onChange={(event) => { keyRef.current = null; setNotes({ ...notes, [dish.id]: event.target.value }); }}
                                        maxLength={200} placeholder="Ghi chú cho bếp (ít cay, không hành...)" className={`${ui.input} min-h-11 text-sm`} />
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
            {duplicates.length > 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
                    Lưu ý: {duplicates.map((dish) => dish.name).join(", ")} đã được gọi và chưa phục vụ. Gửi tiếp nếu khách thật sự gọi thêm.
                </p>
            )}
            <button type="button" onClick={submit} disabled={count === 0 || sending} className={`${ui.primary} w-full`}>
                <FontAwesomeIcon icon={faPaperPlane} /> {sending ? "Đang gửi..." : `${submitLabel} (${count} món · ${formatPrice(total)})`}
            </button>
        </div>
    );
}
