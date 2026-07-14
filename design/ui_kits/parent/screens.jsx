// Parent kit — screens. Registers window.ParentScreens.
(function () {
  const { StatusPill, Money, Button, Avatar, Banner, Badge, Tabs, Dialog, Input, Select, Switch } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.ParentData;

  function ChildSwitch({ kid, setKid }) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {D.children.map(c => {
          const on = c.id === kid;
          return (
            <button key={c.id} onClick={() => setKid(c.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 6px', cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border-default)'}`, background: on ? 'var(--primary-soft)' : 'var(--surface-card)', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)' }}>
              <Avatar name={c.name} size={26} />
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: on ? 600 : 500, color: on ? 'var(--primary-hover)' : 'var(--text-body)' }}>{c.name.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // ---- Home ----
  function Home({ kid, setKid, go }) {
    const c = D.children.find(x => x.id === kid);
    const next = (D.schedule[kid] || []).find(s => s.status === 'planned');
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div><h2 className="page-title">Cześć, Ewa</h2><p className="page-desc">Twoje dzieci w szkole H2O</p></div>
          <ChildSwitch kid={kid} setKid={setKid} />
        </div>

        {c.balance < 0 && (
          <Banner tone="danger" title="Zaległość do opłacenia" style={{ marginBottom: 14 }}
            action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>Zapłać</Button>}>
            {c.name}: saldo <strong>{Math.abs(c.balance)},00 zł</strong>. Prześlij potwierdzenie przelewu.
          </Banner>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Calendar size={15} /></span>Następny trening</div>
            {next ? (
              <>
                <div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{next.date.replace('Dziś · ', '')} · {next.start}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{next.group} · {next.trainer}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}><I.Location size={13} />{next.location}</div>
              </>
            ) : <div className="muted" style={{ marginTop: 8 }}>Brak zaplanowanych zajęć.</div>}
          </div>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>Abonament</div>
            <div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{c.sub}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
              <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Pozostało: <strong className="mono" style={{ color: c.subLeft != null && c.subLeft <= 2 ? 'var(--amber-600)' : 'var(--text-strong)' }}>{c.subLeft == null ? '∞' : `${c.subLeft} zaj.`}</strong></span>
              <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Koniec: <strong className="mono">{c.subEnds}</strong></span>
            </div>
            <Button size="sm" variant="secondary" style={{ marginTop: 12 }} onClick={() => go('subscription')}>Zobacz historię</Button>
          </div>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Wallet size={15} /></span>Płatność</div>
            {c.balance < 0
              ? <><div style={{ margin: '4px 0 2px' }}><Money amount={c.balance} signed size="var(--fs-lg)" /></div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Termin: 05.07.2026</div></>
              : <><div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px', color: 'var(--money-credit)' }}>Brak zaległości</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Wszystko opłacone</div></>}
            <Button size="sm" variant={c.balance < 0 ? 'primary' : 'secondary'} style={{ marginTop: 12 }} iconLeft={<I.Upload size={14} />} onClick={() => go('payments')}>Prześlij czek</Button>
          </div>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Bell size={15} /></span>Powiadomienia</div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-body)', lineHeight: 1.5, marginTop: 4 }}>
              <div>· Zajęcia 9.07 zostały <strong>odwołane</strong>.</div>
              <div>· Abonament Zofii kończy się za <strong>3 zajęcia</strong>.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Schedule ----
  function Schedule({ kid, setKid }) {
    const list = D.schedule[kid] || [];
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h2 className="page-title">Rozkład</h2><p className="page-desc">Nie możesz sam zapisać ani przełożyć zajęć — skontaktuj się z administracją.</p></div><ChildSwitch kid={kid} setKid={setKid} /></div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {list.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < list.length - 1 ? '1px solid var(--border-subtle)' : 'none', opacity: s.status === 'cancelled' ? 0.6 : 1 }}>
              <div style={{ width: 120 }}><div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{s.date}</div><div className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>{s.start}–{s.end}</div></div>
              <span className="strong" style={{ width: 100, textDecoration: s.status === 'cancelled' ? 'line-through' : 'none' }}>{s.group}</span>
              <span className="muted" style={{ flex: 1, fontSize: 'var(--fs-xs)' }}>{s.trainer} · {s.location}</span>
              <StatusPill status={s.status} size="sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Subscription ----
  function Subscription({ kid, setKid }) {
    const c = D.children.find(x => x.id === kid);
    const rows = D.ledger[kid] || [];
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head"><div><h2 className="page-title">Abonament</h2><p className="page-desc">{c.name} · {c.sub}</p></div><ChildSwitch kid={kid} setKid={setKid} /></div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 18 }}>
          <div className="card card-pad" style={{ flex: 1 }}><div className="eyebrow">Pozostało zajęć</div><div className="mono" style={{ fontSize: 'var(--fs-3xl)', fontWeight: 600, color: 'var(--text-strong)' }}>{c.subLeft == null ? '∞' : c.subLeft}</div></div>
          <div className="card card-pad" style={{ flex: 1 }}><div className="eyebrow">Data końca</div><div className="mono" style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text-strong)', marginTop: 8 }}>{c.subEnds}</div></div>
          <div className="card card-pad" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}><Button variant="primary" size="sm">Zgłoś przedłużenie</Button><Button variant="ghost" size="sm">Kontakt z administracją</Button></div>
        </div>
        {rows.length > 0 && <>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Historia ruchów — czytelna: zakup +8, obecność −1, korekta +1</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span className="mono" style={{ width: 44, fontWeight: 600, fontSize: 'var(--fs-md)', color: r.delta[0] === '+' ? 'var(--money-credit)' : 'var(--money-debt)' }}>{r.delta}</span>
                <span style={{ flex: 1, fontSize: 'var(--fs-sm)' }}>{r.label}</span>
                <span className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>{r.date}</span>
              </div>
            ))}
          </div>
        </>}
      </div>
    );
  }

  // ---- Payments + receipt upload ----
  function Payments({ kid, setKid }) {
    const [tab, setTab] = React.useState('charges');
    const [upload, setUpload] = React.useState(false);
    const [file, setFile] = React.useState(null);
    return (
      <div className="page" style={{ maxWidth: 860 }}>
        <div className="page-head"><div><h2 className="page-title">Płatności</h2><p className="page-desc">Naliczenia, historia wpłat i przesłane czeki</p></div>
          <Button variant="primary" iconLeft={<I.Upload size={15} />} onClick={() => setUpload(true)}>Prześlij czek</Button></div>

        <Tabs value={tab} onChange={setTab} style={{ marginBottom: 16 }} items={[
          { value: 'charges', label: 'Do zapłaty', count: D.charges.length },
          { value: 'history', label: 'Historia wpłat' },
        ]} />

        {tab === 'charges' && (
          <div className="card" style={{ overflow: 'hidden' }}>
            {D.charges.map((ch, i) => (
              <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < D.charges.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ flex: 1 }}><div className="strong">{ch.desc}</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{ch.child} · termin {ch.due}</div></div>
                <Money amount={ch.amount} />
                <StatusPill status={ch.status} size="sm" />
                <Button size="sm" variant="subtle" iconLeft={<I.Upload size={13} />} onClick={() => setUpload(true)}>Czek</Button>
              </div>
            ))}
          </div>
        )}
        {tab === 'history' && (
          <div className="card" style={{ overflow: 'hidden' }}>
            {D.payments.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < D.payments.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ flex: 1 }}><div className="strong">{p.child}</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{p.method} · {p.date}</div></div>
                {p.receipt && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-link)', fontSize: 'var(--fs-xs)' }}><I.File size={14} />{p.receipt}</span>}
                <Money amount={p.amount} />
                <StatusPill status={p.status} size="sm" />
              </div>
            ))}
          </div>
        )}

        {upload && (
          <Dialog open title="Prześlij potwierdzenie płatności" width={480}
            confirmLabel="Wyślij do weryfikacji" cancelLabel="Anuluj"
            onClose={() => { setUpload(false); setFile(null); }} onConfirm={() => { setUpload(false); setFile(null); }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Select label="Dziecko" defaultValue="Zofia Kowalska"><option>Zofia Kowalska</option><option>Kacper Kowalski</option></Select>
              <div style={{ display: 'flex', gap: 10 }}>
                <Input label="Kwota" suffix="zł" defaultValue="240,00" containerStyle={{ flex: 1 }} />
                <Input label="Data wpłaty" type="date" defaultValue="2026-07-03" containerStyle={{ flex: 1 }} />
              </div>
              <Select label="Sposób płatności" defaultValue="Przelew"><option>Przelew</option><option>Gotówka</option><option>Karta</option></Select>
              <div>
                <div style={{ font: 'var(--text-label)', color: 'var(--text-body)', marginBottom: 5 }}>Plik (PDF / JPG / PNG)</div>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px', border: `1.5px dashed ${file ? 'var(--primary)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-md)', background: file ? 'var(--primary-soft)' : 'var(--surface-sunken)', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <I.Upload size={22} />
                  <span style={{ fontSize: 'var(--fs-sm)' }}>{file ? file : 'Kliknij lub przeciągnij plik'}</span>
                  <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] ? e.target.files[0].name : 'przelew.pdf')} />
                </label>
              </div>
              <Banner tone="info">Płatność online nie jest dostępna. Administrator zweryfikuje czek i potwierdzi wpłatę.</Banner>
            </div>
          </Dialog>
        )}
      </div>
    );
  }

  // ---- Consents ----
  function Consents({ kid, setKid }) {
    const [ch, setCh] = React.useState({ rodo: true, email: true, sms: false, tg: true });
    const t = (k) => setCh(s => ({ ...s, [k]: !s[k] }));
    const ITEMS = [
      ['rodo', 'Przetwarzanie danych (RODO)', 'Wymagane do korzystania ze szkoły. Wycofanie: skontaktuj się z administracją.', true],
      ['email', 'Powiadomienia e-mail', 'Przypomnienia o zajęciach i płatnościach.'],
      ['sms', 'Powiadomienia SMS', 'Tylko krytyczne sytuacje (odwołane zajęcia).'],
      ['tg', 'Powiadomienia Telegram', 'Połączony czat: @ewa_k.'],
    ];
    return (
      <div className="page" style={{ maxWidth: 680 }}>
        <div className="page-head"><div><h2 className="page-title">Zgody i powiadomienia</h2><p className="page-desc">Zarządzasz kanałami kontaktu i zgodami RODO</p></div></div>
        <div className="card">
          {ITEMS.map(([k, title, desc, req], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '15px 18px', borderBottom: i < ITEMS.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div className="strong" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>{title}{req && <Badge tone="neutral">Wymagane</Badge>}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 3 }}>{desc}</div>
              </div>
              <Switch checked={ch[k]} onChange={() => !req && t(k)} />
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 12 }}>Wersja polityki prywatności: 2.1 · zgoda udzielona 2026-01-14</p>
      </div>
    );
  }

  window.ParentScreens = { Home, Schedule, Subscription, Payments, Consents };
})();
