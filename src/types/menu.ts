export type DishCategory = "Tất cả" | "Món chính" | "Khai vị" | "Tráng miệng" | "Đồ uống";

export type Dish = {
    id: number;
    name: string;
    description: string;
    price: number;
    category: Exclude<DishCategory, "Tất cả">;
    icon: string;
    tag: string;
};
