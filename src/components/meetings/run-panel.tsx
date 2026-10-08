"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { callApi } from "../api-client";
import { runStateText } from "../ui-copy";
import { useUiError } from "../use-ui-error";
import type { Meeting } from "../workspace-schemas";
import { runSchema } from "../workspace-schemas";

export function RunPanel({
  meeting,
  locale,
  onPublished,
}: {
  readonly meeting: Meeting;
  readonly locale: "vi" | "en";
  readonly onPublished: () => Promise<void>;
}) {
  const en = locale === "en",
    [run, setRun] = useState<z.infer<typeof runSchema> | null>(null),
    [error, setError] = useUiError(),
    [working, setWorking] = useState(false);
  const pause = useRef(false),
    mounted = useRef(true);
  const load = useCallback(async (id: string) => {
    const next = runSchema.parse(await callApi(`/api/analysis-runs/${id}`));
    if (mounted.current) setRun(next);
    return next;
  }, []);
  useEffect(() => {
    mounted.current = true;
    callApi(`/api/meetings/${meeting.id}/analysis-runs`)
      .then((value) => {
        const rows = z
          .array(z.object({ id: z.string(), state: z.string() }))
          .parse(value);
        if (rows[0]) return load(rows[0].id);
        return undefined;
      })
      .catch((failure) =>
        setError(
          failure instanceof Error ? failure.message : "RUN_LOAD_FAILED",
        ),
      );
    return () => {
      mounted.current = false;
      pause.current = true;
    };
  }, [meeting.id, load, setError]);
  async function start() {
    setError("");
    try {
      const created = z
        .object({ id: z.string() })
        .parse(
          await callApi(
            `/api/meetings/${meeting.id}/analysis-runs`,
            "POST",
            {},
          ),
        );
      const next = await load(created.id);
      await drive(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "ANALYSIS_FAILED");
    }
  }
  async function drive(initial: z.infer<typeof runSchema>) {
    if (working) return;
    pause.current = false;
    setWorking(true);
    setError("");
    let current = initial;
    try {
      while (!pause.current && mounted.current) {
        const next = current.snapshot.steps.find(
          (key) =>
            current.steps.find((step) => step.key === key)?.state !==
            "succeeded",
        );
        if (!next) break;
        await callApi(`/api/analysis-runs/${current.id}/step`, "POST", {
          stepKey: next,
        });
        current = await load(current.id);
      }
      if (current.state === "COMPLETED") await onPublished();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "ANALYSIS_FAILED");
      await load(current.id);
    } finally {
      if (mounted.current) setWorking(false);
    }
  }
  async function resume() {
    if (run) await drive(await load(run.id));
    else await start();
  }
  const completed =
      run?.steps.filter((step) => step.state === "succeeded").length ?? 0,
    total = run?.snapshot.steps.length ?? 0;
  return (
    <section className="panel">
      <header className="page-heading">
        <h2>{en ? "Analysis" : "Phân tích AI"}</h2>
        <span className="badge">
          {runStateText(
            run?.state ?? (meeting.activeAnalysisId ? "COMPLETED" : "READY"),
            locale,
          )}
        </span>
      </header>
      <p className="notice">
        {en
          ? "Keep this page open. Pausing stops the next step; closing a tab does not guarantee background completion. Resume from saved checkpoints."
          : "Giữ trang mở. Tạm dừng ngăn bước tiếp theo; đóng tab không bảo đảm chạy nền. Có thể tiếp tục từ checkpoint đã lưu."}
      </p>
      {run && (
        <>
          <progress max={Math.max(1, total)} value={completed} />
          <p>
            {completed} / {total} {en ? "steps saved" : "bước đã lưu"}
          </p>
        </>
      )}
      <div className="cluster">
        <button
          type="button"
          onClick={
            run && !["COMPLETED", "CANCELLED", "FAILED"].includes(run.state)
              ? resume
              : start
          }
          disabled={working}
        >
          {meeting.activeAnalysisId
            ? en
              ? "Analyze again"
              : "Phân tích lại"
            : en
              ? "Analyze / resume"
              : "Phân tích / tiếp tục"}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={!working}
          onClick={() => {
            pause.current = true;
          }}
        >
          {en ? "Pause after this step" : "Tạm dừng sau bước này"}
        </button>
        {run && (
          <button
            className="secondary"
            type="button"
            onClick={async () => {
              if (
                confirm(
                  en
                    ? "Cancel this run? Submitted provider requests may still be billed."
                    : "Hủy run này? Request đã gửi vẫn có thể tính phí.",
                )
              ) {
                pause.current = true;
                await callApi(
                  `/api/analysis-runs/${run.id}/cancel`,
                  "POST",
                  {},
                );
                await load(run.id);
              }
            }}
          >
            {en ? "Cancel run" : "Hủy run"}
          </button>
        )}
      </div>
      {error && (
        <div className="notice danger" role="alert">
          <p>{error}</p>
          {run && (
            <button type="button" onClick={resume} disabled={working}>
              {en ? "Retry / resume" : "Thử lại / tiếp tục"}
            </button>
          )}
        </div>
      )}
      <details>
        <summary>
          {en ? "Run and checkpoint details" : "Chi tiết run / checkpoint"}
        </summary>
        {run?.steps.map((step) => (
          <p key={step.key}>
            {step.key} · {step.state} · {step.attempt}{" "}
            {step.error && JSON.stringify(step.error)}
          </p>
        ))}
      </details>
    </section>
  );
}
