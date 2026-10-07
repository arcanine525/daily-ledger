import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { normalizeSearch } from "./index";

export const searchInput = z.object({
  query: z.string().trim().min(1).max(500),
  projectId: z.uuid().optional(),
  meetingId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(1500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type Hit = {
  id: string;
  sourceId: string;
  projectId: string;
  meetingId: string | null;
  kind: string;
  text: string;
  rank: number;
  revisionId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  meetingTitle: string | null;
  occurredAt: Date | null;
};
export async function search(ownerId: string, input: unknown) {
  const parsed = searchInput.safeParse(input);
  if (!parsed.success) throw new HttpError(422, "INVALID_SEARCH");
  const { cursor, ...filter } = parsed.data;
  const scopeHash = createHash("sha256")
      .update(JSON.stringify(filter))
      .digest("hex"),
    query = normalizeSearch(filter.query),
    like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  let position: { rank: number; id: string; scope: string } | null = null;
  if (cursor) {
    try {
      position = z
        .object({ rank: z.number(), id: z.uuid(), scope: z.string() })
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    } catch {
      throw new HttpError(422, "INVALID_SEARCH_CURSOR");
    }
    if (position.scope !== scopeHash)
      throw new HttpError(422, "SEARCH_CURSOR_SCOPE_CHANGED");
  }
  const conditions = Prisma.sql`
    p."ownerId"=${ownerId}::uuid
    AND ((d.kind='TRANSCRIPT' AND m."deletedAt" IS NULL AND r.number=m."currentRevisionNumber") OR (d.kind='SUMMARY' AND m."deletedAt" IS NULL AND m."activeAnalysisId"=a.id) OR (d.kind='TASK' AND t.id IS NOT NULL))
    ${filter.projectId ? Prisma.sql`AND d."projectId"=${filter.projectId}::uuid` : Prisma.empty}
    ${
      filter.meetingId || filter.from || filter.to
        ? Prisma.sql`AND (
      (d.kind!='TASK' ${filter.meetingId ? Prisma.sql`AND m.id=${filter.meetingId}::uuid` : Prisma.empty} ${filter.from ? Prisma.sql`AND (m."occurredAt" AT TIME ZONE m."meetingTimezone")::date>=${filter.from}::date` : Prisma.empty} ${filter.to ? Prisma.sql`AND (m."occurredAt" AT TIME ZONE m."meetingTimezone")::date<=${filter.to}::date` : Prisma.empty})
      OR (d.kind='TASK' AND EXISTS (SELECT 1 FROM "TaskEvidence" e JOIN "Meeting" em ON em.id=e."sourceMeetingId" WHERE e."taskId"=t.id AND e."sourceDeleted"=false AND em."deletedAt" IS NULL ${filter.meetingId ? Prisma.sql`AND em.id=${filter.meetingId}::uuid` : Prisma.empty} ${filter.from ? Prisma.sql`AND (em."occurredAt" AT TIME ZONE em."meetingTimezone")::date>=${filter.from}::date` : Prisma.empty} ${filter.to ? Prisma.sql`AND (em."occurredAt" AT TIME ZONE em."meetingTimezone")::date<=${filter.to}::date` : Prisma.empty})))`
        : Prisma.empty
    }
    AND (d."englishVector" @@ websearch_to_tsquery('english',${filter.query}) OR d."simpleVector" @@ websearch_to_tsquery('simple',${query}) OR d."normalizedText" LIKE ${like} ESCAPE '\\')`;
  const rows = await database().$queryRaw<Hit[]>`WITH ranked AS (
    SELECT d.id,d."sourceId",d."projectId",d."meetingId",d.kind,d.text,
    (ts_rank(d."englishVector",websearch_to_tsquery('english',${filter.query}))+ts_rank(d."simpleVector",websearch_to_tsquery('simple',${query}))+CASE WHEN d."normalizedText" LIKE ${like} ESCAPE '\\' THEN 1 ELSE 0 END)::float8 AS rank,
    r.id AS "revisionId",s."startOffset",s."endOffset",m.title AS "meetingTitle",m."occurredAt"
    FROM "SearchDocument" d JOIN "Project" p ON p.id=d."projectId"
    LEFT JOIN "Meeting" m ON m.id=d."meetingId" LEFT JOIN "TranscriptSegment" s ON s.id=d."sourceId" AND d.kind='TRANSCRIPT'
    LEFT JOIN "TranscriptRevision" r ON r.id=s."revisionId" LEFT JOIN "AnalysisVersion" a ON a.id=d."sourceId" AND d.kind='SUMMARY'
    LEFT JOIN "Task" t ON t.id=d."sourceId" AND d.kind='TASK' WHERE ${conditions}
  ) SELECT * FROM ranked ${position ? Prisma.sql`WHERE rank<${position.rank} OR (rank=${position.rank} AND id>${position.id}::uuid)` : Prisma.empty} ORDER BY rank DESC,id ASC LIMIT ${filter.limit + 1}`;
  const items = rows.slice(0, filter.limit),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > filter.limit && last
        ? Buffer.from(
            JSON.stringify({ rank: last.rank, id: last.id, scope: scopeHash }),
          ).toString("base64url")
        : null,
    mode: "LEXICAL",
  };
}
