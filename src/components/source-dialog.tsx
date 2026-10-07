"use client";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
export function Modal({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
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
          aria-label="Đóng"
        >
          Đóng
        </button>
      </header>
      {children}
    </dialog>
  );
}
