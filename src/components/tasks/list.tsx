"use client";
import Link from "next/link";
import { useState } from "react";
import { projectsSchema } from "../settings-contracts";
import { useResource } from "../use-resource";
import { taskList } from "../workspace-schemas";

export function TasksList({ locale }: { readonly locale: "vi" | "en" }) {
  const en = locale === "en",
    [filters, setFilters] = useState<Record<string, string>>({});
  const query = Object.fromEntries(
    Object.entries(filters).filter(([_name, value]) => Boolean(value)),
  );
  const data = useResource(
      `/api/tasks?${new URLSearchParams(query)}`,
      taskList,
    ),
    projects = useResource("/api/projects", projectsSchema);
  function filter(name: string, value: string) {
    setFilters((previous) => ({
      ...previous,
      [name]: value,
      ...(name !== "cursor" ? { cursor: "" } : {}),
    }));
  }
  const dates = [
    { name: "meetingFrom", label: en ? "Meeting date from" : "Ngày họp từ" },
    { name: "meetingTo", label: en ? "Meeting date to" : "Ngày họp đến" },
    { name: "dueFrom", label: en ? "Deadline from" : "Deadline từ" },
    { name: "dueTo", label: en ? "Deadline to" : "Deadline đến" },
  ];
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">CONFIRMED WORK</p>
          <h1>{en ? "Tasks" : "Công việc"}</h1>
          <p>
            {en
              ? "One task, one shared status, any number of assignees."
              : "Một công việc, một trạng thái chung, có thể nhiều người phụ trách."}
          </p>
        </div>
        <Link className="button" href={`/${locale}/tasks/new`}>
          {en ? "Create task" : "Tạo công việc"}
        </Link>
      </header>
      <section className="panel">
        <div className="form-grid">
          <label>
            {en ? "Project" : "Dự án"}
            <select
              value={filters["projectId"] ?? ""}
              onChange={(event) => filter("projectId", event.target.value)}
            >
              <option value="">{en ? "All" : "Tất cả"}</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {en ? "Scope" : "Người phụ trách"}
            <select onChange={(event) => filter("scope", event.target.value)}>
              <option value="ALL">{en ? "Everyone" : "Tất cả"}</option>
              <option value="MINE">{en ? "Mine" : "Của tôi"}</option>
              <option value="UNASSIGNED">
                {en ? "Unassigned" : "Chưa xác định"}
              </option>
            </select>
          </label>
          <label>
            {en ? "Status" : "Trạng thái"}
            <select onChange={(event) => filter("status", event.target.value)}>
              <option value="">{en ? "All" : "Tất cả"}</option>
              {["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              onChange={(event) =>
                filter("overdue", event.target.checked ? "true" : "")
              }
            />
            {en ? "Overdue only" : "Chỉ quá hạn"}
          </label>
        </div>
        <div className="form-grid">
          {dates.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                type="date"
                onChange={(event) => filter(field.name, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="muted">
          {en
            ? "Meeting dates and deadlines are separate filters. Manual tasks without meeting links do not match meeting-date filters."
            : "Ngày họp và deadline là hai bộ lọc riêng. Task thủ công chưa liên kết không thuộc kết quả lọc ngày họp."}
        </p>
        {data.error && (
          <p className="notice danger" role="alert">
            {data.error}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{en ? "Task" : "Công việc"}</th>
                <th>{en ? "Status" : "Trạng thái"}</th>
                <th>{en ? "Assignees" : "Người phụ trách"}</th>
                <th>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.items.map((task) => (
                <tr key={task.id}>
                  <td>
                    <Link href={`/${locale}/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                    <small>{task.origin}</small>
                  </td>
                  <td>
                    <span className="badge">{task.status}</span>
                  </td>
                  <td>
                    {task.assignments
                      .map((person) => person.nameSnapshot)
                      .join(", ") || "—"}
                  </td>
                  <td>{task.dueDate?.slice(0, 10) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.data?.total === 0 && (
          <p className="empty">
            {en ? "No matching tasks." : "Không có công việc phù hợp."}
          </p>
        )}
        <p>
          {data.data?.total ?? 0}{" "}
          {en ? "distinct tasks" : "công việc riêng biệt"}
        </p>
        <button
          type="button"
          disabled={!data.data?.nextCursor}
          onClick={() => filter("cursor", data.data?.nextCursor ?? "")}
        >
          {en ? "Next page" : "Trang sau"}
        </button>
      </section>
    </main>
  );
}
