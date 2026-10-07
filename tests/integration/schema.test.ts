import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

const client = new Client({
  connectionString:
    process.env["TEST_DATABASE_URL"] ??
    "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
});
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

it("enforces singleton owner and rolls back test records", async () => {
  await client.query("BEGIN");
  try {
    await client.query(
      'INSERT INTO "Owner" (id,email,"passwordHash") VALUES ($1,$2,$3)',
      [randomUUID(), `test-${randomUUID()}@example.test`, "fixture"],
    );
    await expect(
      client.query(
        'INSERT INTO "Owner" (id,email,"passwordHash") VALUES ($1,$2,$3)',
        [randomUUID(), "duplicate@example.test", "fixture"],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  } finally {
    await client.query("ROLLBACK");
  }
});

it("provides full schema and core full-text indexes", async () => {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  expect(tables.rows.map((row) => row.tablename)).toEqual(
    expect.arrayContaining([
      "TranscriptRevision",
      "AnalysisRun",
      "MeetingActionOccurrence",
      "TaskAssignment",
      "ChatMessageDependency",
      "Citation",
    ]),
  );
  const indexes = await client.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public'",
  );
  expect(indexes.rows.map((row) => row.indexname)).toEqual(
    expect.arrayContaining([
      "one_active_analysis_per_meeting",
      "search_english_gin",
      "search_simple_gin",
    ]),
  );
});

it("prevents duplicate active runs and preserves immutable revisions", async () => {
  await client.query("BEGIN");
  try {
    const owner = randomUUID(),
      project = randomUUID(),
      meeting = randomUUID(),
      revision = randomUUID(),
      profile = randomUUID(),
      config = randomUUID(),
      run = randomUUID();
    await client.query(
      'INSERT INTO "Owner" (id,email,"passwordHash") VALUES ($1,$2,$3)',
      [owner, "fixture@example.test", "fixture"],
    );
    await client.query(
      'INSERT INTO "Project" (id,"ownerId",name) VALUES ($1,$2,$3)',
      [project, owner, "Fixture"],
    );
    await client.query(
      'INSERT INTO "Meeting" (id,"projectId",title,"occurredAt","meetingTimezone") VALUES ($1,$2,$3,now(),$4)',
      [meeting, project, "Daily", "UTC"],
    );
    await client.query(
      'INSERT INTO "TranscriptRevision" (id,"meetingId",number,"rawText",sha256) VALUES ($1,$2,1,$3,$4)',
      [revision, meeting, "Hello", "sha"],
    );
    await client.query(
      'INSERT INTO "ProviderProfile" (id,"ownerId",name,type) VALUES ($1,$2,$3,$4)',
      [profile, owner, "Mock", "openai-compatible"],
    );
    await client.query(
      'INSERT INTO "ProviderProfileRevision" (id,"profileId",number,"baseUrl",model) VALUES ($1,$2,1,$3,$4)',
      [config, profile, "https://example.test", "mock"],
    );
    const insertRun =
      'INSERT INTO "AnalysisRun" (id,"meetingId","revisionId","profileRevisionId",snapshot,"promptVersion","schemaVersion") VALUES ($1,$2,$3,$4,$5,$6,$7)';
    await client.query(insertRun, [
      run,
      meeting,
      revision,
      config,
      {},
      "1",
      "1",
    ]);
    await client.query("SAVEPOINT duplicate_run");
    await expect(
      client.query(insertRun, [
        randomUUID(),
        meeting,
        revision,
        config,
        {},
        "1",
        "1",
      ]),
    ).rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate_run");
    await client.query(
      'INSERT INTO "AnalysisStep" (id,"runId","stepKey") VALUES ($1,$2,$3)',
      [randomUUID(), run, "map:1"],
    );
    await client.query("SAVEPOINT duplicate_step");
    await expect(
      client.query(
        'INSERT INTO "AnalysisStep" (id,"runId","stepKey") VALUES ($1,$2,$3)',
        [randomUUID(), run, "map:1"],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate_step");
    await client.query("SAVEPOINT immutable");
    await expect(
      client.query('UPDATE "TranscriptRevision" SET "rawText"=$1 WHERE id=$2', [
        "changed",
        revision,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT immutable");
  } finally {
    await client.query("ROLLBACK");
  }
});
