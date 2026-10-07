import { z } from "zod";
import { transcriptSegments } from "../../server/meetings/parser";
import { callApi } from "../api-client";
import type { Project } from "../settings-contracts";
import type { Meeting } from "../workspace-schemas";
export function SpeakerMapping({
  meeting,
  roster,
  en,
  onSaved,
  onError,
}: {
  readonly meeting: Meeting;
  readonly roster: readonly Project["participants"][number][];
  readonly en: boolean;
  readonly onSaved: () => Promise<void>;
  readonly onError: (value: string) => void;
}) {
  const labels = [
    ...new Set(
      transcriptSegments(meeting.revisions[0]?.rawText ?? "")
        .map((segment) => segment.speaker)
        .filter((speaker): speaker is string => Boolean(speaker)),
    ),
  ];
  return (
    <details className="panel">
      <summary>
        {en
          ? "Speaker mapping before analysis"
          : "Ánh xạ người nói trước khi phân tích"}
      </summary>
      <form
        key={JSON.stringify(meeting.identity)}
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            await callApi(
              `/api/meetings/${meeting.id}/identity`,
              "POST",
              labels.map((speaker) => ({
                speaker,
                isSharedSpeaker: data.get(`shared:${speaker}`) === "on",
                participantIds: data.get(`person:${speaker}`)
                  ? [data.get(`person:${speaker}`)]
                  : [],
              })),
            );
            await onSaved();
          } catch (failure) {
            onError(
              failure instanceof Error ? failure.message : "MAPPING_FAILED",
            );
          }
        }}
      >
        {labels.map((speaker) => {
          const mapping = meeting.identity.find(
              (value) => value.speaker === speaker,
            ),
            parsed = z
              .object({ participantIds: z.array(z.string()) })
              .safeParse(mapping?.mapping);
          return (
            <div className="form-grid" key={speaker}>
              <label>
                {speaker}
                <select
                  name={`person:${speaker}`}
                  defaultValue={
                    parsed.success ? (parsed.data.participantIds[0] ?? "") : ""
                  }
                >
                  <option value="">
                    {en ? "Unassigned" : "Chưa xác định"}
                  </option>
                  {roster
                    .filter((person) => !person.archivedAt)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="check">
                <input
                  name={`shared:${speaker}`}
                  type="checkbox"
                  defaultChecked={mapping?.isSharedSpeaker ?? false}
                />
                {en ? "Shared speaker" : "Nhãn dùng chung"}
              </label>
            </div>
          );
        })}
        <button type="submit">{en ? "Save mapping" : "Lưu ánh xạ"}</button>
        <p>
          {en
            ? "Shared labels never automatically assign work to you."
            : "Nhãn dùng chung không tự gán công việc cho bạn."}
        </p>
      </form>
    </details>
  );
}
