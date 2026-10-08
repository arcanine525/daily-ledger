import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.setTimeout(180000);
test("trash UI supports keyboard restore and exact-title purge confirmation", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:3100",
    login = await page.request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: "browser@example.test",
        password: "browser-test-password",
      },
    }),
    headers = { origin, "x-csrf-token": (await login.json()).csrfToken };
  const projectId = (
      await (
        await page.request.post("/api/projects", {
          headers,
          data: { name: "Trash UI" },
        })
      ).json()
    ).id,
    title =
      "Cuộc họp với tiêu đề tiếng Việt rất dài để kiểm tra giao diện và bàn phím",
    meeting = (
      await (
        await page.request.post("/api/meetings", {
          headers: { ...headers, "Idempotency-Key": "trash-ui" },
          data: {
            projectId,
            title,
            occurredAt: "2026-10-07T02:00:00Z",
            meetingTimezone: "UTC",
            rawText: "Mai: Trash interface fixture.",
          },
        })
      ).json()
    ).id;
  await page.goto(`/en/meetings/${meeting}`);
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("chat");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/trash$/);
  const card = page.getByRole("article").filter({ hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Restore", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveCount(0);
  await page.request.post(`/api/meetings/${meeting}/trash`, { headers });
  await page.reload();
  await card
    .getByRole("button", { name: "Permanently delete", exact: true })
    .click();
  const dialog = page.getByRole("dialog"),
    confirm = dialog.getByRole("button", {
      name: "Permanently delete",
      exact: true,
    });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Confirmation title").fill("wrong");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Confirmation title").fill(title);
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(card).toHaveCount(0);
  expect((await page.request.get(`/api/meetings/${meeting}`)).status()).toBe(
    404,
  );
});
test("locale switching preserves thread queries and persists independently of analysis language", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:3100",
    login = await page.request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: "browser@example.test",
        password: "browser-test-password",
      },
    }),
    headers = { origin, "x-csrf-token": (await login.json()).csrfToken },
    before = await (await page.request.get("/api/settings")).json(),
    thread = (
      await (
        await page.request.post("/api/conversations", {
          headers,
          data: { title: "Locale thread" },
        })
      ).json()
    ).id;
  await page.goto(`/vi/chat?conversation=${thread}`);
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/chat\\?conversation=${thread}$`),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  expect(
    (await (await page.request.get("/api/settings")).json()).outputLocale,
  ).toBe(before.outputLocale);
});
test("all bilingual app routes pass serious/critical axe checks and responsive overflow checks", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:3100";
  await page.request.post("/api/auth/login", {
    headers: { origin },
    data: { email: "browser@example.test", password: "browser-test-password" },
  });
  const routes = [
    "",
    "meetings",
    "meetings/new",
    "tasks",
    "tasks/new",
    "pending",
    "projects",
    "settings",
    "chat",
    "trash",
    "login",
  ];
  for (const locale of ["vi", "en"]) {
    for (const route of routes) {
      await page.goto(`/${locale}${route ? `/${route}` : ""}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("h1").first()).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.filter(
          (value) => value.impact === "serious" || value.impact === "critical",
        ),
        `${locale}/${route}`,
      ).toEqual([]);
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page
            .locator("body")
            .evaluate((element) => element.scrollWidth > window.innerWidth),
          `${locale}/${route}/${width}`,
        ).toBe(false);
        if (route === "trash")
          await page.screenshot({
            path: `.omo/evidence/task-17-plan/trash-${locale}-${width}.png`,
          });
      }
    }
  }
});
