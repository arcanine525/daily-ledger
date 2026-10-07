"use client";
import Link from "next/link";
import { useResource } from "./use-resource";
import { meetingList, pendingSchema } from "./workspace-schemas";
export function Dashboard({ locale }: { readonly locale: "vi" | "en" }) {
  const en = locale === "en",
    meetings = useResource("/api/meetings", meetingList),
    pending = useResource("/api/task-proposals", pendingSchema);
  return (
    <main className="workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DAILY LEDGER</p>
          <h1>
            {en
              ? "Your daily work, remembered."
              : "Ghi lại cuộc họp. Theo dõi công việc."}
          </h1>
          <p>
            {en
              ? "Original transcripts, confirmed work and clear provenance."
              : "Transcript gốc, công việc đã xác nhận và nguồn rõ ràng."}
          </p>
        </div>
        <Link className="button" href={`/${locale}/meetings/new`}>
          {en ? "New meeting" : "Cuộc họp mới"}
        </Link>
      </header>
      <div className="split-grid">
        <section className="panel">
          <header className="page-heading">
            <h2>{en ? "Recent meetings" : "Cuộc họp gần đây"}</h2>
            <Link href={`/${locale}/meetings`}>
              {en ? "All meetings" : "Tất cả"}
            </Link>
          </header>
          {meetings.data?.items.slice(0, 6).map((meeting) => (
            <article key={meeting.id}>
              <Link href={`/${locale}/meetings/${meeting.id}`}>
                {meeting.title}
              </Link>
              <small>
                {new Date(meeting.occurredAt).toLocaleDateString(locale)} · v
                {meeting.currentRevisionNumber}
              </small>
            </article>
          ))}
          {meetings.data?.items.length === 0 && (
            <p className="empty">
              {en
                ? "Save your first daily transcript."
                : "Lưu transcript daily đầu tiên của bạn."}
            </p>
          )}
        </section>
        <section className="panel">
          <header className="page-heading">
            <h2>{en ? "Awaiting review" : "Hàng chờ duyệt"}</h2>
            <span className="badge">
              {pending.data?.filter((item) => item.state === "PENDING")
                .length ?? 0}
            </span>
          </header>
          {pending.data
            ?.filter((item) => item.state === "PENDING")
            .slice(0, 4)
            .map((item) => (
              <article key={item.id}>
                <span className="badge">{item.kind}</span> {item.action.title}
              </article>
            ))}
          <Link className="button secondary" href={`/${locale}/pending`}>
            {en ? "Open review inbox" : "Mở hộp chờ duyệt"}
          </Link>
          <p className="muted">
            {en
              ? "Suggestions do not change tasks until approved."
              : "Đề xuất không thay đổi task trước khi được duyệt."}
          </p>
        </section>
      </div>
      <Link href={`/${locale}/settings`}>
        {en ? "Open workspace settings" : "Mở cài đặt workspace"}
      </Link>
    </main>
  );
}
