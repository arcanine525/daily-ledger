"use client";
import { useState } from "react";
import type { Reply } from "./contracts";
export function TaskGroups({
  reply,
  en,
}: {
  readonly reply: Reply;
  readonly en: boolean;
}) {
  const [confirmedPage, setConfirmedPage] = useState(0),
    [pendingPage, setPendingPage] = useState(0),
    confirmed = reply.sections.appState ?? [],
    pending = reply.sections.pendingTodos ?? [];
  const groups = [
    {
      key: "confirmed",
      rows: confirmed.map((row) => ({
        id: row.taskId,
        title: row.state.title,
        names: row.state.assignees.map((p) => p.name),
        deadline: row.state.deadline,
        status: row.state.status,
        suspect: false,
      })),
      page: confirmedPage,
      setPage: setConfirmedPage,
      title: en
        ? "Confirmed unfinished tasks"
        : "Công việc chính thức chưa xong",
      total: reply.totals?.confirmed ?? confirmed.length,
    },
    {
      key: "pending",
      rows: pending.map((row) => ({
        id: row.id,
        title: row.title,
        names: row.assignees.map((p) => p.name),
        deadline: row.deadline,
        status: null,
        suspect: row.suspectDuplicate ?? false,
      })),
      page: pendingPage,
      setPage: setPendingPage,
      title: en ? "Pending Todos" : "Todo chờ duyệt",
      total: reply.totals?.pending ?? pending.length,
    },
  ];
  return (
    <div className="chat-task-groups">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <h3>
            {group.title} <span className="badge">{group.total}</span>
          </h3>
          {!group.rows.length ? (
            <p>{en ? "No items" : "Không có mục nào"}</p>
          ) : (
            <ul>
              {group.rows
                .slice(group.page * 10, (group.page + 1) * 10)
                .map((row) => (
                  <li key={row.id}>
                    <strong>{row.title}</strong>
                    <p>
                      {row.names.join(", ") ||
                        (en ? "Unassigned" : "Chưa phân công")}{" "}
                      ·{" "}
                      {row.deadline ??
                        (en ? "No deadline" : "Chưa có deadline")}
                      {row.status && ` · ${row.status}`}
                    </p>
                    {row.suspect && (
                      <span className="badge">
                        {en ? "Possible duplicate" : "Nghi trùng"}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {group.rows.length > 10 && (
            <div className="cluster">
              <button
                type="button"
                className="secondary"
                disabled={group.page === 0}
                onClick={() => group.setPage((value) => value - 1)}
              >
                {en ? "Previous" : "Trước"}
              </button>
              <span>
                {group.page + 1} / {Math.ceil(group.rows.length / 10)}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={(group.page + 1) * 10 >= group.rows.length}
                onClick={() => group.setPage((value) => value + 1)}
              >
                {en ? "Next" : "Sau"}
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
