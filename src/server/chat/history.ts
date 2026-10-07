import type { Prisma } from "../../generated/prisma/client";
import { database } from "../db/client";

export async function unavailableMessages(
  ownerId: string,
  tx: Prisma.TransactionClient = database(),
) {
  return tx.$queryRaw<{ id: string }[]>`WITH RECURSIVE unavailable(id) AS (
    SELECT m.id FROM "ChatMessage" m JOIN "Conversation" c ON c.id=m."conversationId"
    WHERE c."ownerId"=${ownerId}::uuid AND (NOT m."contextEligible" OR EXISTS (
      SELECT 1 FROM "Citation" x LEFT JOIN "TranscriptRevision" r ON r.id=x."revisionId"
      LEFT JOIN "Meeting" meeting ON meeting.id=r."meetingId"
      WHERE x."messageId"=m.id AND (x."sourceDeleted" OR meeting."deletedAt" IS NOT NULL)))
    UNION SELECT d."messageId" FROM "ChatMessageDependency" d JOIN unavailable u ON u.id=d."contextMessageId"
  ) SELECT id FROM unavailable`;
}
