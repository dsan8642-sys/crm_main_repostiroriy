// Admin › Payments — payments on review; confirm / reject with receipt preview.
(function () {
  const { Table, StatusPill, Money, Button, IconButton, Tabs, Banner, Dialog, Avatar } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;

  function ReceiptDrawer({ pay, onClose, onConfirm, onReject }) {
    if (!pay) return null;
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <aside className="drawer" style={{ width: 440 }}>
          <div className="drawer-head">
            <div style={{ flex: 1 }}>
              <div className="strong" style={{ fontSize: 'var(--fs-md)' }}>Płatność {pay.id.toUpperCase()}</div>
              <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{pay.child} · {pay.parent}</div>
            </div>
            <IconButton label="Zamknij" onClick={onClose}><I.X /></IconButton>
          </div>
          <div className="drawer-body">
            <dl className="dl" style={{ marginBottom: 18 }}>
              <dt>Kwota</dt><dd><Money amount={pay.amount} /></dd>
              <dt>Sposób</dt><dd>{pay.method}</dd>
              <dt>Data wpłaty</dt><dd className="mono">{pay.date}</dd>
              <dt>Zgłosił</dt><dd>{pay.parent} (rodzic)</dd>
            </dl>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Czek / potwierdzenie</div>
            {pay.receipt ? (
              <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ height: 200, background: 'repeating-linear-gradient(135deg, var(--slate-100), var(--slate-100) 12px, var(--slate-50) 12px, var(--slate-50) 24px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <I.File size={40} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                  <I.File size={15} />
                  <span className="mono" style={{ flex: 1, fontSize: 'var(--fs-xs)' }}>{pay.receipt}</span>
                  <Button size="sm" variant="ghost" iconLeft={<I.Download size={14} />}>Pobierz</Button>
                </div>
              </div>
            ) : (
              <Banner tone="warning">Brak załączonego czeku — płatność gotówkowa zgłoszona przez administratora.</Banner>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}>
            <Button variant="danger" fullWidth onClick={onReject}>Odrzuć</Button>
            <Button variant="primary" fullWidth iconLeft={<I.Check size={15} />} onClick={onConfirm}>Potwierdź płatność</Button>
          </div>
        </aside>
      </>
    );
  }

  function Payments() {
    const [tab, setTab] = React.useState('review');
    const [open, setOpen] = React.useState(null);
    const [reject, setReject] = React.useState(null);
    const [list, setList] = React.useState(D.payments.map(p => ({ ...p })));
    const [toast, setToast] = React.useState(null);

    const counts = {
      all: list.length,
      review: list.filter(p => p.status === 'pending').length,
      rejected: list.filter(p => p.status === 'rejected').length,
    };
    let rows = list;
    if (tab === 'review') rows = list.filter(p => p.status === 'pending');
    if (tab === 'rejected') rows = list.filter(p => p.status === 'rejected');

    const confirm = (p) => { setList(l => l.map(x => x.id === p.id ? { ...x, status: 'paid' } : x)); setOpen(null); setToast(`Płatność ${p.id.toUpperCase()} potwierdzona`); };
    const doReject = (p) => { setList(l => l.map(x => x.id === p.id ? { ...x, status: 'rejected' } : x)); setOpen(null); setReject(null); setToast(`Płatność ${p.id.toUpperCase()} odrzucona`); };

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Płatności</h2>
            <p className="page-desc">Naliczenia i płatności są rozdzielone. Weryfikuj kwotę czeku przed potwierdzeniem.</p>
          </div>
          <Button variant="secondary" iconLeft={<I.Download size={15} />}>Eksport (XLSX)</Button>
        </div>

        {toast && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setToast(null)}>{toast}</Banner>}

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'all', label: 'Wszystkie', count: counts.all },
            { value: 'review', label: 'Na weryfikacji', count: counts.review },
            { value: 'rejected', label: 'Odrzucone', count: counts.rejected },
          ]} />
        </div>

        <Table
          rows={rows} onRowClick={p => p.status === 'pending' && setOpen(p)}
          emptyLabel="Brak płatności w tej kategorii"
          columns={[
            { key: 'child', header: 'Dziecko', render: p => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={p.child} size={26} /><span className="strong">{p.child}</span></span> },
            { key: 'parent', header: 'Zgłosił', muted: true },
            { key: 'method', header: 'Sposób', muted: true },
            { key: 'date', header: 'Data', muted: true, render: p => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{p.date}</span> },
            { key: 'receipt', header: 'Czek', render: p => p.receipt ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-link)', fontSize: 'var(--fs-xs)' }}><I.File size={14} /> {p.receipt}</span> : <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>—</span> },
            { key: 'amount', header: 'Kwota', align: 'right', width: 110, render: p => <Money amount={p.amount} /> },
            { key: 'status', header: 'Status', width: 130, render: p => <StatusPill status={p.status} size="sm" /> },
            { key: 'act', header: '', width: 90, render: p => p.status === 'pending' ? <div className="row-actions" onClick={e => e.stopPropagation()}><IconButton label="Potwierdź" size="sm" onClick={() => confirm(p)}><I.Check size={16} /></IconButton><IconButton label="Odrzuć" size="sm" variant="danger" onClick={() => setReject(p)}><I.X size={16} /></IconButton></div> : null },
          ]}
        />

        {open && <ReceiptDrawer pay={open} onClose={() => setOpen(null)} onConfirm={() => confirm(open)} onReject={() => setReject(open)} />}
        {reject && (
          <Dialog open tone="danger" title="Odrzucić płatność?" confirmLabel="Odrzuć" cancelLabel="Anuluj"
            onClose={() => setReject(null)} onConfirm={() => doReject(reject)}
            description={`Płatność ${reject.child} na ${reject.amount},00 zł zostanie odrzucona. Rodzic otrzyma powiadomienie z powodem.`} />
        )}
      </div>
    );
  }

  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Payments = Payments;
})();
