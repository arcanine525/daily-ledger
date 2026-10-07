import type { z } from "zod";
import { HttpError } from "../auth/session";

export type ProviderType = "openai-compatible" | "anthropic" | "gemini";
export type Provider = {
  readonly type: ProviderType;
  readonly baseUrl: string;
  readonly model: string;
  readonly token: string;
};
export type Prompt = { readonly system: string; readonly user: string };
export type ProviderRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal?: AbortSignal;
};
export type ProviderResponse = {
  readonly status: number;
  readonly body: string;
  readonly headers?: Headers;
};
export type Transport = (request: ProviderRequest) => Promise<ProviderResponse>;
export type StructuredPrompt<T> = Prompt & { readonly schema: z.ZodType<T> };
export class ProviderError extends HttpError {
  readonly retryAfterSeconds: number;
  constructor(
    code: string,
    readonly retryable: boolean,
    retryAfterSeconds = 0,
  ) {
    super(502, code);
    this.retryAfterSeconds = Math.min(900, Math.max(0, retryAfterSeconds));
  }
}
export function checkResponse(status: number, headers?: Headers) {
  if (status === 429)
    throw new ProviderError(
      "PROVIDER_RATE_LIMIT",
      true,
      Number(headers?.get("retry-after") ?? 0) || 0,
    );
  if (status === 401 || status === 403)
    throw new ProviderError("PROVIDER_AUTH_FAILED", false);
  if (status >= 400)
    throw new ProviderError(
      status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REQUEST_REJECTED",
      status >= 500,
    );
}
function unreachable(value: never): never {
  throw new ProviderError(`UNSUPPORTED_PROTOCOL_${value}`, false);
}
export function buildRequest(
  provider: Provider,
  input: Prompt,
  stream: boolean,
  schema?: unknown,
): ProviderRequest {
  const root = provider.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  switch (provider.type) {
    case "openai-compatible":
      headers["Authorization"] = `Bearer ${provider.token}`;
      return {
        url: `${root}/chat/completions`,
        headers,
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          max_completion_tokens: 4096,
          stream,
          ...(schema
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: { name: "ledger_output", strict: true, schema },
                },
              }
            : {}),
        }),
      };
    case "anthropic":
      headers["x-api-key"] = provider.token;
      headers["anthropic-version"] = "2023-06-01";
      return {
        url: `${root.replace(/\/v1$/, "")}/v1/messages`,
        headers,
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 4096,
          system: input.system,
          messages: [{ role: "user", content: input.user }],
          stream,
          ...(schema
            ? { output_config: { format: { type: "json_schema", schema } } }
            : {}),
        }),
      };
    case "gemini":
      headers["x-goog-api-key"] = provider.token;
      return {
        url: `${root.replace(/\/v1beta$/, "")}/v1beta/models/${encodeURIComponent(provider.model.replace(/^models\//, ""))}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
        headers,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            ...(schema
              ? {
                  responseMimeType: "application/json",
                  responseJsonSchema: schema,
                }
              : {}),
          },
        }),
      };
    default:
      return unreachable(provider.type);
  }
}
