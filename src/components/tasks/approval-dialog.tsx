"use client";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { requestApi } from "../api-client";
import { projectsSchema } from "../settings-contracts";
import { Modal } from "../source-dialog";
import { useResource } from "../use-resource";
import { useUiError } from "../use-ui-error";
import type { Proposal } from "../workspace-schemas";
import { taskList } from "../workspace-schemas";

export function ApprovalDialog({
  proposal,
  action,
  locale,
  onClose,
  onSaved,
}: {
  readonly proposal: Proposal;
  readonly action: {
    title: string;
    dueDate: string | null;
    assignees: readonly { id: string; name: string }[];
    projectId: string;
  };
  readonly locale: "vi" | "en";
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const en = locale === "en",
    projects = useResource("/api/projects", projectsSchema),
    tasks = useResource(`/api/tasks?projectId=${action.projectId}`, taskList),
    key = useRef(crypto.randomUUID());
  const [error, setError] = useUiError(),
    [busy, setBusy] = useState(false),
    [resolution, setResolution] = useState<"LINK_EXISTING" | "CREATE_SEPARATE">(
      "LINK_EXISTING",
    );
  const create =
      proposal.kind === "CREATE" ||
      (proposal.changes.requiresReconciliation &&
        resolution === "CREATE_SEPARATE"),
    roster =
      projects.data?.find((p) => p.id === action.projectId)?.participants ?? [];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await requestApi(`/api/task-proposals/${proposal.id}/decision`, {
        method: "POST",
        key: key.current,
        body: {
          decision: "ACCEPT",
          ...(create
            ? {
                overrides: {
                  title: data.get("title"),
                  status: data.get("status"),
                  deadline: data.get("deadline") || null,
                  assigneeIds: data.getAll("assignee"),
                },
              }
            : {}),
          ...(proposal.changes.requiresReconciliation
            ? {
                resolution,
                ...(resolution === "LINK_EXISTING"
                  ? { targetTaskId: data.get("target") }
                  : {}),
              }
            : {}),
        },
      });
      await onSaved();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "DECISION_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={en ? "Review before applying" : "Xem lại trước khi áp dụng"}
      onClose={onClose}
    >
      <form onSubmit={save}>
        {proposal.changes.requiresReconciliation && (
          <div className="notice">
            <p>
              {en
                ? "Possible duplicate. Choose explicitly; no automatic merge."
                : "Có thể trùng. Chọn rõ cách xử lý; không tự gộp."}
            </p>
            <label>
              {en ? "Resolution" : "Cách xử lý"}
              <select
                value={resolution}
                onChange={(event) =>
                  setResolution(
                    event.target.value === "CREATE_SEPARATE"
                      ? "CREATE_SEPARATE"
                      : "LINK_EXISTING",
                  )
                }
              >
                <option value="LINK_EXISTING">
                  {en ? "Link evidence only" : "Chỉ liên kết nguồn"}
                </option>
                <option value="CREATE_SEPARATE">
                  {en ? "Create a separate task" : "Tạo công việc riêng"}
                </option>
              </select>
            </label>
            {resolution === "LINK_EXISTING" && (
              <label>
                {en ? "Existing task" : "Công việc đã có"}
                <select
                  name="target"
                  required
                  defaultValue={proposal.taskId ?? ""}
                >
                  <option value="">—</option>
                  {tasks.data?.items.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {create ? (
          <>
            <label>
              {en ? "Task title" : "Nội dung công việc"}
              <input
                name="title"
                required
                defaultValue={
                  proposal.changes.requiresReconciliation
                    ? (proposal.changes.after.title ?? action.title)
                    : action.title
                }
              />
            </label>
            <label>
              {en ? "Initial status" : "Trạng thái ban đầu"}
              <select name="status" defaultValue="TODO">
                <option value="TODO">{en ? "To do" : "Cần làm"}</option>
                <option value="IN_PROGRESS">
                  {en ? "In progress" : "Đang làm"}
                </option>
                <option value="BLOCKED">{en ? "Blocked" : "Bị chặn"}</option>
                <option value="DONE">{en ? "Done" : "Hoàn thành"}</option>
                <option value="CANCELLED">{en ? "Cancelled" : "Đã hủy"}</option>
              </select>
            </label>
            <label>
              {en ? "Deadline (optional)" : "Deadline (không bắt buộc)"}
              <input
                name="deadline"
                type="date"
                defaultValue={action.dueDate?.slice(0, 10) ?? ""}
              />
            </label>
            <fieldset>
              <legend>
                {en
                  ? "Assignees (optional, multiple)"
                  : "Người phụ trách (không bắt buộc, chọn nhiều)"}
              </legend>
              {roster.map((person) => (
                <label className="check" key={person.id}>
                  <input
                    type="checkbox"
                    name="assignee"
                    value={person.id}
                    defaultChecked={action.assignees.some(
                      (a) => a.id === person.id,
                    )}
                  />
                  {person.displayName}{" "}
                  {person.archivedAt ? "(identity cũ)" : ""}
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          <div className="diff-grid">
            <div>
              <strong>{en ? "Before" : "Trước"}</strong>
              <pre>{JSON.stringify(proposal.changes.before, null, 2)}</pre>
            </div>
            <div>
              <strong>{en ? "After" : "Sau"}</strong>
              <pre>{JSON.stringify(proposal.changes.after, null, 2)}</pre>
            </div>
          </div>
        )}
        <blockquote>{proposal.evidence.quote}</blockquote>
        {error && (
          <p role="alert" className="notice danger">
            {error}
          </p>
        )}
        <div className="cluster">
          <button disabled={busy} type="submit">
            {busy
              ? en
                ? "Applying…"
                : "Đang áp dụng…"
              : en
                ? "Confirm decision"
                : "Xác nhận duyệt"}
          </button>
          <button className="secondary" type="button" onClick={onClose}>
            {en ? "Cancel" : "Hủy"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
