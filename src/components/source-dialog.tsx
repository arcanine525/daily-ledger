"use client";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
export function Modal({
  title,
  children,
  onClose,
  locale = "vi",
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly locale?: "vi" | "en";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} onClose={onClose}>
      <header className="page-heading">
        <h2>{title}</h2>
        <button
          className="secondary"
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={locale === "en" ? "Close" : "Đóng"}
        >
          {locale === "en" ? "Close" : "Đóng"}
        </button>
      </header>
      {children}
    </dialog>
  );
}
