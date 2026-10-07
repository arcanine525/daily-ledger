import { useState } from "react";
import { callApi } from "../api-client";
import { Modal } from "../source-dialog";
import { ManualLinkDialog } from "../tasks/manual-link-dialog";
import { ReviewInbox } from "../tasks/review-inbox";
import type { Meeting } from "../workspace-schemas";

export function MeetingTodos({
  meeting,
  locale,
  onChanged,
  onQuote,
  roster,
}: {
  readonly meeting: Meeting;
  readonly locale: "vi" | "en";
  readonly roster: readonly { id: string; displayName: string }[];
  readonly onChanged: () => Promise<void>;
  readonly onQuote: (source: {
    revisionId: string;
    start: number;
    end: number;
    quote: string;
  }) => void;
}) {
  const en = locale === "en",
    [link, setLink] = useState<string | null>(null),
    [editing, setEditing] = useState<Meeting["actions"][number] | null>(null),
    [error, setError] = useState("");
  const [scope, setScope] = useState("ALL");
  const actions = meeting.actions.filter((action) =>
    scope === "MINE"
      ? action.assignees.some((person) => person.isSelf)
      : scope === "UNASSIGNED"
        ? action.assignees.length === 0
        : true,
  );
  return (
    <>
      <label>
        {en ? "Todo scope" : "Phạm vi Todo"}
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="ALL">{en ? "Everyone" : "Tất cả"}</option>
          <option value="MINE">{en ? "Mine" : "Của tôi"}</option>
          <option value="UNASSIGNED">
            {en ? "Unassigned" : "Chưa xác định"}
          </option>
        </select>
      </label>
      <div className="stack">
        {actions.map((action) => (
          <article className="panel" key={action.id}>
            <h2>{action.title}</h2>
            <p>
              {action.assignees.map((person) => person.name).join(", ") ||
                (en ? "Unassigned" : "Chưa xác định")}{" "}
              · {action.dueDate?.slice(0, 10) ?? "—"}
            </p>
            {(action.sourceChanged || action.retainedMissing) && (
              <p className="notice warning">
                {action.retainedMissing
                  ? en
                    ? "Retained; no exact match in new analysis."
                    : "Đã giữ; chưa khớp chính xác trong phân tích mới."
                  : en
                    ? "Source changed; review first."
                    : "Nguồn đã thay đổi; cần xem lại."}
              </p>
            )}
            {action.taskId ? (
              <a href={`/${locale}/tasks/${action.taskId}`}>
                {en ? "Open confirmed task" : "Mở task chính thức"}
              </a>
            ) : (
              <p className="muted">
                {action.reviewState === "REJECTED"
                  ? en
                    ? "Rejected suggestion"
                    : "Đề xuất đã từ chối"
                  : en
                    ? "Not yet a confirmed task"
                    : "Chưa là task chính thức"}
              </p>
            )}
            <div className="cluster">
              {action.occurrences.slice(-1).map((value) => (
                <button
                  className="secondary"
                  key={value.occurrence.analysisId}
                  type="button"
                  onClick={() => onQuote(value.occurrence.evidence)}
                >
                  {en ? "View source" : "Xem nguồn"}
                </button>
              ))}
              {!action.taskId && (
                <>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setLink(action.id)}
                  >
                    {en ? "Choose existing task" : "Tự chọn task để liên kết"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setEditing(action)}
                  >
                    {en ? "Edit pending item" : "Sửa Todo"}
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <ReviewInbox
        locale={locale}
        meetingId={meeting.id}
        onChange={onChanged}
      />
      {link && (
        <ManualLinkDialog
          actionId={link}
          projectId={meeting.projectId}
          locale={locale}
          onClose={() => setLink(null)}
          onSaved={onChanged}
        />
      )}{" "}
      {editing && (
        <Modal
          title={en ? "Edit pending item" : "Sửa Todo chưa duyệt"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              try {
                await callApi(`/api/meeting-actions/${editing.id}`, "PATCH", {
                  expectedVersion: editing.version,
                  title: data.get("title"),
                  deadline: data.get("deadline") || null,
                  assigneeIds: data.getAll("assignee"),
                });
                await onChanged();
                setEditing(null);
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : "EDIT_FAILED",
                );
              }
            }}
          >
            <label>
              {en ? "Title" : "Nội dung"}
              <input name="title" defaultValue={editing.title} required />
            </label>
            <label>
              Deadline
              <input
                type="date"
                name="deadline"
                defaultValue={editing.dueDate?.slice(0, 10) ?? ""}
              />
            </label>
            <p>
              {en
                ? "No task status is applied before approval."
                : "Không áp dụng trạng thái task trước khi duyệt."}
            </p>
            <fieldset>
              <legend>{en ? "Assignees" : "Người phụ trách"}</legend>
              {roster.map((person) => (
                <label className="check" key={person.id}>
                  <input
                    type="checkbox"
                    name="assignee"
                    value={person.id}
                    defaultChecked={editing.assignees.some(
                      (value) => value.id === person.id,
                    )}
                  />
                  {person.displayName}
                </label>
              ))}
            </fieldset>
            {error && <p role="alert">{error}</p>}
            <button type="submit">{en ? "Save edits" : "Lưu chỉnh sửa"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
