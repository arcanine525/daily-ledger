import { expect, test } from "@playwright/test";
import { Client } from "pg";

test("trash restore and purge preserve chat and canonical tasks through HTTP", async ({
  request,
}) => {
  const origin = "http://127.0.0.1:3100",
    login = await request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: "browser@example.test",
        password: "browser-test-password",
      },
    }),
    headers = { origin, "x-csrf-token": (await login.json()).csrfToken };
  const projectId = (
    await (
      await request.post("/api/projects", {
        headers,
        data: { name: "Retention HTTP" },
      })
    ).json()
  ).id;
  const meetingId = (
    await (
      await request.post("/api/meetings", {
        headers: { ...headers, "Idempotency-Key": "retention-http" },
        data: {
          projectId,
          title: "Retention HTTP",
          occurredAt: "2026-10-07T02:00:00Z",
          meetingTimezone: "UTC",
          rawText: "Mai: Migration evidence retained in chat.",
        },
      })
    ).json()
  ).id;
  const task = await (
    await request.post("/api/tasks", {
      headers: { ...headers, "Idempotency-Key": "retention-task" },
      data: { projectId, title: "Confirmed HTTP task" },
    })
  ).json();
  const profile = (
    await (
      await request.post("/api/providers", {
        headers,
        data: {
          name: "Retention mock",
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:3201/v1",
          model: "fixture",
          token: "fixture",
        },
      })
    ).json()
  ).id;
  await request.patch("/api/settings", {
    headers,
    data: { chatProfileId: profile },
  });
  const conversation = (
    await (
      await request.post("/api/conversations", {
        headers,
        data: { title: "Retention history" },
      })
    ).json()
  ).id;
  const run = (
    await (
      await request.post(`/api/conversations/${conversation}/messages`, {
        headers,
        data: { question: "Migration?", filters: { meetingId } },
      })
    ).json()
  ).id;
  for (const stepKey of ["plan", "retrieve", "answer"])
    expect(
      (
        await request.post(`/api/chat-runs/${run}/step`, {
          headers,
          data: { stepKey },
        })
      ).status(),
    ).toBe(200);
  const before = await (
      await request.get(`/api/conversations/${conversation}/messages`)
    ).json(),
    answer = before.find(
      (message: { role: string }) => message.role === "assistant",
    );
  expect(
    (
      await request.post(`/api/meetings/${meetingId}/trash`, { headers })
    ).status(),
  ).toBe(200);
  expect((await request.get(`/api/meetings/${meetingId}`)).status()).toBe(404);
  expect(
    (
      await (
        await request.get(`/api/search?query=migration&meetingId=${meetingId}`)
      ).json()
    ).items,
  ).toHaveLength(0);
  const hidden = await (
    await request.get(`/api/conversations/${conversation}/messages`)
  ).json();
  expect(
    hidden.find((message: { id: string }) => message.id === answer.id),
  ).toMatchObject({ body: answer.body, contextEligible: false });
  const metadata = await (await request.get(`/api/chat-runs/${run}`)).text();
  expect(metadata).not.toContain("Migration evidence retained in chat.");
  expect(
    (
      await request.post(`/api/meetings/${meetingId}/restore`, { headers })
    ).status(),
  ).toBe(200);
  expect((await request.get(`/api/meetings/${meetingId}`)).status()).toBe(200);
  expect(
    (
      await request.post(`/api/meetings/${meetingId}/purge`, {
        headers,
        data: { confirmationTitle: "Wrong" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post(`/api/meetings/${meetingId}/purge`, {
        headers,
        data: { confirmationTitle: "Retention HTTP" },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get(`/api/meetings/${meetingId}`)).status()).toBe(404);
  expect(
    await (await request.get(`/api/tasks/${task.id}`)).json(),
  ).toMatchObject({ id: task.id, title: task.title, status: task.status });
  const saved = await (
    await request.get(`/api/conversations/${conversation}/messages`)
  ).json();
  expect(
    saved.find((message: { id: string }) => message.id === answer.id),
  ).toMatchObject({
    body: answer.body,
    contextEligible: false,
    citations: [
      {
        quote: "Mai: Migration evidence retained in chat.",
        sourceDeleted: true,
        revisionId: null,
      },
    ],
  });
});

test("an authenticated browser visit drains expired meetings in ten-item batches", async ({
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
          data: { name: "Visit maintenance" },
        })
      ).json()
    ).id,
    ids: string[] = [];
  for (let index = 0; index < 11; index++)
    ids.push(
      (
        await (
          await page.request.post("/api/meetings", {
            headers: {
              ...headers,
              "Idempotency-Key": `visit-expired-${index}`,
            },
            data: {
              projectId,
              title: `Expired visit ${index}`,
              occurredAt: "2026-10-07T02:00:00Z",
              meetingTimezone: "UTC",
              rawText: `Mai: Expired visit ${index}.`,
            },
          })
        ).json()
      ).id,
    );
  const db = new Client({
    connectionString: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
  });
  await db.connect();
  try {
    await db.query(
      'UPDATE "Meeting" SET "deletedAt"=NOW()-INTERVAL \'31 days\' WHERE id=ANY($1::uuid[])',
      [ids],
    );
  } finally {
    await db.end();
  }
  expect(
    (await (await page.request.get("/api/trash")).json()).filter(
      (meeting: { id: string }) => ids.includes(meeting.id),
    ),
  ).toHaveLength(11);
  const batches: number[] = [];
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/maintenance/purge-expired") &&
      response.status() === 200
    )
      batches.push((await response.json()).purged);
  });
  await page.goto("/en");
  await expect
    .poll(async () => {
      const trash = await (await page.request.get("/api/trash")).json();
      return trash.filter((meeting: { id: string }) => ids.includes(meeting.id))
        .length;
    })
    .toBe(0);
  expect(batches).toContain(10);
  await expect.poll(() => batches.includes(1)).toBe(true);
  expect(
    await page
      .locator("body")
      .evaluate((element) => element.scrollWidth > window.innerWidth),
  ).toBe(false);
});
