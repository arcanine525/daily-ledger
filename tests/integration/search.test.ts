import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "../../src/server/db/client";
import {
  createMeeting,
  reviseMeeting,
} from "../../src/server/meetings/archive";
import { search } from "../../src/server/search/retrieve";
import { createTask } from "../../src/server/tasks/write";

const db = database();
let ownerId = "",
  projectId = "",
  meetingId = "";
beforeAll(async () => {
  ownerId = (
    await db.owner.create({
      data: { email: "search@example.test", passwordHash: "fixture" },
    })
  ).id;
  projectId = (await db.project.create({ data: { ownerId, name: "Search" } }))
    .id;
  meetingId = (
    await createMeeting(
      ownerId,
      {
        projectId,
        title: "Search daily",
        occurredAt: "2026-10-07T02:00:00Z",
        meetingTimezone: "UTC",
        rawText:
          "Mai: We are running migration tests.\nAlex: Ticket ALPHA-525 is blocked.",
      },
      "search-meeting",
    )
  ).id;
});
afterAll(async () => {
  await db.task.deleteMany({ where: { projectId } });
  await db.meeting.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
it("finds English stemming and literal ticket names", async () => {
  expect(
    (await search(ownerId, { query: "run migration" })).items.some(
      (item) => item.meetingId === meetingId,
    ),
  ).toBe(true);
  expect((await search(ownerId, { query: "ALPHA-525" })).items).toHaveLength(1);
});
it("does not expose old revisions or trashed sources", async () => {
  await reviseMeeting(ownerId, meetingId, {
    expectedRevision: 1,
    rawText: "Mai: New release plan.",
  });
  expect((await search(ownerId, { query: "migration" })).items).toHaveLength(0);
  await db.meeting.update({
    where: { id: meetingId },
    data: { deletedAt: new Date() },
  });
  expect((await search(ownerId, { query: "release" })).items).toHaveLength(0);
  await db.meeting.update({
    where: { id: meetingId },
    data: { deletedAt: null },
  });
});
it("indexes independent tasks and treats SQL text as data", async () => {
  await createTask(
    ownerId,
    { projectId, title: "Document deployment workflow" },
    "search-task",
  );
  expect(
    (await search(ownerId, { query: "deployment" })).items.some(
      (item) => item.kind === "TASK",
    ),
  ).toBe(true);
  expect(
    (await search(ownerId, { query: "'; DROP TABLE Owner; --" })).items,
  ).toHaveLength(0);
  expect(await db.owner.count()).toBe(1);
});
