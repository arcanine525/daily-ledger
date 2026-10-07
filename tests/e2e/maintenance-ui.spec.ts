import { expect, test } from "@playwright/test";

test("a cleanup failure remains visible and readable after browser login in both locales", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/maintenance/purge-expired", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "FIXTURE_MAINTENANCE_FAILURE" }),
    }),
  );
  await page.goto("/vi/login");
  await page.getByLabel("Email").fill("browser@example.test");
  await page.getByLabel("Mật khẩu").fill("browser-test-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Chưa dọn xong thùng rác",
  );
  for (const locale of ["vi", "en"]) {
    await page.goto(`/${locale}`);
    await expect(page.getByRole("status")).toContainText(
      locale === "vi" ? "Chưa dọn xong" : "Trash cleanup could not finish",
    );
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page
          .locator("body")
          .evaluate((element) => element.scrollWidth > window.innerWidth),
      ).toBe(false);
      await page.screenshot({
        path: `.omo/evidence/task-15-plan/maintenance-${locale}-${width}.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});
