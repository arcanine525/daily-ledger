import { expect, test } from "@playwright/test";

test("shows a generic error for wrong credentials", async ({ page }) => {
  await page.goto("/vi/login");
  await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
