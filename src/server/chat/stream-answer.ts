import { z } from "zod";
import type { Prompt, Provider } from "../providers/protocol";
import {
  buildRequest,
  checkResponse,
  ProviderError,
} from "../providers/protocol";
import { parseEvents } from "../providers/stream";
import { safeProviderStream } from "../providers/transport";
import { answerSchema } from "./contracts";

function partialText(json: string) {
  const match = /"text"\s*:\s*"/u.exec(json);
  if (!match) return "";
  const start = match.index + match[0].length;
  let end = start,
    escaped = false;
  for (let index = start; index < json.length; index++) {
    const character = json[index];
    if (!escaped && character === '"') {
      end = index;
      break;
    }
    if (!escaped && character === "\\") {
      escaped = true;
      continue;
    }
    if (escaped) {
      escaped = false;
      if (character === "u") {
        if (index + 4 >= json.length) break;
        index += 4;
      }
    }
    end = index + 1;
  }
  try {
    return z.string().parse(JSON.parse(`"${json.slice(start, end)}"`));
  } catch {
    return "";
  }
}
export async function streamAnswer(
  provider: Provider,
  prompt: Prompt,
  onProgress?: (event: { type: string; data: unknown }) => void,
) {
  const request = buildRequest(
    provider,
    prompt,
    true,
    z.toJSONSchema(answerSchema, { target: "draft-7" }),
  );
  if (
    provider.contextBudget &&
    Buffer.byteLength(request.body) + 4096 > provider.contextBudget
  )
    throw new ProviderError("CONTEXT_BUDGET_EXCEEDED", false);
  const response = await safeProviderStream({
    ...request,
    signal: AbortSignal.timeout(150000),
  });
  checkResponse(response.status, response.headers);
  if (!response.body) throw new ProviderError("EMPTY_PROVIDER_STREAM", false);
  let json = "",
    sent = "";
  for await (const token of parseEvents(provider.type, response.body)) {
    json += token;
    if (Buffer.byteLength(json) > 524288)
      throw new ProviderError("PROVIDER_OUTPUT_TOO_LARGE", false);
    const text = partialText(json);
    if (text.startsWith(sent) && text.length > sent.length) {
      onProgress?.({
        type: "delta",
        data: { text: text.slice(sent.length), verified: false },
      });
      sent = text;
    }
  }
  try {
    return answerSchema.parse(JSON.parse(json));
  } catch {
    throw new ProviderError("INVALID_STRUCTURED_OUTPUT", false);
  }
}
