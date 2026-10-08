import type { FormEvent } from "react";
import { callApi } from "./api-client";
import type { Project, RunAction } from "./settings-contracts";

export function ProjectPanel({
  projects,
  en,
  run,
}: {
  readonly projects: readonly Project[];
  readonly en: boolean;
  readonly run: RunAction;
}) {
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await run(() => callApi("/api/projects", "POST", { name: f.get("name") }));
  }
  async function add(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await run(() =>
      callApi(`/api/projects/${project.id}/participants`, "POST", {
        displayName: f.get("displayName"),
        isSelf: f.get("isSelf") === "on",
        aliases: String(f.get("aliases"))
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    );
  }
  return (
    <section className="panel">
      <h2>{en ? "Projects & participants" : "Dự án và người tham gia"}</h2>
      <form onSubmit={create}>
        <label>
          {en ? "Project name" : "Tên dự án"}
          <input name="name" required />
        </label>
        <button type="submit">{en ? "Create project" : "Tạo dự án"}</button>
      </form>
      {projects.map((project) => (
        <article key={project.id}>
          <h3>
            {project.name} {project.archivedAt ? "(archived)" : ""}
          </h3>
          <button
            type="button"
            onClick={() =>
              run(() =>
                callApi(`/api/projects/${project.id}`, "PATCH", {
                  name: project.name,
                  archived: !project.archivedAt,
                }),
              )
            }
          >
            {project.archivedAt
              ? en
                ? "Unarchive"
                : "Bỏ lưu trữ"
              : en
                ? "Archive"
                : "Lưu trữ"}
          </button>
          <button
            type="button"
            onClick={() => {
              const name = prompt(
                en ? "Project name" : "Tên dự án",
                project.name,
              );
              if (name)
                run(() =>
                  callApi(`/api/projects/${project.id}`, "PATCH", { name }),
                );
            }}
          >
            {en ? "Rename" : "Đổi tên"}
          </button>
          <ul>
            {project.participants.map((p) => (
              <li key={p.id}>
                {p.displayName} {p.isSelf ? "(self)" : ""} ·{" "}
                {p.aliases.map((a) => a.normalized).join(", ")}{" "}
                {p.archivedAt ? "(mapping retired)" : ""}
                {!p.archivedAt && (
                  <button
                    type="button"
                    onClick={() => {
                      const aliases = prompt(
                        en
                          ? "Aliases, separated by commas"
                          : "Aliases, cách nhau bằng dấu phẩy",
                        p.aliases.map((a) => a.normalized).join(","),
                      );
                      if (aliases !== null)
                        run(() =>
                          callApi(
                            `/api/projects/${project.id}/participants/${p.id}`,
                            "PATCH",
                            {
                              displayName: p.displayName,
                              isSelf: p.isSelf,
                              aliases: aliases
                                .split(",")
                                .map((a) => a.trim())
                                .filter(Boolean),
                            },
                          ),
                        );
                    }}
                  >
                    {en ? "Edit aliases" : "Sửa aliases"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={(event) => add(event, project)}>
            <label>
              {en ? "Participant name" : "Tên người tham gia"}
              <input name="displayName" required />
            </label>
            <label>
              Aliases
              <input name="aliases" />
            </label>
            <label>
              <input name="isSelf" type="checkbox" />{" "}
              {en ? "This is me" : "Đây là tôi"}
            </label>
            <button type="submit">
              {en ? "Add participant" : "Thêm người"}
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              if (
                confirm(
                  en
                    ? "Merge aliases for future analyses only? Existing tasks and history stay unchanged."
                    : "Gộp tên chỉ cho phân tích tương lai? Task và lịch sử cũ giữ nguyên.",
                )
              )
                run(() =>
                  callApi(`/api/projects/${project.id}/participants`, "PATCH", {
                    sourceId: f.get("source"),
                    targetId: f.get("target"),
                    confirm: true,
                  }),
                );
            }}
          >
            <h3>
              {en
                ? "Future-only identity merge"
                : "Gộp danh tính cho lần phân tích sau"}
            </h3>
            <label>
              {en ? "Source identity" : "Danh tính nguồn"}
              <select name="source">
                {project.participants
                  .filter((p) => !p.archivedAt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {en ? "Target identity" : "Danh tính đích"}
              <select name="target">
                {project.participants
                  .filter((p) => !p.archivedAt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit">
              {en ? "Review merge" : "Xác nhận gộp"}
            </button>
          </form>
        </article>
      ))}
    </section>
  );
}
