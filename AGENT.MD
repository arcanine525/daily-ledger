# Daily Ledger: agent working rules

## Execution and Git

- Work directly in the current agent. Do not create sub-agents unless the user explicitly changes this instruction.
- Follow `PLAN.MD` and the approved product decisions. Current stack: Next.js full-stack, Vercel, Prisma ORM and Prisma Postgres; Docker Compose for local PostgreSQL.
- **Each implementation task is exactly one commit, followed by a push before starting the next task.** Include implementation, its tests, and directly related documentation in that task commit. Do not combine multiple tasks or split one task across commits.
- Validate the task before committing: targeted tests, lint, typecheck/build when applicable, and actual usage through its public surface. Do not mark a blocked or failing task complete.
- Use descriptive Conventional Commit messages. Inspect status, diff and recent history before staging; stage explicit intended paths only.
- Push normally to the configured remote. Never force-push, rewrite history, amend, bypass hooks or commit secrets.
- If push fails, resolve authentication/network issues or report the blocker; do not start the next task with an unpushed completed task.
- User authorized the baseline and Phase 1 tasks 1–5, then said "Tiếp tục" to authorize Phase 2 tasks 6–10. Stop after Phase 2; do not proceed to Phase 3 without a new instruction.

## Quality and scope

- TDD for implementation, strict TypeScript, no `any` or type-error suppression.
- Business logic belongs in `src/server/`; Next.js Route Handlers remain thin HTTP adapters.
- Test AI only through deterministic mocks, never live provider calls or paid evaluation.
- Preserve transcript revisions, user-confirmed work and provenance according to the plan.
- Keep `PLAN.MD` and `.omo/plans/plan.md` synchronized when changing requirements; `.omo/` is local tooling, not a committed product artifact.
- Wireframe is design evidence only. Do not reuse its simulated auth or state as production code.
- Never commit `.env`, real transcripts, tokens, keys, database dumps or local agent/browser artifacts.
- Generate future Prisma migrations with `--create-only` and inspect SQL before deploy. Raw SQL owns generated FTS columns, GIN indexes, evidence foreign keys and invariant triggers; Prisma diff must not remove or alter them accidentally. Never reset databases to resolve migration drift.

## Handoff

- Report task number, validation performed, commit hash and push result.
- Describe unverified behavior and blockers honestly; no claim of real-model quality from mock tests.
