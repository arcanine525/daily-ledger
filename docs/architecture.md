# Architecture and approved decision map

Next.js App Router owns the browser UI and thin authenticated HTTP adapters. Business
logic is in `src/server`. Prisma/Postgres stores raw immutable revisions, analyses,
logical actions, canonical tasks/events, chat runs/checkpoints/citations and dependency
edges. PostgreSQL English/simple FTS is lexical retrieval, not a vector/semantic engine.
Native OpenAI-compatible/Anthropic/Gemini transports pin allowed DNS addresses and keep
credentials server-side. Browser-driven steps perform at most one provider call, outside
DB publication transactions; leases/fencing and idempotent receipts prevent stale commits.
Retention keeps canonical work and historical chat while removing live source references
and operational caches. No multi-user signup, file upload, queue, worker or scheduler.

## Q1–Q28 traceability

This map links approved requirements to ownership and regression areas. It is not a
claim that every possible scenario is covered; F1 must audit remaining gaps independently.

| Decision | Owning behavior | Regression area |
| --- | --- | --- |
|Q1,Q6|Retained chat, deleted source and transitive exclusion|retention/chat-boundaries/chat browser tests|
|Q2,Q10,Q21,Q28|Explicit approval, safe bulk, optional owner/date, TODO default|tasks/concurrency/meetings-tasks tests|
|Q3,Q14,Q19,Q24,Q26|Reanalysis preservation, source flags, rejection and stale-field reconciliation|analysis-pipeline/tasks tests|
|Q4,Q15,Q23,Q25|Historical snapshots, separate dates, manual-source scope, application save time|chat-boundaries/search/concurrency tests|
|Q5|Fixture-only AI and honest quality limits|provider fixtures, deployment/recovery drivers, runbook|
|Q7,Q12,Q13,Q27|Separate groups, shared status, DISTINCT counts, no pending status|chat-task groups/tasks/contracts tests|
|Q8,Q11|Five-section summary and completion report handling|analysis contracts/pipeline and meeting views|
|Q9,Q20|Project-local aliases, future-only identity mapping|settings/analysis contracts/pipeline and assignment snapshots|
|Q16|Overdue only in task filters|task list/dashboard source and browser workflows|
|Q17,Q18,Q22|Manual tasks, same-project evidence linking/unlink history|tasks API/integration and source dialogs|

## Boundaries and verification status

Session/Origin/CSRF guards are server-side, not UI-only. Operator password reset uses a
direct connection and hidden prompts; no public recovery endpoint. Source/citation payloads
render as escaped text, never remote images/HTML. Per-field versions and source visibility
are checked before publication. Managed backups/provider retention are outside immediate purge.

Tasks1–19 are implemented with scoped evidence; Task20 provides operations/runbooks and
conditional preview smoke. Current preview smoke is BLOCKED without isolated provisioning.
No live-model quality or comprehensive WCAG/Lighthouse certification is claimed. Final
F1–F4 verdicts and user acceptance remain separate from implementation/test pass counts.
