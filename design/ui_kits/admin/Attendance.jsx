// Admin › Attendance — mark attendance for one session; statuses show lesson consumption.
(function () {
  const { StatusPill, Button, Avatar, Banner, Money } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;

  const OPTIONS = ['present', 'absent', 'excused', 'moved'];
  const LABELS = { present: 'Obecny', absent: 'Nieobecny', excused: 'Uspr.', moved: 'Przeł.' };

  function Attendance({ go }) {
    const [rows, setRows] = React.useState(D.roster.map(r => ({ ...r })));
    const [saved, setSaved] = React.useState(false);
    const set = (id, status) => { setRows(rs => rs.map(r => r.id === id ? { ...r, status } : r)); setSaved(false); };
    const markAll = () => { setRows(rs => rs.map(r => r.status ? r : { ...r, status: 'present' })); setSaved(false); };
    const done = rows.filter(r => r.status).length;

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <button onClick={() => go('schedule')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: 0, marginBottom: 6 }}><I.ArrowLeft size={14} /> Grafik</button>
            <h2 className="page-title">Delfiny · 17:00–17:45</h2>
            <p className="page-desc">Czw 3.07.2026 · Marek Zieliński · Basen duży, tor 3-4</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={markAll}>Zaznacz wszystkich obecnych</Button>
            <Button variant="primary" iconLeft={<I.Check size={15} />} onClick={() => setSaved(true)}>Zapisz</Button>
          </div>
        </div>

        <Banner tone="info" style={{ marginBottom: 14 }}>
          Statusy <strong style={{ color: 'var(--text-strong)' }}>Obecny</strong> i <strong style={{ color: 'var(--text-strong)' }}>Nieobecny</strong> spisują zajęcie z abonamentu (−1). Zmiana statusu tworzy korektę, nie edytuje starego wpisu.
        </Banner>
        {saved && <Banner tone="success" style={{ marginBottom: 14 }} onClose={() => setSaved(false)}>Frekwencja zapisana. Utworzono {rows.filter(r => r.status === 'present' || r.status === 'absent').length} spisań.</Banner>}

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="eyebrow" style={{ flex: 1 }}>Uczeń ({done}/{rows.length} odznaczonych)</span>
            <span className="eyebrow" style={{ width: 320 }}>Status &amp; spisanie</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: r.status ? 'transparent' : 'var(--amber-50)' }}>
              <Avatar name={r.name} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {r.name}
                  {r.med && <span title={r.med} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--red-600)', fontSize: 'var(--fs-2xs)', fontWeight: 600, background: 'var(--red-50)', padding: '1px 6px', borderRadius: 999 }}><I.Heart size={11} />{r.med}</span>}
                </div>
                <div className="mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-faint)' }}>{r.phone}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, width: 300, justifyContent: 'flex-end' }}>
                {OPTIONS.map(o => {
                  const on = r.status === o;
                  const consumes = o === 'present' || o === 'absent';
                  return (
                    <button key={o} onClick={() => set(r.id, o)} title={consumes ? 'Spisuje zajęcie (−1)' : 'Nie spisuje'} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', cursor: 'pointer',
                      border: `1px solid ${on ? `var(--status-${o}-fg)` : 'var(--border-default)'}`,
                      background: on ? `var(--status-${o}-bg)` : 'var(--surface-card)',
                      color: on ? `var(--status-${o}-fg)` : 'var(--text-muted)',
                      borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-xs)', fontWeight: on ? 600 : 500, fontFamily: 'var(--font-sans)',
                    }}>
                      {LABELS[o]}
                      {consumes && <span className="mono" style={{ fontSize: 'var(--fs-2xs)', opacity: on ? 1 : 0.5 }}>−1</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Attendance = Attendance;
})();
