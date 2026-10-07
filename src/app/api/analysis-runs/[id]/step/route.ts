import { z } from "zod";
import { executeAnalysisStep } from "../../../../../server/analysis/pipeline";
import {
  authenticate,
  HttpError,
  limit,
  respond,
} from "../../../../../server/auth/session";

export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = await authenticate(request, true);
    const input = z
      .object({ stepKey: z.string().min(1).max(80) })
      .safeParse(await request.json());
    if (!input.success) throw new HttpError(422, "INVALID_STEP_REQUEST");
    await limit(`analysis-step:${session.ownerId}`, 30, 60000);
    return Response.json(
      await executeAnalysisStep({
        ownerId: session.ownerId,
        runId: (await context.params).id,
        stepKey: input.data.stepKey,
      }),
    );
  });
}
