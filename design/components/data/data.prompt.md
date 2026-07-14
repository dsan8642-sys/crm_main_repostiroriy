**Data display** — the read-side primitives for SwimCRM's list and detail views: tables, status pills, money, badges and avatars.

```jsx
<Table columns={[
  { key: 'child', header: 'Dziecko', render: r => <><Avatar name={r.name}/> {r.name}</> },
  { key: 'balance', header: 'Saldo', align: 'right', render: r => <Money amount={r.bal} signed/> },
  { key: 'status', header: 'Status', render: r => <StatusPill status={r.st}/> },
]} rows={rows} selectable onRowClick={open} />

<StatusPill status="present" showConsumes />   // Obecny  −1
<StatusPill status="overdue" />                 // Po terminie
<Money amount={-80} signed />                   // −80,00 zł (red)
<Badge tone="danger" dot>3 błędy</Badge>
<Avatar name="Zofia Kowalska" />
```

`StatusPill` is the load-bearing element — never invent ad-hoc status colours; use the `status` keys (attendance: present/absent/excused/moved; payments: paid/pending/rejected/overdue; subscriptions: active/frozen/expired/cancelled). `showConsumes` surfaces whether an attendance status spends a lesson. `Money` always renders currency and colours debt/credit when `signed`.
