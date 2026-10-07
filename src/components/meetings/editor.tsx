"use client";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { z } from "zod";
import { localTimeToIso } from "../../shared/local-time";
import { requestApi } from "../api-client";
import { projectsSchema, settingsSchema } from "../settings-contracts";
import { useResource } from "../use-resource";

export function MeetingEditor({ locale }: { readonly locale: "vi" | "en" }) {
  const en = locale === "en",
    projects = useResource("/api/projects", projectsSchema),
    settings = useResource("/api/settings", settingsSchema);
  const [raw, setRaw] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID()),
    duplicate = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const body = {
        projectId: data.get("project"),
        title: data.get("title"),
        occurredAt: localTimeToIso(
          String(data.get("time")),
          String(data.get("timezone")),
        ),
        meetingTimezone: data.get("timezone"),
        rawText: raw,
        confirmDuplicate: duplicate.current,
      };
      let value: unknown;
      try {
        value = await requestApi("/api/meetings", {
          method: "POST",
          body,
          key: key.current,
        });
      } catch (failure) {
        if (
          failure instanceof Error &&
          failure.message === "DUPLICATE_TRANSCRIPT" &&
          confirm(
            en
              ? "Same transcript exists in this project. Save another meeting?"
              : "Transcript đã có trong dự án. Bạn vẫn muốn lưu cuộc họp khác?",
          )
        ) {
          duplicate.current = true;
          value = await requestApi("/api/meetings", {
            method: "POST",
            body: { ...body, confirmDuplicate: true },
            key: key.current,
          });
        } else throw failure;
      }
      location.assign(
        `/${locale}/meetings/${z.object({ id: z.string() }).parse(value).id}`,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "SAVE_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">01 / RAW TRANSCRIPT</p>
          <h1>{en ? "New meeting" : "Cuộc họp mới"}</h1>
          <p>
            {en
              ? "Save the original transcript before any AI request."
              : "Lưu transcript gốc trước khi gửi bất kỳ request AI nào."}
          </p>
        </div>
      </header>
      <form className="panel" onSubmit={save}>
        <div className="form-grid">
          <label>
            {en ? "Title" : "Tiêu đề"}
            <input name="title" required maxLength={200} />
          </label>
          <label>
            {en ? "Project" : "Dự án"}
            <select name="project" required>
              {projects.data
                ?.filter((p) => !p.archivedAt)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {en ? "Meeting local time" : "Thời gian cuộc họp"}
            <input name="time" type="datetime-local" required />
          </label>
          <label>
            {en ? "Timezone" : "Múi giờ"}
            <input
              key={settings.data?.timezone ?? "loading"}
              name="timezone"
              required
              defaultValue={
                settings.data?.timezone ??
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
            />
          </label>
        </div>
        <label>
          {en ? "Original transcript" : "Transcript gốc"}
          <textarea
            className="transcript-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            required
            spellCheck={false}
            placeholder="09:00 Mai: I will review the API tomorrow."
          />
        </label>
        <p className="muted">
          {raw.length.toLocaleString()} / 240,000 ·{" "}
          {en
            ? "Plain text only; original whitespace is retained."
            : "Chỉ plain text; giữ nguyên khoảng trắng và xuống dòng."}
        </p>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={
            busy ||
            !projects.data?.some((p) => !p.archivedAt) ||
            raw.length > 240000
          }
          type="submit"
        >
          {busy
            ? en
              ? "Saving…"
              : "Đang lưu…"
            : en
              ? "Save original transcript"
              : "Lưu transcript gốc"}
        </button>
      </form>
    </main>
  );
}
