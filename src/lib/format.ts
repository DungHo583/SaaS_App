export const formatPrice = (price: number) => new Intl.NumberFormat("vi-VN").format(price) + "đ";

export function formatDateTime(value: string | Date, timeZone = "Asia/Ho_Chi_Minh") {
    return new Intl.DateTimeFormat("vi-VN", {
        timeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(value));
}

export const BADGE_LABELS = {
    best_seller: "Bán chạy",
    must_try: "Must try",
    recommend: "Đề xuất",
    new: "Mới",
} as const;

export const ITEM_STATUS_LABELS: Record<string, string> = {
    pending: "Chờ xác nhận",
    queued: "Chờ bếp",
    cooking: "Đang làm",
    ready: "Đã xong",
    served: "Đã phục vụ",
    cancelled: "Đã huỷ",
};

export const ROUND_STATUS_LABELS: Record<string, string> = {
    pending: "Chờ nhân viên xác nhận",
    confirmed: "Đã xác nhận",
    rejected: "Bị từ chối",
    junk: "Quá hạn xác nhận",
};
