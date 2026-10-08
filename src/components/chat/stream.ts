import { z } from "zod";
import { ClientError, callApi } from "../api-client";

const eventSchema = z.object({ type: z.string(), data: z.unknown() });
export async function streamReply(input: {
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly onDelta: (text: string) => void;
}) {
  const session = z
    .object({ csrfToken: z.string() })
    .parse(await callApi("/api/auth/session"));
  const response = await fetch(`/api/chat-runs/${input.runId}/step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": session.csrfToken,
    },
    body: JSON.stringify({ stepKey: "answer" }),
    signal: input.signal,
  });
  if (!response.ok) {
    const error = z.object({ code: z.string() }).parse(await response.json());
    throw new ClientError(error.code);
  }
  if (!response.body) throw new ClientError("EMPTY_CHAT_STREAM");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    verified = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary),
          type =
            frame
              .split("\n")
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim() ?? "",
          data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n"),
          event = eventSchema.parse({ type, data: JSON.parse(data) });
        switch (event.type) {
          case "delta":
            input.onDelta(
              z.object({ text: z.string() }).parse(event.data).text,
            );
            break;
          case "done":
            verified =
              z
                .object({
                  verified: z.boolean().optional(),
                  replayed: z.boolean().optional(),
                  completed: z.boolean().optional(),
                })
                .parse(event.data).verified === true ||
              z
                .object({
                  replayed: z.boolean().optional(),
                  completed: z.boolean().optional(),
                })
                .parse(event.data).completed === true;
            break;
          case "error":
            throw new ClientError(
              z.object({ code: z.string() }).parse(event.data).code,
            );
          case "stage":
            break;
          default:
            throw new ClientError("INVALID_CHAT_EVENT");
        }
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
      if (chunk.done) break;
    }
    if (!verified) throw new ClientError("INCOMPLETE_CHAT_STREAM");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
