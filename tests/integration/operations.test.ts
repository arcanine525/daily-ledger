import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "../../src/server/db/client";
import { openToken, sealToken } from "../../src/server/providers/crypto";
import { saveProfile } from "../../src/server/providers/profiles";
import { runtimeProvider } from "../../src/server/providers/runtime";

const source = `ledger_ops_${randomUUID().replaceAll("-", "")}`,
  restored = `${source}_restore`,
  container = "meeting-notes-test-db-1",
  url = (name: string) => `postgresql://ledger:ledger@127.0.0.1:55433/${name}`;
let db: Client;
async function operator(mode: "create" | "reset", password: string) {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "scripts/admin.mjs", mode],
    {
      env: { ...process.env, DIRECT_URL: url(source) },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "",
    error = "",
    emailSent = false,
    passwordSent = false;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (!emailSent && output.includes("Email:")) {
      emailSent = true;
      child.stdin.write("ops@example.test\n");
    }
    if (!passwordSent && output.includes("Password (hidden):")) {
      passwordSent = true;
      child.stdin.write(`${password}\n`);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    error += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  expect(code, error).toBe(0);
  expect(output).not.toContain(password);
  return output;
}
beforeAll(async () => {
  for (const name of [source, restored])
    execFileSync("docker", [
      "exec",
      container,
      "createdb",
      "-U",
      "ledger",
      name,
    ]);
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DIRECT_URL: url(source) },
      stdio: "pipe",
      timeout: 60000,
    },
  );
  db = new Client({ connectionString: url(source) });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
  await database().$disconnect();
  for (const name of [source, restored])
    execFileSync("docker", [
      "exec",
      container,
      "dropdb",
      "-U",
      "ledger",
      "--if-exists",
      name,
    ]);
});
it("shows help without prompting and refuses password arguments", () => {
  const help = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/admin.mjs", "--help"],
    { encoding: "utf8" },
  );
  expect(help).toContain("create|reset");
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/admin.mjs",
      "create",
      "forbidden-argv-secret",
    ],
    { encoding: "utf8", timeout: 3000 },
  );
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain("forbidden-argv-secret");
});
it("operator reset revokes existing sessions without echoing a password", async () => {
  await operator("create", "initial-ops-fixture-password");
  const owner = (await db.query<{ id: string }>('SELECT id FROM "Owner"'))
    .rows[0];
  if (!owner) throw new Error("Missing owner");
  await db.query(
    'INSERT INTO "Session" (id,"ownerId","tokenHash","csrfHash","expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'1 day\')',
    [randomUUID(), owner.id, "fixture-session", "fixture-csrf"],
  );
  expect(await operator("reset", "changed-ops-fixture-password")).toContain(
    "sessions revoked",
  );
  expect(
    (await db.query('SELECT count(*)::integer AS count FROM "Session"')).rows[0]
      .count,
  ).toBe(0);
});
it("restores immutable raw hashes from a custom-format dump into a separate disposable database", async () => {
  const owner = (await db.query<{ id: string }>('SELECT id FROM "Owner"'))
    .rows[0];
  if (!owner) throw new Error("Missing owner");
  const project = randomUUID(),
    meeting = randomUUID(),
    revision = randomUUID(),
    raw = "Mai: Operations restore fixture.",
    hash = createHash("sha256").update(raw).digest("hex");
  await db.query(
    'INSERT INTO "Project" (id,"ownerId",name) VALUES ($1,$2,$3)',
    [project, owner.id, "Ops"],
  );
  await db.query(
    'INSERT INTO "Meeting" (id,"projectId",title,"occurredAt","meetingTimezone") VALUES ($1,$2,$3,NOW(),$4)',
    [meeting, project, "Backup", "UTC"],
  );
  await db.query(
    'INSERT INTO "TranscriptRevision" (id,"meetingId",number,"rawText",sha256) VALUES ($1,$2,1,$3,$4)',
    [revision, meeting, raw, hash],
  );
  const dump = execFileSync(
    "docker",
    ["exec", container, "pg_dump", "-U", "ledger", "-d", source, "-Fc"],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  execFileSync(
    "docker",
    ["exec", "-i", container, "pg_restore", "-U", "ledger", "-d", restored],
    { input: dump },
  );
  const restoredDb = new Client({ connectionString: url(restored) });
  await restoredDb.connect();
  try {
    expect(
      (
        await restoredDb.query(
          'SELECT "rawText",sha256 FROM "TranscriptRevision" WHERE id=$1',
          [revision],
        )
      ).rows[0],
    ).toEqual({ rawText: raw, sha256: hash });
    await expect(
      restoredDb.query(
        'UPDATE "TranscriptRevision" SET "rawText"=$1 WHERE id=$2',
        ["Changed", revision],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  } finally {
    await restoredDb.end();
  }
});
it("rejects the wrong encryption key rather than silently replacing saved credentials", () => {
  const metadata = { profileId: randomUUID(), revision: 1 },
    sealed = sealToken("fixture-provider-token", metadata, Buffer.alloc(32, 1));
  expect(() => openToken(sealed, metadata, Buffer.alloc(32, 2))).toThrow();
  expect(openToken(sealed, metadata, Buffer.alloc(32, 1))).toBe(
    "fixture-provider-token",
  );
});
it("requires credential reconfiguration at runtime with the wrong key and leaves ciphertext unchanged", async () => {
  const client = database(),
    owner = await client.owner.create({
      data: { email: "ops-key@example.test", passwordHash: "fixture" },
    });
  try {
    const profile = await saveProfile(owner.id, {
        name: "Ops key",
        type: "openai-compatible",
        baseUrl: "https://example.com",
        model: "fixture",
        token: "fixture-only-token",
      }),
      revision = await client.providerProfileRevision.findFirstOrThrow({
        where: { profileId: profile.id },
      });
    vi.stubEnv(
      "PROVIDER_ENCRYPTION_KEY",
      Buffer.alloc(32, 2).toString("base64"),
    );
    await expect(runtimeProvider(owner.id, revision.id)).rejects.toMatchObject({
      code: "INVALID_ENCRYPTED_CREDENTIAL",
    });
    expect(
      (
        await client.providerProfileRevision.findUniqueOrThrow({
          where: { id: revision.id },
        })
      ).ciphertext,
    ).toBe(revision.ciphertext);
  } finally {
    vi.unstubAllEnvs();
    await client.owner.delete({ where: { id: owner.id } });
  }
});
