# Admin UI kit — SwimCRM

Full interactive recreation of the **administrator** CRM. This is the school-wide back office: everything an admin does daily.

## Screens (`index.html` router)

- **Przegląd** (`Overview.jsx`) — operational "today": KPIs (sessions, trainers, cancelled, students; unpaid/overdue finances; expiring subscriptions), a payments-on-review banner, and the upcoming-sessions list.
- **Klienci** (`Clients.jsx`) — the family/student database: filter tabs (all / active / inactive / debtors), search, group filter, selectable rows, and a **client detail drawer** (Dane / Finanse / Frekwencja tabs, medical banner, subscription ledger, RODO anonymise dialog).
- **Grafik** (`Schedule.jsx`) — day view of sessions by hour, with full-group / cancelled / conflict states and per-session actions.
- **Frekwencja** (`Attendance.jsx`) — mark attendance for one session; 4 statuses with explicit `−1` lesson-consumption markers; unmarked rows highlighted; save creates corrections.
- **Płatności** (`Payments.jsx`) — charges/payments kept separate; tabs (all / on-review / rejected); **receipt drawer** to preview and confirm/reject a payment.
- **Dłużnicy** (`Debtors.jsx`) — overdue balances with reasons, date-range filter, quick notify.

## How it's wired

`index.html` loads React 18.3.1 + Babel + the design-system bundle, then `assets/icons.jsx`, `data.jsx` (mock Polish school data → `window.AdminData`), and each screen file (→ `window.AdminScreens.*`). The shell composes `SidebarNav` + a topbar and swaps screens by state. All primitives come from `window.SwimCRMDesignSystem_546643`; screens never re-implement them.

`data.jsx` is fake but realistic (Polish names, PLN balances, groups Delfiny/Rekiny/Foki, medical notes). Edit it to change the demo content.
