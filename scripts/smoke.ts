import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const argumentsSchema = z.object({
  base: z.url(),
  email: z.email(),
  password: z.string().min(12),
  fixture: z.url(),
  authorization: z.literal("1"),
});
const index = process.argv.indexOf("--base-url"),
  input = argumentsSchema.safeParse({
    base: index >= 0 ? process.argv[index + 1] : process.env["PREVIEW_URL"],
    email: process.env["SMOKE_EMAIL"],
    password: process.env["SMOKE_PASSWORD"],
    fixture: process.env["SMOKE_FIXTURE_URL"],
    authorization: process.env["SMOKE_ALLOW_PREVIEW_MUTATIONS"],
  });
if (!input.success) {
  process.stdout.write(
    JSON.stringify({
      status: "BLOCKED",
      reason:
        "Preview URL, isolated fixture URL, operator login and explicit preview-mutation authorization are required",
    }) + "\n",
  );
  process.exitCode = 2;
} else {
  const { base, email, password, fixture } = input.data,
    origin = new URL(base).origin;
  assert.equal(new URL(base).protocol, "https:");
  assert.equal(new URL(fixture).protocol, "https:");
  let cookie = "",
    csrf = "";
  const id = randomUUID();
  async function api(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
        "Content-Type": "application/json",
        "Idempotency-Key": id,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(180000),
    });
    const value: unknown = await response.json();
    if (!response.ok)
      throw new Error(`Preview smoke failed at ${path} (${response.status})`);
    if (path === "/api/auth/login") {
      cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
      csrf = z.object({ csrfToken: z.string() }).parse(value).csrfToken;
    }
    return value;
  }
  const identity = z.object({ id: z.string() }),
    runSchema = z.object({
      id: z.string(),
      snapshot: z.object({ steps: z.array(z.string()) }),
    });
  assert.equal(
    z.object({ status: z.string() }).parse(await api("/api/health/ready"))
      .status,
    "ready",
  );
  await api("/api/auth/login", "POST", { email, password });
  const project = identity.parse(
      await api("/api/projects", "POST", { name: `Isolated smoke ${id}` }),
    ).id,
    profile = identity.parse(
      await api("/api/providers", "POST", {
        name: `Smoke fixture ${id}`,
        type: "openai-compatible",
        baseUrl: fixture,
        model: "fixture",
        token: "fixture-only-token",
      }),
    ).id;
  await api("/api/settings", "PATCH", {
    analysisProfileId: profile,
    chatProfileId: profile,
  });
  const meeting = identity.parse(
      await api("/api/meetings", "POST", {
        projectId: project,
        title: "Preview fixture",
        occurredAt: "2026-10-08T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: "Mai: I will review the API tomorrow.\nMai: Migration check.",
      }),
    ).id,
    run = runSchema.parse(
      await api(`/api/meetings/${meeting}/analysis-runs`, "POST", {}),
    );
  for (const stepKey of run.snapshot.steps)
    await api(`/api/analysis-runs/${run.id}/step`, "POST", { stepKey });
  assert.equal(
    z
      .object({ state: z.string() })
      .parse(await api(`/api/analysis-runs/${run.id}`)).state,
    "COMPLETED",
  );
  const thread = identity.parse(
      await api("/api/conversations", "POST", { title: `Smoke ${id}` }),
    ).id,
    chat = identity.parse(
      await api(`/api/conversations/${thread}/messages`, "POST", {
        question: "Migration đang vướng gì?",
        filters: { projectId: project },
      }),
    ).id;
  for (const stepKey of ["plan", "retrieve"])
    await api(`/api/chat-runs/${chat}/step`, "POST", { stepKey });
  const stream = await fetch(`${origin}/api/chat-runs/${chat}/step`, {
    method: "POST",
    headers: {
      origin,
      cookie,
      "x-csrf-token": csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ stepKey: "answer" }),
    signal: AbortSignal.timeout(180000),
  });
  assert.equal(stream.status, 200);
  assert.ok((await stream.text()).includes('"verified":true'));
  const messages = z
    .array(
      z.object({
        state: z.string(),
        citations: z.array(
          z.object({ id: z.string(), sourceDeleted: z.boolean() }),
        ),
      }),
    )
    .parse(await api(`/api/conversations/${thread}/messages`));
  assert.ok(
    messages.some(
      (message) =>
        message.state === "complete" &&
        message.citations.some((citation) => !citation.sourceDeleted),
    ),
  );
  process.stdout.write(
    JSON.stringify({
      status: "PASS",
      projectId: project,
      meetingId: meeting,
      analysis: true,
      chatCitation: true,
      liveModelEvaluated: false,
    }) + "\n",
  );
}
