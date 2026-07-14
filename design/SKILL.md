---
name: swimcrm-design
description: Use this skill to generate well-branded interfaces and assets for SwimCRM — the CRM for the H2O swimming school (Poland) — either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation

- **What this is:** a Polish, data-dense, role-based CRM (admin / trainer / parent) for a swimming school — never a marketing site. Calm cool-water blues, dense tables, PLN money (`240,00 zł`), Europe/Warsaw dates, RODO-aware. No emoji.
- **Tokens:** link `styles.css` (imports everything). Colours in `tokens/colors.css` (`--primary`, `--status-*` families are load-bearing), type in `tokens/typography.css` (IBM Plex Sans + Mono), spacing/elevation likewise.
- **Components:** React primitives on `window.SwimCRMDesignSystem_546643` after loading `_ds_bundle.js`. See `components/*/*.prompt.md` for usage. The key one is `StatusPill` — always use it for attendance/payment/subscription state, never ad-hoc colours.
- **Icons:** `assets/icons.jsx` registers `window.SwimIcons` (Lucide-style line icons).
- **Full-screen examples:** `ui_kits/admin/` is a complete interactive CRM recreation — read it to match layout, density and Polish copy. Load order in its `index.html` shows the pattern (React + Babel + bundle + icons + data + screens).

## To build a new HTML artifact
1. `<link rel="stylesheet" href="styles.css">` (+ `ui_kits/shared/kit.css` for app-shell layout).
2. Load React 18.3.1 + Babel + `_ds_bundle.js`, then `assets/icons.jsx`.
3. Destructure components from `window.SwimCRMDesignSystem_546643`; compose screens like the admin kit.
4. Keep copy Polish, money in PLN via `<Money>`, statuses via `<StatusPill>`. No emoji, no gradients.
