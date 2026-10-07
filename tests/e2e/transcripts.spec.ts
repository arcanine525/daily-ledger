import { expect, test } from "@playwright/test";

test("API saves raw before analysis and exposes immutable revisions", async ({
  request,
}) => {
  const origin = "http://127.0.0.1:3100";
  const login = await request.post("/api/auth/login", {
    headers: { origin },
    data: { email: "browser@example.test", password: "browser-test-password" },
  });
  expect(login.status()).toBe(200);
  const headers = { origin, "x-csrf-token": (await login.json()).csrfToken };
  const project = await request.post("/api/projects", {
    headers,
    data: { name: "Transcript API fixture" },
  });
  const raw = "09:00 Mai: I will review the API.\r\nUnknown 😀 line\n";
  const input = {
    projectId: (await project.json()).id,
    title: "Daily API",
    occurredAt: "2026-10-07T02:00:00Z",
    meetingTimezone: "UTC",
    rawText: raw,
  };
  const created = await request.post("/api/meetings", {
    headers: { ...headers, "Idempotency-Key": "api-transcript" },
    data: input,
  });
  expect(created.status()).toBe(201);
  const meeting = await created.json();
  const replay = await request.post("/api/meetings", {
    headers: { ...headers, "Idempotency-Key": "api-transcript" },
    data: input,
  });
  expect((await replay.json()).id).toBe(meeting.id);
  const revised = await request.post(`/api/meetings/${meeting.id}/revisions`, {
    headers,
    data: {
      rawText: `${raw}09:05 Alex: New information.`,
      expectedRevision: 1,
    },
  });
  expect(revised.status()).toBe(201);
  const result = await (
    await request.get(`/api/meetings/${meeting.id}`)
  ).json();
  expect(result.revisions).toHaveLength(2);
  expect(
    result.revisions.find((r: { number: number }) => r.number === 1).rawText,
  ).toBe(raw);
  expect(result.activeAnalysisId).toBeNull();
});
