import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/server/auth/password.ts";

const args=process.argv.slice(2);
if(args.includes("--help")){process.stdout.write("Usage: admin.mjs create|reset\nEmail and password are prompted; never pass a password as an argument.\n");process.exit(0);}
const mode=args[0];
if(args.length!==1||(mode!=="create"&&mode!=="reset")){process.stderr.write("Use create or reset; never pass a password as an argument.\n");process.exit(1);}
let hidden = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
const email = (await prompt.question("Email: ")).trim().toLowerCase();
process.stdout.write("Password (hidden): "); hidden = true;
const password = await prompt.question(""); hidden = false;
process.stdout.write("\n"); prompt.close();
if (!email.includes("@") || password.length < 12) throw new Error("Valid email and at least 12 password characters required");
const db = new Client({ connectionString: process.env.DIRECT_URL });
await db.connect();
try {
  await db.query("BEGIN");
  const hash = await hashPassword(password);
  if (mode === "create") {
    const id = randomUUID();
    await db.query('INSERT INTO "Owner" (id,email,"passwordHash") VALUES ($1,$2,$3)', [id,email,hash]);
    await db.query('INSERT INTO "UserSettings" ("ownerId") VALUES ($1)',[id]);
  } else {
    const result = await db.query('UPDATE "Owner" SET "passwordHash"=$1 WHERE email=$2 RETURNING id',[hash,email]);
    if (!result.rows[0]) throw new Error("Owner not found");
    await db.query('DELETE FROM "Session" WHERE "ownerId"=$1',[result.rows[0].id]);
  }
  await db.query("COMMIT");
  process.stdout.write(mode === "create" ? "Owner created.\n" : "Password reset; sessions revoked.\n");
} catch (error) { await db.query("ROLLBACK"); throw error; }
finally { await db.end(); }
