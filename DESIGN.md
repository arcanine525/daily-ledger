# DESIGN.md — Wireframe design system (scoped to `wireframe.html` ONLY)

## Phase 1 application foundation contract

The initial Next.js foundation reuses the wireframe's ink #16181d, paper #f2f3f5,
border #d0d5dd, action blue #2456f0, and accessible secondary text #536070.
System typography, 24/32/48px spacing, restrained 8px panel radius and visible focus.
This exception covers Phase 1 login and workspace settings panels as well as the
bilingual foundation page, not the later full product UI. Panels are modular,
single-column responsive forms, with shared button/input styles and 44px-class targets.

This document describes the design system of the **interactive wireframe prototype**
(`wireframe.html`, root of this workspace). It is NOT the design system of the future
Next.js application. PLAN.MD (S1–S13, Q1–Q28) remains the authoritative product spec;
this file only documents how the wireframe looks and behaves.

## 0. Research log and scope

- Authority: PLAN.MD S1–S13 and all 28 approved decisions. This is a low-fidelity
  interaction wireframe, not a branded production UI or an implementation of the app.
- The parent loaded the frontend design router and perfection guidance from the
  OpenCode package cache; the delegated designer could not locate that corpus in its
  searched skill directories. Do not interpret that worker limitation as global absence.
- No external product screenshots, Lazyweb research or Imagen drafts were produced;
  no brand fidelity or generated concept comparison is claimed. Image generation tools
  were not exposed. The wireframe uses the documented monochrome system below.
- Browser verification is for wireframe navigation, states and responsive layout;
  it does not constitute a production Lighthouse, security or accessibility certification.

---

## 1. Intent

A **clean operational wireframe**, not a marketing page: dense, quiet, border-based,
typography-led. The aesthetic target is an internal ops tool (dense sidebar, strong type
hierarchy, 1px borders, generous data density) — deliberately *not* flashy. Color is
almost entirely removed; one blue accent is reserved exclusively for actions and active
states so a reviewer can scan "what can I click" at a glance.

## 2. Design tokens (CSS custom properties in `:root`)

| Token | Value | Role |
|---|---|---|
| `--ink` | `#16181d` | Primary text, active nav, solid fills |
| `--ink-2/3/4` | `#3d434d / #667085 / #98a2b3` | Secondary / muted / faint text |
| `--line` / `--line-soft` / `--line-strong` | `#d0d5dd / #e7eaee / #b8bfc9` | Borders (1px everywhere; no shadows for structure) |
| `--paper` | `#f2f3f5` | App canvas |
| `--surface` / `--surface-2/3` | `#fff / #f8f9fb / #eef0f3` | Cards / subtle fills / hover fills |
| `--accent` / `--accent-ink` / `--accent-soft` / `--accent-line` | `#2456f0 / #1a3fb8 / #edf2fe / #c3d2fb` | **Actions only**: primary buttons, active nav, links, citation chips, progress fill |
| `--warn-*`, `--danger-*`, `--ok-*` | amber / red / green trios | State semantics only (stale, error, success) — never decoration |
| `--r-s/m/l` | `4 / 6 / 10 px` | Radii |
| `--sp-1…7` | `4 / 8 / 12 / 16 / 24 / 32 / 48 px` | Spacing scale (4px base) — no arbitrary margins |
| `--mono`, `--sans` | system stacks | IDs, hashes, quotes, step numbers in mono; UI in sans |

**Hard rules encoded in CSS**
- Blue appears only on: `.btn.primary`, active `.nav-item`, `.tab.on` underline, `.cite`
  chips, `.prog > i`, `.badge.blue`, `.item.sel`, focus rings. Everything else is grayscale.
- Status colors (`ok/warn/danger`) appear only inside `.badge.*` and `.note.*/.callout.*`.
- No gradients, no large color fields, no decorative imagery. Avatars are 1px-bordered
  squares with initials (wireframe convention).

## 3. Typography

- Base 13.5px/1.5 sans; `h1` 20px, `h2` 16px, `h3` 13.5px — tight, letter-spacing −0.01em.
- Mono at 10–12.5px for: screen IDs (`S10`), PLAN refs (`Q27`), SHA snippets, transcript
  quotes, step numbers, event types.
