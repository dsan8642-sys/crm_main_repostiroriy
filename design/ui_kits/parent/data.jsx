// Parent kit — mock data. Registers window.ParentData.
(function () {
  const children = [
    { id: 'k1', name: 'Zofia Kowalska', group: 'Delfiny', trainer: 'Marek Zieliński', born: '2015-04-12',
      sub: '8 zajęć', subLeft: 3, subEnds: '2026-07-20', balance: -240 },
    { id: 'k2', name: 'Kacper Kowalski', group: 'Foki', trainer: 'Marek Zieliński', born: '2017-08-03',
      sub: 'Bez limitu', subLeft: null, subEnds: '2026-09-01', balance: 0 },
  ];
  const schedule = {
    k1: [
      { date: 'Dziś · Czw 3.07', start: '17:00', end: '17:45', group: 'Delfiny', trainer: 'Marek Zieliński', location: 'Basen duży · tor 3-4', status: 'planned' },
      { date: 'Pon 7.07', start: '17:00', end: '17:45', group: 'Delfiny', trainer: 'Marek Zieliński', location: 'Basen duży', status: 'planned' },
      { date: 'Śr 9.07', start: '17:00', end: '17:45', group: 'Delfiny', trainer: 'Marek Zieliński', location: 'Basen duży', status: 'cancelled' },
    ],
    k2: [
      { date: 'Wt 8.07', start: '16:00', end: '16:45', group: 'Foki', trainer: 'Marek Zieliński', location: 'Basen mały', status: 'planned' },
    ],
  };
  const ledger = {
    k1: [
      { label: 'Zakup — abonament 8 zajęć', delta: '+8', date: '2026-06-20' },
      { label: 'Obecność · Delfiny', delta: '−1', date: '2026-06-24' },
      { label: 'Obecność · Delfiny', delta: '−1', date: '2026-06-27' },
      { label: 'Korekta administratora', delta: '+1', date: '2026-06-28' },
      { label: 'Obecność · Delfiny', delta: '−1', date: '2026-07-01' },
    ],
  };
  const attendance = {
    k1: [
      { date: '2026-07-01', label: 'Delfiny · 17:00', status: 'present' },
      { date: '2026-06-27', label: 'Delfiny · 17:00', status: 'present' },
      { date: '2026-06-24', label: 'Delfiny · 17:00', status: 'absent' },
      { date: '2026-06-20', label: 'Delfiny · 17:00', status: 'excused' },
    ],
  };
  const charges = [
    { id: 'ch1', child: 'Zofia Kowalska', desc: 'Abonament 8 zajęć — lipiec', amount: 240, due: '2026-07-05', status: 'overdue' },
    { id: 'ch2', child: 'Kacper Kowalski', desc: 'Abonament bez limitu — lipiec', amount: 300, due: '2026-07-10', status: 'awaiting' },
  ];
  const payments = [
    { id: 'pp1', child: 'Zofia Kowalska', amount: 240, date: '2026-07-02', method: 'Przelew', status: 'pending', receipt: 'przelew_240.pdf' },
    { id: 'pp2', child: 'Zofia Kowalska', amount: 240, date: '2026-06-04', method: 'Przelew', status: 'paid', receipt: 'czerwiec.pdf' },
    { id: 'pp3', child: 'Kacper Kowalski', amount: 300, date: '2026-05-30', method: 'Karta', status: 'paid', receipt: 'maj.pdf' },
  ];
  window.ParentData = { children, schedule, ledger, attendance, charges, payments };
})();
