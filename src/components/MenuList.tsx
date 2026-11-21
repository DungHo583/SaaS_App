import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { BADGE_LABELS, formatPrice } from "@/lib/format";
import { ALL_CATEGORY, type Dish, type DishCategory } from "@/types/menu";

type MenuListProps = {
    activeCategory: DishCategory;
    dishes: readonly Dish[];
    cart: Record<string, number>;
    /** Số phần đã gọi mà chưa phục vụ, theo món (nhãn "món đã gọi"). */
    ordered: Record<string, number>;
    onAdd: (id: string) => void;
    onQuantityChange: (id: string, delta: number) => void;
};

export default function MenuList({ activeCategory, dishes, cart, ordered, onAdd, onQuantityChange }: MenuListProps) {
    return (
        <section className="[container:menu/inline-size]" aria-labelledby="menu-heading">
            <div className="mb-3 flex items-baseline justify-between">
                <h2 id="menu-heading" className="text-xl font-bold">
                    {activeCategory === ALL_CATEGORY ? "Món nổi bật" : activeCategory}
                </h2>
                <span className="text-xs text-[#806d62]">{dishes.length} món</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dishes.map((dish) => {
                    const quantity = cart[dish.id] ?? 0;
                    return (
                        <article
                            className={`grid min-h-38 grid-cols-[45%_55%] overflow-hidden rounded-[1.1rem] border border-[#eee3d7] bg-white ${dish.sold_out ? "opacity-60" : ""}`}
                            key={dish.id}
                        >
                            <div className="relative grid place-items-center bg-linear-to-br from-[#f6d7b9] to-[#f2eadf]">
                                {dish.highlight_badge && (
                                    <span className="absolute left-2 top-2 rounded-full bg-[#ef7d32] px-2 py-1 text-[0.65rem] font-bold text-white">
                                        {BADGE_LABELS[dish.highlight_badge]}
                                    </span>
                                )}
                                {ordered[dish.id] ? (
                                    <span className="absolute bottom-2 left-2 rounded-full bg-[#4a2d22] px-2 py-1 text-[0.65rem] font-bold text-white">
                                        Món đã gọi ×{ordered[dish.id]}
                                    </span>
                                ) : null}
                                {dish.image_url
                                    ? /* eslint-disable-next-line @next/next/no-img-element -- ảnh món do owner tải lên (data URL) */
                                    <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
                                    : <span className="text-[clamp(4.5rem,16vw,8rem)] drop-shadow-md" aria-hidden="true">🍽️</span>}
                            </div>

                            <div className="min-w-0 p-3">
                                <h3 className="mb-1 text-[0.98rem] font-bold">{dish.name}</h3>
                                <p className="min-h-[2.4em] text-xs leading-normal text-[#806d62]">{dish.description}</p>
                                <footer className="mt-2.5 flex flex-col items-stretch gap-2">
                                    <strong className="text-lg text-[#b84d1d]">{formatPrice(dish.price)}<span className="text-xs font-normal text-[#806d62]"> / {dish.unit}</span></strong>
                                    {dish.sold_out ? (
                                        <span className="grid min-h-11 place-items-center rounded-[0.65rem] bg-[#eee3d7] text-sm font-bold text-[#806d62]">Tạm hết món</span>
                                    ) : quantity === 0 ? (
                                        <button
                                            className="flex min-h-11 w-full items-center justify-center gap-1 rounded-[0.65rem] bg-[#ef7d32] text-sm font-bold text-white"
                                            type="button"
                                            onClick={() => onAdd(dish.id)}
                                            aria-label={`Thêm ${dish.name}`}
                                        >
                                            <FontAwesomeIcon icon={faPlus} /> Thêm
                                        </button>
                                    ) : (
                                        <div className="flex items-center justify-end gap-2" aria-label={`Số lượng ${dish.name}`}>
                                            <button type="button" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-white text-[#b84d1d]" onClick={() => onQuantityChange(dish.id, -1)} aria-label={`Giảm ${dish.name}`}>
                                                <FontAwesomeIcon icon={faMinus} />
                                            </button>
                                            <span className="min-w-[1ch] text-center font-bold">{quantity}</span>
                                            <button type="button" className="grid size-11 cursor-pointer place-items-center rounded-full border border-[#ef7d32] bg-[#ef7d32] text-white" onClick={() => onQuantityChange(dish.id, 1)} aria-label={`Tăng ${dish.name}`}>
                                                <FontAwesomeIcon icon={faPlus} />
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
