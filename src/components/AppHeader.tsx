import { faBars, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { RefObject } from "react";

type AppHeaderProps = {
    restaurantName: string;
    tableName: string | null;
    itemCount: number;
    navDialogRef: RefObject<HTMLDialogElement | null>;
    cartDialogRef: RefObject<HTMLDialogElement | null>;
};

export default function AppHeader({ restaurantName, tableName, itemCount, navDialogRef, cartDialogRef }: AppHeaderProps) {
    return (
        <header className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
                <button
                    className="grid size-11 place-items-center rounded-xl border border-[#eee3d7] bg-white text-xl text-[#4a2d22]"
                    type="button"
                    aria-label="Mở menu điều hướng"
                    aria-haspopup="dialog"
                    onClick={() => navDialogRef.current?.showModal()}
                >
                    <FontAwesomeIcon icon={faBars} />
                </button>
                <div>
                    <p className="mb-0.5 text-xs text-[#806d62]">{tableName ? `Xin chào · ${tableName}` : "Xin chào 👋"}</p>
                    <h1 className="text-xl font-bold text-[#4a2d22] sm:text-2xl">{restaurantName}</h1>
                </div>
            </div>

            <button
                className="flex min-h-11 items-center gap-2 rounded-[0.9rem] bg-[#4a2d22] py-1 pl-3 pr-1 text-sm text-white max-[480px]:pl-2.5"
                type="button"
                aria-haspopup="dialog"
                onClick={() => cartDialogRef.current?.showModal()}
            >
                <FontAwesomeIcon icon={faCartShopping} />
                <span className="max-[380px]:hidden">Giỏ hàng</span>
                <strong className="grid size-8 place-items-center rounded-[0.65rem] bg-[#ef7d32]">{itemCount}</strong>
            </button>
        </header>
    );
}
