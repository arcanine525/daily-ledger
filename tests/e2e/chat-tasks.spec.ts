import { expect, test } from "@playwright/test";

test.setTimeout(60000);

test("chat paginates confirmed and pending groups separately and cites manual task events", async ({
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
        data: { name: "Chat task groups" },
      })
    ).json()
  ).id;
  for (let index = 0; index < 15; index++)
    await page.request.post("/api/tasks", {
      headers: { ...headers, "Idempotency-Key": `chat-group-${index}` },
      data: { projectId, title: `Manual chat task ${index}` },
    });
  await page.request.post(`/api/projects/${projectId}/participants`, {
    headers,
    data: { displayName: "Mai", isSelf: true, aliases: ["Mai"] },
  });
  const profile = (
    await (
      await page.request.post("/api/providers", {
        headers,
        data: {
          name: "Task groups fixture",
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:3201/v1",
          model: "fixture",
          token: "fixture",
        },
      })
    ).json()
  ).id;
  await page.request.patch("/api/settings", {
    headers,
    data: { analysisProfileId: profile, chatProfileId: profile },
  });
  const meeting = (
    await (
      await page.request.post("/api/meetings", {
        headers: { ...headers, "Idempotency-Key": "chat-groups-source" },
        data: {
          projectId,
          title: "Pending group source",
          occurredAt: "2026-10-07T02:00:00Z",
          meetingTimezone: "UTC",
          rawText: "Mai: I will review the API tomorrow.",
        },
      })
    ).json()
  ).id;
  const analysis = await (
    await page.request.post(`/api/meetings/${meeting}/analysis-runs`, {
      headers,
      data: {},
    })
  ).json();
  for (const stepKey of analysis.snapshot.steps)
    expect(
      (
        await page.request.post(`/api/analysis-runs/${analysis.id}/step`, {
          headers,
          data: { stepKey },
        })
      ).status(),
    ).toBe(200);
  await page.goto(`/en/chat?project=${projectId}`);
  await page.getByLabel("Conversation title").fill("Task groups");
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("What tasks are unfinished?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  const confirmed = page.getByRole("region", {
      name: "Confirmed unfinished tasks",
    }),
    pending = page.getByRole("region", { name: "Pending Todos" });
  await expect(confirmed.locator("li")).toHaveCount(10);
  await expect(confirmed.locator("h3")).toContainText("15");
  await expect(pending.locator("h3")).toContainText("1");
  await expect(pending.getByText("TODO", { exact: true })).toHaveCount(0);
  await expect(pending.getByText("Review API", { exact: true })).toBeVisible();
  await confirmed.getByRole("button", { name: "Next", exact: true }).click();
  await expect(confirmed.locator("li")).toHaveCount(5);
  await page
    .getByRole("button", { name: /Manual chat task 0.*CREATE/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Application history");
  await expect(page.getByRole("dialog")).toContainText("Manual chat task 0");
});
