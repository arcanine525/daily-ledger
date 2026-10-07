import { z } from "zod";
import type { Provider, StructuredPrompt, Transport } from "./protocol";
import { buildRequest, checkResponse, ProviderError } from "./protocol";
import { safeProviderRequest } from "./transport";

export { buildRequest, ProviderError } from "./protocol";
export { parseEvents, streamText } from "./stream";

const openai = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      message: z.object({
        content: z.string().nullable(),
        refusal: z.string().nullable().optional(),
      }),
    }),
  ),
});
const anthropic = z.object({
  stop_reason: z.string().nullable().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});
const gemini = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })) })
          .optional(),
      }),
    )
    .optional(),
});
export function responseText(type: Provider["type"], body: unknown) {
  switch (type) {
    case "openai-compatible": {
      const value = openai.safeParse(body);
      if (!value.success)
        throw new ProviderError("INVALID_PROVIDER_RESPONSE", false);
      const choice = value.data.choices[0];
      if (choice?.message.refusal || choice?.finish_reason === "content_filter")
        throw new ProviderError("PROVIDER_REFUSAL", false);
      if (choice?.finish_reason === "length")
        throw new ProviderError("PROVIDER_OUTPUT_TRUNCATED", true);
      return choice?.message.content ?? "";
    }
    case "anthropic": {
      const value = anthropic.safeParse(body);
      if (!value.success)
        throw new ProviderError("INVALID_PROVIDER_RESPONSE", false);
      if (value.data.stop_reason === "refusal")
        throw new ProviderError("PROVIDER_REFUSAL", false);
      if (value.data.stop_reason === "max_tokens")
        throw new ProviderError("PROVIDER_OUTPUT_TRUNCATED", true);
      return value.data.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
    }
    case "gemini": {
      const value = gemini.safeParse(body);
      if (!value.success)
        throw new ProviderError("INVALID_PROVIDER_RESPONSE", false);
      const candidate = value.data.candidates?.[0];
      if (
        !candidate ||
        ["SAFETY", "RECITATION"].includes(candidate.finishReason ?? "")
      )
        throw new ProviderError("PROVIDER_REFUSAL", false);
      if (candidate.finishReason === "MAX_TOKENS")
        throw new ProviderError("PROVIDER_OUTPUT_TRUNCATED", true);
      return candidate.content?.parts.map((p) => p.text ?? "").join("") ?? "";
    }
  }
}
export async function generateStructured<T>(
  provider: Provider,
  input: StructuredPrompt<T>,
  transport: Transport = safeProviderRequest,
) {
  const jsonSchema = z.toJSONSchema(input.schema, { target: "draft-7" });
  let response: Awaited<ReturnType<Transport>>;
  try {
    response = await transport({
      ...buildRequest(provider, input, false, jsonSchema),
      signal: AbortSignal.timeout(150000),
    });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("PROVIDER_CONNECTION_FAILED", true);
  }
  checkResponse(response.status, response.headers);
  try {
    const text = responseText(provider.type, JSON.parse(response.body));
    const value = input.schema.safeParse(JSON.parse(text));
    if (!value.success)
      throw new ProviderError("INVALID_STRUCTURED_OUTPUT", false);
    return { value: value.data, rawResponse: response.body };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("INVALID_PROVIDER_JSON", false);
  }
}
