// Admin › Debtors — overdue balances with reasons and quick notify.
(function () {
  const { Table, Money, Button, Avatar, Badge, IconButton, Banner } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;

  function Debtors() {
    const [range, setRange] = React.useState('30');
    const total = D.debtors.reduce((s, d) => s + d.balance, 0);
    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Dłużnicy</h2>
            <p className="page-desc">{D.debtors.length} rodzin · łączny dług <span style={{ color: 'var(--money-debt)', fontWeight: 600 }}>{Math.abs(total).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span></p>
          </div>
          <Button variant="primary" iconLeft={<I.Bell size={15} />}>Wyślij przypomnienia ({D.debtors.length})</Button>
        </div>

        <div className="toolbar">
          <div className="seg">
            {[['today', 'Dziś'], ['3', '3 dni'], ['7', '7 dni'], ['14', '14 dni'], ['30', '30 dni']].map(([v, l]) => (
              <button key={v} className={v === range ? 'on' : ''} onClick={() => setRange(v)}>{l}</button>
            ))}
          </div>
          <span className="spacer" />
          <Badge tone="danger" dot>Przeterminowane naliczenia</Badge>
        </div>

        <Table
          rows={D.debtors}
          columns={[
            { key: 'child', header: 'Dziecko', render: d => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={d.child} size={26} /><span className="strong">{d.child}</span></span> },
            { key: 'parent', header: 'Rodzic', muted: true, render: d => <span>{d.parent}</span> },
            { key: 'group', header: 'Grupa', muted: true },
            { key: 'reason', header: 'Powód', render: d => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--red-600)', fontSize: 'var(--fs-xs)', fontWeight: 500 }}><I.Alert size={13} />{d.reason}</span> },
            { key: 'last', header: 'Ostatnia wpłata', muted: true, render: d => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{d.last}</span> },
            { key: 'balance', header: 'Saldo', align: 'right', width: 120, render: d => <Money amount={d.balance} signed /> },
            { key: 'act', header: '', width: 96, render: d => <div className="row-actions"><IconButton label="Karta klienta" size="sm"><I.User size={16} /></IconButton><IconButton label="Wyślij przypomnienie" size="sm"><I.Bell size={16} /></IconButton></div> },
          ]}
        />
      </div>
    );
  }

  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Debtors = Debtors;
})();
