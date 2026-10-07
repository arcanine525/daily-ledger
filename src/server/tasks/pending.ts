import { z } from "zod";
import { HttpError } from "../auth/session";
import { database } from "../db/client";
import { taskFields } from "./contracts";
import { assignments } from "./transaction";
import { editTask } from "./write";

export async function editAction(ownerId: string, id: string, input: unknown) {
  const parsed = taskFields
    .omit({ status: true })
    .partial()
    .extend({ expectedVersion: z.number().int().positive() })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new HttpError(422, "INVALID_PENDING_EDIT");
  const action = await database().meetingAction.findFirst({
    where: { id, meeting: { deletedAt: null, project: { ownerId } } },
    include: { meeting: true, task: true },
  });
  if (!action) throw new HttpError(404, "ACTION_NOT_FOUND");
  if (action.taskId && action.task)
    return editTask(ownerId, action.taskId, {
      ...parsed.data,
      expectedVersion: parsed.data.expectedVersion,
    });
  return database().$transaction(async (tx) => {
    const roster = parsed.data.assigneeIds
      ? await assignments(tx, {
          projectId: action.meeting.projectId,
          ids: parsed.data.assigneeIds,
        })
      : null;
    const changed = await tx.meetingAction.updateMany({
      where: { id, version: parsed.data.expectedVersion },
      data: {
        version: { increment: 1 },
        manuallyEditedAt: new Date(),
        ...(parsed.data.title !== undefined
          ? { title: parsed.data.title }
          : {}),
        ...(parsed.data.deadline !== undefined
          ? {
              dueDate: parsed.data.deadline
                ? new Date(`${parsed.data.deadline}T00:00:00Z`)
                : null,
            }
          : {}),
        ...(roster
          ? {
              assignees: roster.map((p) => ({
                id: p.participantId,
                name: p.nameSnapshot,
                isSelf: p.isSelfSnapshot,
                mappingVersion: p.mappingVersion,
              })),
            }
          : {}),
      },
    });
    if (!changed.count) throw new HttpError(409, "ACTION_VERSION_CONFLICT");
    return { saved: true };
  });
}
