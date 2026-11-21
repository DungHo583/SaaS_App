/** Class Tailwind dùng chung — giữ đúng phong cách giao diện hiện có (cam / nâu / kem). */
export const ui = {
    label: "mb-2 block text-sm font-semibold",
    input: "min-h-12 w-full rounded-xl border border-[#d9cbbf] bg-white px-3 text-base outline-none transition focus:border-[#ef7d32] focus:ring-4 focus:ring-[#ef7d32]/15 disabled:bg-[#f7f3ed]",
    hint: "mt-1 text-xs text-[#806d62]",
    primary: "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#ef7d32] px-4 font-bold text-white transition hover:bg-[#d66a24] disabled:cursor-not-allowed disabled:opacity-60",
    secondary: "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#eee3d7] bg-white px-4 font-semibold transition hover:bg-[#fffaf3] disabled:cursor-not-allowed disabled:opacity-50",
    danger: "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40",
    small: "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#eee3d7] bg-white px-3 text-sm font-semibold transition hover:bg-[#fffaf3] disabled:cursor-not-allowed disabled:opacity-40",
    card: "rounded-2xl border border-[#eee3d7] bg-white",
    error: "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700",
    success: "rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800",
    badge: "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
};

export const ITEM_STATUS_STYLES: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    queued: "bg-amber-100 text-amber-800",
    cooking: "bg-orange-100 text-orange-800",
    ready: "bg-blue-100 text-blue-800",
    served: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-700",
};
