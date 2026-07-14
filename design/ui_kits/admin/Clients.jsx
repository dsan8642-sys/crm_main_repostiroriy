// Admin › Clients — family/student database with filters, search & detail drawer.
(function () {
  const { Table, StatusPill, Money, Avatar, Button, IconButton, Select, Tabs, Banner, Dialog } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;

  function ClientDrawer({ client, onClose }) {
    const [tab, setTab] = React.useState('main');
    const [anon, setAnon] = React.useState(false);
    if (!client) return null;
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <aside className="drawer">
          <div className="drawer-head">
            <Avatar name={`${client.first} ${client.last}`} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="strong" style={{ fontSize: 'var(--fs-md)' }}>{client.last} {client.first}</div>
              <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{client.group} · {client.trainer}</div>
            </div>
            <StatusPill status={client.status} size="sm" />
            <IconButton label="Zamknij" onClick={onClose}><I.X /></IconButton>
          </div>

          <Tabs value={tab} onChange={setTab} style={{ padding: '0 18px' }} items={[
            { value: 'main', label: 'Dane' },
            { value: 'finance', label: 'Finanse' },
            { value: 'attendance', label: 'Frekwencja' },
          ]} />

          <div className="drawer-body">
            {client.med && (
              <Banner tone="danger" icon={<I.Heart size={16} />} style={{ marginBottom: 16 }} title="Dane medyczne">
                {client.med} · Kontakt: {client.emergency}
              </Banner>
            )}

            {tab === 'main' && (
              <>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Podstawowe</div>
                <dl className="dl" style={{ marginBottom: 20 }}>
                  <dt>Imię i nazwisko</dt><dd>{client.first} {client.last}</dd>
                  <dt>Data urodzenia</dt><dd className="mono">{client.born}</dd>
                  <dt>Grupa</dt><dd>{client.group}</dd>
                  <dt>Trener</dt><dd>{client.trainer}</dd>
                </dl>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Rodzina</div>
                <dl className="dl">
                  <dt>Rodzic</dt><dd>{client.parent}</dd>
                  <dt>Telefon rodziny</dt><dd className="mono">{client.phone}</dd>
                  <dt>Email</dt><dd>{client.email}</dd>
                </dl>
              </>
            )}

            {tab === 'finance' && (
              <>
                <div style={{ display: 'flex', gap: 20, marginBottom: 18 }}>
                  <div><div className="eyebrow">Saldo</div><Money amount={client.balance} signed size="var(--fs-xl)" /></div>
                  <div><div className="eyebrow">Abonament</div><div className="strong">{client.sub}</div></div>
                  <div><div className="eyebrow">Koniec</div><div className="mono strong">{client.subEnds}</div></div>
                </div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Journal ruchów abonamentu</div>
                <div className="card" style={{ marginBottom: 18 }}>
                  {[['Zakup 8 zajęć', '+8', '2026-06-20'], ['Obecność · Delfiny', '−1', '2026-06-24'], ['Obecność · Delfiny', '−1', '2026-06-27'], ['Korekta administratora', '+1', '2026-06-28'], ['Obecność · Delfiny', '−1', '2026-07-01']].map((r, i, a) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: i < a.length - 1 ? '1px solid var(--border-subtle)' : 'none', fontSize: 'var(--fs-sm)' }}>
                      <span className="mono" style={{ width: 40, fontWeight: 600, color: r[1][0] === '+' ? 'var(--money-credit)' : 'var(--money-debt)' }}>{r[1]}</span>
                      <span style={{ flex: 1 }}>{r[0]}</span>
                      <span className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>{r[2]}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" size="sm" iconLeft={<I.Plus size={14} />}>Nowe naliczenie</Button>
                  <Button variant="secondary" size="sm">Dodaj płatność</Button>
                  <Button variant="secondary" size="sm" iconLeft={<I.Snowflake size={14} />}>Zamroź</Button>
                </div>
              </>
            )}

            {tab === 'attendance' && (
              <div className="card">
                {[['2026-07-01', 'present'], ['2026-06-27', 'present'], ['2026-06-24', 'absent'], ['2026-06-20', 'excused'], ['2026-06-17', 'moved']].map((r, i, a) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < a.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <span className="mono muted" style={{ width: 92, fontSize: 'var(--fs-sm)' }}>{r[0]}</span>
                    <span style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>Delfiny · 17:00</span>
                    <StatusPill status={r[1]} size="sm" showConsumes />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}>
            <Button variant="secondary" iconLeft={<I.Pencil size={14} />}>Edytuj</Button>
            <span style={{ flex: 1 }} />
            <Button variant="danger" size="md" iconLeft={<I.Shield size={14} />} onClick={() => setAnon(true)}>Anonimizuj (RODO)</Button>
          </div>
        </aside>

        {anon && (
          <Dialog open irreversible tone="danger" title="Anonimizacja rodziny"
            confirmLabel="Anonimizuj dane" cancelLabel="Anuluj"
            onClose={() => setAnon(false)} onConfirm={() => setAnon(false)}
            description="Dane osobowe dziecka i rodzica zostaną nieodwracalnie usunięte zgodnie z RODO. Historia finansowa pozostanie w formie zanonimizowanej." />
        )}
      </>
    );
  }

  function Clients() {
    const [q, setQ] = React.useState('');
    const [filter, setFilter] = React.useState('all');
    const [group, setGroup] = React.useState('');
    const [sel, setSel] = React.useState([]);
    const [open, setOpen] = React.useState(null);

    let rows = D.clients;
    if (filter === 'active') rows = rows.filter(c => c.status === 'active');
    if (filter === 'inactive') rows = rows.filter(c => c.status === 'inactive');
    if (filter === 'debtors') rows = rows.filter(c => c.balance < 0);
    if (group) rows = rows.filter(c => c.group === group);
    if (q) rows = rows.filter(c => (`${c.first} ${c.last} ${c.parent} ${c.phone}`).toLowerCase().includes(q.toLowerCase()));

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Klienci</h2>
            <p className="page-desc">{D.clients.length} rodzin · {D.clients.filter(c => c.balance < 0).length} z długiem</p>
          </div>
          <Button variant="primary" iconLeft={<I.Plus size={15} />}>Nowe dziecko</Button>
        </div>

        <div className="toolbar">
          <Tabs value={filter} onChange={setFilter} items={[
            { value: 'all', label: 'Wszyscy', count: D.clients.length },
            { value: 'active', label: 'Aktywni' },
            { value: 'inactive', label: 'Nieaktywni' },
            { value: 'debtors', label: 'Dłużnicy', count: D.clients.filter(c => c.balance < 0).length },
          ]} style={{ border: 'none', flex: 'none' }} />
          <span className="spacer" />
          <div className="searchbox" style={{ width: 240 }}>
            <I.Search size={15} />
            <input placeholder="Szukaj dziecka, rodzica, telefonu…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={group} onChange={e => setGroup(e.target.value)} size="md">
            <option value="">Wszystkie grupy</option>
            {D.groups.map(g => <option key={g.id}>{g.name}</option>)}
          </Select>
        </div>

        {sel.length > 0 && (
          <Banner tone="info" style={{ marginBottom: 12 }}
            action={<div style={{ display: 'flex', gap: 6 }}><Button size="sm" variant="subtle">Zmień grupę</Button><Button size="sm" variant="subtle">Eksport</Button></div>}>
            Zaznaczono {sel.length} {sel.length === 1 ? 'klienta' : 'klientów'}.
          </Banner>
        )}

        <Table
          selectable selectedIds={sel}
          onToggleRow={id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])}
          onToggleAll={() => setSel(s => s.length === rows.length ? [] : rows.map(r => r.id))}
          onRowClick={c => setOpen(c)}
          rows={rows}
          emptyLabel="Brak klientów dla wybranych filtrów"
          columns={[
            { key: 'name', header: 'Dziecko', render: c => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                <Avatar name={`${c.first} ${c.last}`} size={28} />
                <span><span className="strong">{c.last} {c.first}</span>{c.med && <span title="Dane medyczne" style={{ marginLeft: 6, color: 'var(--red-500)', verticalAlign: 'middle' }}><I.Heart size={13} /></span>}</span>
              </span>
            ) },
            { key: 'parent', header: 'Rodzic', muted: true, render: c => <span>{c.parent}<div className="mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-faint)' }}>{c.phone}</div></span> },
            { key: 'group', header: 'Grupa', render: c => c.group },
            { key: 'sub', header: 'Abonament', muted: true, render: c => <span>{c.sub}{c.subLeft != null && <span className="mono" style={{ marginLeft: 6, color: c.subLeft <= 2 ? 'var(--amber-600)' : 'var(--text-faint)' }}>· {c.subLeft} zaj.</span>}</span> },
            { key: 'balance', header: 'Saldo', align: 'right', width: 110, render: c => <Money amount={c.balance} signed /> },
            { key: 'status', header: 'Status', width: 110, render: c => <StatusPill status={c.status} size="sm" /> },
          ]}
        />
        {open && <ClientDrawer client={open} onClose={() => setOpen(null)} />}
      </div>
    );
  }

  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Clients = Clients;
})();
