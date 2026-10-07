# WIREFRAME-FLOWS.md — Coverage & usage map for `wireframe.html`

Companion to `wireframe.html` + `DESIGN.md`. PLAN.MD (S1–S13, Q1–Q28) is authoritative;
this file maps where each approved flow/decision is **exercisable in the prototype**.
Open `wireframe.html` directly in a browser (no server, no build). In-app, the same map
is live at `#/flows` (S00 · "Sơ đồ luồng") with clickable journey cards.

**Demo credentials:** password `wireframe` (wrong passwords demo the bad-login state;
5 failures demo the rate-limit lock). `Vào bản demo` skips auth. Reset: topbar `⟲`.

---

## Screen inventory

| ID | Route | Screen | Key states reachable |
|---|---|---|---|
| S00 | `#/flows` | Sơ đồ luồng (flow map + inventory + D-series index) | always accessible |
| S01 | `#/login` | Đăng nhập | bad login · rate-limit lock · forgot-password (operator) · demo entry |
| S02 | `#/setup` | Thiết lập lần đầu (5 steps) | language · timezone · name/aliases · provider · first project · demo skip |
| S03 | `#/dashboard` | Bảng điều khiển | recent meetings · pending queue · continue analysis · **no overdue widget (Q16)** · empty state |
| S04 | `#/projects` | Dự án | create/edit · archive/unarchive |
| S05 | `#/project/pr1` | Chi tiết dự án | participants · aliases · shared speaker · **future-only merge confirm (Q9/Q20)** |
| S06 | `#/meetings` | Cuộc họp | search · project/status filters |
| S07 | `#/meetings/new` | Tạo cuộc họp | empty/required errors · **oversize 413** (button inserts >240k chars) · **duplicate-hash warning** (sample = m1 content) · save-raw-first |
| S08 | `#/meeting/:id/identity` | Ánh xạ người nói | map to participant · shared speaker · unknown retained |
| S09 | `#/meeting/:id/analysis` | Chạy phân tích | start/pause/resume/retry/cancel · **simulate 429 (Retry-After)** · **simulate timeout** · tab-close limitation note · fresh-run after completed |
| S10 | `#/meeting/:id` | Chi tiết cuộc họp | Summary 5 sections (Q8) · Todos My/All/Unassigned, pending **no status** (Q27) · raw transcript · versions + old-analysis badge · quote drawer · **edit → v2 + sourceChanged banner (Q14)** · **reanalysis compare (Q3/Q19)** · trash |
| S11 | `#/pending` | Hộp chờ duyệt | CREATE/LINK/UPDATE/DONE/RECONCILE groups · **stale blocked 409 (Q26)** · single approval dialog (TODO default editable, Q28) · **bulk only non-suspect CREATE (Q10)** · edit & save pending · reject → suppression fingerprint (Q19) · manual link (Q17) |
| S12 | `#/tasks` | Việc cần làm | All/My/Unassigned · project/status · **independent meeting-date & deadline filters (Q15)** · **overdue filter only here (Q16)** · manual task excluded from meeting-date filter (Q23) |
| S13 | `#/tasks/new` | Tạo việc thủ công | MANUAL origin, no citation (Q22) · multi-assignee · nullable deadline |
| S14 | `#/task/:id` | Chi tiết công việc | edit (one shared status, Q13) · event timeline before/after · sourceChanged warning · link/unlink source · **no undo (Q18)** |
| S15 | `#/chat` | Trò chuyện | threads · scope project/meeting/date filters · sample-prompt chips · 7 answer branches (below) |
| S16 | `#/settings` | Cài đặt chung | VI/EN live switch · separate outputLocale · timezone · self aliases · default analysis/chat slots |
| S17 | `#/settings/providers` | Nhà cung cấp AI | CRUD · **token write-only** · test (simulated success/401) · delete with pending-run warning · two independent defaults |
| S18 | `#/settings/account` | Tài khoản & khôi phục | operator-only reset explanation (CLI, no public endpoint) · session info · logout |
| S19 | `#/trash` | Thùng rác | restore · **hard purge with typed-title confirm** · 30-day lazy-purge illustration · sweep simulation · surviving tasks/chat notice |
| S20 | `#/primitives` | Thành phần UI | primitive showcase |

## Interaction-state inventory (D-series: dialogs, drawers and inline states)

D01 bad-login inline error (S01) · D02 forgot-password operator explanation (S01) ·
D03 project create/edit (S04/S05) · D04 identity merge future-only confirm (S05) ·
D05 duplicate-hash warning with "save anyway" (S07) · D06 oversize 413 (S07) ·
D07 single approval — CREATE default TODO editable / LINK & UPDATE before-after /
DONE with no-backdate note (S10/S11) · D08 bulk approval bar + block explanation (S11) ·
D09 manual link — same project only, evidence-only (S11/S14) · D10 stale 409 blocked
card state (S11) · D11 unlink confirm, no auto-requeue (S14) · D12 task edit with
before/after event (S14) · D13 hard purge typed-title confirm (S19) · D14 provider
add/edit with write-only token (S17) · D15 provider test success/401 simulation (S17) ·
D16 quote drawer with revision pin + deleted-source badge (global) · D17 reanalysis
compare kept/replaced/retained/reconcile/suppressed (S10) · D18 cancel-run confirm (S09) ·
D19 reset-demo confirm (global) · D20 chat CLARIFY turn with two continuation buttons (S15).

