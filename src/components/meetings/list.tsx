"use client";
import Link from "next/link";
import { useState } from "react";
import { projectsSchema } from "../settings-contracts";
import { useResource } from "../use-resource";
import { meetingList } from "../workspace-schemas";

export function MeetingsList({ locale }: { readonly locale: "vi" | "en" }) {
  const en = locale === "en",
    [project, setProject] = useState(""),
    [cursor, setCursor] = useState("");
  const meetings = useResource(
      `/api/meetings?${new URLSearchParams({ ...(project ? { projectId: project } : {}), ...(cursor ? { cursor } : {}) })}`,
      meetingList,
    ),
    projects = useResource("/api/projects", projectsSchema);
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DAILY LEDGER</p>
          <h1>{en ? "Meetings" : "Cuộc họp"}</h1>
          <p>
            {en
              ? "Your original words, safely archived."
              : "Transcript gốc và lịch sử công việc được lưu nguyên vẹn."}
          </p>
        </div>
        <Link className="button" href={`/${locale}/meetings/new`}>
          {en ? "New meeting" : "Cuộc họp mới"}
        </Link>
      </header>
      <div className="panel">
        <label>
          {en ? "Project" : "Dự án"}
          <select
            value={project}
            onChange={(event) => {
              setProject(event.target.value);
              setCursor("");
            }}
          >
            <option value="">{en ? "All projects" : "Tất cả dự án"}</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {meetings.error && <p role="alert">{meetings.error}</p>}
        {meetings.data?.items.length === 0 && (
          <p className="empty">
            {en
              ? "No meetings yet. Paste your first transcript."
              : "Chưa có cuộc họp. Hãy lưu transcript đầu tiên."}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{en ? "Meeting" : "Cuộc họp"}</th>
                <th>{en ? "Date" : "Ngày"}</th>
                <th>{en ? "Analysis" : "Phân tích"}</th>
              </tr>
            </thead>
            <tbody>
              {meetings.data?.items.map((meeting) => (
                <tr key={meeting.id}>
                  <td>
                    <Link href={`/${locale}/meetings/${meeting.id}`}>
                      {meeting.title}
                    </Link>
                    <small>v{meeting.currentRevisionNumber}</small>
                  </td>
                  <td>
                    {new Date(meeting.occurredAt).toLocaleDateString(locale)}
                  </td>
                  <td>
                    <span className="badge">
                      {meeting.activeAnalysisId
                        ? en
                          ? "Analyzed"
                          : "Đã phân tích"
                        : en
                          ? "Raw saved"
                          : "Đã lưu raw"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cluster">
          <button
            className="secondary"
            type="button"
            disabled={!cursor}
            onClick={() => setCursor("")}
          >
            {en ? "First page" : "Trang đầu"}
          </button>
          <button
            type="button"
            disabled={!meetings.data?.nextCursor}
            onClick={() => setCursor(meetings.data?.nextCursor ?? "")}
          >
            {en ? "Next page" : "Trang sau"}
          </button>
        </div>
      </div>
    </main>
  );
}
