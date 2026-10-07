import { expect, test } from "@playwright/test";

test("full HTTP pipeline uses only the allowlisted fixture provider and publishes once", async ({
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
      data: { name: "Analysis HTTP fixture" },
    }),
    projectId = (await project.json()).id;
  await request.post(`/api/projects/${projectId}/participants`, {
    headers,
    data: { displayName: "Mai", aliases: ["Mai"], isSelf: true },
  });
  const profile = await request.post("/api/providers", {
    headers,
    data: {
      name: "HTTP mock",
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:3201/v1",
      model: "fixture",
      token: "fixture-only-secret",
    },
  });
  expect(profile.status()).toBe(201);
  const profileData = await profile.json();
  const connection = await request.post(
    `/api/providers/${profileData.id}/test`,
    { headers, data: {} },
  );
  expect(connection.status()).toBe(200);
  await request.patch("/api/settings", {
    headers,
    data: { analysisProfileId: profileData.id },
  });
  const created = await request.post("/api/meetings", {
    headers: { ...headers, "Idempotency-Key": "analysis-http-meeting" },
    data: {
      projectId,
      title: "Daily HTTP",
      occurredAt: "2026-10-07T02:00:00Z",
      meetingTimezone: "UTC",
      rawText: "Mai: I will review the API tomorrow.",
    },
  });
  const meetingId = (await created.json()).id;
  const runResponse = await request.post(
    `/api/meetings/${meetingId}/analysis-runs`,
    { headers, data: {} },
  );
  expect(runResponse.status()).toBe(201);
  const run = await runResponse.json();
  for (const stepKey of run.snapshot.steps) {
    const step = await request.post(`/api/analysis-runs/${run.id}/step`, {
      headers,
      data: { stepKey },
    });
    expect(step.status()).toBe(200);
  }
  const done = await (await request.get(`/api/analysis-runs/${run.id}`)).json();
  expect(done.state).toBe("COMPLETED");
  const meeting = await (
    await request.get(`/api/meetings/${meetingId}`)
  ).json();
  expect(meeting.activeAnalysisId).toBeTruthy();
  expect(meeting.analyses).toHaveLength(1);
  const replay = await request.post(`/api/analysis-runs/${run.id}/step`, {
    headers,
    data: { stepKey: "publish" },
  });
  expect((await replay.json()).replayed).toBe(true);
});
