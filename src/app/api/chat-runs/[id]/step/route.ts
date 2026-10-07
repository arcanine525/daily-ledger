import { z } from "zod";
import {
  authenticate,
  HttpError,
  limit,
  respond,
} from "../../../../../server/auth/session";
import { executeChatStep } from "../../../../../server/chat/service";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    await limit(`ai-step:${session.ownerId}`, 30, 60000);
    const parsed = z
      .object({ stepKey: z.string().min(1).max(80) })
      .safeParse(await request.json());
    if (!parsed.success) throw new HttpError(422, "INVALID_CHAT_STEP_REQUEST");
    const input = {
      ownerId: session.ownerId,
      runId: (await context.params).id,
      stepKey: parsed.data.stepKey,
    };
    if (input.stepKey !== "answer")
      return Response.json(await executeChatStep(input));
    let disconnected = false;
    const encoder = new TextEncoder(),
      body = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: { type: string; data: unknown }) => {
            if (!disconnected)
              controller.enqueue(
                encoder.encode(
                  `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
                ),
              );
          };
          executeChatStep(input, undefined, send)
            .then((result) => {
              if (result.replayed) send({ type: "done", data: result });
              if (!disconnected) controller.close();
            })
            .catch((error) => {
              send({
                type: "error",
                data: {
                  code:
                    error instanceof HttpError
                      ? error.code
                      : "CHAT_STEP_FAILED",
                  retryable: error instanceof HttpError && error.retryable,
                  verified: false,
                },
              });
              if (!disconnected) controller.close();
            });
        },
        cancel() {
          disconnected = true;
        },
      });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
