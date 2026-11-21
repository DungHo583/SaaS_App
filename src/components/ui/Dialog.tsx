"use client";

import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useId, useRef } from "react";

/**
 * Dialog modal dùng <dialog> + showModal() (focus trap, Esc, top layer).
 * Light-dismiss bằng closedby="any"; fallback bấm ra ngoài cho trình duyệt chưa hỗ trợ (Safari).
 */
export default function Dialog({ open, onClose, title, children, wide = false }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    function handleClick(event: React.MouseEvent<HTMLDialogElement>) {
        const dialog = ref.current;
        if (!dialog || "closedBy" in HTMLDialogElement.prototype || event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside = rect.top <= event.clientY && event.clientY <= rect.bottom && rect.left <= event.clientX && event.clientX <= rect.right;
        if (!inside) dialog.close();
    }

    return (
        <dialog
            ref={ref}
            className={`app-dialog${wide ? " wide" : ""}`}
            aria-labelledby={titleId}
            onClose={onClose}
            onClick={handleClick}
            {...{ closedby: "any" }}
        >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#eee3d7] bg-white px-5 py-4">
                <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                <button type="button" onClick={() => ref.current?.close()} aria-label="Đóng" className="grid size-11 place-items-center rounded-full border border-[#eee3d7] bg-[#fffaf3]">
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </header>
            <div className="p-5">{open ? children : null}</div>
        </dialog>
    );
}
