import { z } from "zod";
import type {
  Prompt,
  Provider,
  ProviderRequest,
  ProviderType,
} from "./protocol";
import { buildRequest, checkResponse, ProviderError } from "./protocol";
import { safeProviderStream } from "./transport";

const frame = z.object({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        delta: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
  type: z.string().optional(),
  delta: z
    .object({
      text: z.string().optional(),
      stop_reason: z.string().nullable().optional(),
    })
    .optional(),
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })) })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
});
export async function* parseEvents(
  type: ProviderType,
  body: ReadableStream<Uint8Array>,
) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  function delta(event: string) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return "";
    if (data === "[DONE]") {
      completed = true;
      return "";
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new ProviderError("INVALID_PROVIDER_STREAM", false);
    }
    const value = frame.safeParse(parsed);
    if (!value.success)
      throw new ProviderError("INVALID_PROVIDER_STREAM", false);
    const item = value.data;
    if (item.error) throw new ProviderError("PROVIDER_STREAM_ERROR", true);
    switch (type) {
      case "openai-compatible":
        if (item.choices?.[0]?.finish_reason === "stop") completed = true;
        if (item.choices?.[0]?.delta.refusal)
          throw new ProviderError("PROVIDER_REFUSAL", false);
        if (item.choices?.[0]?.finish_reason === "length")
          throw new ProviderError("PROVIDER_OUTPUT_TRUNCATED", true);
        return item.choices?.[0]?.delta.content ?? "";
      case "anthropic":
        if (item.type === "message_stop") completed = true;
        if (item.delta?.stop_reason === "max_tokens")
          throw new ProviderError("PROVIDER_OUTPUT_TRUNCATED", true);
        return item.type === "content_block_delta"
          ? (item.delta?.text ?? "")
          : "";
      case "gemini":
        if (item.candidates?.[0]?.finishReason === "STOP") completed = true;
        if (item.candidates?.[0]?.finishReason === "MAX_TOKENS")
          throw new ProviderError("PROVIDER_OUTPUT_TRUNCATED", true);
        if (item.candidates?.[0]?.finishReason === "SAFETY")
          throw new ProviderError("PROVIDER_REFUSAL", false);
        return (
          item.candidates?.[0]?.content?.parts
            .map((p) => p.text ?? "")
            .join("") ?? ""
        );
    }
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const token = delta(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (token) yield token;
        boundary = buffer.indexOf("\n\n");
      }
      if (chunk.done) {
        if (buffer.trim()) {
          const token = delta(buffer);
          if (token) yield token;
        }
        break;
      }
    }
    if (!completed) throw new ProviderError("INCOMPLETE_PROVIDER_STREAM", true);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
export async function* streamText(
  provider: Provider,
  prompt: Prompt,
  transport: (input: ProviderRequest) => Promise<Response> = safeProviderStream,
) {
  const response = await transport({
    ...buildRequest(provider, prompt, true),
    signal: AbortSignal.timeout(150000),
  });
  checkResponse(response.status, response.headers);
  if (!response.body) throw new ProviderError("EMPTY_PROVIDER_STREAM", false);
  yield* parseEvents(provider.type, response.body);
}
