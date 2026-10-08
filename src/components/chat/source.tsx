"use client";
import { useState } from "react";
import type { z } from "zod";
import { callApi } from "../api-client";
import { Modal } from "../source-dialog";
import { sourceSchema } from "./contracts";
export function ChatSource({
  id,
  label,
  deleted,
  en,
}: {
  readonly id: string;
  readonly label: string;
  readonly deleted: boolean;
  readonly en: boolean;
}) {
  const [source, setSource] = useState<z.infer<typeof sourceSchema> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    setError("");
    try {
      setSource(sourceSchema.parse(await callApi(`/api/citations/${id}`)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "SOURCE_FAILED");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="chat-citation">
      <button
        type="button"
        className="secondary"
        disabled={deleted || loading}
        onClick={open}
      >
        {label}
      </button>
      {deleted && (
        <span className="badge">
          {en ? "Source deleted" : "Nguồn đã bị xóa"}
        </span>
      )}
      {error && <p role="alert">{error}</p>}
      {source && (
        <Modal
          title={source.label}
          onClose={() => setSource(null)}
          locale={en ? "en" : "vi"}
        >
          {source.kind === "TRANSCRIPT" ? (
            <>
              <p>
                v{source.revisionNumber} · {source.start}–{source.end} UTF-16
              </p>
              <blockquote>
                {source.quote ??
                  (en ? "Source provenance" : "Nguồn tham chiếu")}
              </blockquote>
              <pre>{source.rawText}</pre>
            </>
          ) : (
            <>
              <p>
                {en ? "Application history" : "Lịch sử trong ứng dụng"} ·{" "}
                {source.recordedAt}
              </p>
              <pre>{JSON.stringify(source.state, null, 2)}</pre>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
