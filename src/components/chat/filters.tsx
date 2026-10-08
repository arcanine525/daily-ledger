"use client";
import { projectsSchema } from "../settings-contracts";
import { useResource } from "../use-resource";
import { meetingList } from "../workspace-schemas";
import { type ChatFilters, filtersSchema } from "./contracts";
export function ChatFilterFields({
  value,
  onChange,
  en,
  disabled,
}: {
  readonly value: ChatFilters;
  readonly onChange: (value: ChatFilters) => void;
  readonly en: boolean;
  readonly disabled: boolean;
}) {
  const projects = useResource("/api/projects", projectsSchema),
    meetings = useResource(
      `/api/meetings${value.projectId ? `?projectId=${value.projectId}` : ""}`,
      meetingList,
    );
  function change(key: string, text: string) {
    const next: Record<string, unknown> = { ...value };
    if (text) next[key] = text;
    else delete next[key];
    if (key === "projectId") delete next["meetingId"];
    onChange(filtersSchema.parse(next));
  }
  return (
    <fieldset disabled={disabled}>
      <legend>
        {en ? "Scope for the next question" : "Phạm vi câu hỏi tiếp theo"}
      </legend>
      <div className="form-grid">
        <label>
          {en ? "Project" : "Dự án"}
          <select
            value={value.projectId ?? ""}
            onChange={(event) => change("projectId", event.target.value)}
          >
            <option value="">{en ? "All projects" : "Tất cả dự án"}</option>
            {projects.data?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en ? "Meeting" : "Cuộc họp"}
          <select
            value={value.meetingId ?? ""}
            onChange={(event) => change("meetingId", event.target.value)}
          >
            <option value="">{en ? "All meetings" : "Tất cả cuộc họp"}</option>
            {meetings.data?.items.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en ? "Assignee scope" : "Phạm vi phụ trách"}
          <select
            value={value.scope}
            onChange={(event) => change("scope", event.target.value)}
          >
            <option value="ALL">{en ? "Everyone" : "Mọi người"}</option>
            <option value="MINE">{en ? "Mine" : "Của tôi"}</option>
            <option value="UNASSIGNED">
              {en ? "Unassigned" : "Chưa phân công"}
            </option>
          </select>
        </label>
        {[
          { key: "from", label: en ? "Meeting date from" : "Ngày họp từ" },
          { key: "to", label: en ? "Meeting date to" : "Ngày họp đến" },
          { key: "dueFrom", label: en ? "Deadline from" : "Deadline từ" },
          { key: "dueTo", label: en ? "Deadline to" : "Deadline đến" },
        ].map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="date"
              value={
                Object.entries(value).find(([key]) => key === field.key)?.[1] ??
                ""
              }
              onChange={(event) => change(field.key, event.target.value)}
            />
          </label>
        ))}
      </div>
      {(projects.error || meetings.error) && (
        <p role="alert">{projects.error || meetings.error}</p>
      )}
    </fieldset>
  );
}
