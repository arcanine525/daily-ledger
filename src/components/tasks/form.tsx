"use client";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { z } from "zod";
import { requestApi } from "../api-client";
import { projectsSchema } from "../settings-contracts";
import { useResource } from "../use-resource";
import { useUiError } from "../use-ui-error";
import type { Task } from "../workspace-schemas";

export function TaskForm({
  locale,
  task,
  onSaved,
}: {
  readonly locale: "vi" | "en";
  readonly task?: Task;
  readonly onSaved?: () => Promise<void>;
}) {
  const en = locale === "en",
    projects = useResource("/api/projects", projectsSchema),
    [project, setProject] = useState(task?.projectId ?? ""),
    [error, setError] = useUiError(),
    [busy, setBusy] = useState(false),
    key = useRef(crypto.randomUUID());
  const projectId = (project || projects.data?.[0]?.id) ?? "",
    roster = projects.data?.find((p) => p.id === projectId)?.participants ?? [];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await requestApi(
        task ? `/api/tasks/${task.id}` : "/api/tasks",
        {
          method: task ? "PATCH" : "POST",
          key: key.current,
          body: {
            title: data.get("title"),
            status: data.get("status"),
            deadline: data.get("deadline") || null,
            assigneeIds: data.getAll("assignee"),
            ...(task ? { expectedVersion: task.version } : { projectId }),
          },
        },
      );
      if (onSaved) await onSaved();
      else
        location.assign(
          `/${locale}/tasks/${z.object({ id: z.string() }).parse(result).id}`,
        );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "TASK_SAVE_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={save}>
      <label>
        {en ? "Task title" : "Nội dung công việc"}
        <input
          name="title"
          required
          maxLength={300}
          defaultValue={task?.title}
        />
      </label>
      {!task && (
        <label>
          {en ? "Project" : "Dự án"}
          <select
            value={projectId}
            onChange={(event) => setProject(event.target.value)}
            required
          >
            {projects.data?.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="form-grid">
        <label>
          {en ? "Shared status" : "Trạng thái chung"}
          <select name="status" defaultValue={task?.status ?? "TODO"}>
            {["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          {en ? "Deadline (optional)" : "Deadline (không bắt buộc)"}
          <input
            type="date"
            name="deadline"
            defaultValue={task?.dueDate?.slice(0, 10) ?? ""}
          />
        </label>
      </div>
      <fieldset>
        <legend>{en ? "Assignees" : "Người phụ trách"}</legend>
        {roster.map((person) => (
          <label className="check" key={person.id}>
            <input
              type="checkbox"
              name="assignee"
              value={person.id}
              defaultChecked={
                task?.assignments.some((a) => a.participantId === person.id) ??
                false
              }
            />
            {person.displayName}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        {en
          ? "Assignees and deadline can be empty. Manual tasks need no meeting citation."
          : "Có thể để trống người phụ trách/deadline. Task thủ công không cần nguồn họp."}
      </p>
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy
          ? en
            ? "Saving…"
            : "Đang lưu…"
          : en
            ? "Save task"
            : "Lưu công việc"}
      </button>
    </form>
  );
}
