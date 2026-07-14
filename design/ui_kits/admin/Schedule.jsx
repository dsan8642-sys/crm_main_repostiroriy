// Admin › Schedule — day view of sessions with conflict/limit/cancel states.
(function () {
  const { StatusPill, Button, IconButton, Banner, Badge } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;

  const HOURS = ['15:00', '16:00', '17:00', '18:00', '19:00'];

  function Schedule({ go }) {
    const [day, setDay] = React.useState('Czw 3.07');
    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Grafik</h2>
            <p className="page-desc">Widok dnia · Europe/Warsaw</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" iconLeft={<I.Plus size={15} />}>Indywidualne zajęcie</Button>
            <Button variant="primary" iconLeft={<I.Layers size={15} />}>Generuj z szablonu</Button>
          </div>
        </div>

        <div className="toolbar">
          <div className="seg">
            {['Pon 30.06', 'Wt 1.07', 'Śr 2.07', 'Czw 3.07', 'Pt 4.07'].map(d => (
              <button key={d} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>{d}</button>
            ))}
          </div>
          <span className="spacer" />
          <Badge tone="danger" dot>1 odwołane</Badge>
          <Badge tone="warning" dot>1 pełne</Badge>
        </div>

        <Banner tone="warning" title="Uwaga: pełna grupa" style={{ marginBottom: 14 }}>
          Delfiny 17:00 osiągnęły limit 12/12 uczestników.
        </Banner>

        <div className="card" style={{ overflow: 'hidden' }}>
          {HOURS.map((h, hi) => {
            const items = D.sessions.filter(s => s.start === h);
            return (
              <div key={h} style={{ display: 'flex', borderBottom: hi < HOURS.length - 1 ? '1px solid var(--border-subtle)' : 'none', minHeight: 62 }}>
                <div className="mono muted" style={{ width: 64, flexShrink: 0, padding: '12px 0 0 16px', fontSize: 'var(--fs-sm)' }}>{h}</div>
                <div style={{ flex: 1, display: 'flex', gap: 10, padding: 10, flexWrap: 'wrap' }}>
                  {items.length === 0 && <span className="muted" style={{ fontSize: 'var(--fs-xs)', alignSelf: 'center' }}>—</span>}
                  {items.map(s => {
                    const full = s.count >= s.limit;
                    const cancelled = s.status === 'cancelled';
                    return (
                      <div key={s.id} style={{
                        flex: '1 1 300px', minWidth: 280, maxWidth: 440,
                        border: `1px solid ${cancelled ? 'var(--border-subtle)' : full ? 'var(--amber-100)' : 'var(--border-default)'}`,
                        borderLeft: `3px solid ${cancelled ? 'var(--slate-300)' : full ? 'var(--amber-500)' : 'var(--primary)'}`,
                        borderRadius: 'var(--radius-md)',
                        background: cancelled ? 'var(--surface-sunken)' : 'var(--surface-card)',
                        padding: '9px 12px', opacity: cancelled ? 0.7 : 1,
                        display: 'flex', flexDirection: 'column', gap: 5,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="strong" style={{ flex: 1, textDecoration: cancelled ? 'line-through' : 'none' }}>{s.group}</span>
                          {cancelled ? <StatusPill status="cancelled" size="sm" /> : full ? <Badge tone="warning">{s.count}/{s.limit}</Badge> : <span className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>{s.count}/{s.limit}</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 'var(--fs-xs)', display: 'flex', gap: 12 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.Whistle size={13} />{s.trainer}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.Location size={13} />{s.location}</span>
                        </div>
                        {!cancelled && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                            <Button size="sm" variant="subtle" onClick={() => go('attendance')}>Frekwencja</Button>
                            <Button size="sm" variant="ghost">Edytuj</Button>
                            <span style={{ flex: 1 }} />
                            <IconButton label="Odwołaj" size="sm" variant="danger"><I.X size={15} /></IconButton>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Schedule = Schedule;
})();
