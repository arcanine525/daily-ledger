import type { FormEvent } from "react";
import { useState } from "react";
import { callApi } from "./api-client";
import type { Profile, RunAction } from "./settings-contracts";

export function ProviderPanel({
  profiles,
  en,
  run,
}: {
  readonly profiles: readonly Profile[];
  readonly en: boolean;
  readonly run: RunAction;
}) {
  const [editing, setEditing] = useState<Profile | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      f = new FormData(form);
    const saved = await run(() =>
      callApi(
        editing ? `/api/providers/${editing.id}` : "/api/providers",
        editing ? "PATCH" : "POST",
        {
          name: f.get("name"),
          type: f.get("type"),
          baseUrl: f.get("baseUrl"),
          model: f.get("model"),
          ...(f.get("token") ? { token: f.get("token") } : {}),
        },
      ),
    );
    if (saved) {
      form.reset();
      setEditing(null);
    }
  }
  return (
    <section>
      <h2>{en ? "AI profiles" : "Cấu hình AI"}</h2>
      <p>
        {en
          ? "Tokens are write-only. Protocol adapters arrive in Task 9; no AI request is performed in Phase 1."
          : "Token chỉ nhập, không trả lại. Protocol adapters ở Task 9; Phase 1 chưa gọi AI."}
      </p>
      <ul>
        {profiles.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> · {p.type} · {p.model} ·{" "}
            {p.hasToken ? (en ? "Token saved" : "Đã lưu token") : "—"}{" "}
            <button type="button" onClick={() => setEditing(p)}>
              {en ? "Edit" : "Sửa"}
            </button>{" "}
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    en
                      ? "Delete credentials and cancel pending runs?"
                      : "Xóa token và hủy các run đang dùng cấu hình này?",
                  )
                )
                  run(() => callApi(`/api/providers/${p.id}`, "DELETE"));
              }}
            >
              {en ? "Delete" : "Xóa"}
            </button>{" "}
            <button
              type="button"
              onClick={() =>
                run(() => callApi(`/api/providers/${p.id}/test`, "POST", {}))
              }
            >
              {en ? "Check configuration" : "Kiểm tra cấu hình"}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={save} key={editing?.id ?? "new"}>
        <h3>
          {editing
            ? en
              ? "Edit profile"
              : "Sửa profile"
            : en
              ? "Add profile"
              : "Thêm profile"}
        </h3>
        <label>
          {en ? "Profile name" : "Tên profile"}
          <input name="name" defaultValue={editing?.name} required />
        </label>
        <label>
          {en ? "Protocol" : "Giao thức"}
          <select
            name="type"
            defaultValue={editing?.type ?? "openai-compatible"}
          >
            <option>openai-compatible</option>
            <option>anthropic</option>
            <option>gemini</option>
          </select>
        </label>
        <label>
          Base URL
          <input
            name="baseUrl"
            type="url"
            defaultValue={editing?.baseUrl ?? "https://api.openai.com/v1"}
            required
          />
        </label>
        <label>
          Model
          <input name="model" defaultValue={editing?.model} required />
        </label>
        <label>
          Token
          <input
            name="token"
            type="password"
            autoComplete="off"
            placeholder={editing ? "Để trống để giữ token cũ" : "Nhập token"}
          />
        </label>
        <button type="submit">{en ? "Save profile" : "Lưu profile"}</button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)}>
            {en ? "Cancel" : "Hủy"}
          </button>
        )}
      </form>
    </section>
  );
}
