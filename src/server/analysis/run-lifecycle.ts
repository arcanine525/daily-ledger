import { HttpError } from "../auth/session";
import { database } from "../db/client";
import type { Candidate } from "./pipeline-contracts";
import { runSnapshot } from "./run-snapshot";

type Plan =
  | readonly string[]
  | {
      readonly stepKeys: readonly string[];
      readonly expectedRevision: number;
      readonly chunkLimit: number;
      readonly candidates: readonly Candidate[];
      readonly expectedProfileId?: string;
    };
export async function startRun(ownerId: string, meetingId: string, plan: Plan) {
  const planning = "stepKeys" in plan ? plan : undefined,
    steps = "stepKeys" in plan ? plan.stepKeys : plan;
  if (!steps.length || new Set(steps).size !== steps.length)
    throw new HttpError(422, "INVALID_STEP_PLAN");
  return database().$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "Meeting" WHERE id=${meetingId}::uuid FOR UPDATE`;
    const meeting = await db.meeting.findFirst({
      where: { id: meetingId, deletedAt: null, project: { ownerId } },
      include: {
        revisions: { orderBy: { number: "desc" }, take: 1 },
        identity: true,
        project: {
          include: {
            participants: {
              where: { archivedAt: null },
              include: { aliases: true },
            },
          },
        },
      },
    });
    if (!meeting) throw new HttpError(404, "MEETING_NOT_FOUND");
    const existing = await db.analysisRun.findFirst({
      where: {
        meetingId,
        state: { in: ["READY", "RUNNING", "PAUSED_RETRYABLE"] },
      },
    });
    if (existing) return existing;
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
    if (!profile || !revision)
      throw new HttpError(422, "ANALYSIS_CONFIGURATION_REQUIRED");
    if (planning && planning.expectedRevision !== revision.number)
      throw new HttpError(409, "REVISION_CONFLICT");
    if (
      planning?.expectedProfileId &&
      planning.expectedProfileId !== profile.id
    )
      throw new HttpError(409, "ANALYSIS_CONFIGURATION_CHANGED");
    const aliases = await db.identityAlias.findMany({ where: { ownerId } });
    let participants = meeting.project.participants;
    const selfName = settings?.displayName.trim() || aliases[0]?.label;
    if (selfName && !participants.some((person) => person.isSelf)) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${meeting.projectId},1))`;
      participants = await db.projectParticipant.findMany({
        where: { projectId: meeting.projectId, archivedAt: null },
        include: { aliases: true },
      });
      if (!participants.some((person) => person.isSelf))
        participants.push(
          await db.projectParticipant.create({
            data: {
              projectId: meeting.projectId,
              displayName: selfName,
              isSelf: true,
              aliases: {
                create: [
                  ...new Set([
                    selfName.toLowerCase(),
                    ...aliases.map((alias) => alias.normalized),
                  ]),
                ].map((normalized) => ({ normalized })),
              },
            },
            include: { aliases: true },
          }),
        );
    }
    const snapshot = runSnapshot.parse({
      chunkLimit: planning?.chunkLimit ?? 12000,
      candidates: planning?.candidates ?? [],
      steps,
      revisionNumber: revision.number,
      outputLocale: settings?.outputLocale ?? "vi",
      timezone: meeting.meetingTimezone,
      occurredAt: meeting.occurredAt.toISOString(),
      participants: participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        isSelf: p.isSelf,
        aliases: [
          ...p.aliases.map((a) => a.normalized),
          ...(p.isSelf ? aliases.map((a) => a.normalized) : []),
        ],
      })),
      identity: meeting.identity.map((m) => ({
        speaker: m.speaker,
        isSharedSpeaker: m.isSharedSpeaker,
        mapping: m.mapping,
      })),
    });
    return db.analysisRun.create({
      data: {
        meetingId,
        revisionId: revision.id,
        profileRevisionId: profile.id,
        snapshot,
        promptVersion: "1",
        schemaVersion: "1",
        steps: { create: steps.map((stepKey) => ({ stepKey })) },
      },
    });
  });
}
export async function runForOwner(ownerId: string, runId: string) {
  const run = await database().analysisRun.findFirst({
    where: { id: runId, meeting: { project: { ownerId } } },
    include: {
      steps: true,
      meeting: true,
      revision: true,
      profile: { include: { profile: true } },
    },
  });
  if (!run) throw new HttpError(404, "RUN_NOT_FOUND");
  return run;
}
