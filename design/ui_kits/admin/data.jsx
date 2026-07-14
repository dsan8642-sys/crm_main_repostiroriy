// SwimCRM Admin kit — mock data (Polish swimming school). Registers window.AdminData.
(function () {
  const trainers = [
    { id: 't1', name: 'Marek Zieliński', phone: '+48 601 220 145', active: true, groups: 3 },
    { id: 't2', name: 'Anna Lewandowska', phone: '+48 602 118 907', active: true, groups: 2 },
    { id: 't3', name: 'Piotr Kaczmarek', phone: '+48 605 771 330', active: false, groups: 1 },
  ];
  const groups = [
    { id: 'g1', name: 'Delfiny', trainer: 'Marek Zieliński', students: 12, active: true },
    { id: 'g2', name: 'Rekiny', trainer: 'Anna Lewandowska', students: 9, active: true },
    { id: 'g3', name: 'Foki', trainer: 'Marek Zieliński', students: 8, active: true },
    { id: 'g4', name: 'Żółwie (początkujący)', trainer: 'Piotr Kaczmarek', students: 6, active: false },
  ];
  const clients = [
    { id: 'c1', first: 'Zofia', last: 'Kowalska', born: '2015-04-12', parent: 'Ewa Kowalska', phone: '+48 600 100 200', email: 'ewa.k@example.pl', group: 'Delfiny', trainer: 'Marek Zieliński', status: 'active', balance: -240, sub: '8 zajęć', subLeft: 3, subEnds: '2026-07-20', med: 'Astma — inhalator w torbie', emergency: 'Ewa Kowalska · +48 600 100 200' },
    { id: 'c2', first: 'Jan', last: 'Nowak', born: '2014-09-30', parent: 'Tomasz Nowak', phone: '+48 601 233 991', email: 'tnowak@example.pl', group: 'Rekiny', trainer: 'Anna Lewandowska', status: 'active', balance: 0, sub: '12 zajęć', subLeft: 9, subEnds: '2026-08-04', med: '', emergency: 'Tomasz Nowak · +48 601 233 991' },
    { id: 'c3', first: 'Lena', last: 'Wiśniewska', born: '2016-01-18', parent: 'Marta Wiśniewska', phone: '+48 602 550 771', email: 'marta.w@example.pl', group: 'Foki', trainer: 'Marek Zieliński', status: 'active', balance: 80, sub: '8 zajęć (zamr.)', subLeft: 5, subEnds: '2026-07-28', med: 'Alergia na chlor — łagodna', emergency: 'Marta Wiśniewska · +48 602 550 771' },
    { id: 'c4', first: 'Antoni', last: 'Wójcik', born: '2015-11-02', parent: 'Paweł Wójcik', phone: '+48 603 812 400', email: 'pwojcik@example.pl', group: 'Delfiny', trainer: 'Marek Zieliński', status: 'active', balance: -120, sub: '4 zajęcia', subLeft: 1, subEnds: '2026-07-08', med: '', emergency: 'Paweł Wójcik · +48 603 812 400' },
    { id: 'c5', first: 'Maja', last: 'Kamińska', born: '2017-03-25', parent: 'Karolina Kamińska', phone: '+48 604 119 233', email: 'k.kaminska@example.pl', group: 'Żółwie (początkujący)', trainer: 'Piotr Kaczmarek', status: 'inactive', balance: 0, sub: 'Wygasł', subLeft: 0, subEnds: '2026-06-10', med: '', emergency: 'Karolina Kamińska · +48 604 119 233' },
    { id: 'c6', first: 'Filip', last: 'Zawadzki', born: '2014-07-14', parent: 'Anna Zawadzka', phone: '+48 605 660 187', email: 'a.zawadzka@example.pl', group: 'Rekiny', trainer: 'Anna Lewandowska', status: 'active', balance: -360, sub: '12 zajęć', subLeft: 2, subEnds: '2026-07-11', med: 'Cukrzyca typu 1', emergency: 'Anna Zawadzka · +48 605 660 187' },
    { id: 'c7', first: 'Nadia', last: 'Sokołowska', born: '2016-10-08', parent: 'Robert Sokołowski', phone: '+48 606 200 415', email: 'r.sokol@example.pl', group: 'Foki', trainer: 'Marek Zieliński', status: 'active', balance: 0, sub: 'Bez limitu', subLeft: null, subEnds: '2026-09-01', med: '', emergency: 'Robert Sokołowski · +48 606 200 415' },
    { id: 'c8', first: 'Igor', last: 'Baran', born: '2015-05-19', parent: 'Monika Baran', phone: '+48 607 341 998', email: 'm.baran@example.pl', group: 'Delfiny', trainer: 'Marek Zieliński', status: 'active', balance: -80, sub: '8 zajęć', subLeft: 4, subEnds: '2026-07-22', med: '', emergency: 'Monika Baran · +48 607 341 998' },
  ];

  // Today's schedule (Europe/Warsaw)
  const sessions = [
    { id: 's1', start: '15:00', end: '15:45', group: 'Żółwie (początkujący)', trainer: 'Piotr Kaczmarek', location: 'Basen mały', count: 6, limit: 8, status: 'done' },
    { id: 's2', start: '16:00', end: '16:45', group: 'Foki', trainer: 'Marek Zieliński', location: 'Basen mały', count: 8, limit: 10, status: 'done' },
    { id: 's3', start: '17:00', end: '17:45', group: 'Delfiny', trainer: 'Marek Zieliński', location: 'Basen duży · tor 3-4', count: 12, limit: 12, status: 'planned', conflict: false },
    { id: 's4', start: '17:00', end: '17:45', group: 'Rekiny', trainer: 'Anna Lewandowska', location: 'Basen duży · tor 1-2', count: 9, limit: 10, status: 'planned' },
    { id: 's5', start: '18:00', end: '18:45', group: 'Rekiny', trainer: 'Anna Lewandowska', location: 'Basen duży · tor 1-2', count: 9, limit: 10, status: 'cancelled' },
  ];

  // Attendance roster for Delfiny 17:00
  const roster = [
    { id: 'c1', name: 'Zofia Kowalska', phone: '+48 600 100 200', status: 'present', med: 'Astma' },
    { id: 'c4', name: 'Antoni Wójcik', phone: '+48 603 812 400', status: 'present', med: '' },
    { id: 'c8', name: 'Igor Baran', phone: '+48 607 341 998', status: 'absent', med: '' },
    { id: 'c9', name: 'Hanna Duda', phone: '+48 608 190 552', status: 'excused', med: '' },
    { id: 'c10', name: 'Oskar Wróbel', phone: '+48 609 771 300', status: 'moved', med: 'Alergia — orzechy' },
    { id: 'c11', name: 'Alicja Mazur', phone: '+48 512 004 881', status: null, med: '' },
    { id: 'c12', name: 'Szymon Górski', phone: '+48 513 660 240', status: null, med: '' },
  ];

  // Payments on review
  const payments = [
    { id: 'p1', child: 'Zofia Kowalska', parent: 'Ewa Kowalska', amount: 240, method: 'Przelew', date: '2026-07-02', status: 'pending', receipt: 'przelew_240.pdf' },
    { id: 'p2', child: 'Filip Zawadzki', parent: 'Anna Zawadzka', amount: 360, method: 'Przelew', date: '2026-07-02', status: 'pending', receipt: 'blik_pokwitowanie.jpg' },
    { id: 'p3', child: 'Igor Baran', parent: 'Monika Baran', amount: 80, method: 'Gotówka', date: '2026-07-01', status: 'pending', receipt: null },
    { id: 'p4', child: 'Antoni Wójcik', parent: 'Paweł Wójcik', amount: 120, method: 'Przelew', date: '2026-07-01', status: 'pending', receipt: 'wplata.png' },
    { id: 'p5', child: 'Maja Kamińska', parent: 'Karolina Kamińska', amount: 200, method: 'Przelew', date: '2026-06-30', status: 'paid', receipt: 'ok.pdf' },
    { id: 'p6', child: 'Nadia Sokołowska', parent: 'Robert Sokołowski', amount: 300, method: 'Karta', date: '2026-06-29', status: 'rejected', receipt: 'zla_kwota.jpg' },
  ];

  // Debtors
  const debtors = [
    { id: 'c6', child: 'Filip Zawadzki', parent: 'Anna Zawadzka', group: 'Rekiny', trainer: 'Anna Lewandowska', reason: 'Przeterminowane naliczenie', balance: -360, last: '2026-05-18' },
    { id: 'c1', child: 'Zofia Kowalska', parent: 'Ewa Kowalska', group: 'Delfiny', trainer: 'Marek Zieliński', reason: 'Dług', balance: -240, last: '2026-06-04' },
    { id: 'c4', child: 'Antoni Wójcik', parent: 'Paweł Wójcik', group: 'Delfiny', trainer: 'Marek Zieliński', reason: 'Abonament wygasa · dług', balance: -120, last: '2026-06-20' },
    { id: 'c8', child: 'Igor Baran', parent: 'Monika Baran', group: 'Delfiny', trainer: 'Marek Zieliński', reason: 'Dług', balance: -80, last: '2026-06-22' },
  ];

  window.AdminData = { trainers, groups, clients, sessions, roster, payments, debtors };
})();
