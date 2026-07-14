# Parent UI kit — SwimCRM

Recreation of the **parent** view. A parent sees **only their own children** — their subscriptions, schedule, attendance and payments. Parents **cannot** self-enroll, reschedule or cancel sessions (the UI states this explicitly), and there is **no online payment** — they upload a receipt for the admin to verify.

## Screens (`index.html`, child switcher in the header)

- **Główna** (`Home`) — per-child cards: next session, subscription (remaining lessons + end date), payment status, notifications. Debt banner when balance < 0.
- **Rozkład** (`Schedule`) — upcoming/planned sessions with a note that changes go through administration; cancelled sessions struck through.
- **Abonament** (`Subscription`) — remaining lessons + end date, "request extension" / "contact admin", and the **readable movement ledger** (purchase +8, attendance −1, correction +1).
- **Płatności** (`Payments`) — charges to pay + payment history, and the **receipt upload dialog** (child, amount, date, method, file PDF/JPG/PNG) with an explicit "no online payment — admin verifies" notice.
- **Zgody** (`Consents`) — RODO + email/SMS/Telegram consent switches; the required RODO consent can't be silently toggled and points to administration.

## Wiring

React + Babel + `_ds_bundle.js` + `assets/icons.jsx` + `data.jsx` (→ `window.ParentData`) + `screens.jsx` (→ `window.ParentScreens`). Screens receive `{ kid, setKid, go }` so the child switcher and nav stay in sync.
