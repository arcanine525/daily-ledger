import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  archived: z.boolean().optional(),
});
const participantSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  isSelf: z.boolean().default(false),
  aliases: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});
export async function projectForOwner(ownerId: string, id: string) {
  const project = await database().project.findFirst({
    where: { id, ownerId },
  });
  if (!project) throw new HttpError(404, "PROJECT_NOT_FOUND");
  return project;
}
export async function listProjects(ownerId: string) {
  return database().project.findMany({
    where: { ownerId },
    include: {
      participants: {
        include: { aliases: true },
        orderBy: { displayName: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}
export async function createProject(ownerId: string, input: unknown) {
  const result = projectSchema.safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_PROJECT");
  return database().project.create({
    data: { ownerId, name: result.data.name },
  });
}
export async function editProject(ownerId: string, id: string, input: unknown) {
  await projectForOwner(ownerId, id);
  const result = projectSchema.safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_PROJECT");
  return database().project.update({
    where: { id },
    data: {
      name: result.data.name,
      ...(result.data.archived !== undefined
        ? { archivedAt: result.data.archived ? new Date() : null }
        : {}),
    },
  });
}
export async function addParticipant(
  ownerId: string,
  projectId: string,
  input: unknown,
) {
  await projectForOwner(ownerId, projectId);
  const result = participantSchema.safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_PARTICIPANT");
  const { aliases, ...data } = result.data;
  return database().projectParticipant.create({
    data: {
      ...data,
      projectId,
      aliases: {
        create: [...new Set(aliases.map((a) => a.toLowerCase()))].map(
          (normalized) => ({ normalized }),
        ),
      },
    },
  });
}
export async function mergeParticipants(
  ownerId: string,
  projectId: string,
  input: unknown,
) {
  await projectForOwner(ownerId, projectId);
  const result = z
    .object({
      sourceId: z.uuid(),
      targetId: z.uuid(),
      confirm: z.literal(true),
    })
    .safeParse(input);
  if (!result.success || result.data.sourceId === result.data.targetId)
    throw new HttpError(422, "INVALID_IDENTITY_MERGE");
  return database().$transaction(async (db) => {
    const source = await db.projectParticipant.findFirst({
      where: { id: result.data.sourceId, projectId, archivedAt: null },
      include: { aliases: true },
    });
    const target = await db.projectParticipant.findFirst({
      where: { id: result.data.targetId, projectId, archivedAt: null },
    });
    if (!source || !target) throw new HttpError(404, "PARTICIPANT_NOT_FOUND");
    await db.participantAlias.deleteMany({
      where: { participantId: source.id },
    });
    await db.participantAlias.createMany({
      data: source.aliases.map((alias) => ({
        participantId: target.id,
        normalized: alias.normalized,
      })),
      skipDuplicates: true,
    });
    await db.projectParticipant.update({
      where: { id: source.id },
      data: { archivedAt: new Date(), mappingVersion: { increment: 1 } },
    });
    await db.projectParticipant.update({
      where: { id: target.id },
      data: { mappingVersion: { increment: 1 } },
    });
    return { merged: true, historicalAssignmentsChanged: false };
  });
}
export async function editParticipant(
  ownerId: string,
  projectId: string,
  id: string,
  input: unknown,
) {
  await projectForOwner(ownerId, projectId);
  const result = participantSchema.safeParse(input);
  if (!result.success) throw new HttpError(422, "INVALID_PARTICIPANT");
  return database().$transaction(async (db) => {
    const participant = await db.projectParticipant.findFirst({
      where: { id, projectId, archivedAt: null },
    });
    if (!participant) throw new HttpError(404, "PARTICIPANT_NOT_FOUND");
    const { aliases, ...data } = result.data;
    await db.projectParticipant.update({
      where: { id },
      data: { ...data, mappingVersion: { increment: 1 } },
    });
    await db.participantAlias.deleteMany({ where: { participantId: id } });
    await db.participantAlias.createMany({
      data: [...new Set(aliases.map((a) => a.toLowerCase()))].map(
        (normalized) => ({ participantId: id, normalized }),
      ),
    });
    return { saved: true, historicalAssignmentsChanged: false };
  });
}