## Journey → branch coverage (mirrors the 10 in-app journey cards)

1. **Auth & setup** — S01→S02→S03. Branches: wrong password (generic error, no field
   hints) · 5-failure lock (429 + Retry-After) · forgot password → operator CLI only ·
   first login → 5-step setup with demo skip · logout (sidebar or `L` key).
2. **Dashboard** — recent → S10 · pending → S11 · continue analysis → S09 · explicit
   "no overdue widget" callout (Q16) · empty scenario.
3. **Projects & identity** — create/edit/archive/unarchive (archive blocks new meetings) ·
   participant + alias CRUD · merge dialog: future-runs-only, old tasks/history untouched,
   no new login accounts (Q9/Q20) · shared speaker never defaults to owner.
4. **Ingest & analyze** — S07→S08→S09→S10. Branches: required-field errors · oversize 413 ·
   duplicate hash → confirm-to-save · speaker mapping with unknown/shared · run controls ·
   429/timeout simulations · tab-close honesty note · completion publishes version +
   proposals.
5. **Meeting detail** — 4 tabs · quote drawer pins revision+span · edit → v2 + sourceChanged
   on linked tasks (Q14) · versions with old-badge · reanalysis compare dialog exercising
   Q3 (keep edited/approved, replace pending, retained badge, reconcile, suppression).
6. **Pending inbox** — per-kind cards with before/after diffs and evidence quotes ·
   single approval (Q21/Q28) · bulk gating (Q10) · stale blocked (Q26) · DONE only with
   matching task (Q11) · uncertain duplicate reconcile (S4.12) · reject fingerprint (Q19) ·
   manual link evidence-only (Q17).
7. **Tasks** — scope/status/project filters · independent date filters (Q15) · overdue
   list-only (Q16) · manual task no-citation + meeting-date exclusion (Q22/Q23) · detail
   with timeline, sourceChanged, unlink, no-undo (Q13/Q18).
8. **Chat** — sample chips map 1:1 to branches: cited lookup (opens drawer) · two-group
   answer, no combined total, no pending status (Q7) · historical app-vs-meeting split with
   conflict note, no backdate (Q4) · ambiguous "tuần này" → CLARIFY buttons (Q15) ·
   no-evidence honesty (S7) · provider 401 error + resume/retry, no silent fallback ·
   deleted-source answer view-only, excluded from future context (Q6) · read-only input
   (no mutation tools).
9. **Settings** — VI/EN instant label switch · separate output locale (no retro-translation) ·
   timezone (no history rewrite) · aliases · provider CRUD/test/delete with write-only
   token and mid-run switch rule (S4.5) · operator password reset guide (S8).
10. **Trash & retention** — list with purge dates · restore · typed-title hard purge ·
    lazy-purge explainer + sweep simulation (max 10/request, no cron) · tasks survive ·
    chat preserved with deleted-source badge and context exclusion (Q1/Q6).

## Demo scenario selector (topbar, no destructive setup)

| Preset | What it does | Where to look |
|---|---|---|
| Đầy đủ dữ liệu (normal) | reseeds full demo | everywhere |
| Trống rỗng (empty) | strips meetings/tasks/proposals/threads | S03/S06/S11/S12/S15 empty states |
| Đề xuất hết hạn (stale) | reseed + navigate | S11 → p204 stale card (409 blocked) |
| Nguồn đã xóa (deleted) | reseed + navigate | S19 (m6) + chat thread c5 badge |
| Lịch sử mâu thuẫn (historical) | reseed + navigate | S15 thread c3 (app vs meeting evidence) |

## Honest-simulation boundaries (what the wireframe does NOT claim)

- No network calls, no AI, no DB — every "run", "test connection", "publish" is a local
  state simulation annotated in-app (`Không kết nối AI/DB` banner + per-screen notes).
- Analysis progress is a timed local animation of the S4 step machine; closing the tab
  does **not** continue the run (stated on S09, per S4.10).
- Provider "Test connection" offers explicit success/401 simulation buttons — it does not
  pretend to verify a real endpoint.
- Business invariants (CAS versioning, fingerprint suppression, FTS behavior) are
  **annotated** with their PLAN refs, not implemented.
- Passwords/tokens are never persisted; Reset demo clears localStorage and reseeds.

## Browser verification of this wireframe

- Re-ran the Chrome interaction driver against the final HTML: 44/44 checks passed,
  including login/error, save-before-analysis, duplicate/oversize input, simulated
  429 recovery, approval constraints, citations, typed purge confirmation, locale,
  empty states and reset. No JavaScript errors were observed in that run.
- Captured all 21 screens at 1440, 768 and 390px (63 captures); page-level horizontal
  overflow was zero. Wide data tables scroll within their own container.
- Direct manual browser checks also covered creating a manual task with two assignees
  and no deadline, viewing its shared status/history, and asking an ambiguous chat
  question to reach the meeting-date/deadline clarification controls.
- These checks cover the simulated wireframe, not production auth, API correctness,
  real AI quality, or a complete production accessibility/performance audit.
