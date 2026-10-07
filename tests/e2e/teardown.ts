import { Client } from "pg";

export default async function teardown() {
  const db = new Client({
    connectionString: "postgresql://ledger:ledger@127.0.0.1:55433/ledger_test",
  });
  await db.connect();
  await db.query('DELETE FROM "Owner" WHERE email=$1', [
    "browser@example.test",
  ]);
  await db.query('DELETE FROM "RateLimitBucket"');
  await db.end();
}
