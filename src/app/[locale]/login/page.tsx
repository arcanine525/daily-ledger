"use client";

import type { FormEvent } from "react";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        password: data.get("password"),
      }),
    });
    if (!response.ok) {
      setError(
        response.status === 429
          ? "Vui lòng thử lại sau 15 phút."
          : "Email hoặc mật khẩu không hợp lệ.",
      );
      return;
    }
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "csrfToken" in body &&
      typeof body.csrfToken === "string"
    )
      sessionStorage.setItem("ledger_csrf", body.csrfToken);
    location.assign("/vi");
  }
  return (
    <main className="shell">
      <p className="eyebrow">DAILY LEDGER</p>
      <h1>Đăng nhập</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Mật khẩu
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button type="submit">Đăng nhập</button>
        {error && <p role="alert">{error}</p>}
        <p>
          Quên mật khẩu? Chủ sở hữu reset bằng{" "}
          <code>pnpm admin:reset-password</code> trên máy có quyền truy cập hạ
          tầng. Không mở đăng ký.
        </p>
      </form>
    </main>
  );
}
