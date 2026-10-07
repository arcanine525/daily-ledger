import { callApi } from "../api-client";
import type { Meeting } from "../workspace-schemas";

export function SummaryView({
  analysis,
  en,
}: {
  readonly analysis: Meeting["analyses"][number] | undefined;
  readonly en: boolean;
}) {
  if (!analysis)
    return (
      <p className="empty">
        {en
          ? "No valid analysis for this revision. Original transcript is saved."
          : "Chưa có phân tích cho phiên bản này. Transcript gốc đã được lưu."}
      </p>
    );
  const sections = [
    { label: en ? "Blockers" : "Vướng mắc", items: analysis.summary.blockers },
    {
      label: en ? "Decisions" : "Quyết định",
      items: analysis.summary.decisions,
    },
    { label: "Todo", items: analysis.summary.todos },
  ];
  return (
    <div className="stack">
      <section className="panel">
        <h2>{en ? "Overview" : "Tổng quan"}</h2>
        <p>
          {analysis.summary.overview ||
            (en ? "Not recorded" : "Không ghi nhận")}
        </p>
      </section>
      <section className="panel">
        <h2>{en ? "Updates by person" : "Cập nhật theo người"}</h2>
        {analysis.summary.byPerson.length ? (
          analysis.summary.byPerson.map((person) => (
            <p key={`${person.speaker}:${person.update}`}>
              <strong>{person.speaker}</strong>: {person.update}
            </p>
          ))
        ) : (
          <p>—</p>
        )}
      </section>
      {sections.map((section) => (
        <section className="panel" key={section.label}>
          <h2>{section.label}</h2>
          <ul>
            {section.items.length ? (
              [...new Set(section.items)].map((value) => (
                <li key={value}>{value}</li>
              ))
            ) : (
              <li>{en ? "Not recorded" : "Không ghi nhận"}</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
export function TranscriptView({
  meeting,
  raw,
  en,
  editing,
  onSaved,
  onError,
}: {
  readonly meeting: Meeting;
  readonly raw: Meeting["revisions"][number];
  readonly en: boolean;
  readonly editing: boolean;
  readonly onSaved: () => Promise<void>;
  readonly onError: (value: string) => void;
}) {
  return (
    <section className="panel">
      <h2>
        {en ? "Original text" : "Nội dung nguyên văn"} · v{raw.number}
      </h2>
      {editing ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            try {
              await callApi(`/api/meetings/${meeting.id}/revisions`, "POST", {
                rawText: data.get("raw"),
                expectedRevision: meeting.currentRevisionNumber,
              });
              await onSaved();
            } catch (failure) {
              onError(
                failure instanceof Error ? failure.message : "REVISION_FAILED",
              );
            }
          }}
        >
          <label>
            {en ? "New revision" : "Phiên bản mới"}
            <textarea
              className="transcript-input"
              name="raw"
              aria-label={en ? "New revision" : "Phiên bản mới"}
              defaultValue={raw.rawText}
              required
            />
          </label>
          <p className="notice">
            {en
              ? "Original revision and user edits remain. Linked tasks will show source changed."
              : "Giữ bản gốc và chỉnh sửa của bạn. Task liên quan được đánh dấu nguồn thay đổi."}
          </p>
          <button type="submit">
            {en ? "Save new revision" : "Lưu phiên bản mới"}
          </button>
        </form>
      ) : (
        <pre className="raw-transcript">{raw.rawText}</pre>
      )}
    </section>
  );
}
export function VersionsView({
  meeting,
  en,
  onSelect,
}: {
  readonly meeting: Meeting;
  readonly en: boolean;
  readonly onSelect: (value: number) => void;
}) {
  return (
    <section className="panel">
      <h2>{en ? "Raw revisions" : "Lịch sử phiên bản"}</h2>
      {meeting.revisions.map((version) => (
        <p key={version.id}>
          <button
            className="secondary"
            type="button"
            onClick={() => onSelect(version.number)}
          >
            v{version.number}
          </button>{" "}
          · {version.sha256.slice(0, 12)} ·{" "}
          {version.number === meeting.currentRevisionNumber
            ? en
              ? "Current"
              : "Hiện tại"
            : en
              ? "Historical"
              : "Bản cũ"}
        </p>
      ))}
      <h2>{en ? "Analyses" : "Lịch sử phân tích"}</h2>
      {meeting.analyses.map((value) => (
        <details key={value.id}>
          <summary>
            #{value.number} ·{" "}
            {value.id === meeting.activeAnalysisId
              ? en
                ? "Active"
                : "Đang dùng"
              : en
                ? "Historical / old revision"
                : "Bản cũ / phiên bản cũ"}
          </summary>
          <pre>{JSON.stringify(value.summary, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}
