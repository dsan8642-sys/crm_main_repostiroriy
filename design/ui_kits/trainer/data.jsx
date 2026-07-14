// Trainer kit — mock data. Registers window.TrainerData.
(function () {
  const sessions = [
    { id: 's1', date: 'Dziś · Czw 3.07', start: '16:00', end: '16:45', group: 'Foki', location: 'Basen mały', count: 8, status: 'done' },
    { id: 's2', date: 'Dziś · Czw 3.07', start: '17:00', end: '17:45', group: 'Delfiny', location: 'Basen duży · tor 3-4', count: 12, status: 'planned' },
    { id: 's3', date: 'Jutro · Pt 4.07', start: '16:00', end: '16:45', group: 'Foki', location: 'Basen mały', count: 8, status: 'planned' },
    { id: 's4', date: 'Jutro · Pt 4.07', start: '17:00', end: '17:45', group: 'Delfiny', location: 'Basen duży · tor 3-4', count: 12, status: 'planned' },
    { id: 's5', date: 'Pon 7.07', start: '17:00', end: '17:45', group: 'Delfiny', location: 'Basen duży', count: 12, status: 'cancelled' },
  ];
  const roster = [
    { id: 'c1', name: 'Zofia Kowalska', emergency: 'Ewa Kowalska · +48 600 100 200', med: 'Astma — inhalator w torbie', status: 'present' },
    { id: 'c4', name: 'Antoni Wójcik', emergency: 'Paweł Wójcik · +48 603 812 400', med: '', status: 'present' },
    { id: 'c8', name: 'Igor Baran', emergency: 'Monika Baran · +48 607 341 998', med: '', status: null },
    { id: 'c9', name: 'Hanna Duda', emergency: 'Robert Duda · +48 608 190 552', med: '', status: null },
    { id: 'c10', name: 'Oskar Wróbel', emergency: 'Julia Wróbel · +48 609 771 300', med: 'Alergia — orzechy', status: null },
    { id: 'c11', name: 'Alicja Mazur', emergency: 'Piotr Mazur · +48 512 004 881', med: '', status: null },
    { id: 'c12', name: 'Szymon Górski', emergency: 'Ewa Górska · +48 513 660 240', med: '', status: null },
  ];
  const groups = [
    { id: 'g1', name: 'Delfiny', students: 12, next: 'Dziś 17:00', schedule: 'Pon, Śr, Czw · 17:00' },
    { id: 'g3', name: 'Foki', students: 8, next: 'Dziś 16:00', schedule: 'Wt, Czw · 16:00' },
    { id: 'g5', name: 'Wieloryby', students: 10, next: 'Pt 18:00', schedule: 'Pt · 18:00' },
  ];
  window.TrainerData = { sessions, roster, groups };
})();
