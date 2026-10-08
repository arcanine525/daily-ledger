# Phase 4 progress

Phase 4 is authorized. Work remains direct-agent, mock-AI only, with exactly one
validated commit and push per implementation task. Final F1–F4 acceptance remains separate.

## Task 16: grounded bilingual chat UI

Implemented `/vi/chat` and `/en/chat`: persisted threads, project/meeting/assignee
scope, independent meeting-date/deadline filters, saved message filters, provisional
streaming and verified final replies, run checkpoints/pause/resume/cancel, separate
confirmed/pending task groups with ten-row pages and independent totals, and historical
application state versus meeting evidence. HTML and image syntax renders as plaintext.

Owned `/api/conversations/[id]` exposes active-run resume metadata without credentials.
Owned `/api/citations/[id]` resolves exact pinned transcript revisions or task events;
trashed/purged references cannot open raw. Saved answers remain readable after purge.
Retrieval now orders task rows deterministically so source selection and paging do not
depend on PostgreSQL heap layout.

Validation: `pnpm verify` passed with15 unit,44 real-DB integration and16 built-app
HTTP/Chrome E2E tests, strict typecheck and production build. Integration timeout is
30s, not the previous5s default; full multi-step fixtures exceeded5s on this machine.
No assertions were removed or weakened. Screenshots at390/768/1440px in VI/EN and a
pinned-v1 source dialog are in ignored `.omo/evidence/task-16-plan/`.

No live-model quality, Vercel preview, independent reviewer or Lighthouse certification
is claimed. TypeScript LSP remains unavailable; CLI validation is used.

## Task 17: lifecycle UI, locale and accessibility

Added trash screens and meeting-to-trash confirmation, keyboard restore and exact-title
purge confirmation with the retained-chat warning. Source dialogs have accessible names,
locale-aware close controls and native focus handling. Settings use the same panel system.
Locale switches preserve query parameters, persist a browser preference and the authenticated
UI preference, update document language and leave analysis-language selection unchanged.
Error/run-state catalogs have identical EN/VI keys; form/resource/chat errors are localized
without rendering arbitrary exception payloads. Existing bilingual labels remain localized.

Validation: `pnpm verify` passed with18 unit,44 integration and19 E2E tests. Axe4.13.0
checks found no automatically detectable serious/critical WCAG A/AA violations across
eleven routes in both languages. Overflow was checked at390/768/1440px on every route;
keyboard confirmation/restore and six trash screenshots were checked. This is not a claim
of comprehensive WCAG or Lighthouse certification. Evidence: `.omo/evidence/task-17-plan/`.

Tasks18–20 and F1–F4 are pending.
