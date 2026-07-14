# Trainer UI kit — SwimCRM

Recreation of the **trainer** view. Trainers see **only their own** sessions, groups and rosters — **no financial data**, no school-wide actions (enforced by what the screens expose).

## Screens (`index.html`)

- **Moje zajęcia** (`Sessions` in `screens.jsx`) — sessions grouped by day with time, group, location, count and status; range filter (today / week / all); cancelled sessions struck through.
- **Frekwencja** (`Session`) — mark attendance for one session: 4 statuses with `−1` consumption markers, **emergency contact + medical note visible per student** (school-policy dependent), unmarked rows highlighted. Trainers cannot extend subscriptions or touch payments.
- **Moje grupy** (`Groups`) — assigned groups as cards with schedule and next session.

## Wiring

Same pattern as the admin kit: React + Babel + `_ds_bundle.js` + `assets/icons.jsx` + `data.jsx` (→ `window.TrainerData`) + `screens.jsx` (→ `window.TrainerScreens`). Shell composes `SidebarNav` + topbar.
