# SwimCRM Design System

Design system for **SwimCRM** — a web CRM for the **H2O** private swimming school in Poland. This is an operational, data-dense back-office tool for three roles (administrator, trainer, parent), **not a marketing site**. Money is in PLN (`240,00 zł`), dates/times are Europe/Warsaw, and the product is RODO/GDPR-aware.

## Sources

- `uploads/DESIGNER_BRIEF.md` — the only provided source: a detailed (Russian-language) product brief describing every screen, field, action and state for the admin/trainer/parent versions, business rules, and backend endpoints. There was **no** codebase, Figma, logo, brand guide, or fonts supplied.
- Everything visual here (colours, type, spacing, components) was designed from scratch to fit the brief. Decisions are flagged in **Caveats** below.

## Product context

Three role-based surfaces, all sharing this system:

- **Administrator** — the whole school: clients, schedule, attendance, subscriptions, payments, debtors, trainers, groups, notifications, reports, import/export, audit log, security. (UI kit: `ui_kits/admin/`)
- **Trainer** — only their own sessions: my sessions, today, attendance marking, groups. (UI kit: `ui_kits/trainer/` — planned)
- **Parent** — only their own children: home, schedule, subscription, payments + receipt upload, consents. (UI kit: `ui_kits/parent/` — planned)

Load-bearing rules that shaped the components: subscriptions are computed from a **ledger of movements** (+8 purchase, −1 attendance, +1 correction), not an editable "remaining" field; **charges and payments are separate**; there is **no online payment** — parents upload a receipt, the admin verifies; critical statuses (debt, overdue, on-review, cancelled) must never be hidden; medical/emergency data must be visible but not shouty.

---

## Content fundamentals

- **Language:** product UI is **Polish** (a Polish school). This design system's own docs/comments are English; all rendered UI copy is Polish.
- **Tone:** calm, precise, operational. It's a tool for daily work — quick to scan, never salesy. No exclamation marks, no marketing adjectives.
- **Person:** address the **parent** with "Ty" (e.g. *Twoje dzieci*, *Twój abonament*); speak neutrally/impersonally to the admin and trainer (labels, not sentences).
- **Casing:** sentence case everywhere except short uppercase eyebrow labels (letter-spaced). Buttons are short imperative verbs: *Zapisz, Potwierdź, Odrzuć, Anonimizuj, Generuj z szablonu*.
- **Numbers & money:** always show currency and use Polish formatting — `240,00 zł`, `−80,00 zł` (debt, red), `+120,00 zł` (credit, green). Dates `03.07.2026`, times `17:00`, ranges `17:00–17:45`. All numeric data uses tabular mono figures.
- **Emoji:** **never.** No emoji, no decorative unicode. Status is carried by coloured pills + a small dot, not glyphs.
- **Statuses read as words:** *Obecny, Nieobecny, Nieob. uspr., Przełożone, Zapłacone, Na weryfikacji, Po terminie, Aktywny, Zamrożony, Wygasł*. Attendance pills also show whether the lesson is consumed (`−1`) or not (`0`).
- **Vibe:** trustworthy municipal-pool clarity — cool water blues, lots of white, dense tables, quiet borders.

## Visual foundations

- **Colour:** a calm "clear water" palette. Primary is **pool blue** `--blue-500 #1a7dc4`; accent is **lane teal** `--teal-500`. Neutrals are a **cool slate** ramp. Semantic families (green/amber/red/violet) are load-bearing and defined as explicit status tokens (`--status-present-*`, `--status-overdue-*`, …). Backgrounds are flat (`--surface-page` off-white, `--surface-card` white) — **no gradients, no imagery, no textures**. Colour is used sparingly: mostly slate + white, with blue for action and status colours only where a state matters.
- **Type:** **IBM Plex Sans** for all UI text (full Polish Latin-Extended coverage, technical-but-warm, excellent small); **IBM Plex Mono** for money, counts, IDs, dates (tabular numerals). Compact scale — body 14px, table cells 13px, KPI numbers 32px. See `tokens/typography.css`.
- **Spacing:** 4px base grid, compact defaults for data density. Table rows 40px, controls 34px, sidebar 232px, topbar 56px. See `tokens/spacing.css`.
- **Corners:** small and calm — 5–7px on controls/cards, 10–14px on larger panels, pills for status/badges. Never fully-rounded "bubbly" UI.
- **Borders & cards:** the system leans on **1px hairline borders** (`--border-subtle/-default`) plus a **very soft, cool-tinted shadow** (`--shadow-xs/-sm`), not heavy elevation. Cards = white surface + subtle border + `--radius-lg` + `--shadow-sm`. Selected rows/active nav get a soft blue fill and a 3px accent left rail.
- **Elevation ladder:** `xs` (KPI), `sm` (cards), `md` (popovers), `lg` (drawers/toasts), `pop` (dialogs). See `tokens/elevation.css`.
- **Motion:** quick and unshowy — 120–260ms, standard/`ease-out` curves, **no bounce**. Fades and short slides only (dialog pop, drawer slide-in, toast rise). It's a working tool, not a toy; no infinite/decorative loops.
- **Hover / press:** hover darkens fills one step or adds a slate wash on neutrals; press goes one step darker again. Focus shows a 3px blue focus ring (`--ring`). Disabled = 45–50% opacity.
- **Transparency/blur:** used only for modal scrims (`rgba(26,33,41,0.36–0.44)` + a 2px backdrop blur on dialogs). Nowhere else.
- **Imagery:** there is none by design — no photos of children (RODO), no stock. People are represented by **deterministic initials avatars** whose hue derives from the name.

