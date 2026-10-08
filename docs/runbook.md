# Daily Ledger operations runbook

## Preconditions and release scope

Single owner, Node22, Next.js full-stack, Prisma7/Postgres17. No cron, queue or worker.
Use the checked-in lockfile. Do not migrate/reset a production database to repair
test drift. Release controls and local commands are in `deployment.md`.
**Chưa đánh giá chất lượng AI thực tế.** Automated provider requests are fixtures.

## First owner and account recovery

Set DIRECT_URL securely on a trusted operator machine. Never pass passwords in argv.

```sh
pnpm admin:create-owner
pnpm admin:reset-password
node --experimental-strip-types scripts/admin.mjs --help
```

The prompts hide the password; minimum length12. Reset updates the existing owner
and revokes every session in one transaction. There is no public signup/reset API.
CLI rejects additional password arguments before opening prompts. The Compose ops
target runs the same commands against the internal database.

## Backups and restore

Keep encrypted dumps private, outside Git, and restrict filesystem permissions.
Database dumps include password hashes and encrypted provider credentials. Keep the
matching PROVIDER_ENCRYPTION_KEY and key ID in a separate secure backup, not the dump.

1. Verify database/project/environment identity and stop application writes.
2. Take a new custom-format pg_dump before any destructive restore.
3. Restore into a **new isolated database first**, using the matching Postgres major version.
4. Validate raw text/hash, immutable triggers, tasks/events, chat/citations and migrations.
5. Restore the matching encryption key/ID and verify fixture credential decryption.
6. Test login/reset, readiness and fixture analysis before changing production routing.
7. Preserve the old database and keys until rollback is no longer needed.

Examples are in `deployment.md`. `pg_restore --clean` is destructive; never point it
at a database based on a guessed URL. Task20 operations tests create two random disposable
databases, migrate the first, dump/restore into the second and remove only those databases.
They verify identical raw/hash and that restored immutable transcript triggers still reject updates.

## Encryption-key failure and rotation

An incorrect key ID returns ENCRYPTION_KEY_MISMATCH; a wrong key with the same ID
returns INVALID_ENCRYPTED_CREDENTIAL. These require operator reconfiguration, not
silent credential replacement. Do not clear ciphertext or retry another provider.
If the old key is lost, encrypted tokens cannot be recovered: re-enter credentials.

Current runtime accepts one active key, not an online multi-key rollout. Rotate offline:
stop writes/runs, back up DB plus old key IDs, load the required old/new keys into an
operator-only keyring, and re-encrypt credentials in reviewed transaction batches using
`openToken`/`sealToken`. Preserve AES-GCM AAD `{profileId, revision:number}` and use
fresh nonces. Update each row's key ID, switch environment key/ID, revoke sessions and
restart. Keep old keys for old backups. Never log tokens, keyring values or ciphertext dumps.
Do not advertise zero-downtime rotation or an automatic rotation CLI: neither is implemented.

## Failure handling and on-demand recovery

- Raw is saved before AI. Provider failure does not remove transcript revisions.
- Each analysis/chat request executes one bounded step; saved steps replay.
- Close/reopen the browser and use resume. Closing a tab is not a background-work guarantee.
- Respect429 Retry-After; do not clear production rate-limit buckets to bypass throttles.
- An expired claim is fenced; a response from the old process cannot publish.
- Relevant-field conflicts require reload/review; do not force an outdated approval.
- Native SSE deltas are provisional; only the final committed citation state is verified.
- `/api/health/live` is liveness; `/api/health/ready` checks configuration and database/schema access.
- Missing/unsafe deployment environment fails bootstrap; never expose URL/token details in public errors.

## Retention and disclosure

Trash hides sources immediately and cancels dependent runs. Restore before30 elapsed
24-hour days. Cleanup happens on authenticated visits in batches of10, not on a schedule.
Without visits, expired rows can remain physically present. Hard purge preserves confirmed
tasks and readable historical chat body/quote/label text, but removes source/operational
caches and revokes direct/transitive context eligibility. Saved chat excerpts, operator
backups and AI-provider copies are not a guarantee of complete erasure.

## Isolated preview smoke

Vercel CLI authentication alone is not enough. Provision/link an isolated Preview project,
dedicated Prisma Postgres DB, exact APP_ORIGIN, encryption key/ID and a public HTTPS
deterministic fixture endpoint. Do not point the smoke command at Production or a real model.
Supply SMOKE_EMAIL/SMOKE_PASSWORD through a private environment/secret manager, not argv.

```sh
SMOKE_ALLOW_PREVIEW_MUTATIONS=1 pnpm smoke -- --base-url "$PREVIEW_URL"
```

Also supply SMOKE_FIXTURE_URL (HTTPS fixture API root). The command creates isolated
synthetic project/provider/meeting/thread data and verifies readiness, login, analysis and
committed chat citations. Keep deployment protection compatible with the authorized operator;
do not disable production protection. Missing inputs produce status BLOCKED and exit2.

**Current remote status: BLOCKED.** CLI is authenticated, but no isolated preview URL,
preview DB configuration or public HTTPS fixture endpoint was supplied. No cloud deployment,
production migration or paid model evaluation was performed. Run the remote smoke only when
those prerequisites and explicit isolated-preview authorization are available.

## Rollback and final acceptance

Keep the previous image/deployment, database backup and matching keys. A code rollback does
not automatically reverse schema/data changes. Prefer restoring to a new database and switching
routing after verification; never reset/drop production to make a test green.
F1–F4 plan/quality/manual/scope verdicts and the user's explicit acceptance remain required
before claiming the whole project release complete.
