# Phase 1 delivery

Tasks 1–5 are committed separately and pushed after validation, per AGENT.MD.

## Usable surface

- Next.js pages `/vi`, `/en`, `/vi/login`, `/vi/settings`, `/en/settings`.
- Single-owner login, HTTP-only session, Origin/CSRF checks, database login throttling.
- Operator create/reset CLI with hidden password input; reset revokes sessions.
- Real PostgreSQL schema/migrations for the planned archive, task and chat models.
- Provider profiles: versioned encrypted token, safe metadata reads, delete scrubs
  credentials/cancels active runs. Test endpoint reports Task 9 adapter unavailable,
  not a fabricated live-provider success.
- HTTPS transport validates all DNS addresses and pins the selected address, rejects
  redirects and bounds timeout/response bytes. No live AI request was made.
- Settings: self aliases, distinct UI/output language, first browser timezone capture
  once, profile selection for analysis/chat independently.
- Projects: create/rename/archive/unarchive; participants and alias edits; explicit
  future-only merge keeps historical assignment snapshots untouched.

## Verification

- Node22/pnpm10 lint, strict TypeScript, production Next build.
- Unit tests for environment and scrypt verification.
- Integration tests against PostgreSQL17 test DB for constraints, immutable revisions,
  duplicate runs/steps, auth, encryption/metadata tamper, unsafe IP/URL rejection,
  stored token isolation, timezone behavior and historical assignment preservation.
- Chrome E2E: bilingual foundation after login, invalid login, unsupported locale,
  actual settings save/provider save/project create/participant create/mobile/logout.
- Direct manual browser use: login, persisted name save, browser timezone capture,
  and visual inspection of rendered settings. Operator CLI was driven directly with
  disposable test credentials and checked for password-output suppression/revocation.

## Limits

- No Vercel deployment/cloud database credentials used; cloud verification is later.
- No live-provider quality evaluation or native inference adapters yet (Task 9).
- Actual transcript ingestion, AI pipeline, task UI and chat UI are later phases.
- TypeScript/Biome LSP servers unavailable; tsc, Biome CLI and browser tests are the
  verification substitutes. Biome informational bracket-key advice does not override
  TypeScript's noPropertyAccessFromIndexSignature rule.
- PostgreSQL services are local: dev port55432 and isolated test port55433. Do not
  point integration tests at production. No real meeting data or secrets committed.
- Encryption key rotation requires re-login to refresh session CSRF tokens; backup
  key material separately from the database. Full operational runbook is Task 20.
