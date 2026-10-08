"use client";
import { useState } from "react";
import { z } from "zod";
import { callApi } from "./api-client";
import { Modal } from "./source-dialog";
import { useResource } from "./use-resource";

const trashSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    deletedAt: z.string(),
    projectId: z.string(),
    occurredAt: z.string(),
  }),
);
export function Trash({ locale }: { readonly locale: "en" | "vi" }) {
  const en = locale === "en",
    resource = useResource("/api/trash", trashSchema),
    [selected, setSelected] = useState<
      z.infer<typeof trashSchema>[number] | null
    >(null),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false);
  async function restore(id: string) {
    setBusy(true);
    try {
      await callApi(`/api/meetings/${id}/restore`, "POST", {});
      await resource.reload();
    } catch (failure) {
      resource.setError(
        failure instanceof Error ? failure.message : "RESTORE_FAILED",
      );
    } finally {
      setBusy(false);
    }
  }
  async function purge() {
    if (!selected) return;
    setBusy(true);
    try {
      await callApi(`/api/meetings/${selected.id}/purge`, "POST", {
        confirmationTitle: confirmation,
      });
      setSelected(null);
      await resource.reload();
    } catch (failure) {
      resource.setError(
        failure instanceof Error ? failure.message : "PURGE_FAILED",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <h1>{en ? "Trash" : "Thùng rác"}</h1>
      <p className="notice">
        {en
          ? "Restore within thirty days. Expired meetings are removed when you visit, in batches of ten; there is no background cleanup. Confirmed tasks and saved chat excerpts remain after purge."
          : "Khôi phục trong ba mươi ngày. Cuộc họp quá hạn được dọn khi truy cập, mỗi đợt mười mục; không có dọn nền. Công việc đã xác nhận và trích đoạn chat đã lưu vẫn được giữ sau khi xóa."}
      </p>
      {resource.error && (
        <p role="alert" className="notice danger">
          {resource.error}
        </p>
      )}
      {!resource.data ? (
        <p role="status">{en ? "Loading…" : "Đang tải…"}</p>
      ) : !resource.data.length ? (
        <p className="empty">{en ? "Trash is empty" : "Thùng rác trống"}</p>
      ) : (
        resource.data.map((meeting) => (
          <article className="panel" key={meeting.id}>
            <h2>{meeting.title}</h2>
            <p>
              {en ? "Trashed at" : "Đã đưa vào thùng rác lúc"}{" "}
              {new Date(meeting.deletedAt).toLocaleString(locale)}
            </p>
            <div className="cluster">
              <button
                type="button"
                disabled={
                  busy ||
                  new Date(meeting.deletedAt).getTime() + 30 * 86400000 <=
                    Date.now()
                }
                onClick={() => {
                  void restore(meeting.id);
                }}
              >
                {en ? "Restore" : "Khôi phục"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setConfirmation("");
                  setSelected(meeting);
                }}
              >
                {en ? "Permanently delete" : "Xóa vĩnh viễn"}
              </button>
            </div>
          </article>
        ))
      )}
      {selected && (
        <Modal
          title={en ? "Confirm permanent deletion" : "Xác nhận xóa vĩnh viễn"}
          locale={locale}
          onClose={() => setSelected(null)}
        >
          <p>
            {en
              ? "This removes the source, not every trace. Saved chat bodies and quotes remain readable, but are excluded from new context. Backups and provider retention are separate."
              : "Thao tác này xóa nguồn, không xóa sạch mọi dấu vết. Nội dung và trích đoạn chat đã lưu vẫn đọc được nhưng không dùng làm ngữ cảnh mới. Backup và dữ liệu provider giữ là phạm vi riêng."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void purge();
            }}
          >
            <label>
              {en ? "Confirmation title" : "Tên cuộc họp xác nhận"}
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
            <p>{selected.title}</p>
            <button
              type="submit"
              disabled={busy || confirmation !== selected.title}
            >
              {en ? "Permanently delete" : "Xóa vĩnh viễn"}
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}
