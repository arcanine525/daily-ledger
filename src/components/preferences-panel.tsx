import type { FormEvent } from "react";
import type { Profile, Settings } from "./settings-contracts";

export function PreferencesPanel({
  settings,
  profiles,
  en,
  onSave,
}: {
  readonly settings: Settings;
  readonly profiles: readonly Profile[];
  readonly en: boolean;
  readonly onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="panel">
      <h2>{en ? "Identity & preferences" : "Danh tính và tùy chọn"}</h2>
      <form onSubmit={onSave} key={JSON.stringify(settings)}>
        <label>
          {en ? "Your name" : "Tên của bạn"}
          <input name="displayName" defaultValue={settings.displayName} />
        </label>
        <label>
          {en ? "Aliases (one per line)" : "Tên gọi (mỗi dòng một tên)"}
          <textarea name="aliases" defaultValue={settings.aliases.join("\n")} />
        </label>
        <label>
          {en ? "Interface language" : "Ngôn ngữ giao diện"}
          <select name="uiLocale" defaultValue={en ? "en" : "vi"}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {en ? "Analysis language" : "Ngôn ngữ phân tích"}
          <select name="outputLocale" defaultValue={settings.outputLocale}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {en ? "Timezone" : "Múi giờ"}
          <input
            name="timezone"
            defaultValue={
              settings.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
            }
            required
          />
        </label>
        <label>
          {en ? "Analysis provider" : "Provider phân tích"}
          <select
            name="analysis"
            defaultValue={settings.analysisProfileId ?? ""}
          >
            <option value="">—</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en ? "Chat provider" : "Provider chat"}
          <select name="chat" defaultValue={settings.chatProfileId ?? ""}>
            <option value="">—</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{en ? "Save settings" : "Lưu cài đặt"}</button>
      </form>
    </section>
  );
}
