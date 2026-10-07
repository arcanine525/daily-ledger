import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "../../src/server/db/client";
import { createMeeting } from "../../src/server/meetings/archive";
import { bulkCreate, decideProposal } from "../../src/server/tasks/decisions";
import { createTask, editTask } from "../../src/server/tasks/write";

const db = database();
let ownerId = "",
  projectId = "",
  otherProjectId = "",
  meetingId = "",
  revisionId = "";
beforeAll(async () => {
  ownerId = (
    await db.owner.create({
      data: { email: "tasks@example.test", passwordHash: "fixture" },
    })
  ).id;
  projectId = (await db.project.create({ data: { ownerId, name: "Tasks" } }))
    .id;
  otherProjectId = (
    await db.project.create({ data: { ownerId, name: "Other" } })
  ).id;
  meetingId = (
    await createMeeting(
      ownerId,
      {
        projectId,
        title: "Daily",
        occurredAt: "2026-10-07T02:00:00Z",
        meetingTimezone: "UTC",
        rawText: "Mai: Review API.",
      },
      "task-fixture",
    )
  ).id;
  revisionId = (
    await db.transcriptRevision.findFirstOrThrow({ where: { meetingId } })
  ).id;
});
afterAll(async () => {
  await db.task.deleteMany({ where: { project: { ownerId } } });
  await db.meeting.deleteMany({ where: { project: { ownerId } } });
  await db.project.deleteMany({ where: { ownerId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.proposalDecision.deleteMany({
    where: { idempotencyKey: { startsWith: `${ownerId}:` } },
  });
  await db.$disconnect();
});
async function proposal(
  kind: "CREATE" | "LINK" | "UPDATE" = "CREATE",
  taskId?: string,
) {
  const action = await db.meetingAction.create({
    data: { meetingId, title: "Review API", assignees: [] },
  });
  return db.taskProposal.create({
    data: {
      actionId: action.id,
      kind,
      taskId: taskId ?? null,
      expectedTaskVersion: taskId ? 1 : null,
      baseFieldVersions: { deadline: 1 },
      readFields: kind === "UPDATE" ? ["deadline"] : [],
      writeFields: kind === "UPDATE" ? ["deadline"] : [],
      changes: {
        before: {},
        after:
          kind === "UPDATE"
            ? { deadline: "2026-10-10" }
            : { title: "Review API", deadline: null, assigneeIds: [] },
        requiresReconciliation: false,
      },
      evidence: { revisionId, start: 0, end: 16, quote: "Mai: Review API." },
      sourceOccurredAt: new Date("2026-10-07T02:00:00Z"),
      fingerprint: randomUUID(),
    },
  });
}
it("creates a task only on approval and replays without another event", async () => {
  const p = await proposal();
  const before = await db.task.count();
  const result = await decideProposal(
    ownerId,
    p.id,
    { decision: "ACCEPT" },
    "approve-one",
  );
  expect(await db.task.count()).toBe(before + 1);
  if (!result.taskId) throw new Error("Approval did not produce a task");
  expect(
    (await decideProposal(ownerId, p.id, { decision: "ACCEPT" }, "approve-one"))
      .taskId,
  ).toBe(result.taskId);
  expect(await db.taskEvent.count({ where: { taskId: result.taskId } })).toBe(
    1,
  );
  expect(
    (await db.task.findUniqueOrThrow({ where: { id: result.taskId } })).status,
  ).toBe("TODO");
});
it("blocks relevant field edits but allows unrelated edits with revalidation", async () => {
  const task = await createTask(
    ownerId,
    { projectId, title: "Original" },
    "manual-task",
  );
  const p = await proposal("UPDATE", task.id);
  await editTask(ownerId, task.id, { expectedVersion: 1, title: "Renamed" });
  await decideProposal(ownerId, p.id, { decision: "ACCEPT" }, "unrelated");
  expect(
    (await db.task.findUniqueOrThrow({ where: { id: task.id } })).title,
  ).toBe("Renamed");
  const stale = await proposal("UPDATE", task.id);
  await editTask(ownerId, task.id, {
    expectedVersion: 3,
    deadline: "2026-10-12",
  });
  await expect(
    decideProposal(ownerId, stale.id, { decision: "ACCEPT" }, "stale"),
  ).rejects.toMatchObject({ status: 409 });
});
it("rejects cross-project links and unsafe bulk approvals", async () => {
  const task = await createTask(
    ownerId,
    { projectId: otherProjectId, title: "Other" },
    "other-task",
  );
  const linked = await proposal("LINK", task.id);
  await expect(
    decideProposal(ownerId, linked.id, { decision: "ACCEPT" }, "cross-project"),
  ).rejects.toMatchObject({ status: 422 });
  const fresh = await proposal();
  await expect(
    bulkCreate(ownerId, { proposalIds: [fresh.id, linked.id] }, "unsafe-bulk"),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    (await db.taskProposal.findUniqueOrThrow({ where: { id: fresh.id } }))
      .state,
  ).toBe("PENDING");
});