- Uppercase 10.5px + letter-spacing .06–.08em for table headers and sidebar section labels.
- Vietnamese diacritics render through the system stack; no webfonts (zero network).

## 4. Primitives (showcase route: `#/primitives`, screen S20)

`btn` (primary/quiet/danger/sm/lg/block/disabled) · `card` (h/b/f) · `badge` (blue/ok/warn/
danger/gray/mono) · `tag` (dashed mono ref chip) · `note` (+blue/warn/danger, carries
`.ref` PLAN refs) · `callout` (left-border emphasis) · `stepnum` (numbered circle:
done/now) · `kbd` · `field/input/textarea/check` with inline `.err` · `tbl` inside
`.tbl-wrap` (horizontal scroll — keeps Actions columns clickable under the rail) ·
`tabs/tab` · `item` (list card with sel state) · `quote` (clickable → drawer) · `prog` +
`step-list` · `diff` (before/after with del/ins) · `tl` (event timeline) · `msg/cite/chip`
(chat) · `empty` (dashed placeholder) · `jcard` (flow-map journey card) · `drawer` ·
native `dialog`.

Every screen composes only these primitives — no one-off styling. Verified by the S20
showcase route and by grep-level consistency of class usage.

## 5. Layout & responsive behavior

- Persistent top banner (dark strip): `Wireframe tương tác · Dữ liệu mô phỏng · Không kết
  nối AI/DB` — always visible, switches with locale.
- **1440**: sidebar 232px + fluid view (max 1060px) + annotation rail 300px (PLAN refs,
  business rules, entry/outcome per screen) + footer with screen ID and PLAN refs.
- **≤1100**: rail hidden; toggled as a fixed overlay from the topbar `Ghi chú` button.
- **≤768**: sidebar becomes a hamburger slide-in; grids collapse to 1 column; chat and
  diff stacks go vertical.
- **390**: tighter padding, `.hide-sm/.hide-xs` drop non-critical columns; verified
  0px horizontal overflow in QA.
- `prefers-reduced-motion: reduce` disables all transitions/animations globally.

## 6. Interaction & accessibility rules

- All modals are **native `<dialog>`** (`showModal`): Escape closes, backdrop blocks,
  focus is trapped by the UA. Destructive confirms (purge) require typed input match.
- Quote drawer closes on Escape and ✕; disabled citation chips explain why (deleted source).
- Forms validate inline (`.field.invalid` + `.err`), `aria-label`s on icon-only and
  filter controls, `role=tablist/tab` on meeting tabs, `aria-pressed` on locale segment,
  `role=progressbar` on run progress, `role=link/tabindex=0` on clickable rows.
- Keyboard: `L` logs out (guarded against typing contexts); Enter activates journey cards.
- Every rendered enabled button performs a real simulated state change or navigation —
  no dead buttons, no fake success toasts for backend actions (each mutation mutates the
  in-memory/localStorage demo state and says "mô phỏng").

## 7. Motion

Minimal and informational only: drawer slide (220ms), progress width transition, sidebar
slide on mobile. No entrance animations, no hover-only decoration. Reduced-motion kills all.

## 8. Accepted debt (wireframe-scope)

- Touch targets in dense rows are ~32–36px (below 44px ideal) — acceptable for a desktop
  wireframe; the production app must fix this.
- Demo content is Vietnamese-first with English transcripts (per plan: English fixtures,
  Vietnamese UI); the EN locale switch translates **UI chrome labels**, not demo data —
  this is intentional and labeled in-app.
- The annotation rail can overlap wide unwrapped content on narrow-desktop widths;
  tables are wrapped in `.tbl-wrap` to prevent it (QA-verified).
- Toasts are transient feedback; they may briefly overlap content — capped at 92vw.

## 9. Honest-simulation contract

The wireframe never pretends a backend exists: every simulated action mutates local demo
state, every AI/DB-dependent surface is annotated with its PLAN rule and the banner states
"Không kết nối AI/DB". Passwords and provider tokens are never written to `localStorage`
(only `hasToken` booleans); Reset demo reseeds everything.
