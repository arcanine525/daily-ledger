# Phase 2: transcript and analysis backend

Tasks6–10 follow the one-task / one-commit / push-before-next-task rule.
All work was performed directly by the current agent, without sub-agents.

## Delivered

- Raw-first meeting creation with persistent idempotency and duplicate confirmation.
- Immutable revisions, source-changed flags, archived-project rejection and speaker mapping.
- Exact UTF-16 evidence spans, optional segment disambiguation, conservative shared/unknown
  speaker handling and explicit meeting overrides. Speaker labels alone never identify a
  shared-speaker assignee. Declared global self identity is represented per project for new runs.
- Deadlines resolved from meeting date/timezone; ambiguous phrases remain null.
- Fenced per-run leases, server-owned step ordering, checkpoint replay, retry/backoff,
  cancellation and rejection of expired/stale claims. No network operation inside transactions.
- Native OpenAI-compatible, Anthropic Messages and Gemini generateContent adapters,
  structured output validation, bounded streaming, refusal/error handling and no automatic retries/fallback.
- HTTPS production transport validates all resolved addresses and pins the connection.
  Exact operator-allowed local origins support deterministic tests/local models only;
  Vercel disables that exception. DNS and response consumption are deadline-bounded.
- Map → hierarchical summary reduction → bounded candidate matching → atomic publish.
  Action items are preserved independently of summary reduction. Provider responses and
  available usage metadata are retained in successful checkpoints.
- Reanalysis keeps edited/accepted logical actions, supersedes untouched pending proposals,
  flags retained items without an exact match, and exposes uncertain reconciliation instead
  of creating another active copy. Rejected proposal fingerprints ignore rerun IDs and AI
  title rephrasing. Task changes remain proposals only; no canonical task is auto-created/updated.
- Published analysis is versioned and linked to the correct raw revision. Meeting detail API
  exposes current actions/proposals; list API uses cursor pagination.

## Verification executed

- `pnpm verify`: lint/typecheck/build pass; **14 unit, 23 integration, 6 E2E tests pass**.
- PostgreSQL17 integration tests cover duplicate effects, immutable source, concurrency,
  lease expiry, stale commits, retry checkpoints, reanalysis retention, rejection suppression,
  global identity and disabled-on-Vercel local allowlist.
- Long fixture is approximately24,000 English words / a2-hour meeting, processed through
  multiple map/reduce steps using deterministic model responses, not a real AI evaluation.
- HTTP E2E runs the built app and a local fixture provider: auth → project/provider → raw
  meeting → run → step loop → published analysis → replay. Connection probe uses the same
  fixture endpoint; no live provider or paid model request was made.
- A separate direct HTTP driver was also used against live local processes: raw preserved,
  oversize input413, pending CREATE produced, publish replay complete without another analysis.
  Disposable data and processes were cleaned after usage.

## Migration and operational notes

Prisma's generated diff attempted to remove hand-written FTS/FK invariants. The failed
local migration was repaired without resetting databases or deleting user data; both
local and test DBs now have the corrected migrations. Future migration generation must
use `--create-only` followed by SQL review (see AGENT.MD), preserving generated columns,
GIN indexes, evidence foreign keys and immutable-source triggers.

The run lifecycle, execution and reconciliation policy are separate modules so backend
files remain reviewable. Runtime LSP is unavailable; tsc and Biome CLI are the substitutes.
Informational Biome suggestions remain; no lint error. pg/Prisma emits a concurrency
deprecation warning during some transactions, and the test harness reports the existing
Next standalone/start advisory; neither failed the tests. Production Docker serving is Task18.

## Not delivered or claimed here

- Full meeting/task UI, confirmation endpoints and chat: Phase3–4.
- Automatic jobs continuing after the browser closes: not in the chosen architecture.
- Real-model extraction/translation/retrieval quality: **not evaluated**, by user decision.
- Vercel/cloud runtime verification: not performed; no production credentials or deployment.

Next authorized step must be Phase3, beginning with Task11; this handoff does not start it.
