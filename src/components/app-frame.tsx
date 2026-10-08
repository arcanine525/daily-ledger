"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { ClientError, callApi } from "./api-client";
import { useUiError } from "./use-ui-error";
import { VisitMaintenance } from "./visit-maintenance";

export function AppFrame({
  locale,
  children,
}: {
  readonly locale: "vi" | "en";
  readonly children: ReactNode;
}) {
  const pathname = usePathname(),
    en = locale === "en";
  const search = useSearchParams().toString();
  const [localeError, setLocaleError] = useUiError();
  useEffect(() => {
    document.documentElement.lang = locale;
    void cookieStore.set({
      name: "ledger_locale",
      value: locale,
      path: "/",
      expires: Date.now() + 31536000000,
      sameSite: "lax",
    });
  }, [locale]);
  function remember(next: "en" | "vi") {
    void cookieStore.set({
      name: "ledger_locale",
      value: next,
      path: "/",
      expires: Date.now() + 31536000000,
      sameSite: "lax",
    });
    void callApi("/api/settings", "PATCH", { uiLocale: next }).catch(
      (error) => {
        if (error instanceof ClientError && error.code === "UNAUTHENTICATED")
          return;
        setLocaleError(
          error instanceof Error ? error.message : "LOCALE_SAVE_FAILED",
        );
      },
    );
  }
  if (pathname.endsWith("/login")) return children;
  const links = [
    ["", en ? "Overview" : "Tổng quan"],
    ["meetings", en ? "Meetings" : "Cuộc họp"],
    ["pending", en ? "Review inbox" : "Hộp chờ duyệt"],
    ["tasks", en ? "Tasks" : "Công việc"],
    ["chat", en ? "Chat" : "Trò chuyện"],
    ["trash", en ? "Trash" : "Thùng rác"],
    ["projects", en ? "Projects" : "Dự án"],
    ["settings", en ? "Settings" : "Cài đặt"],
  ] as const;
  return (
    <div className="ledger-app">
      <aside className="ledger-sidebar">
        <Link className="ledger-brand" href={`/${locale}`}>
          <span className="brand-mark">DL</span>Daily Ledger
        </Link>
        <small>{en ? "PERSONAL WORKSPACE" : "WORKSPACE CÁ NHÂN"}</small>
        <nav aria-label={en ? "Primary navigation" : "Điều hướng chính"}>
          {links.map(([path, title]) => (
            <Link
              key={path}
              className={
                pathname === `/${locale}${path ? `/${path}` : ""}` ||
                (path && pathname.startsWith(`/${locale}/${path}/`))
                  ? "active"
                  : ""
              }
              href={`/${locale}${path ? `/${path}` : ""}`}
            >
              {title}
            </Link>
          ))}
        </nav>
        <p>
          {en
            ? "A record of your daily work."
            : "Cuộc họp được nhớ. Công việc được theo dõi."}
        </p>
      </aside>
      <div className="ledger-body">
        <header className="ledger-header">
          <span>{en ? "Your daily record" : "Nhật ký công việc của bạn"}</span>
          <div className="cluster">
            <Link
              aria-label="Tiếng Việt"
              href={`${pathname.replace(`/${locale}`, "/vi")}${search ? `?${search}` : ""}`}
              onClick={() => remember("vi")}
            >
              VI
            </Link>
            <Link
              aria-label="English"
              href={`${pathname.replace(`/${locale}`, "/en")}${search ? `?${search}` : ""}`}
              onClick={() => remember("en")}
            >
              EN
            </Link>
          </div>
        </header>
        <div className="ledger-content">
          <VisitMaintenance locale={locale} />
          {localeError && (
            <p className="notice danger" role="alert">
              {localeError}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
