/** Danh mục giả "tất cả" chỉ dùng ở UI, không tồn tại trong bảng menu_categories. */
export const ALL_CATEGORY = "Tất cả";

/** Tên danh mục lấy từ bảng menu_categories (quản trị có thể thêm/sửa). */
export type DishCategory = string;

export type DishBadge = "best_seller" | "must_try" | "recommend" | "new";

/** Món trên thực đơn khách (GET /api/public/menu). */
export type Dish = {
    id: string;
    name: string;
    description: string;
    unit: string;
    price: number;
    category: DishCategory;
    image_url: string | null;
    highlight_badge: DishBadge | null;
    sold_out: boolean;
    remaining: number | null;
};
