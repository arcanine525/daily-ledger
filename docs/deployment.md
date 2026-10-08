# Deployment configuration

## Vercel preview

Import this repository as Next.js with Node22.x and pnpm10.32.1. `vercel.json`
generates Prisma Client, validates the server environment, then builds Next.js.
Use a dedicated Prisma Postgres database for Preview, separate from Production.
Required variables: DATABASE_URL, DIRECT_URL, APP_ORIGIN (exact HTTPS preview or
stable preview-alias origin), PROVIDER_ENCRYPTION_KEY (32 random bytes, base64),
PROVIDER_ENCRYPTION_KEY_ID. Never use NEXT_PUBLIC_ for credentials.

Run `pnpm exec prisma migrate deploy` from a trusted machine against the preview
DIRECT_URL, then `pnpm admin:create-owner`. Password is prompted, never argv.
AI_DEV_ALLOWED_ORIGINS must be absent on Vercel; the build/start guards reject it.
Public HTTPS fixtures can use ordinary provider URLs without a private-network bypass.
No cloud deployment or preview smoke is claimed by this configuration alone.

## Standalone Compose

Create `.env` from `.env.example` and supply a unique encryption key. Preserve that
key separately from database backups. Compose's app uses its internal db connection;
CONTAINER_DATABASE_URL/CONTAINER_DIRECT_URL override this when needed. The original
host database port55432 and persistent volume remain unchanged.

```sh
docker compose config --quiet
docker compose up --build -d --wait
docker compose --profile ops run --rm ops pnpm admin:create-owner
```

Open http://127.0.0.1:3000. The migration service must finish successfully before
the app starts; healthchecks distinguish liveness from DB/schema readiness. The
runtime image executes as user `node`, validates configuration before binding the
listener, and copies Next's standalone/static output. There is no worker or cron.

Operator password reset:

```sh
docker compose --profile ops run --rm ops pnpm admin:reset-password
```

Back up from a trusted terminal; first create a private, ignored `backups` directory.
Never commit dumps or encryption keys. Do not use these commands against production
without the operator's backup/restore procedure and explicit target verification.

```sh
umask 077
docker compose exec -T db pg_dump -U ledger -d ledger -Fc > backups/ledger.dump
# Destructive restore: stop the app, verify the target, and take a backup first.
docker compose stop app
docker compose exec -T db pg_restore -U ledger -d ledger --clean --if-exists < backups/ledger.dump
docker compose up -d --wait
```

Never run `down -v` on a database you want to preserve. `down` without `-v` retains
the volume. Managed provider backups and AI-provider retention are separate.

## Isolated deployment fixture

`compose.deploy-test.yaml` contains only synthetic test credentials and is not a
production configuration. It does not use the normal local or integration database.
Pick a fresh project name and free app port; the default app port is3300. Its mock
provider is internal to the isolated network. `compose.test.yaml` also exposes an
optional `fixture` profile for the host test setup.

```sh
docker compose -f compose.deploy-test.yaml -p ledger-my-isolated-test up --build -d --wait
DEPLOY_TEST_PROJECT=ledger-my-isolated-test node scripts/deploy/verify-compose.mjs
docker compose -f compose.deploy-test.yaml -p ledger-my-isolated-test down
```

The driver is for a fresh isolated fixture volume and loopback origin only. It
exercises hidden-password owner creation, login, generated static assets, mock
analysis, approval and streamed chat. Reusing the populated volume preserves data;
it is intentionally not reset or silently overwritten by the driver.
