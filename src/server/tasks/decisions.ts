import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { decisionInput, proposalChanges } from "./contracts";
import { decideTx } from "./decision-transaction";

export async function decideProposal(
  ownerId: string,
  id: string,
  input: unknown,
  key: string,
) {
  const parsed = decisionInput.safeParse(input);
  if (
    !parsed.success ||
    !z.uuid().safeParse(id).success ||
    !key ||
    key.length > 120
  )
    throw new HttpError(422, "INVALID_DECISION");
  return database().$transaction(
    (tx) =>
      decideTx(tx, {
        ownerId,
        proposalId: id,
        choice: parsed.data,
        key,
        bulk: false,
      }),
    { timeout: 30000 },
  );
}
export async function bulkCreate(ownerId: string, input: unknown, key: string) {
  const parsed = z
    .object({ proposalIds: z.array(z.uuid()).min(1).max(50) })
    .safeParse(input);
  if (!parsed.success || !key || key.length > 100)
    throw new HttpError(422, "INVALID_BULK_DECISION");
  const ids = [...new Set(parsed.data.proposalIds)].sort();
  return database().$transaction(
    async (tx) => {
      const proposals = await tx.taskProposal.findMany({
        where: {
          id: { in: ids },
          action: { meeting: { project: { ownerId }, deletedAt: null } },
        },
      });
      if (
        proposals.length !== ids.length ||
        proposals.some(
          (p) =>
            p.kind !== "CREATE" ||
            proposalChanges.parse(p.changes).requiresReconciliation,
        )
      )
        throw new HttpError(422, "BULK_CREATE_ONLY");
      const results = [];
      for (const id of ids)
        results.push(
          await decideTx(tx, {
            ownerId,
            proposalId: id,
            choice: { decision: "ACCEPT" },
            key: `${key}:${id}`,
            bulk: true,
          }),
        );
      return results;
    },
    { timeout: 60000 },
  );
}
