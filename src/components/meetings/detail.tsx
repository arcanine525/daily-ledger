"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { projectsSchema } from "../settings-contracts";
import { Modal } from "../source-dialog";
import { useResource } from "../use-resource";
import { meetingSchema } from "../workspace-schemas";
import { RunPanel } from "./run-panel";
import { SpeakerMapping } from "./speaker-mapping";
import { MeetingTodos } from "./todos";
import { SummaryView, TranscriptView, VersionsView } from "./views";

export function MeetingDetail({
  id,
  locale,
}: {
  readonly id: string;
  readonly locale: "vi" | "en";
}) {
  const en = locale === "en",
    search = useSearchParams(),
    resource = useResource(`/api/meetings/${id}`, meetingSchema),
    projects = useResource("/api/projects", projectsSchema);
  const [tab, setTab] = useState(
      search.get("revision") ? "transcript" : "summary",
    ),
    [revision, setRevision] = useState<number | null>(null),
    [editing, setEditing] = useState(false),
    [quote, setQuote] = useState<{
      revisionId: string;
      start: number;
      end: number;
      quote: string;
    } | null>(null);
  const meeting = resource.data;
  if (!meeting)
    return (
      <main className="workspace">
        <p role={resource.error ? "alert" : "status"}>
          {resource.error || (en ? "Loading…" : "Đang tải…")}
        </p>
      </main>
    );
  const raw =
    meeting.revisions.find((value) => value.id === search.get("revision")) ??
    meeting.revisions.find(
      (value) => value.number === (revision ?? meeting.currentRevisionNumber),
    ) ??
    meeting.revisions[0];
  const analysis = meeting.analyses.find(
      (value) => value.id === meeting.activeAnalysisId,
    ),
    roster =
      projects.data?.find((project) => project.id === meeting.projectId)
        ?.participants ?? [];
  const tabs = [
    { key: "summary", label: en ? "Summary" : "Tóm tắt" },
    { key: "todos", label: "Todo" },
    { key: "transcript", label: en ? "Transcript" : "Nguyên văn" },
    { key: "versions", label: en ? "Versions" : "Phiên bản" },
  ];
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date(meeting.occurredAt).toLocaleString(locale, {
              timeZone: meeting.meetingTimezone,
            })}{" "}
            · {meeting.meetingTimezone} · v{meeting.currentRevisionNumber}
          </p>
          <h1>{meeting.title}</h1>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setTab("transcript");
            setEditing(true);
          }}
        >
          {en ? "Edit transcript" : "Sửa transcript"}
        </button>
      </header>
      {resource.error && (
        <p role="alert" className="notice danger">
          {resource.error}
        </p>
      )}
      <SpeakerMapping
        meeting={meeting}
        roster={roster}
        en={en}
        onSaved={resource.reload}
        onError={resource.setError}
      />
      <RunPanel
        key={`${meeting.id}-${meeting.currentRevisionNumber}`}
        meeting={meeting}
        locale={locale}
        onPublished={resource.reload}
      />
      <nav
        className="tabs"
        aria-label={en ? "Meeting views" : "Nội dung cuộc họp"}
      >
        {tabs.map((value) => (
          <button
            className={tab === value.key ? "" : "secondary"}
            key={value.key}
            type="button"
            onClick={() => setTab(value.key)}
          >
            {value.label}
          </button>
        ))}
      </nav>
      {tab === "summary" && <SummaryView analysis={analysis} en={en} />}
      {tab === "todos" && (
        <MeetingTodos
          meeting={meeting}
          locale={locale}
          onChanged={resource.reload}
          roster={roster}
          onQuote={setQuote}
        />
      )}
      {tab === "transcript" && raw && (
        <TranscriptView
          meeting={meeting}
          raw={raw}
          en={en}
          editing={editing}
          onSaved={async () => {
            setEditing(false);
            setRevision(null);
            await resource.reload();
          }}
          onError={resource.setError}
        />
      )}
      {tab === "versions" && (
        <VersionsView
          meeting={meeting}
          en={en}
          onSelect={(number) => {
            setRevision(number);
            setTab("transcript");
          }}
        />
      )}
      {quote && (
        <Modal
          title={`${en ? "Pinned source" : "Nguồn đã ghim"} · ${quote.revisionId.slice(0, 8)}`}
          onClose={() => setQuote(null)}
        >
          <blockquote>{quote.quote}</blockquote>
          <p>
            {quote.start}–{quote.end} UTF-16
          </p>
          <pre className="raw-transcript">
            {meeting.revisions
              .find((value) => value.id === quote.revisionId)
              ?.rawText.slice(Math.max(0, quote.start - 120), quote.end + 120)}
          </pre>
        </Modal>
      )}
    </main>
  );
}
