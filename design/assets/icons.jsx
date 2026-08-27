// SwimCRM shared icon set — Lucide-style line icons.
// 24px grid, 1.7px stroke, round caps/joins, currentColor. No fills.
// Loaded as a Babel script by UI-kit pages; registers window.SwimIcons.
(function () {
  const P = (d, size = 18, extra = null) => (props) => {
    const s = props && props.size ? props.size : size;
    return React.createElement(
      'svg',
      { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', style: props && props.style, ...(props||{}), size: undefined },
      ...(Array.isArray(d) ? d : [React.createElement('path', { key: 'p', d })]),
      extra
    );
  };

  const path = (d, key) => React.createElement('path', { key: key || d.slice(0, 6), d });
  const circle = (cx, cy, r, key) => React.createElement('circle', { key: key || 'c' + cx + cy, cx, cy, r });
  const rect = (x, y, w, h, rx, key) => React.createElement('rect', { key: key || 'r' + x + y, x, y, width: w, height: h, rx });
  const line = (x1, y1, x2, y2, key) => React.createElement('line', { key: key || 'l' + x1 + y1, x1, y1, x2, y2 });

  window.SwimIcons = {
    Home:       P([path('M3 11.5 12 4l9 7.5'), path('M5.5 10v9.5h13V10')]),
    Users:      P([path('M16 19v-1.5a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3V19'), circle(9.5, 8, 3.2), path('M17.5 19v-1.5a3 3 0 0 0-2.2-2.9'), path('M15 5.2a3 3 0 0 1 0 5.6')]),
    ClientFamily: P([circle(8.5, 7.5, 2.8), circle(16.5, 10, 2.2), path('M3.5 19v-1.3a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4V19'), path('M13.5 19v-.8a3 3 0 0 1 3-3h.5a3 3 0 0 1 3 3v.8')]),
    GroupMembers: P([circle(12, 6.7, 2.8), circle(6, 9.2, 2), circle(18, 9.2, 2), path('M6.5 20v-1.2a5.5 5.5 0 0 1 11 0V20'), path('M2.5 20v-1a3.5 3.5 0 0 1 4.8-3.25'), path('M21.5 20v-1a3.5 3.5 0 0 0-4.8-3.25')]),
    TrainerWhistle: P([circle(12, 6.5, 3), path('M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20'), path('M9.5 12.7 12 15l2.5-2.3'), path('M11 15h3.2l2.3 1v1.8l-2.3 1H13a2 2 0 0 1-2-2V15Z'), circle(13.2, 16.9, .55)]),
    User:       P([path('M18 20v-1.5a4 4 0 0 0-4-4H10a4 4 0 0 0-4 4V20'), circle(12, 7.5, 3.5)]),
    Calendar:   P([rect(3.5, 5, 17, 15.5, 2), line(3.5, 9.5, 20.5, 9.5), line(8, 3, 8, 6.5), line(16, 3, 16, 6.5)]),
    Clock:      P([circle(12, 12, 8.5), path('M12 7.5V12l3 2')]),
    Cash:       P([rect(3, 6.5, 18, 11, 2), circle(12, 12, 2.4), path('M6.5 9v6M17.5 9v6')]),
    Wallet:     P([path('M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1.5'), path('M20 8.5H6.5A2.5 2.5 0 0 0 4 11v6a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1Z'), circle(16.5, 13.5, 1.3)]),
    Alert:      P([path('M12 4 21 20H3L12 4Z'), line(12, 10, 12, 14.5), path('M12 17.2h.01')]),
    Chart:      P([path('M4 4v16h16'), path('M8 15l3-4 3 2 4-6')]),
    Layers:     P([path('M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z'), path('M4 13l8 4.5L20 13'), path('M4 17l8 4.5L20 17')]),
    Bell:       P([path('M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9'), path('M10.5 19a2 2 0 0 0 3 0')]),
    Whistle:    P([path('M3 13a4 4 0 0 0 4 4h4l7-3v-4l-7-3H7a4 4 0 0 0-4 4v2Z'), circle(7, 13, 1.4), path('M14 6.5V4')]),
    Waves:      P([path('M3 8c1.5-1.5 3-1.5 4.5 0S10.5 9.5 12 8s3-1.5 4.5 0S19.5 9.5 21 8'), path('M3 13c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0'), path('M3 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0')]),
    Search:     P([circle(11, 11, 6.5), line(20, 20, 16, 16)]),
    Plus:       P('M12 5v14M5 12h14'),
    Filter:     P('M4 6h16l-6 7v5l-4 2v-7L4 6Z'),
    Download:   P([path('M12 4v10'), path('M8 11l4 3 4-3'), path('M5 19h14')]),
    Upload:     P([path('M12 15V5'), path('M8 8l4-3 4 3'), path('M5 19h14')]),
    Check:      P('M5 12.5l4.5 4.5L19 7'),
    X:          P('M6 6l12 12M18 6L6 18'),
    ChevronR:   P('M9 6l6 6-6 6'),
    ChevronD:   P('M6 9l6 6 6-6'),
    ChevronL:   P('M15 6l-6 6 6 6'),
    Dots:       P([circle(5, 12, 1.4), circle(12, 12, 1.4), circle(19, 12, 1.4)]),
    Pencil:     P([path('M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z'), line(13, 7, 17, 11)]),
    Trash:      P([path('M4 7h16'), path('M9 7V5h6v2'), path('M7 7l1 12h8l1-12')]),
    File:       P([path('M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10Z'), path('M13 4v6h6')]),
    Phone:      P('M6 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2Z'),
    Mail:       P([rect(3.5, 5.5, 17, 13, 2), path('M4 7l8 6 8-6')]),
    Heart:      P('M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z'),
    Shield:     P([path('M12 3.5 19 6v5c0 5-3.5 7.8-7 9.5-3.5-1.7-7-4.5-7-9.5V6l7-2.5Z'), path('M9 12l2 2 4-4')]),
    Snowflake:  P([line(12, 3, 12, 21), line(4.5, 7.5, 19.5, 16.5), line(19.5, 7.5, 4.5, 16.5), path('M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2')]),
    Settings:   P([circle(12, 12, 3), path('M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18')]),
    ArrowLeft:  P([path('M19 12H5'), path('M11 6l-6 6 6 6')]),
    ArrowUpRight: P([path('M7 17 17 7'), path('M9 7h8v8')]),
    Location:   P([path('M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z'), circle(12, 11, 2.3)]),
    Import:     P([path('M12 4v10'), path('M8 11l4 3 4-3'), path('M4 19h16')]),
    Logout:     P([path('M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4'), path('M10 12H3'), path('M6 9l-3 3 3 3')]),
    Grid:       P([rect(4, 4, 7, 7, 1.5), rect(13, 4, 7, 7, 1.5), rect(4, 13, 7, 7, 1.5), rect(13, 13, 7, 7, 1.5)]),
    Doc:        P([path('M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z'), path('M13 3v6h6'), line(8.5, 13, 15.5, 13), line(8.5, 16, 13, 16)]),
    List:       P([line(8, 6, 20, 6), line(8, 12, 20, 12), line(8, 18, 20, 18), circle(4, 6, 0.6), circle(4, 12, 0.6), circle(4, 18, 0.6)]),
  };
})();
