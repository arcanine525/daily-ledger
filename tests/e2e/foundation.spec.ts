import { expect, test } from "@playwright/test";

test("visitors can view the bilingual foundation", async ({ page }) => {
  await page.goto("/vi");
  await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/vi$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(
    page.getByRole("heading", { name: "Your daily work, remembered." }),
  ).toBeVisible();
});
test("unsupported locales are rejected", async ({ request }) => {
  const response = await request.get("/zz");
  expect(response.status()).toBe(404);
});
