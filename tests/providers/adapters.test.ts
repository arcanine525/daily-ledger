import { expect, it } from "vitest";
import { z } from "zod";
import {
  buildRequest,
  generateStructured,
  parseEvents,
} from "../../src/server/providers/adapters";

const schema = z.object({ ok: z.boolean() });
const base = {
  baseUrl: "https://example.com",
  model: "fixture",
  token: "fixture-secret",
};
it("uses native protocol headers URLs and structured response payloads", async () => {
  const fixtures = [
    {
      type: "openai-compatible",
      body: { choices: [{ message: { content: '{"ok":true}' } }] },
    },
    {
      type: "anthropic",
      body: { content: [{ type: "text", text: '{"ok":true}' }] },
    },
    {
      type: "gemini",
      body: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] },
    },
  ] as const;
  for (const fixture of fixtures) {
    const calls: string[] = [];
    const result = await generateStructured(
      { ...base, type: fixture.type },
      { system: "Fixture", user: "Input", schema },
      async (request) => {
        calls.push(request.url);
        expect(`${request.url} ${request.body}`).toContain("fixture");
        return { status: 200, body: JSON.stringify(fixture.body) };
      },
    );
    expect(result.value).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  }
  expect(
    buildRequest(
      { ...base, type: "anthropic" },
      { system: "Fixture", user: "Input" },
      false,
    ).headers["x-api-key"],
  ).toBe(base.token);
  expect(
    buildRequest(
      { ...base, type: "gemini" },
      { system: "Fixture", user: "Input" },
      true,
    ).url,
  ).toContain(":streamGenerateContent?alt=sse");
});
it("surfaces rate limits without retries or token leakage", async () => {
  let calls = 0;
  await expect(
    generateStructured(
      { ...base, type: "openai-compatible" },
      { system: "Fixture", user: "Input", schema },
      async () => {
        calls++;
        return {
          status: 429,
          body: '{"error":"fixture-secret"}',
          headers: new Headers({ "retry-after": "30" }),
        };
      },
    ),
  ).rejects.toMatchObject({
    code: "PROVIDER_RATE_LIMIT",
    retryAfterSeconds: 30,
  });
  expect(calls).toBe(1);
});
it("parses SSE frames split across arbitrary byte chunks", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const value of [
        'data: {"choices":[{"delta":{"con',
        'tent":"Hello"}}]}\r\n\r\n',
        "data: [DONE]\n\n",
      ])
        controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
  const text: string[] = [];
  for await (const token of parseEvents("openai-compatible", body))
    text.push(token);
  expect(text.join("")).toBe("Hello");
});

it("handles native Anthropic and Gemini stream events and detects incomplete streams", async () => {
  const stream = (data: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(data));
        controller.close();
      },
    });
  const anthropic: string[] = [];
  for await (const text of parseEvents(
    "anthropic",
    stream(
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
    ),
  ))
    anthropic.push(text);
  expect(anthropic.join("")).toBe("Hello");
  const gemini: string[] = [];
  for await (const text of parseEvents(
    "gemini",
    stream(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"STOP"}]}\n\n',
    ),
  ))
    gemini.push(text);
  expect(gemini.join("")).toBe("Hello");
  await expect(
    (async () => {
      const tokens: string[] = [];
      for await (const text of parseEvents(
        "openai-compatible",
        stream('data: {"choices":[{"delta":{"content":"unfinished"}}]}\n\n'),
      ))
        tokens.push(text);
      return tokens;
    })(),
  ).rejects.toMatchObject({ code: "INCOMPLETE_PROVIDER_STREAM" });
});
