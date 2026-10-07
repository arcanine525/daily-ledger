import { expect, test } from "@playwright/test";

test("owner can configure identity provider and project through the UI", async ({
  page,
}) => {
  await page.goto("/vi/login");
  await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/vi$/);
  await page.getByRole("link", { name: "Mở cài đặt workspace" }).click();
  await page.getByLabel("Tên của bạn", { exact: true }).fill("Mai Test");
  await page
    .getByLabel("Tên gọi (mỗi dòng một tên)", { exact: true })
    .fill("Mai\nmai.test");
  await page.getByLabel("Múi giờ", { exact: true }).fill("Asia/Ho_Chi_Minh");
  await page.getByRole("button", { name: "Lưu cài đặt", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  await page.getByLabel("Tên profile", { exact: true }).fill("Fixture AI");
  await page.getByLabel("Model", { exact: true }).fill("mock-model");
  await page.getByLabel("Token", { exact: true }).fill("fixture-only-token");
  await page.getByRole("button", { name: "Lưu profile", exact: true }).click();
  await expect(
    page.locator("strong").filter({ hasText: "Fixture AI" }),
  ).toBeVisible();
  await expect(page.getByLabel("Token", { exact: true })).toHaveValue("");
  await page.getByLabel("Tên dự án", { exact: true }).fill("Browser Project");
  await page.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Project", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tên người tham gia", { exact: true }).fill("Alex");
  await page.getByRole("button", { name: "Thêm người", exact: true }).click();
  await expect(page.getByText("Alex", { exact: false }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
