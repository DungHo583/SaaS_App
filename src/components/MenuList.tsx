import type { Dish, DishCategory } from "@/types/menu";
import { formatPrice } from "@/data/menu";

type MenuListProps = {
    activeCategory: DishCategory;
    dishes: readonly Dish[];
    cart: Record<number, number>;
    onAdd: (id: number) => void;
    onQuantityChange: (id: number, delta: number) => void;
};

export default function MenuList({ activeCategory, dishes, cart, onAdd, onQuantityChange }: MenuListProps) {
    return (
        <section className="[container:menu/inline-size]" aria-labelledby="menu-heading">
            <div className="mb-3 flex items-baseline justify-between">
                <h2 id="menu-heading" className="text-xl font-bold">
                    {activeCategory === "Tất cả" ? "Món nổi bật" : activeCategory}
                </h2>
                <span className="text-xs text-[#806d62]">{dishes.length} món</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dishes.map((dish) => {
                    const quantity = cart[dish.id] ?? 0;
                    return (
                        <article
                            className="grid min-h-38 grid-cols-[45%_55%] overflow-hidden rounded-[1.1rem] border border-[#eee3d7] bg-white"
                            key={dish.id}
                        >
                            <div className="relative grid place-items-center bg-linear-to-br from-[#f6d7b9] to-[#f2eadf]" aria-hidden="true">
                                {dish.tag && (
                                    <span className="absolute left-2 top-2 rounded-full bg-[#ef7d32] px-2 py-1 text-[0.65rem] font-bold text-white">
                                        {dish.tag}
                                    </span>
                                )}
                                <span className="text-[clamp(4.5rem,16vw,8rem)] drop-shadow-md">{dish.icon}</span>
                            </div>

                            <div className="min-w-0 p-3">
                                <h3 className="mb-1 text-[0.98rem] font-bold">{dish.name}</h3>
                                <p className="min-h-[2.4em] text-xs leading-normal text-[#806d62]">{dish.description}</p>
                                <footer className="mt-2.5 flex flex-col items-stretch gap-2">
                                    <strong className="text-lg text-[#b84d1d]">{formatPrice(dish.price)}</strong>
                                    {quantity === 0 ? (
                                        <button
                                            className="min-h-11 w-full rounded-[0.65rem] bg-[#ef7d32] text-sm font-bold text-white"
                                            type="button"
                                            onClick={() => onAdd(dish.id)}
                                            aria-label={`Thêm ${dish.name}`}
                                        >
                                            + Thêm
                                        </button>
                                    ) : (
                                        <div className="flex items-center justify-end gap-2" aria-label={`Số lượng ${dish.name}`}>
                                            <button
                                                type="button"
                                                className="size-11 rounded-full border border-[#eee3d7] bg-white text-lg text-[#b84d1d]"
                                                onClick={() => onQuantityChange(dish.id, -1)}
                                                aria-label="Giảm số lượng"
                                            >
                                                −
                                            </button>
                                            <span className="min-w-[1ch] text-center font-bold">{quantity}</span>
                                            <button
                                                type="button"
                                                className="size-11 cursor-pointer rounded-full border border-[#ef7d32] bg-[#ef7d32] text-lg text-white"
                                                onClick={() => onQuantityChange(dish.id, 1)}
                                                aria-label="Tăng số lượng"
                                            >
                                                +
                                            </button>
                                        </div>
                                    )}
                                </footer>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
