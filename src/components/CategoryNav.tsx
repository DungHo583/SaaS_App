import type { DishCategory } from "@/types/menu";

type CategoryNavProps = {
    categories: readonly DishCategory[];
    activeCategory: DishCategory;
    onChange: (category: DishCategory) => void;
};

export default function CategoryNav({ categories, activeCategory, onChange }: CategoryNavProps) {
    return (
        <nav className="mb-4 mt-5 flex gap-2 overflow-x-auto" aria-label="Danh mục món ăn">
            {categories.map((category) => {
                const isActive = category === activeCategory;
                return (
                    <button
                        key={category}
                        type="button"
                        className={isActive
                            ? "min-h-11 flex-none rounded-full border border-[#4a2d22] bg-[#4a2d22] px-4 text-sm text-white"
                            : "min-h-11 flex-none rounded-full border border-[#eee3d7] bg-white px-4 text-sm text-[#806d62]"}
                        aria-pressed={isActive}
                        onClick={() => onChange(category)}
                    >
                        {category}
                    </button>
                );
            })}
        </nav>
    );
}
