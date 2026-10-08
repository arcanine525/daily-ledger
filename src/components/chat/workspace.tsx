"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { callApi } from "../api-client";
import { useResource } from "../use-resource";
import { filtersSchema, threadsSchema } from "./contracts";
import { ChatThread } from "./thread";
import "./chat.css";
export function ChatWorkspace({ locale }: { readonly locale: "vi" | "en" }) {
  const en = locale === "en",
    search = useSearchParams(),
    router = useRouter(),
    threads = useResource("/api/conversations", threadsSchema),
    id = search.get("conversation"),
    [title, setTitle] = useState(""),
    [error, setError] = useState("");
  function select(threadId: string) {
    const params = new URLSearchParams(search);
    params.set("conversation", threadId);
    router.replace(`/${locale}/chat?${params}`);
  }
  async function create() {
    try {
      const conversation = z
        .object({ id: z.string() })
        .parse(await callApi("/api/conversations", "POST", { title }));
      await threads.reload();
      setTitle("");
      select(conversation.id);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "CONVERSATION_FAILED",
      );
    }
  }
  const initialFilters = filtersSchema.parse({
    scope: "ALL",
    ...(search.get("project") ? { projectId: search.get("project") } : {}),
    ...(search.get("meeting") ? { meetingId: search.get("meeting") } : {}),
  });
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DAILY LEDGER</p>
          <h1>{en ? "Ask your daily record" : "Hỏi nhật ký công việc"}</h1>
          <p>
            {en
              ? "Grounded answers, never task mutations."
              : "Câu trả lời có nguồn, không thay đổi công việc."}
          </p>
        </div>
      </header>
      <div className="chat-layout">
        <aside className="panel chat-threads">
          <h2>{en ? "Conversations" : "Cuộc trò chuyện"}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label>
              {en ? "Conversation title" : "Tên cuộc trò chuyện"}
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <button type="submit">
              {en ? "New conversation" : "Cuộc trò chuyện mới"}
            </button>
          </form>
          {threads.data?.map((thread) => (
            <button
              className={id === thread.id ? "" : "secondary"}
              type="button"
              key={thread.id}
              onClick={() => select(thread.id)}
              aria-pressed={id === thread.id}
            >
              {thread.title}
            </button>
          ))}
        </aside>
        <div className="chat-pane">
          {error || threads.error ? (
            <p role="alert">{error || threads.error}</p>
          ) : null}
          {id ? (
            <ChatThread
              key={id}
              id={id}
              en={en}
              initialFilters={initialFilters}
            />
          ) : (
            <div className="empty">
              {en
                ? "Choose a conversation or create one to start."
                : "Chọn hoặc tạo cuộc trò chuyện để bắt đầu."}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
