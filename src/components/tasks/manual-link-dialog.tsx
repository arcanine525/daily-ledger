"use client";
import { useState } from "react";
import { callApi } from "../api-client";
import { Modal } from "../source-dialog";
import { useResource } from "../use-resource";
import { taskList } from "../workspace-schemas";
export function ManualLinkDialog({
  actionId,
  projectId,
  locale,
  onClose,
  onSaved,
}: {
  readonly actionId: string;
  readonly projectId: string;
  readonly locale: "vi" | "en";
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const en = locale === "en",
    [cursor, setCursor] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  const tasks = useResource(
    `/api/tasks?${new URLSearchParams({ projectId, ...(cursor ? { cursor } : {}) })}`,
    taskList,
  );
  return (
    <Modal
      title={en ? "Link an existing task" : "Liên kết task đã có"}
      onClose={onClose}
    >
      <p className="notice">
        {en
          ? "Same project only. This adds evidence, not status/deadline/assignee changes."
          : "Chỉ cùng dự án. Chỉ thêm bằng chứng, không đổi trạng thái/deadline/người phụ trách."}
      </p>
      <label>
        {en ? "Find on this page" : "Tìm trong trang hiện tại"}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await callApi(`/api/meeting-actions/${actionId}/link`, "POST", {
              taskId: selected,
            });
            await onSaved();
            onClose();
          } catch (failure) {
            setError(
              failure instanceof Error ? failure.message : "LINK_FAILED",
            );
          }
        }}
      >
        <label>
          {en ? "Choose task" : "Chọn công việc"}
          <select
            required
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">—</option>
            {tasks.data?.items
              .filter((task) =>
                task.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" disabled={!selected}>
          {en ? "Link evidence" : "Liên kết nguồn"}
        </button>
      </form>
      <button
        className="secondary"
        type="button"
        disabled={!tasks.data?.nextCursor}
        onClick={() => setCursor(tasks.data?.nextCursor ?? "")}
      >
        {en ? "Next page" : "Trang sau"}
      </button>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