## Iconography

- **Set:** a **Lucide-style line-icon** family, hand-built in `assets/icons.jsx` (24px grid, **1.7px stroke**, round caps/joins, `currentColor`, no fills). ~45 glyphs cover the CRM's needs (nav, money, calendar, whistle/waves for the swim domain, file/receipt, medical heart, shield/RODO, snowflake for "freeze", etc.). Registers `window.SwimIcons`; each icon takes a `size` prop.
- **Why hand-built:** no icon assets were provided and no codebase to copy from. The glyphs match Lucide's metrics so the set can be swapped for the real Lucide CDN (`lucide.dev`) with no visual change if preferred — **flagged as a substitution** (see Caveats).
- **Usage:** icons are monochrome and inherit text colour; they sit at 15–18px in UI, 24px in KPIs/empty states. **No emoji, no unicode symbols** are used as icons anywhere. Status is never icon-only — always pill + label.

---

## Components

React primitives (`window.SwimCRMDesignSystem_546643`). Grouped by concern under `components/`.

**Forms** (`components/forms/`): **Button**, **IconButton**, **Input**, **Textarea**, **Select**, **Checkbox**, **Radio**, **Switch**.

**Data display** (`components/data/`): **Table** (column-driven, selectable, sticky header), **StatusPill** (the load-bearing status indicator — attendance/payment/subscription states, with lesson-consumption marker), **Money** (PLN formatting + debt/credit colour), **Badge**, **Avatar** (deterministic initials). `STATUS` is an exported lookup of every status → label/tone/consumes.

**Feedback** (`components/feedback/`): **Dialog** (confirmations + irreversible RODO warning), **Banner** (inline info/success/warning/danger), **Toast** (transient), **EmptyState**.

**Navigation** (`components/navigation/`): **SidebarNav** (app rail with grouped items + count pills + role footer), **Tabs** (section switcher + filtered-list counts).

Each directory has `<Name>.jsx` + `<Name>.d.ts` + a `.prompt.md` usage note + a `@dsCard` demo HTML. Starting points are marked on Button, Input, StatusPill, Table, SidebarNav.

## Index / manifest

- `styles.css` — root entry (imports only). Consumers link this.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `base.css` (resets + interaction-state CSS + keyframes).
- `components/{forms,data,feedback,navigation}/` — the primitives above.
- `guidelines/*.card.html` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `assets/icons.jsx` — shared Lucide-style icon set.
- `ui_kits/shared/kit.css` — layout scaffolding for the kits.
- `ui_kits/admin/` — **Admin CRM kit** (`index.html` + `data.jsx` + Overview/Clients/Schedule/Attendance/Payments/Debtors screens). Interactive: browse clients, open a client drawer, mark attendance, review & confirm/reject payments.
- `ui_kits/trainer/`, `ui_kits/parent/` — **planned** (see Caveats).
- `SKILL.md` — Agent-Skill wrapper.
- Generated (do not edit): `_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json`.

### Reproducible bundle workflow

Run `node scripts/generate-design-bundle.mjs` from the repository root after
changing an authoring component or `assets/icons.jsx`. The command rebuilds
`design/_ds_bundle.js` and `design/_ds_manifest.json` from canonical sources
and synchronises the runtime bundle. Use
`node scripts/generate-design-bundle.mjs --check` in tests to fail when a
generated artifact is stale. Token, stylesheet and font assets are synchronised
with `scripts/sync-design-frontend.ps1` and verified with
`scripts/verify-design-runtime.ps1`.

## Caveats & open questions

1. **No brand identity was provided.** There is **no logo** — the mark is a type-only lockup ("H2O" tile + "SwimCRM" wordmark, see `guidelines/brand-wordmark.card.html`). If H2O has a real logo, share it and I'll swap the wordmark.
2. **Colour & type are my invention** to fit a calm Polish swim-school CRM. Happy to re-theme to real brand colours/fonts if they exist.
3. **Fonts are self-hosted.** The official IBM Plex Sans variable Roman face and IBM Plex Mono Regular are stored under `assets/fonts/ibm-plex/`; hashes, source URLs and the OFL are recorded in `PROVENANCE.md`.
4. **Icons are a hand-built Lucide-style substitute** (no source set was given). Swappable for real Lucide.
5. **Trainer and Parent UI kits are not yet built** — only the Admin kit is complete. The primitives and tokens they need are all in place.

**Please tell me:** real H2O brand colours + logo + fonts if any, and whether to proceed building the Trainer and Parent kits next.
