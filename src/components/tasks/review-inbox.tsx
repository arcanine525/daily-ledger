"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { z } from "zod";
import { requestApi } from "../api-client";
import { useResource } from "../use-resource";
import { pendingSchema } from "../workspace-schemas";
import { ApprovalDialog } from "./approval-dialog";

export function ReviewInbox({
  locale,
  meetingId,
  onChange,
}: {
  readonly locale: "vi" | "en";
  readonly meetingId?: string;
  readonly onChange?: () => Promise<void>;
}) {
  const en = locale === "en",
    resource = useResource("/api/task-proposals", pendingSchema),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<
      z.infer<typeof pendingSchema>[number] | null
    >(null),
    [busy, setBusy] = useState(false),
    key = useRef(crypto.randomUUID());
  const items =
    resource.data?.filter(
      (item) => !meetingId || item.action.meeting.id === meetingId,
    ) ?? [];
  async function changed() {
    await resource.reload();
    if (onChange) await onChange();
  }
  async function reject(id: string) {
    setBusy(true);
    try {
      await requestApi(`/api/task-proposals/${id}/decision`, {
        method: "POST",
        body: { decision: "REJECT" },
        key: crypto.randomUUID(),
      });
      await changed();
    } catch (failure) {
      resource.setError(
        failure instanceof Error ? failure.message : "REJECT_FAILED",
      );
    } finally {
      setBusy(false);
    }
  }
  async function bulk() {
    setBusy(true);
    try {
      await requestApi("/api/task-proposals/bulk-create", {
        method: "POST",
        key: key.current,
        body: { proposalIds: selected },
      });
      setSelected([]);
      key.current = crypto.randomUUID();
      await changed();
    } catch (failure) {
      resource.setError(
        failure instanceof Error ? failure.message : "BULK_FAILED",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <header className="page-heading">
        <div>
          <h1>{en ? "Review inbox" : "Hộp chờ duyệt"}</h1>
          <p>
            {en
              ? "Suggestions are not tasks until you confirm."
              : "Đề xuất chưa trở thành công việc chính thức cho đến khi bạn duyệt."}
          </p>
        </div>
        <button
          disabled={busy || !selected.length}
          type="button"
          onClick={bulk}
        >
          {en ? "Approve selected new tasks" : "Duyệt việc mới đã chọn"} (
          {selected.length})
        </button>
      </header>
      <p className="notice">
        {en
          ? "Bulk only applies to new, non-duplicate CREATE proposals. Every new task starts as To do."
          : "Chỉ duyệt hàng loạt CREATE không nghi trùng. Mọi task tạo theo lô bắt đầu ở Cần làm."}
      </p>
      {resource.error && (
        <p role="alert" className="notice danger">
          {resource.error}
        </p>
      )}
      {!items.length && (
        <p className="empty">
          {en ? "Nothing awaiting review." : "Không có đề xuất chờ duyệt."}
        </p>
      )}
      <div className="stack">
        {items.map((item) => (
          <article className="panel" key={item.id}>
            <header className="page-heading">
              <div className="cluster">
                {item.kind === "CREATE" &&
                  !item.changes.requiresReconciliation &&
                  item.state === "PENDING" && (
                    <input
                      aria-label={`${en ? "Select" : "Chọn"} ${item.action.title}`}
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                  )}
                <span className="badge">{item.kind}</span>
                <h2>{item.action.title}</h2>
              </div>
              <span
                className={`badge ${item.state === "STALE" ? "danger" : ""}`}
              >
                {item.state === "STALE"
                  ? en
                    ? "Stale · blocked"
                    : "Lỗi thời · bị chặn"
                  : en
                    ? "Awaiting review"
                    : "Chờ duyệt"}
              </span>
            </header>
            <p className="muted">
              <Link href={`/${locale}/meetings/${item.action.meeting.id}`}>
                {item.action.meeting.title}
              </Link>{" "}
              · {item.action.meeting.project.name}
            </p>
            <p>
              {item.action.assignees.map((p) => p.name).join(", ") ||
                (en ? "Unassigned" : "Chưa xác định")}{" "}
              · {item.action.dueDate?.slice(0, 10) ?? "—"}
            </p>
            {item.kind !== "CREATE" && (
              <div className="diff-grid">
                <pre>{JSON.stringify(item.changes.before, null, 2)}</pre>
                <pre>{JSON.stringify(item.changes.after, null, 2)}</pre>
              </div>
            )}
            {item.changes.requiresReconciliation && (
              <p className="notice warning">
                {en
                  ? "Possible duplicate; explicit reconciliation required."
                  : "Nghi trùng; cần đối chiếu rõ trước khi duyệt."}
              </p>
            )}
            <blockquote>{item.evidence.quote}</blockquote>
            <div className="cluster">
              <button
                disabled={busy || item.state !== "PENDING"}
                type="button"
                onClick={() => setReview(item)}
              >
                {en ? "Review / approve" : "Xem / duyệt"}
              </button>
              <button
                className="secondary"
                disabled={busy || item.state !== "PENDING"}
                type="button"
                onClick={() => reject(item.id)}
              >
                {en ? "Reject" : "Từ chối"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {review && (
        <ApprovalDialog
          proposal={review}
          action={{
            ...review.action,
            projectId: review.action.meeting.projectId,
          }}
          locale={locale}
          onClose={() => setReview(null)}
          onSaved={changed}
        />
      )}
    </div>
  );
}
