import { Client } from "pg";

export default async function teardown() {
  const db = new Client({
    connectionString: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
  });
  await db.connect();
  await db.query(
    'DELETE FROM "ChatMessageDependency" WHERE "messageId" IN (SELECT m.id FROM "ChatMessage" m JOIN "Conversation" c ON c.id=m."conversationId" JOIN "Owner" o ON o.id=c."ownerId" WHERE o.email=$1)',
    ["browser@example.test"],
  );
  await db.query(
    'DELETE FROM "Conversation" WHERE "ownerId" IN (SELECT id FROM "Owner" WHERE email=$1)',
    ["browser@example.test"],
  );
  await db.query(
    'DELETE FROM "Task" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "ownerId" IN (SELECT id FROM "Owner" WHERE email=$1))',
    ["browser@example.test"],
  );
  await db.query(
    'DELETE FROM "Meeting" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "ownerId" IN (SELECT id FROM "Owner" WHERE email=$1))',
    ["browser@example.test"],
  );
  await db.query(
    'DELETE FROM "ParticipantAlias" WHERE "participantId" IN (SELECT id FROM "ProjectParticipant" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "ownerId" IN (SELECT id FROM "Owner" WHERE email=$1)))',
    ["browser@example.test"],
  );
  await db.query(
    'DELETE FROM "ProjectParticipant" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "ownerId" IN (SELECT id FROM "Owner" WHERE email=$1))',
    ["browser@example.test"],
  );
  await db.query(
    'DELETE FROM "Project" WHERE "ownerId" IN (SELECT id FROM "Owner" WHERE email=$1)',
    ["browser@example.test"],
  );
  await db.query('DELETE FROM "Owner" WHERE email=$1', [
    "browser@example.test",
  ]);
  await db.query('DELETE FROM "RateLimitBucket"');
  await db.end();
}
