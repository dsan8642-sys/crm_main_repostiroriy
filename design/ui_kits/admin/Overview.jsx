// Admin › Overview — operational "today" screen. Registers window.AdminScreens.Overview
(function () {
  const { StatusPill, Money, Button, Banner } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;

  function Kpi({ icon, label, value, sub, tone }) {
    return (
      <div className="kpi">
        <div className="kpi-label"><span className="kpi-ico">{icon}</span>{label}</div>
        <div className="kpi-value" style={tone ? { color: tone } : null}>{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    );
  }

  function Overview({ go }) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2 className="page-title">Przegląd</h2>
            <p className="page-desc">Czwartek, 3 lipca 2026 · Europe/Warsaw</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" iconLeft={<I.Calendar size={15} />} onClick={() => go('schedule')}>Grafik na dziś</Button>
            <Button variant="primary" iconLeft={<I.Cash size={15} />} onClick={() => go('payments')}>Płatności do sprawdzenia</Button>
          </div>
        </div>

        <Banner tone="warning" title="4 płatności czekają na weryfikację" style={{ marginBottom: 16 }}
          action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>Otwórz</Button>}>
          Rodzice przesłali potwierdzenia przelewu. Sprawdź kwoty przed potwierdzeniem.
        </Banner>

        <div className="eyebrow" style={{ marginBottom: 10 }}>Dziś</div>
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <Kpi icon={<I.Calendar size={15} />} label="Zajęcia dziś" value="5" sub="Najbliższe: Delfiny 17:00" />
          <Kpi icon={<I.Whistle size={15} />} label="Trenerzy dziś" value="2" sub="Marek, Anna" />
          <Kpi icon={<I.X size={15} />} label="Odwołane" value="1" sub="Rekiny 18:00" tone="var(--money-debt)" />
          <Kpi icon={<I.Users size={15} />} label="Uczniowie dziś" value="44" sub="Frekwencja 86%" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Finanse</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Kpi icon={<I.Wallet size={15} />} label="Nieopłacone naliczenia" value={<Money amount={2480} />} sub="14 pozycji" />
              <Kpi icon={<I.Alert size={15} />} label="Przeterminowane" value={<span style={{ color: 'var(--money-debt)' }}>4</span>} sub="−800,00 zł łącznie" tone="var(--money-debt)" />
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Abonamenty</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Kpi icon={<I.Clock size={15} />} label="Skoro koniec (7 dni)" value="6" sub="Zaproponuj przedłużenie" />
              <Kpi icon={<I.Layers size={15} />} label="Mało zajęć (≤2)" value="3" sub="Filip, Antoni, Zofia" />
            </div>
          </div>
        </div>

        <div className="eyebrow" style={{ margin: '20px 0 10px' }}>Najbliższe zajęcia</div>
        <div className="card">
          {D.sessions.filter(s => s.status !== 'done').map((s, i, arr) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-strong)', width: 96 }}>{s.start}–{s.end}</span>
              <span className="strong" style={{ flex: 1 }}>{s.group}</span>
              <span className="muted" style={{ fontSize: 'var(--fs-sm)', width: 150 }}>{s.trainer}</span>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)', width: 150 }}>{s.location}</span>
              <span className="mono muted" style={{ fontSize: 'var(--fs-xs)', width: 54, textAlign: 'right' }}>{s.count}/{s.limit}</span>
              <StatusPill status={s.status} size="sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Overview = Overview;
})();
