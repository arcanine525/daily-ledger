"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "../api-client";
import { Modal } from "../source-dialog";
import { useUiError } from "../use-ui-error";
export function MeetingTrashButton({
  id,
  locale,
}: {
  readonly id: string;
  readonly locale: "en" | "vi";
}) {
  const en = locale === "en",
    router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useUiError();
  async function trash() {
    setBusy(true);
    try {
      await callApi(`/api/meetings/${id}/trash`, "POST", {});
      router.push(`/${locale}/trash`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "TRASH_FAILED");
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        {en ? "Move to trash" : "Đưa vào thùng rác"}
      </button>
      {open && (
        <Modal
          title={en ? "Move meeting to trash" : "Đưa cuộc họp vào thùng rác"}
          locale={locale}
          onClose={() => setOpen(false)}
        >
          <p>
            {en
              ? "The meeting is hidden from search and new chat context immediately. Restore within thirty days. Existing chat remains readable; purge will not erase saved chat excerpts."
              : "Cuộc họp sẽ ẩn khỏi tìm kiếm và ngữ cảnh chat mới ngay. Có thể khôi phục trong ba mươi ngày. Chat cũ vẫn đọc được; xóa vĩnh viễn không xóa trích đoạn chat đã lưu."}
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void trash();
            }}
          >
            {en ? "Move to trash" : "Đưa vào thùng rác"}
          </button>
        </Modal>
      )}
    </>
  );
}
