import type { Dish, DishCategory } from "@/types/menu";

export const categories: readonly DishCategory[] = [
    "Tất cả",
    "Món chính",
    "Khai vị",
    "Tráng miệng",
    "Đồ uống",
];

export const dishes: readonly Dish[] = [
    { id: 1, name: "Cơm gà Hội An", description: "Gà xé, cơm đậu xanh, rau sống", price: 89000, category: "Món chính", icon: "🍛", tag: "Bán chạy" },
    { id: 2, name: "Bò lúc lắc", description: "Bò mềm, khoai tây, sốt tiêu đen", price: 129000, category: "Món chính", icon: "🥩", tag: "Chef chọn" },
    { id: 3, name: "Gỏi cuốn tôm thịt", description: "Tôm, thịt heo, bún, rau thơm", price: 59000, category: "Khai vị", icon: "🥢", tag: "Mới" },
    { id: 4, name: "Chè sen long nhãn", description: "Sen tươi, long nhãn, nước cốt dừa", price: 45000, category: "Tráng miệng", icon: "🥥", tag: "" },
    { id: 5, name: "Nước chanh sả", description: "Chanh tươi, sả, đường mía", price: 39000, category: "Đồ uống", icon: "🍋", tag: "" },
    { id: 6, name: "Cà phê muối", description: "Cà phê phin, kem muối béo nhẹ", price: 49000, category: "Đồ uống", icon: "☕", tag: "Hot" },
];

export const formatPrice = (price: number) => new Intl.NumberFormat("vi-VN").format(price) + "đ";
