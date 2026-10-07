"use client";
import { useState } from "react";
import { ProjectPanel } from "./project-panel";
import { projectsSchema } from "./settings-contracts";
import { useResource } from "./use-resource";
export function ProjectsScreen({ locale }: { readonly locale: "vi" | "en" }) {
  const resource = useResource("/api/projects", projectsSchema),
    [message, setMessage] = useState("");
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await resource.reload();
      setMessage(locale === "en" ? "Saved" : "Đã lưu");
      return true;
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : "PROJECT_FAILED");
      return false;
    }
  }
  return (
    <main className="workspace">
      <header className="page-heading">
        <h1>
          {locale === "en" ? "Projects & identity" : "Dự án và danh tính"}
        </h1>
      </header>
      {message && <p role="status">{message}</p>}
      <ProjectPanel
        projects={resource.data ?? []}
        en={locale === "en"}
        run={run}
      />
    </main>
  );
}
