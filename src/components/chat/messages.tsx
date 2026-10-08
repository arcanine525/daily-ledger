"use client";
import type { ChatMessage } from "./contracts";
import { replySchema } from "./contracts";
import { TaskGroups } from "./groups";
import { ChatSource } from "./source";

function parseReply(body: string) {
  try {
    const reply = replySchema.safeParse(JSON.parse(body));
    return reply.success ? reply.data : null;
  } catch {
    return null;
  }
}
export function ChatMessages({
  messages,
  en,
  provisional,
}: {
  readonly messages: readonly ChatMessage[];
  readonly en: boolean;
  readonly provisional: string;
}) {
  return (
    <section
      className="chat-messages"
      aria-label={en ? "Conversation history" : "Lịch sử trò chuyện"}
    >
      {messages.map((message) => {
        const reply =
          message.role === "assistant" && message.state === "complete"
            ? parseReply(message.body)
            : null;
        return (
          <article
            className={`chat-message chat-${message.role}`}
            key={message.id}
          >
            <header className="cluster">
              <strong>
                {message.role === "user"
                  ? en
                    ? "You"
                    : "Bạn"
                  : en
                    ? "Assistant"
                    : "Trợ lý"}
              </strong>
              <span className="badge">
                {reply
                  ? en
                    ? "Verified"
                    : "Đã xác thực"
                  : message.state !== "complete"
                    ? en
                      ? "Incomplete"
                      : "Chưa hoàn tất"
                    : new Date(message.createdAt).toLocaleString(
                        en ? "en" : "vi",
                      )}
              </span>
            </header>
            <p className="chat-text">{reply?.text ?? message.body}</p>
            {!message.contextEligible && (
              <p className="muted">
                {en
                  ? "View only; excluded from future context"
                  : "Chỉ để xem; không dùng làm ngữ cảnh mới"}
              </p>
            )}
            {reply?.sections.appState && <TaskGroups reply={reply} en={en} />}{" "}
            {reply?.sections.meetingEvidence && (
              <section>
                <h3>{en ? "Meeting evidence" : "Thông tin từ cuộc họp"}</h3>
                {reply.sections.meetingEvidence.map((meeting) => (
                  <details key={meeting.meetingId}>
                    <summary>
                      {meeting.title} · {meeting.occurredAt}
                    </summary>
                    <pre>{JSON.stringify(meeting.summary, null, 2)}</pre>
                  </details>
                ))}
              </section>
            )}
            {reply && (
              <p className="muted">
                {reply.coverage.exhaustive
                  ? en
                    ? "All scoped sources processed"
                    : "Đã xử lý mọi nguồn trong phạm vi"
                  : en
                    ? "Top-ranked evidence only, not exhaustive"
                    : "Chỉ bằng chứng được xếp hạng, không bao quát toàn bộ"}{" "}
                · {reply.coverage.meetingIds.length}{" "}
                {en ? "meetings" : "cuộc họp"}
              </p>
            )}
            <details>
              <summary>{en ? "Saved filters" : "Bộ lọc đã lưu"}</summary>
              <pre>{JSON.stringify(message.filters, null, 2)}</pre>
            </details>
            <div className="chat-citations">
              {message.citations.map((citation) => (
                <ChatSource
                  key={citation.id}
                  id={citation.id}
                  label={citation.label}
                  deleted={citation.sourceDeleted}
                  en={en}
                />
              ))}
            </div>
          </article>
        );
      })}
      {provisional && (
        <article className="chat-message">
          <span className="badge">
            {en ? "Provisional, not verified" : "Đang tạo, chưa xác thực"}
          </span>
          <p className="chat-text" aria-live="polite">
            {provisional}
          </p>
        </article>
      )}
    </section>
  );
}
