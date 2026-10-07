import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";

type Reference =
  | { readonly kind: "KEY"; readonly value: string }
  | { readonly kind: "PROPOSAL"; readonly value: string };
const receiptSchema = z.object({
  inputHash: z.string(),
  result: z.object({
    taskId: z.string().nullable(),
    decision: z.enum(["ACCEPT", "REJECT"]),
  }),
});
export async function replayDecision(
  tx: Prisma.TransactionClient,
  reference: Reference,
  hash: string,
) {
  let row: Prisma.ProposalDecisionGetPayload<object> | null;
  switch (reference.kind) {
    case "KEY":
      row = await tx.proposalDecision.findUnique({
        where: { idempotencyKey: reference.value },
      });
      break;
    case "PROPOSAL":
      row = await tx.proposalDecision.findFirst({
        where: { payload: { path: ["proposalId"], equals: reference.value } },
      });
      break;
  }
  if (!row) return null;
  const receipt = receiptSchema.parse(row.payload);
  if (receipt.inputHash !== hash) {
    if (reference.kind === "KEY")
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
    return null;
  }
  return receipt.result;
}
