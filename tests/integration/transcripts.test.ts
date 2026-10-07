import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "../../src/server/db/client";
import {
  createMeeting,
  reviseMeeting,
} from "../../src/server/meetings/archive";

const db = database();
let ownerId = "",
  projectId = "";
const raw =
  "09:00 Mai: I will review the API.\r\nUnlabelled 😀 continuation\r\n09:01 Alex: Tomorrow I will finish the tests.\n";
beforeAll(async () => {
  const owner = await db.owner.create({
    data: { email: "transcripts@example.test", passwordHash: "fixture" },
  });
  ownerId = owner.id;
  projectId = (await db.project.create({ data: { ownerId, name: "Daily" } }))
    .id;
});
afterAll(async () => {
  await db.meeting.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
const input = () => ({
  projectId,
  title: "Daily",
  occurredAt: "2026-10-07T02:00:00Z",
  meetingTimezone: "Asia/Ho_Chi_Minh",
  rawText: raw,
});
it("saves raw bytes once and retains old revision when editing", async () => {
  const first = await createMeeting(ownerId, input(), "key-1");
  expect((await createMeeting(ownerId, input(), "key-1")).id).toBe(first.id);
  const old = await db.transcriptRevision.findFirstOrThrow({
    where: { meetingId: first.id, number: 1 },
  });
  expect(old.rawText).toBe(raw);
  await reviseMeeting(ownerId, first.id, {
    rawText: raw + "09:05 Mai: Correction, next week.",
    expectedRevision: 1,
  });
  expect(
    (await db.transcriptRevision.findUniqueOrThrow({ where: { id: old.id } }))
      .rawText,
  ).toBe(raw);
  expect(
    await db.transcriptRevision.count({ where: { meetingId: first.id } }),
  ).toBe(2);
  await expect(
    createMeeting(ownerId, { ...input(), title: "Changed" }, "key-1"),
  ).rejects.toMatchObject({ status: 409 });
});
it("rejects oversize empty archived and duplicate inputs", async () => {
  await expect(
    createMeeting(ownerId, { ...input(), rawText: " " }, "empty"),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    createMeeting(
      ownerId,
      { ...input(), rawText: "x".repeat(240001) },
      "large",
    ),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    createMeeting(ownerId, input(), "duplicate"),
  ).rejects.toMatchObject({ code: "DUPLICATE_TRANSCRIPT" });
  await db.project.update({
    where: { id: projectId },
    data: { archivedAt: new Date() },
  });
  await expect(
    createMeeting(ownerId, { ...input(), confirmDuplicate: true }, "archived"),
  ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
  await db.project.update({
    where: { id: projectId },
    data: { archivedAt: null },
  });
});
