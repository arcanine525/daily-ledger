import { expect, test } from "@playwright/test";

test("owner pastes analyzes verifies evidence approves and edits a meeting", async ({
  page,
  request,
}) => {
  const origin = "http://127.0.0.1:3100";
  const apiLogin = await request.post("/api/auth/login", {
    headers: { origin },
    data: { email: "browser@example.test", password: "browser-test-password" },
  });
  const headers = { origin, "x-csrf-token": (await apiLogin.json()).csrfToken };
  const project = (
    await (
      await request.post("/api/projects", {
        headers,
        data: { name: "UI Daily" },
      })
    ).json()
  ).id;
  await request.post(`/api/projects/${project}/participants`, {
    headers,
    data: { displayName: "Mai", isSelf: true, aliases: ["Mai"] },
  });
  const profile = (
    await (
      await request.post("/api/providers", {
        headers,
        data: {
          name: "UI fixture",
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:3201/v1",
          model: "fixture",
          token: "fixture-only-token",
        },
      })
    ).json()
  ).id;
  await request.patch("/api/settings", {
    headers,
    data: { analysisProfileId: profile, timezone: "UTC" },
  });
  await page.goto("/vi/login");
  await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/vi$/);
  await page.getByRole("link", { name: "Cuộc họp mới", exact: true }).click();
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Browser daily");
  await page
    .getByRole("combobox", { name: "Dự án", exact: true })
    .selectOption(project);
  await page
    .getByLabel("Thời gian cuộc họp", { exact: true })
    .fill("2026-10-07T09:00");
  await page
    .getByLabel("Transcript gốc", { exact: true })
    .fill("Mai: I will review the API tomorrow.");
  await page
    .getByRole("button", { name: "Lưu transcript gốc", exact: true })
    .click();
  await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]+$/);
  await page
    .getByRole("button", { name: "Phân tích / tiếp tục", exact: true })
    .click();
  await expect(
    page.getByText("Deterministic fixture summary", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Todo", exact: true }).click();
  await page.getByRole("button", { name: "Xem nguồn", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Xem / duyệt", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Trạng thái ban đầu", exact: true }),
  ).toHaveValue("TODO");
  await page
    .getByRole("button", { name: "Xác nhận duyệt", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sửa transcript", exact: true })
    .click();
  await page
    .getByLabel("Phiên bản mới", { exact: true })
    .fill("Mai: I will review the API tomorrow.\nMai: New correction.");
  await page
    .getByRole("button", { name: "Lưu phiên bản mới", exact: true })
    .click();
  await expect(page.getByText("v2", { exact: false }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
