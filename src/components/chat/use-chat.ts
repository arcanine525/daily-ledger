"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { callApi } from "../api-client";
import {
  type ChatFilters,
  type ChatMessage,
  type ChatRun,
  chatRunSchema,
  messagesSchema,
  threadSchema,
} from "./contracts";
import { streamReply } from "./stream";
export function useChat(id: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [run, setRun] = useState<ChatRun | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [provisional, setProvisional] = useState("");
  const mounted = useRef(true),
    paused = useRef(false),
    driving = useRef(false),
    submitting = useRef(false),
    abort = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const data = messagesSchema.parse(
        await callApi(`/api/conversations/${id}/messages`),
      ),
      thread = threadSchema.parse(await callApi(`/api/conversations/${id}`));
    if (mounted.current) {
      setMessages(data);
      setRun(thread.run);
    }
    return thread.run;
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    void reload().catch((failure) =>
      setError(failure instanceof Error ? failure.message : "CHAT_LOAD_FAILED"),
    );
    return () => {
      mounted.current = false;
      paused.current = true;
      abort.current?.abort();
    };
  }, [reload]);
  async function loadRun(runId: string) {
    const current = chatRunSchema.parse(
      await callApi(`/api/chat-runs/${runId}`),
    );
    if (mounted.current) setRun(current);
    return current;
  }
  async function drive(initial: ChatRun) {
    if (driving.current) return;
    driving.current = true;
    paused.current = false;
    setBusy(true);
    setError("");
    setProvisional("");
    let current = initial;
    try {
      while (mounted.current && !paused.current) {
        if (["COMPLETED", "CANCELLED", "FAILED"].includes(current.state)) break;
        const next = current.snapshot.steps.find(
          (key) =>
            current.steps.find((step) => step.stepKey === key)?.state !==
            "succeeded",
        );
        if (!next) break;
        if (next === "answer") {
          const controller = new AbortController();
          abort.current = controller;
          await streamReply({
            runId: current.id,
            signal: controller.signal,
            onDelta: (text) => {
              if (mounted.current) setProvisional((value) => value + text);
            },
          });
        } else
          await callApi(`/api/chat-runs/${current.id}/step`, "POST", {
            stepKey: next,
          });
        current = await loadRun(current.id);
      }
      await reload();
      if (current.state === "COMPLETED") setProvisional("");
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "CHAT_FAILED");
        await reload();
      }
    } finally {
      driving.current = false;
      abort.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function send(question: string, filters: ChatFilters) {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const created = z.object({ id: z.string() }).parse(
        await callApi(`/api/conversations/${id}/messages`, "POST", {
          question,
          filters,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      await reload();
      await drive(await loadRun(created.id));
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "CHAT_FAILED");
      return false;
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function resume() {
    try {
      if (run) await drive(await loadRun(run.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "CHAT_FAILED");
    }
  }
  async function cancel() {
    if (!run) return;
    paused.current = true;
    try {
      await callApi(`/api/chat-runs/${run.id}/cancel`, "POST", {});
      abort.current?.abort();
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "CHAT_FAILED");
    }
  }
  return {
    messages,
    run,
    busy,
    error,
    provisional,
    send,
    resume,
    cancel,
    reload,
    pause: () => {
      paused.current = true;
    },
  };
}
