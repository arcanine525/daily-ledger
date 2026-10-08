"use client";
import { useState } from "react";
import { runStateText } from "../ui-copy";
import { type ChatFilters, filtersSchema } from "./contracts";
import { ChatFilterFields } from "./filters";
import { ChatMessages } from "./messages";
import { useChat } from "./use-chat";
export function ChatThread({
  id,
  en,
  initialFilters,
}: {
  readonly id: string;
  readonly en: boolean;
  readonly initialFilters: ChatFilters;
}) {
  const chat = useChat(id),
    [question, setQuestion] = useState(""),
    [filters, setFilters] = useState(initialFilters),
    completed =
      chat.run?.steps.filter((step) => step.state === "succeeded").length ?? 0,
    total = chat.run?.snapshot.steps.length ?? 0;
  return (
    <section className="chat-thread">
      <ChatFilterFields
        value={filters}
        onChange={setFilters}
        en={en}
        disabled={chat.busy}
      />
      <p className="notice">
        {en
          ? "Read-only answers. Keep the page open; pause stops the next step. Meeting dates and deadlines are independent filters."
          : "Câu trả lời chỉ đọc. Giữ trang mở; tạm dừng ngăn bước tiếp theo. Ngày họp và deadline là hai bộ lọc riêng."}
      </p>
      {chat.run && (
        <section className="panel">
          <h2>{en ? "Reply progress" : "Tiến độ trả lời"}</h2>
          <progress
            aria-label={en ? "Saved steps" : "Bước đã lưu"}
            value={completed}
            max={Math.max(1, total)}
          />
          <p>
            {completed} / {total} ·{" "}
            {runStateText(chat.run.state, en ? "en" : "vi")}
          </p>
          <div className="cluster">
            <button type="button" onClick={chat.resume} disabled={chat.busy}>
              {en ? "Resume" : "Tiếp tục"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={chat.pause}
              disabled={!chat.busy}
            >
              {en ? "Pause after this step" : "Tạm dừng sau bước này"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                void chat.cancel();
              }}
            >
              {en ? "Cancel reply" : "Hủy trả lời"}
            </button>
          </div>
          <details>
            <summary>{en ? "Saved checkpoints" : "Checkpoint đã lưu"}</summary>
            {chat.run.steps.map((step) => (
              <p key={step.stepKey}>
                {step.stepKey} · {step.state} · {step.attempt}
              </p>
            ))}
          </details>
        </section>
      )}
      {chat.error && (
        <p role="alert" className="notice danger">
          {chat.error}
        </p>
      )}
      <ChatMessages
        messages={chat.messages}
        en={en}
        provisional={chat.provisional}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const text = question.trim();
          if (!text) return;
          void chat.send(text, filtersSchema.parse(filters)).then((saved) => {
            if (saved) setQuestion("");
          });
        }}
      >
        <label>
          {en ? "Question" : "Câu hỏi"}
          <textarea
            required
            maxLength={5000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={chat.busy || Boolean(chat.run)}
          />
        </label>
        <button type="submit" disabled={chat.busy || Boolean(chat.run)}>
          {en ? "Send" : "Gửi"}
        </button>
      </form>
    </section>
  );
}
