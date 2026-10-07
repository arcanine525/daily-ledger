import { expect, test } from "@playwright/test";

test("chat HTTP returns provisional stream then verified citations and replay", async ({
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
        data: { name: "Chat HTTP" },
      })
    ).json()
  ).id;
  expect(
    (
      await request.post("/api/meetings", {
        headers: { ...headers, "Idempotency-Key": "chat-http-meeting" },
        data: {
          projectId,
          title: "Chat raw",
          occurredAt: "2026-10-07T02:00:00Z",
          meetingTimezone: "UTC",
          rawText: "Mai: Migration is blocked by staging.",
        },
      })
    ).status(),
  ).toBe(201);
  const profile = (
    await (
      await request.post("/api/providers", {
        headers,
        data: {
          name: "Chat fixture",
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:3201/v1",
          model: "fixture",
          token: "fixture-token",
        },
      })
    ).json()
  ).id;
  expect(
    (
      await request.patch("/api/settings", {
        headers,
        data: { chatProfileId: profile },
      })
    ).status(),
  ).toBe(200);
  const conversationId = (
    await (
      await request.post("/api/conversations", {
        headers,
        data: { title: "Chat HTTP" },
      })
    ).json()
  ).id;
  const run = (
    await (
      await request.post(`/api/conversations/${conversationId}/messages`, {
        headers,
        data: {
          question: "Migration đang vướng gì?",
          filters: { projectId },
          idempotencyKey: "http-chat",
        },
      })
    ).json()
  ).id;
  expect(
    (
      await request.post(`/api/chat-runs/${run}/step`, {
        headers,
        data: { stepKey: "retrieve" },
      })
    ).status(),
  ).toBe(409);
  for (const stepKey of ["plan", "retrieve"])
    expect(
      (
        await request.post(`/api/chat-runs/${run}/step`, {
          headers,
          data: { stepKey },
        })
      ).status(),
    ).toBe(200);
  const reply = await request.post(`/api/chat-runs/${run}/step`, {
      headers,
      data: { stepKey: "answer" },
    }),
    events = await reply.text();
  expect(reply.headers()["content-type"]).toContain("text/event-stream");
  expect(events).toContain('"verified":false');
  expect(events).toContain('"verified":true');
  expect(events).toContain("event: done");
  expect(events).not.toContain("event: error");
  const messages = await (
      await request.get(`/api/conversations/${conversationId}/messages`)
    ).json(),
    answer = messages.find((m: { role: string }) => m.role === "assistant");
  expect(answer.state).toBe("complete");
  expect(answer.citations[0].quote).toBe(
    "Mai: Migration is blocked by staging.",
  );
  expect(
    await (await request.get(`/api/chat-runs/${run}`)).json(),
  ).toMatchObject({ state: "COMPLETED" });
  expect(
    await (
      await request.post(`/api/conversations/${conversationId}/messages`, {
        headers,
        data: {
          question: "Migration đang vướng gì?",
          filters: { projectId },
          idempotencyKey: "http-chat",
        },
      })
    ).json(),
  ).toMatchObject({ id: run });
  expect(
    (
      await request.post(`/api/conversations/${conversationId}/messages`, {
        headers,
        data: { question: "Changed", idempotencyKey: "http-chat" },
      })
    ).status(),
  ).toBe(409);
});
