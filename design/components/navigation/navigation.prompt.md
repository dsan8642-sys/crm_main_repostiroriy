**Navigation** — chrome for moving around the app.

```jsx
<SidebarNav
  product="SwimCRM" roleLabel="Administrator"
  active="clients"
  onSelect={setView}
  items={[
    { key: 'overview', label: 'Obzór', icon: <HomeIcon/>, section: '' },
    { key: 'clients',  label: 'Klienci', icon: <UsersIcon/>, count: 128 },
    { key: 'debtors',  label: 'Dłużnicy', icon: <AlertIcon/>, count: 7, countTone: 'danger' },
  ]}
/>

<Tabs value={tab} onChange={setTab} items={[
  { value: 'all', label: 'Płatności' },
  { value: 'review', label: 'Na weryfikacji', count: 4 },
  { value: 'rejected', label: 'Odrzucone' },
]} />
```

`SidebarNav` is the app rail: grouped items (`section`), count pills (`countTone="danger"` for debtors/errors), active item gets a soft fill + accent left rail. `Tabs` switches sections within a view and filtered lists; supports a mono count pill per tab.
