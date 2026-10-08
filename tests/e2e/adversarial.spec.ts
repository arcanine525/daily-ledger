import { expect, test } from "@playwright/test";

test("HTTP boundaries reject CSRF SSRF stale writes and SQL-like lookup without changing confirmed work", async ({
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
  expect(
    (
      await request.post("/api/projects", {
        headers: { origin, "x-csrf-token": "invalid" },
        data: { name: "Must not exist" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/providers", {
        headers,
        data: {
          name: "Metadata attack",
          type: "openai-compatible",
          baseUrl: "http://169.254.169.254",
          model: "fixture",
          token: "fixture",
        },
      })
    ).status(),
  ).toBe(422);
  const projectId = (
    await (
      await request.post("/api/projects", {
        headers,
        data: { name: "Adversarial fixture" },
      })
    ).json()
  ).id;
  const task = (
    await (
      await request.post("/api/tasks", {
        headers: { ...headers, "Idempotency-Key": "adversarial-task" },
        data: { projectId, title: "Confirmed work" },
      })
    ).json()
  ).id;
  expect(
    (
      await request.patch(`/api/tasks/${task}`, {
        headers,
        data: { expectedVersion: 1, status: "DONE" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.patch(`/api/tasks/${task}`, {
        headers,
        data: { expectedVersion: 1, title: "Stale overwrite" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.get(
        `/api/search?${new URLSearchParams({ query: "'; DROP TABLE Owner; --", projectId })}`,
      )
    ).status(),
  ).toBe(200);
  expect(await (await request.get(`/api/tasks/${task}`)).json()).toMatchObject({
    title: "Confirmed work",
    status: "DONE",
    version: 2,
  });
  expect(
    (await (await request.get(`/api/tasks?projectId=${projectId}`)).json())
      .total,
  ).toBe(1);
});
