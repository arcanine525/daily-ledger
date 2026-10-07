import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashPassword } from "../../src/server/auth/password";

export default async function setup() {
  const db = new Client({
    connectionString: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
  });
  await db.connect();
  const id = randomUUID();
  await db.query(
    'INSERT INTO "Owner" (id,email,"passwordHash") VALUES ($1,$2,$3)',
    [id, "browser@example.test", await hashPassword("browser-test-password")],
  );
  await db.query('INSERT INTO "UserSettings" ("ownerId") VALUES ($1)', [id]);
  await db.end();
}
