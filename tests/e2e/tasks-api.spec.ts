import { expect, test } from "@playwright/test";

test("owner creates and edits a task through authenticated HTTP APIs", async ({
  request,
}) => {
  const origin = "http://127.0.0.1:3100",
    login = await request.post("/api/auth/login", {
      headers: { origin },
      data: {
        email: "browser@example.test",
        password: "browser-test-password",
      },
    });
  expect(login.status()).toBe(200);
  const headers = { origin, "x-csrf-token": (await login.json()).csrfToken };
  const project = (
    await (
      await request.post("/api/projects", {
        headers,
        data: { name: "Task HTTP case" },
      })
    ).json()
  ).id;
  const created = await request.post("/api/tasks", {
    headers: { ...headers, "Idempotency-Key": "http-task" },
    data: { projectId: project, title: "Review API" },
  });
  expect(created.status()).toBe(201);
  const task = await created.json();
  expect(task.status).toBe("TODO");
  const replay = await request.post("/api/tasks", {
    headers: { ...headers, "Idempotency-Key": "http-task" },
    data: { projectId: project, title: "Review API" },
  });
  expect((await replay.json()).id).toBe(task.id);
  const edited = await request.patch(`/api/tasks/${task.id}`, {
    headers,
    data: { expectedVersion: 1, status: "IN_PROGRESS" },
  });
  expect(edited.status()).toBe(200);
  const stale = await request.patch(`/api/tasks/${task.id}`, {
    headers,
    data: { expectedVersion: 1, status: "DONE" },
  });
  expect(stale.status()).toBe(409);
  const result = await (await request.get(`/api/tasks/${task.id}`)).json();
  expect(result.status).toBe("IN_PROGRESS");
  expect(result.events).toHaveLength(2);
});
