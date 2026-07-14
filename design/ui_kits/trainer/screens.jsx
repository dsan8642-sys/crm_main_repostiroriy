// Trainer kit — screens. Registers window.TrainerScreens.
(function () {
  const { StatusPill, Button, Avatar, Banner, Badge, IconButton } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.TrainerData;

  // ---- My sessions ----
  function Sessions({ go }) {
    const [range, setRange] = React.useState('week');
    const grouped = {};
    D.sessions.forEach(s => { (grouped[s.date] = grouped[s.date] || []).push(s); });
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2 className="page-title">Moje zajęcia</h2>
            <p className="page-desc">Marek Zieliński · widzisz tylko swoje zajęcia</p>
          </div>
          <div className="seg">
            {[['today', 'Dziś'], ['week', 'Tydzień'], ['all', 'Wszystkie']].map(([v, l]) => (
              <button key={v} className={v === range ? 'on' : ''} onClick={() => setRange(v)}>{l}</button>
            ))}
          </div>
        </div>

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date} style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{date}</div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {items.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none', opacity: s.status === 'cancelled' ? 0.65 : 1 }}>
                  <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{s.start}–{s.end}</span>
                  <span className="strong" style={{ width: 120, textDecoration: s.status === 'cancelled' ? 'line-through' : 'none' }}>{s.group}</span>
                  <span className="muted" style={{ flex: 1, fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.Location size={13} />{s.location}</span>
                  <span className="mono muted" style={{ fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.Users size={13} />{s.count}</span>
                  <StatusPill status={s.status} size="sm" />
                  {s.status !== 'cancelled' && <Button size="sm" variant={s.status === 'done' ? 'ghost' : 'subtle'} onClick={() => go('session')}>{s.status === 'done' ? 'Podgląd' : 'Frekwencja'}</Button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---- Session attendance ----
  const OPTIONS = ['present', 'absent', 'excused', 'moved'];
  const LABELS = { present: 'Obecny', absent: 'Nieobecny', excused: 'Uspr.', moved: 'Przeł.' };
  function Session({ go }) {
    const [rows, setRows] = React.useState(D.roster.map(r => ({ ...r })));
    const [saved, setSaved] = React.useState(false);
    const set = (id, status) => { setRows(rs => rs.map(r => r.id === id ? { ...r, status } : r)); setSaved(false); };
    const done = rows.filter(r => r.status).length;
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <button onClick={() => go('sessions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: 0, marginBottom: 6 }}><I.ArrowLeft size={14} /> Moje zajęcia</button>
            <h2 className="page-title">Delfiny · 17:00–17:45</h2>
            <p className="page-desc">Czw 3.07 · Basen duży, tor 3-4 · {rows.length} uczniów</p>
          </div>
          <Button variant="primary" iconLeft={<I.Check size={15} />} onClick={() => setSaved(true)}>Zapisz frekwencję</Button>
        </div>

        <Banner tone="info" style={{ marginBottom: 14 }}>Statusy <strong style={{ color: 'var(--text-strong)' }}>Obecny</strong> i <strong style={{ color: 'var(--text-strong)' }}>Nieobecny</strong> spisują zajęcie (−1). Nie przedłużasz abonamentów ani nie zmieniasz płatności.</Banner>
        {saved && <Banner tone="success" style={{ marginBottom: 14 }} onClose={() => setSaved(false)}>Frekwencja zapisana ({done}/{rows.length}).</Banner>}

        <div className="card" style={{ overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: r.status ? 'transparent' : 'var(--amber-50)' }}>
              <Avatar name={r.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {r.name}
                  {r.med && <span title={r.med} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--red-600)', fontSize: 'var(--fs-2xs)', fontWeight: 600, background: 'var(--red-50)', padding: '1px 6px', borderRadius: 999 }}><I.Heart size={11} />{r.med}</span>}
                </div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.Phone size={11} />Kontakt: {r.emergency}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {OPTIONS.map(o => {
                  const on = r.status === o;
                  const consumes = o === 'present' || o === 'absent';
                  return (
                    <button key={o} onClick={() => set(r.id, o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', cursor: 'pointer', border: `1px solid ${on ? `var(--status-${o}-fg)` : 'var(--border-default)'}`, background: on ? `var(--status-${o}-bg)` : 'var(--surface-card)', color: on ? `var(--status-${o}-fg)` : 'var(--text-muted)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-xs)', fontWeight: on ? 600 : 500, fontFamily: 'var(--font-sans)' }}>
                      {LABELS[o]}{consumes && <span className="mono" style={{ fontSize: 'var(--fs-2xs)', opacity: on ? 1 : 0.5 }}>−1</span>}
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

  // ---- Groups ----
  function Groups() {
    return (
      <div className="page">
        <div className="page-head"><div><h2 className="page-title">Moje grupy</h2><p className="page-desc">{D.groups.length} grupy przypisane do Ciebie</p></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {D.groups.map(g => (
            <div key={g.id} className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--primary-soft)', color: 'var(--primary)' }}><I.Waves size={18} /></span>
                <div><div className="strong" style={{ fontSize: 'var(--fs-md)' }}>{g.name}</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{g.students} uczniów</div></div>
              </div>
              <dl className="dl" style={{ gridTemplateColumns: '92px 1fr' }}>
                <dt>Grafik</dt><dd style={{ fontWeight: 500 }}>{g.schedule}</dd>
                <dt>Najbliższe</dt><dd><Badge tone="primary" dot>{g.next}</Badge></dd>
              </dl>
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.TrainerScreens = { Sessions, Session, Groups };
})();
