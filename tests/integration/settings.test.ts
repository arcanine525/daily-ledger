import { afterAll, beforeAll, expect, it } from "vitest";
import { database } from "../../src/server/db/client";
import { saveSettings } from "../../src/server/settings/preferences";
import {
  addParticipant,
  createProject,
  mergeParticipants,
} from "../../src/server/settings/projects";

const db = database();
let ownerId = "";
beforeAll(async () => {
  ownerId = (
    await db.owner.create({
      data: { email: "settings@example.test", passwordHash: "fixture" },
    })
  ).id;
});
afterAll(async () => {
  await db.participantAlias.deleteMany({
    where: { participant: { project: { ownerId } } },
  });
  await db.projectParticipant.deleteMany({ where: { project: { ownerId } } });
  await db.project.deleteMany({ where: { ownerId } });
  await db.owner.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
it("initializes timezone once and allows explicit changes", async () => {
  await saveSettings(ownerId, {
    timezone: "Asia/Ho_Chi_Minh",
    initializeTimezone: true,
  });
  await saveSettings(ownerId, {
    timezone: "America/New_York",
    initializeTimezone: true,
  });
  expect(
    (await db.userSettings.findUniqueOrThrow({ where: { ownerId } })).timezone,
  ).toBe("Asia/Ho_Chi_Minh");
  await saveSettings(ownerId, { timezone: "America/New_York", uiLocale: "en" });
  expect(
    (await db.userSettings.findUniqueOrThrow({ where: { ownerId } })).timezone,
  ).toBe("America/New_York");
  await expect(
    saveSettings(ownerId, { timezone: "Mars/Space" }),
  ).rejects.toMatchObject({ status: 422 });
});
it("merges future alias resolution without altering historical assignments", async () => {
  const project = await createProject(ownerId, { name: "Fixture" });
  const alex = await addParticipant(ownerId, project.id, {
    displayName: "Alex",
    aliases: ["alex"],
  });
  const full = await addParticipant(ownerId, project.id, {
    displayName: "Alex Nguyen",
    aliases: ["alex nguyen"],
  });
  const task = await db.task.create({
    data: {
      projectId: project.id,
      title: "Keep history",
      origin: "MANUAL",
      assignments: {
        create: {
          participantId: alex.id,
          nameSnapshot: "Alex",
          mappingVersion: 1,
        },
      },
    },
  });
  await mergeParticipants(ownerId, project.id, {
    sourceId: alex.id,
    targetId: full.id,
    confirm: true,
  });
  expect(
    (await db.taskAssignment.findFirstOrThrow({ where: { taskId: task.id } }))
      .nameSnapshot,
  ).toBe("Alex");
  expect(
    (
      await db.participantAlias.findFirstOrThrow({
        where: { normalized: "alex" },
      })
    ).participantId,
  ).toBe(full.id);
  expect(await db.owner.count()).toBe(1);
  await db.task.delete({ where: { id: task.id } });
});
