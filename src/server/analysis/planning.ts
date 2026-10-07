import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { meetingForOwner } from "../meetings/archive";
import { chunks } from "./chunking";
import type { Candidate } from "./pipeline-contracts";
import { candidateSchema } from "./pipeline-contracts";
import { startRun } from "./runs";
import { segmentHints } from "./segment-hints";

export function reducePlan(count: number) {
  const groups: { key: string; inputs: string[] }[] = [];
  let nodes = Array.from({ length: count }, (_, index) => `map:${index}`),
    level = 0;
  while (nodes.length > 1) {
    const next: string[] = [];
    for (let start = 0; start < nodes.length; start += 8) {
      const key = `reduce:${level}:${next.length}`;
      groups.push({ key, inputs: nodes.slice(start, start + 8) });
      next.push(key);
    }
    nodes = next;
    level++;
  }
  return { groups, root: nodes[0] ?? "" };
}
export async function beginAnalysis(ownerId: string, meetingId: string) {
  const db = database(),
    meeting = await meetingForOwner(ownerId, meetingId);
  const active = await db.analysisRun.findFirst({
    where: {
      meetingId,
      state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
    },
  });
  if (active) return active;
  const settings = await db.userSettings.findUnique({ where: { ownerId } });
  const profile = settings?.analysisProfileId
    ? await db.providerProfileRevision.findFirst({
        where: {
          profileId: settings.analysisProfileId,
          profile: { ownerId, deletedAt: null },
        },
        orderBy: { number: "desc" },
      })
    : null;
  const revision = meeting.revisions[0];
  if (!profile?.ciphertext || !revision)
    throw new HttpError(422, "ANALYSIS_CONFIGURATION_REQUIRED");
  let chunkLimit = Math.min(
    12000,
    Math.floor((profile.contextBudget - 8192) / 4),
  );
  let map = chunks(revision.rawText, chunkLimit);
  const exceedsBudget = () =>
    map.some(
      (chunk) =>
        Buffer.byteLength(
          JSON.stringify(
            JSON.stringify({
              text: chunk.text,
              segments: segmentHints(revision.rawText, chunk),
            }),
          ),
        ) +
          8192 >
        profile.contextBudget,
    );
  while (exceedsBudget() && chunkLimit > 1000) {
    chunkLimit = Math.max(1000, Math.floor(chunkLimit / 2));
    map = chunks(revision.rawText, chunkLimit);
  }
  if (exceedsBudget()) throw new HttpError(422, "CONTEXT_BUDGET_TOO_SMALL");
  const candidates: Candidate[] = [];
  const tasks = await db.task.findMany({
    where: { projectId: meeting.projectId },
    include: {
      assignments: true,
      events: {
        where: { changedFields: { has: "status" } },
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });
  for (const task of tasks)
    candidates.push(
      candidateSchema.parse({
        id: task.id,
        kind: "TASK",
        taskId: task.id,
        title: task.title,
        version: task.version,
        status: task.status,
        dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
        lastStatusAt: (
          task.events[0]?.recordedAt ?? task.createdAt
        ).toISOString(),
        assigneeIds: task.assignments.map((a) => a.participantId),
        fieldVersions: task.fieldVersions,
      }),
    );
  const actions = await db.meetingAction.findMany({
    where: {
      meetingId,
      OR: [
        { manuallyEditedAt: { not: null } },
        { reviewState: "ACCEPTED" },
        { taskId: { not: null } },
      ],
    },
  });
  for (const action of actions)
    candidates.push(
      candidateSchema.parse({
        id: action.id,
        kind: "ACTION",
        taskId: action.taskId,
        title: action.title,
        version: action.version,
        status: null,
        dueDate: action.dueDate?.toISOString().slice(0, 10) ?? null,
        lastStatusAt: null,
        assigneeIds: [],
      }),
    );
  const keys = map.map((_chunk, index) => `map:${index}`);
  keys.push(...reducePlan(map.length).groups.map((g) => g.key));
  for (let m = 0; m < map.length; m++)
    for (let batch = 0; batch < Math.ceil(candidates.length / 20); batch++)
      keys.push(`match:${m}:${batch}`);
  keys.push("publish");
  return startRun(ownerId, meetingId, {
    expectedProfileId: profile.id,
    stepKeys: keys,
    expectedRevision: revision.number,
    chunkLimit,
    candidates,
  });
}
