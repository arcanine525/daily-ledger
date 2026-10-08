"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { callApi } from "./api-client";
import { PreferencesPanel } from "./preferences-panel";
import { ProjectPanel } from "./project-panel";
import { ProviderPanel } from "./provider-panel";
import type { Profile, Project, Settings } from "./settings-contracts";
import {
  profilesSchema,
  projectsSchema,
  settingsSchema,
} from "./settings-contracts";
import { errorText } from "./ui-copy";

export function Management({ locale }: { readonly locale: "vi" | "en" }) {
  const en = locale === "en";
  const [settings, setSettings] = useState<Settings | null>(null),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const [s, p, r] = await Promise.all([
      callApi("/api/settings"),
      callApi("/api/providers"),
      callApi("/api/projects"),
    ]);
    let parsed = settingsSchema.parse(s);
    if (parsed.timezone === null) {
      await callApi("/api/settings", "PATCH", {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        initializeTimezone: true,
      });
      parsed = settingsSchema.parse(await callApi("/api/settings"));
    }
    setSettings(parsed);
    setProfiles(profilesSchema.parse(p));
    setProjects(projectsSchema.parse(r));
  }, []);
  useEffect(() => {
    load().catch((error) =>
      setMessage(
        errorText(
          error instanceof Error ? error.message : "REQUEST_FAILED",
          locale,
        ),
      ),
    );
  }, [load, locale]);
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
      setMessage(en ? "Saved" : "Đã lưu");
      return true;
    } catch (error) {
      setMessage(
        errorText(
          error instanceof Error ? error.message : "REQUEST_FAILED",
          locale,
        ),
      );
      return false;
    }
  }
  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const saved = await run(() =>
      callApi("/api/settings", "PATCH", {
        displayName: f.get("displayName"),
        uiLocale: f.get("uiLocale"),
        outputLocale: f.get("outputLocale"),
        timezone: f.get("timezone"),
        aliases: String(f.get("aliases"))
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        analysisProfileId: f.get("analysis") || null,
        chatProfileId: f.get("chat") || null,
      }),
    );
    if (saved && f.get("uiLocale") !== locale)
      location.assign(`/${f.get("uiLocale")}/settings`);
  }
  return (
    <main className="workspace">
      <nav>
        <Link href={`/${locale}`}>
          {en ? "Workspace" : "Không gian làm việc"}
        </Link>
        <Link href="/vi/settings">VI</Link>
        <Link href="/en/settings">EN</Link>
        <button
          type="button"
          onClick={() =>
            run(async () => {
              await callApi("/api/auth/logout", "POST", {});
              sessionStorage.removeItem("ledger_csrf");
              location.assign(`/${locale}/login`);
            })
          }
        >
          {en ? "Sign out" : "Đăng xuất"}
        </button>
      </nav>
      <p className="eyebrow">DAILY LEDGER</p>
      <h1>{en ? "Workspace settings" : "Cài đặt workspace"}</h1>
      {message && <p role="status">{message}</p>}
      {settings ? (
        <PreferencesPanel
          settings={settings}
          profiles={profiles}
          en={en}
          onSave={savePreferences}
        />
      ) : (
        <p>{en ? "Loading…" : "Đang tải…"}</p>
      )}
      <ProviderPanel profiles={profiles} en={en} run={run} />
      <ProjectPanel projects={projects} en={en} run={run} />
    </main>
  );
}
