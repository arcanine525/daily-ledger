"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
export function Modal({
  title,
  children,
  onClose,
  locale,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly locale?: "vi" | "en";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname(),
    headingId = useId(),
    en = (locale ?? (pathname.startsWith("/en") ? "en" : "vi")) === "en";
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby={headingId}>
      <header className="page-heading">
        <h2 id={headingId}>{title}</h2>
        <button
          className="secondary"
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={en ? "Close" : "Đóng"}
        >
          {en ? "Close" : "Đóng"}
        </button>
      </header>
      {children}
    </dialog>
  );
}
