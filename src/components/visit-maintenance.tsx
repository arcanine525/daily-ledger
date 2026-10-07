"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ClientError, callApi } from "./api-client";

const resultSchema = z.object({
  purged: z.number(),
  hasMore: z.boolean(),
  busy: z.boolean(),
});
export function VisitMaintenance({ locale }: { readonly locale: "vi" | "en" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function maintain() {
      await callApi("/api/auth/session");
      while (active) {
        const result = resultSchema.parse(
          await callApi("/api/maintenance/purge-expired", "POST"),
        );
        if (!result.hasMore || result.busy) break;
      }
    }
    void maintain().catch((error) => {
      if (error instanceof ClientError && error.code === "UNAUTHENTICATED")
        return;
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return failed ? (
    <p className="notice" role="status">
      {locale === "en"
        ? "Trash cleanup could not finish. It will retry on your next visit."
        : "Chưa dọn xong thùng rác. Hệ thống sẽ thử lại khi bạn truy cập lần sau."}
    </p>
  ) : null;
}
