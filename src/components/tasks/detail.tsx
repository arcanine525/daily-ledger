"use client";
import Link from "next/link";
import { useState } from "react";
import { callApi } from "../api-client";
import { useResource } from "../use-resource";
import { taskSchema } from "../workspace-schemas";
import { TaskForm } from "./form";

export function TaskDetail({
  id,
  locale,
}: {
  readonly id: string;
  readonly locale: "vi" | "en";
}) {
  const en = locale === "en",
    resource = useResource(`/api/tasks/${id}`, taskSchema),
    [edit, setEdit] = useState(false);
  const task = resource.data;
  if (!task)
    return (
      <p role={resource.error ? "alert" : "status"}>
        {resource.error || (en ? "Loading…" : "Đang tải…")}
      </p>
    );
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            {task.origin} · v{task.version}
          </p>
          <h1>{task.title}</h1>
          <p>
            <span className="badge">{task.status}</span> ·{" "}
            {task.assignments.map((person) => person.nameSnapshot).join(", ") ||
              (en ? "Unassigned" : "Chưa xác định")}
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => setEdit(!edit)}
        >
          {en ? "Edit task" : "Sửa công việc"}
        </button>
      </header>
      {edit && (
        <TaskForm
          key={task.version}
          locale={locale}
          task={task}
          onSaved={async () => {
            await resource.reload();
            setEdit(false);
          }}
        />
      )}
      <div className="split-grid">
        <section className="panel">
          <h2>{en ? "Linked sources" : "Nguồn đã liên kết"}</h2>
          <p>
            {en
              ? "Links add evidence only; they do not change shared status or deadline."
              : "Liên kết chỉ thêm bằng chứng; không đổi trạng thái chung hay deadline."}
          </p>
          {task.evidence.length ? (
            task.evidence.map((source) => (
              <article key={source.id}>
                {source.sourceDeleted ? (
                  <p className="notice warning">
                    {en ? "Source deleted" : "Nguồn đã bị xóa"}
                  </p>
                ) : (
                  <>
                    <Link
                      href={`/${locale}/meetings/${source.sourceMeetingId}?revision=${source.sourceRevisionId}`}
                    >
                      {en
                        ? "Open pinned meeting source"
                        : "Mở nguồn họp đã ghim"}
                    </Link>
                    <blockquote>{source.quote}</blockquote>
                    {source.sourceChanged && (
                      <p className="notice warning">
                        {en
                          ? "Source changed; task remains unchanged."
                          : "Nguồn đã thay đổi; task được giữ nguyên."}
                      </p>
                    )}
                    {source.actionId && (
                      <button
                        className="secondary"
                        type="button"
                        onClick={async () => {
                          if (
                            confirm(
                              en
                                ? "Unlink evidence? Task remains and history is retained."
                                : "Bỏ liên kết? Task vẫn giữ và có lịch sử.",
                            )
                          ) {
                            await callApi(
                              `/api/meeting-actions/${source.actionId}/unlink`,
                              "POST",
                              {},
                            );
                            await resource.reload();
                          }
                        }}
                      >
                        {en ? "Unlink" : "Bỏ liên kết"}
                      </button>
                    )}
                  </>
                )}
              </article>
            ))
          ) : (
            <p className="empty">
              {en
                ? "No meeting source. Manual task is still valid."
                : "Chưa có nguồn họp. Task thủ công vẫn hợp lệ."}
            </p>
          )}
        </section>
        <section className="panel">
          <h2>{en ? "History" : "Dòng thời gian"}</h2>
          <p className="muted">
            {en
              ? "Changes take effect when saved in the app, never backdated. Correct mistakes by editing or unlinking, not automatic undo."
              : "Thay đổi có hiệu lực khi lưu trong app, không lùi ngày. Sửa sai bằng edit/unlink, không hoàn tác tự động."}
          </p>
          <ol className="timeline">
            {task.events?.map((event) => (
              <li key={event.id}>
                <strong>{event.kind}</strong>
                <small>
                  {new Date(event.recordedAt).toLocaleString(locale)}
                </small>
                <details>
                  <summary>{en ? "Before / after" : "Trước / sau"}</summary>
                  <pre>
                    {JSON.stringify(
                      { before: event.before, after: event.after },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
