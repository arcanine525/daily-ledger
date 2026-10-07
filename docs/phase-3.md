# Phase 3: tasks, product workflows, search, chat and retention

Tasks 11–15 are implemented. Phase 4 has not started. Work was performed directly
in the current agent, without sub-agents, with one implementation commit and push
per task. No live model or paid AI evaluation was used.

## Delivered scope

| Task | Result | Commit |
| --- | --- | --- |
| 11 | Canonical/manual tasks, approval receipts, field-version conflicts, safe bulk create, link/unlink and event history | `de88995` |
| 12 | Dashboard, meetings/raw/revisions/progress, approval inbox, tasks and project UI | `b83696e` |
| 13 | Current-revision PostgreSQL FTS and literal lookup, scope intersections and visibility guards | `5301ea7` |
| 14 | Read-only allowlisted chat, bounded map/reduce, history snapshots, separate task/pending groups and verified citations | `af019a8` |
| 15 | Trash/restore, on-visit expiry cleanup, source tombstones and deletion-safe context | This document's task commit |

The chat and trash **backend/API** is available. Full chat/trash screens and final
UI polish remain Phase 4 work, not functionality claimed by this handoff.

## Chat API

- `GET/POST /api/conversations`: list/create owner conversations; create accepts `{title}`.
- `GET /api/conversations/[id]/messages`: readable history with citation labels,
  quotes, source-deleted flags and context eligibility.
- `POST /api/conversations/[id]/messages`: `{question, filters?, idempotencyKey?}`
  creates a snapshotted run and its user/assistant message pair.
- Filters: projectId, meetingId, meeting-date from/to, deadline dueFrom/dueTo and
  ALL/MINE/UNASSIGNED. Provider planning cannot expand these filters.
- `GET /api/chat-runs/[id]`: state, snapshot and step metadata only; source
  checkpoints are not exposed through the public status response.
- `POST /api/chat-runs/[id]/step`: `{stepKey}`; execute in snapshot order and reload
  the snapshot after retrieval adds map/reduction steps. Completed steps replay.
- `POST /api/chat-runs/[id]/cancel`: invalidate the active claim and cancel the reply.

Allowlisted intents are LOOKUP, LIST_TASKS, TASK_COUNTS, TASK_HISTORY,
MEETING_SUMMARY and CLARIFY. LOOKUP is ranked lexical retrieval, not exhaustive
semantic search. Task counts use SQL without top-k; pending Todos have no business
status and are not combined with confirmed-task counts. Historical assignments,
deadlines and status come from the event snapshot at cutoff, not current fields.
Meeting evidence remains a separate section, including late-ingested meetings.

Long requests traverse all scoped meetings in database batches and then persisted,
bounded map steps and hierarchical reductions. Final prompts do not repeat the
entire original transcript collection. Provider authentication failures are fatal;
retryable failures preserve retry timing and checkpoints, with no provider fallback.

The answer step uses native provider streaming and SSE events: `stage`, provisional
`delta` (`verified:false`), then `done` (`verified:true`) only after citation and
visibility validation and database commit. Invalid output produces `error`, not a
verified answer. A disconnected client can inspect persisted state and resume the
next step; no background worker completes subsequent steps.

## Retention API and invariants

- `GET /api/trash`: owner meeting metadata, without raw source content.
- `POST /api/meetings/[id]/trash`: soft-delete without resetting an existing trash clock.
- `POST /api/meetings/[id]/restore`: restore within 30 elapsed 24-hour days; rebuild
  search documents and recompute direct/transitive chat context eligibility.
- `POST /api/meetings/[id]/purge`: `{confirmationTitle}` must exactly match the
  meeting title; immediate permanent purge is available even before expiry.
- `POST /api/maintenance/purge-expired`: at most ten expired meetings; returns
  `{purged, hasMore, busy}`. An authenticated app visit calls it and continues
  batches while mounted. Database transaction advisory locks serialize cleanup
  against chat publication and avoid simultaneous maintenance work from two tabs.

All mutations require the session cookie, exact Origin and session CSRF token.
There is no scheduler. Without a visit, expired records may remain physically in
the database. A maintenance failure displays a bilingual status notice and retries
on the next app visit, rather than pretending cleanup succeeded.

Trash immediately hides meeting/raw retrieval and invalidates dependent runs.
Purge cascades raw revisions, segments, analyses, analysis checkpoints, actions,
proposals and meeting search documents. Task evidence becomes a tombstone with
null live references and cleared quote/span caches. Related decision provenance
is scrubbed; dependent chat-run checkpoints and operational question copies are
cleared. Old meeting creation receipts prevent retrying a purged request from
silently recreating the source.

Canonical tasks and their user-confirmed work history survive. Chat bodies and
already displayed citation quote/label text remain readable byte-for-byte, with
unavailable-source flags and no live raw reference. Recursive dependency closure
excludes direct and indirect dependent user/assistant turns from new provider
context; independent turns remain eligible. Restore cannot revive hard-purged
dependencies. Final commits recheck source visibility under the cleanup lock, so
an in-flight model response cannot resurrect purged data.

**Retention exception:** purge is not erasure of all historical excerpts. Saved
chat may still contain quoted or paraphrased content, and database backups/provider
retention are outside this application's immediate deletion guarantee.

## Verification on 2026-10-07

`pnpm verify` exited 0 using Node 22 and pnpm 10:

- Biome lint: no errors; eight pre-existing warnings and nine informational suggestions.
- TypeScript strict typecheck and Next.js production build: passed.
- Unit tests: **15 passed**.
- Real PostgreSQL integration tests: **44 passed**.
- Built-app HTTP and real Chrome E2E tests: **13 passed**.

Chat checks include Vietnamese fixture expansion into English evidence, exact
quotes, invented citation rejection, historical field filtering, 21-meeting map/
reduce coverage, SQL counts beyond twelve tasks, ambiguous-date clarification,
idempotency conflicts, transitive context exclusion and provider401 without fallback.
HTTP checks observe provisional native SSE followed by committed verified citations.

Retention checks cover day29 restore/day31 expiry, ten-item batches, no job without
a visit, concurrent-maintenance busy response, source-cache scrubbing, preserved
tasks/chat, stale analysis completion and a deliberately paused in-flight chat
response rejected after purge. Browser tests perform login, observe visit-triggered
cleanup and exercise bilingual cleanup failure notices at390/768/1440px with no
horizontal overflow or uncaught page errors.

Local screenshots and evidence are in ignored `.omo/evidence/task-15-plan/` and
`.omo/evidence/task-14-plan.txt`. Independent reviewer agents were not spawned,
in accordance with the user's direct-agent instruction; no independent visual
certification or Lighthouse score is claimed.

## Limitations and next phase

- TypeScript LSP is unavailable and installation was previously declined; CLI
  typecheck, lint, build and execution supplied validation instead.
- Existing pg concurrency deprecation and Next standalone/start advisories remain.
- A pre-existing formatting-only change in `tests/e2e/search-api.spec.ts` is left
  unstaged; no unrelated work was reverted.
- No Vercel preview or cloud migration/deployment was performed.
- **Chưa đánh giá chất lượng AI thực tế.** Fixture tests prove orchestration and
  data boundaries, not real-model answer quality.
- Await a new instruction before Phase 4 Task16, chat UI/citations/resume.
