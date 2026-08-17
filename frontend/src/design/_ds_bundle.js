/* @ds-bundle: {"format":4,"namespace":"SwimCRMDesignSystem_546643","components":[{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"Money","sourcePath":"components/data/Money.jsx"},{"name":"STATUS","sourcePath":"components/data/StatusPill.jsx"},{"name":"StatusPill","sourcePath":"components/data/StatusPill.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Banner","sourcePath":"components/feedback/Banner.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"SidebarNav","sourcePath":"components/navigation/SidebarNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"assets/icons.jsx":"3ea60936d1f0","components/data/Avatar.jsx":"671d0dab0cb2","components/data/Badge.jsx":"ed0aa3033c94","components/data/Money.jsx":"84dd3f8c6313","components/data/StatusPill.jsx":"5e04e2f701b3","components/data/Table.jsx":"0739116ccae8","components/forms/Button.jsx":"d515b677698e","components/forms/Checkbox.jsx":"e8519173e668","components/forms/IconButton.jsx":"616567f2a33c","components/forms/Input.jsx":"f9aababef51a","components/forms/Radio.jsx":"5ad05167f384","components/forms/Select.jsx":"63fc8b0831ed","components/forms/Switch.jsx":"3fbe898249dc","components/forms/Textarea.jsx":"0870c4205f77","components/feedback/Banner.jsx":"7f02f7a1fefb","components/feedback/Dialog.jsx":"dc99b5700fc7","components/feedback/EmptyState.jsx":"151a7f51c963","components/feedback/Toast.jsx":"c7482bdd87c5","components/navigation/SidebarNav.jsx":"dbbf326806fb","components/navigation/Tabs.jsx":"bbbcc232ebaa","ui_kits/admin/data.jsx":"81a279dcff77","ui_kits/admin/Attendance.jsx":"959f58642ae7","ui_kits/admin/Clients.jsx":"549143b37085","ui_kits/admin/Debtors.jsx":"7de5a19d6d4e","ui_kits/admin/Overview.jsx":"93b4d593d07b","ui_kits/admin/Payments.jsx":"56c9f1dcde72","ui_kits/admin/Schedule.jsx":"f1ce6f1511a5","ui_kits/parent/data.jsx":"10378a012779","ui_kits/parent/screens.jsx":"a1fccc3ea3c0","ui_kits/trainer/data.jsx":"30584aa96676","ui_kits/trainer/screens.jsx":"81076f9febea"},"inlinedExternals":[],"unexposedExports":[{"name":"labelStyle","sourcePath":"components/forms/Input.jsx"},{"name":"tdBase","sourcePath":"components/data/Table.jsx"},{"name":"thBase","sourcePath":"components/data/Table.jsx"}]} */

(() => {
const __ds_ns = (window.SwimCRMDesignSystem_546643 = window.SwimCRMDesignSystem_546643 || {});
const __ds_scope = {};
(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/icons.jsx
try { (() => {
(function() {
  const P = (d, size = 18, extra = null) => (props) => {
    const s = props && props.size ? props.size : size;
    return React.createElement(
      "svg",
      { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", style: props && props.style, ...props || {}, size: void 0 },
      ...Array.isArray(d) ? d : [React.createElement("path", { key: "p", d })],
      extra
    );
  };
  const path = (d, key) => React.createElement("path", { key: key || d.slice(0, 6), d });
  const circle = (cx, cy, r, key) => React.createElement("circle", { key: key || "c" + cx + cy, cx, cy, r });
  const rect = (x, y, w, h, rx, key) => React.createElement("rect", { key: key || "r" + x + y, x, y, width: w, height: h, rx });
  const line = (x1, y1, x2, y2, key) => React.createElement("line", { key: key || "l" + x1 + y1, x1, y1, x2, y2 });
  window.SwimIcons = {
    Home: P([path("M3 11.5 12 4l9 7.5"), path("M5.5 10v9.5h13V10")]),
    Users: P([path("M16 19v-1.5a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3V19"), circle(9.5, 8, 3.2), path("M17.5 19v-1.5a3 3 0 0 0-2.2-2.9"), path("M15 5.2a3 3 0 0 1 0 5.6")]),
    ClientFamily: P([circle(8.5, 7.5, 2.8), circle(16.5, 10, 2.2), path("M3.5 19v-1.3a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4V19"), path("M13.5 19v-.8a3 3 0 0 1 3-3h.5a3 3 0 0 1 3 3v.8")]),
    GroupMembers: P([circle(12, 6.7, 2.8), circle(6, 9.2, 2), circle(18, 9.2, 2), path("M6.5 20v-1.2a5.5 5.5 0 0 1 11 0V20"), path("M2.5 20v-1a3.5 3.5 0 0 1 4.8-3.25"), path("M21.5 20v-1a3.5 3.5 0 0 0-4.8-3.25")]),
    TrainerWhistle: P([circle(12, 6.5, 3), path("M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20"), path("M9.5 12.7 12 15l2.5-2.3"), path("M11 15h3.2l2.3 1v1.8l-2.3 1H13a2 2 0 0 1-2-2V15Z"), circle(13.2, 16.9, 0.55)]),
    User: P([path("M18 20v-1.5a4 4 0 0 0-4-4H10a4 4 0 0 0-4 4V20"), circle(12, 7.5, 3.5)]),
    Calendar: P([rect(3.5, 5, 17, 15.5, 2), line(3.5, 9.5, 20.5, 9.5), line(8, 3, 8, 6.5), line(16, 3, 16, 6.5)]),
    Clock: P([circle(12, 12, 8.5), path("M12 7.5V12l3 2")]),
    Cash: P([rect(3, 6.5, 18, 11, 2), circle(12, 12, 2.4), path("M6.5 9v6M17.5 9v6")]),
    Wallet: P([path("M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1.5"), path("M20 8.5H6.5A2.5 2.5 0 0 0 4 11v6a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1Z"), circle(16.5, 13.5, 1.3)]),
    Alert: P([path("M12 4 21 20H3L12 4Z"), line(12, 10, 12, 14.5), path("M12 17.2h.01")]),
    Chart: P([path("M4 4v16h16"), path("M8 15l3-4 3 2 4-6")]),
    Layers: P([path("M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z"), path("M4 13l8 4.5L20 13"), path("M4 17l8 4.5L20 17")]),
    Bell: P([path("M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9"), path("M10.5 19a2 2 0 0 0 3 0")]),
    Whistle: P([path("M3 13a4 4 0 0 0 4 4h4l7-3v-4l-7-3H7a4 4 0 0 0-4 4v2Z"), circle(7, 13, 1.4), path("M14 6.5V4")]),
    Waves: P([path("M3 8c1.5-1.5 3-1.5 4.5 0S10.5 9.5 12 8s3-1.5 4.5 0S19.5 9.5 21 8"), path("M3 13c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"), path("M3 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0")]),
    Search: P([circle(11, 11, 6.5), line(20, 20, 16, 16)]),
    Plus: P("M12 5v14M5 12h14"),
    Filter: P("M4 6h16l-6 7v5l-4 2v-7L4 6Z"),
    Download: P([path("M12 4v10"), path("M8 11l4 3 4-3"), path("M5 19h14")]),
    Upload: P([path("M12 15V5"), path("M8 8l4-3 4 3"), path("M5 19h14")]),
    Check: P("M5 12.5l4.5 4.5L19 7"),
    X: P("M6 6l12 12M18 6L6 18"),
    ChevronR: P("M9 6l6 6-6 6"),
    ChevronD: P("M6 9l6 6 6-6"),
    ChevronL: P("M15 6l-6 6 6 6"),
    Dots: P([circle(5, 12, 1.4), circle(12, 12, 1.4), circle(19, 12, 1.4)]),
    Pencil: P([path("M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"), line(13, 7, 17, 11)]),
    Trash: P([path("M4 7h16"), path("M9 7V5h6v2"), path("M7 7l1 12h8l1-12")]),
    File: P([path("M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10Z"), path("M13 4v6h6")]),
    Phone: P("M6 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2Z"),
    Mail: P([rect(3.5, 5.5, 17, 13, 2), path("M4 7l8 6 8-6")]),
    Heart: P("M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z"),
    Shield: P([path("M12 3.5 19 6v5c0 5-3.5 7.8-7 9.5-3.5-1.7-7-4.5-7-9.5V6l7-2.5Z"), path("M9 12l2 2 4-4")]),
    Snowflake: P([line(12, 3, 12, 21), line(4.5, 7.5, 19.5, 16.5), line(19.5, 7.5, 4.5, 16.5), path("M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2")]),
    Settings: P([circle(12, 12, 3), path("M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18")]),
    ArrowLeft: P([path("M19 12H5"), path("M11 6l-6 6 6 6")]),
    ArrowUpRight: P([path("M7 17 17 7"), path("M9 7h8v8")]),
    Location: P([path("M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z"), circle(12, 11, 2.3)]),
    Import: P([path("M12 4v10"), path("M8 11l4 3 4-3"), path("M4 19h16")]),
    Logout: P([path("M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"), path("M10 12H3"), path("M6 9l-3 3 3 3")]),
    Grid: P([rect(4, 4, 7, 7, 1.5), rect(13, 4, 7, 7, 1.5), rect(4, 13, 7, 7, 1.5), rect(13, 13, 7, 7, 1.5)]),
    Doc: P([path("M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z"), path("M13 3v6h6"), line(8.5, 13, 15.5, 13), line(8.5, 16, 13, 16)]),
    List: P([line(8, 6, 20, 6), line(8, 12, 20, 12), line(8, 18, 20, 18), circle(4, 6, 0.6), circle(4, 12, 0.6), circle(4, 18, 0.6)])
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/icons.jsx", error: String((e && e.message) || e) }); }

// components/data/Avatar.jsx
try { (() => {
const PALETTE = [
  ["#d6ecfb", "#0f5285"],
  // blue
  ["#eef6fd", "#1364a3"],
  // pool blue
  ["#e0d5f6", "#6238a8"],
  // violet
  ["#f9e6bd", "#855708"],
  // amber
  ["#cdecd7", "#116a38"],
  // green
  ["#f9d5d2", "#93231d"]
  // red
];
function hueFor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}
function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function Avatar({ name = "", size = 32, kind, style }) {
  const [bg, fg] = hueFor(name);
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      title: name,
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: bg,
        color: fg,
        border: kind ? `1.5px solid ${fg}` : "1px solid rgba(0,0,0,0.04)",
        fontFamily: "var(--font-sans)",
        fontWeight: "var(--fw-semibold)",
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
        letterSpacing: "0.01em",
        userSelect: "none",
        ...style
      }
    },
    initials(name)
  );
}
__ds_scope.Avatar = Avatar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
const TONES = {
  neutral: ["--status-neutral-bg", "--status-neutral-fg", "--status-neutral-bd"],
  info: ["--status-info-bg", "--status-info-fg", "--status-info-bd"],
  primary: ["--primary-soft", "--primary-hover", "--primary-soft-border"],
  success: ["--status-paid-bg", "--status-paid-fg", "--status-paid-bd"],
  warning: ["--status-pending-bg", "--status-pending-fg", "--status-pending-bd"],
  danger: ["--status-overdue-bg", "--status-overdue-fg", "--status-overdue-bd"]
};
function Badge({ children, tone = "neutral", dot = false, solid = false, style }) {
  const [bg, fg, bd] = TONES[tone] || TONES.neutral;
  const base = solid ? { background: `var(${fg})`, color: "#fff", border: "1px solid transparent" } : { background: `var(${bg})`, color: `var(${fg})`, border: `1px solid var(${bd})` };
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 20,
        padding: "0 8px",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--fs-2xs)",
        fontWeight: "var(--fw-semibold)",
        letterSpacing: "0.01em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...base,
        ...style
      }
    },
    dot && /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: solid ? "#fff" : `var(${fg})` } }),
    children
  );
}
__ds_scope.Badge = Badge;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/Money.jsx
try { (() => {
function Money({ amount, currency = "zł", signed = false, muted = false, size = "inherit", style }) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let color = "inherit";
  if (muted) color = "var(--text-muted)";
  if (signed) {
    if (n < 0) color = "var(--money-debt)";
    else if (n > 0) color = "var(--money-credit)";
    else color = "var(--money-zero)";
  }
  const sign = signed && n > 0 ? "+" : signed && n < 0 ? "−" : "";
  const fontSize = size === "inherit" ? "inherit" : size;
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      className: "swim-mono",
      style: { color, fontSize, fontWeight: "var(--fw-medium)", whiteSpace: "nowrap", ...style }
    },
    sign,
    abs,
    " ",
    currency
  );
}
__ds_scope.Money = Money;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Money.jsx", error: String((e && e.message) || e) }); }

// components/data/StatusPill.jsx
try { (() => {
const STATUS = {
  // Attendance
  present: { label: "Obecny", tone: "present", consumes: true },
  absent: { label: "Nieobecny", tone: "absent", consumes: true },
  excused: { label: "Nieob. uspr.", tone: "excused", consumes: false },
  moved: { label: "Przełożone", tone: "moved", consumes: false },
  // Payments / charges
  paid: { label: "Zapłacone", tone: "paid" },
  pending: { label: "Na weryfikacji", tone: "pending" },
  rejected: { label: "Odrzucone", tone: "overdue" },
  overdue: { label: "Po terminie", tone: "overdue" },
  partial: { label: "Częściowo", tone: "pending" },
  awaiting: { label: "Oczekuje", tone: "neutral" },
  // Subscription / session lifecycle
  active: { label: "Aktywny", tone: "paid" },
  frozen: { label: "Zamrożony", tone: "info" },
  expired: { label: "Wygasł", tone: "overdue" },
  cancelled: { label: "Anulowane", tone: "neutral" },
  planned: { label: "Zaplanowane", tone: "info" },
  done: { label: "Zakończone", tone: "neutral" },
  inactive: { label: "Nieaktywny", tone: "neutral" }
};
const TONE_VARS = {
  present: ["--status-present-bg", "--status-present-fg", "--status-present-bd"],
  absent: ["--status-absent-bg", "--status-absent-fg", "--status-absent-bd"],
  excused: ["--status-excused-bg", "--status-excused-fg", "--status-excused-bd"],
  moved: ["--status-moved-bg", "--status-moved-fg", "--status-moved-bd"],
  paid: ["--status-paid-bg", "--status-paid-fg", "--status-paid-bd"],
  pending: ["--status-pending-bg", "--status-pending-fg", "--status-pending-bd"],
  overdue: ["--status-overdue-bg", "--status-overdue-fg", "--status-overdue-bd"],
  info: ["--status-info-bg", "--status-info-fg", "--status-info-bd"],
  neutral: ["--status-neutral-bg", "--status-neutral-fg", "--status-neutral-bd"]
};
function StatusPill({ status, label, tone, showConsumes = false, size = "md", style }) {
  const def = status ? STATUS[status] : null;
  const t = tone || (def ? def.tone : "neutral");
  const text = label || (def ? def.label : status) || "—";
  const [bg, fg, bd] = TONE_VARS[t] || TONE_VARS.neutral;
  const h = size === "sm" ? 18 : 22;
  const consumes = def && typeof def.consumes === "boolean";
  return /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, ...style } }, /* @__PURE__ */ React.createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: h,
        padding: size === "sm" ? "0 7px" : "0 9px",
        borderRadius: "var(--radius-sm)",
        background: `var(${bg})`,
        color: `var(${fg})`,
        border: `1px solid var(${bd})`,
        fontSize: size === "sm" ? "var(--fs-2xs)" : "var(--fs-xs)",
        fontWeight: "var(--fw-semibold)",
        lineHeight: 1,
        whiteSpace: "nowrap"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: `var(${fg})` } }),
    text
  ), showConsumes && consumes && /* @__PURE__ */ React.createElement(
    "span",
    {
      className: "swim-mono",
      title: def.consumes ? "Zajęcie zostaje spisane" : "Zajęcie nie jest spisane",
      style: {
        fontSize: "var(--fs-2xs)",
        fontWeight: "var(--fw-semibold)",
        color: def.consumes ? "var(--money-debt)" : "var(--text-faint)"
      }
    },
    def.consumes ? "−1" : "0"
  ));
}
__ds_scope.StatusPill = StatusPill;
__ds_scope.STATUS = STATUS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/data/Table.jsx
try { (() => {
function Table({
  columns,
  rows,
  rowKey = (r, i) => {
    var _a;
    return (_a = r.id) != null ? _a : i;
  },
  onRowClick,
  selectable = false,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  density = "compact",
  emptyLabel = "Brak danych",
  stickyHeader = true,
  children,
  style
}) {
  const rowH = density === "compact" ? "var(--row-h-compact)" : "var(--row-h-default)";
  const cellPad = density === "compact" ? "0 12px" : "0 14px";
  const wrap = {
    width: "100%",
    background: "var(--surface-card)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    ...style
  };
  if (children) {
    return /* @__PURE__ */ React.createElement("div", { style: wrap }, /* @__PURE__ */ React.createElement("table", { style: tableBase }, children));
  }
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  return /* @__PURE__ */ React.createElement("div", { style: wrap, className: "table-wrap" }, /* @__PURE__ */ React.createElement("table", { style: tableBase }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, selectable && /* @__PURE__ */ React.createElement("th", { style: { ...thBase, width: 40, position: stickyHeader ? "sticky" : "static", top: 0 } }, /* @__PURE__ */ React.createElement(CheckboxCell, { checked: allSelected, indeterminate: someSelected, onChange: onToggleAll })), columns.map((c) => /* @__PURE__ */ React.createElement(
    "th",
    {
      key: c.key,
      style: {
        ...thBase,
        width: c.width,
        textAlign: c.align || "left",
        position: stickyHeader ? "sticky" : "static",
        top: 0
      }
    },
    c.header
  )))), /* @__PURE__ */ React.createElement("tbody", null, rows.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: columns.length + (selectable ? 1 : 0), style: { padding: "28px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--fs-sm)" } }, emptyLabel)), rows.map((r, i) => {
    const id = rowKey(r, i);
    const selected = selectedIds.includes(id);
    return /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: id,
        className: "swim-tr-hover",
        onClick: onRowClick ? () => onRowClick(r) : void 0,
        style: {
          height: rowH,
          cursor: onRowClick ? "pointer" : "default",
          background: selected ? "var(--primary-soft)" : "transparent",
          transition: "background-color var(--dur-fast) var(--ease-standard)"
        }
      },
      selectable && /* @__PURE__ */ React.createElement("td", { style: { ...tdBase, padding: cellPad }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement(CheckboxCell, { checked: selected, onChange: () => onToggleRow && onToggleRow(id) })),
      columns.map((c) => /* @__PURE__ */ React.createElement("td", { key: c.key, "data-label": c.header, style: { ...tdBase, padding: cellPad, textAlign: c.align || "left", color: c.muted ? "var(--text-muted)" : "var(--text-body)" } }, c.render ? c.render(r, i) : r[c.key]))
    );
  }))));
}
const tableBase = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "var(--font-sans)",
  fontVariantNumeric: "tabular-nums"
};
const thBase = {
  textAlign: "left",
  padding: "0 12px",
  height: 34,
  background: "var(--surface-sunken)",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-muted)",
  fontSize: "var(--fs-2xs)",
  fontWeight: "var(--fw-semibold)",
  letterSpacing: "var(--ls-caps)",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  zIndex: 1
};
const tdBase = {
  borderBottom: "1px solid var(--border-subtle)",
  fontSize: "var(--fs-sm)",
  color: "var(--text-body)",
  verticalAlign: "middle"
};
function CheckboxCell({ checked, indeterminate, onChange }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return /* @__PURE__ */ React.createElement(
    "input",
    {
      ref,
      type: "checkbox",
      checked,
      onChange,
      style: { width: 15, height: 15, accentColor: "var(--primary)", cursor: "pointer", display: "block" }
    }
  );
}
__ds_scope.Table = Table;
__ds_scope.thBase = thBase;
__ds_scope.tdBase = tdBase;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Table.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft = null,
  iconRight = null,
  disabled = false,
  loading = false,
  fullWidth = false,
  type = "button",
  onClick,
  style,
  ...rest
}) {
  const heights = {
    sm: "var(--control-h-sm)",
    md: "var(--control-h-md)",
    lg: "var(--control-h-lg)"
  };
  const pads = { sm: "0 10px", md: "0 14px", lg: "0 18px" };
  const fs = { sm: "var(--fs-xs)", md: "var(--fs-sm)", lg: "var(--fs-base)" };
  const variants = {
    primary: {
      background: "var(--primary)",
      color: "var(--text-on-solid)",
      border: "1px solid var(--primary)"
    },
    secondary: {
      background: "var(--surface-card)",
      color: "var(--text-body)",
      border: "1px solid var(--border-default)"
    },
    ghost: {
      background: "transparent",
      color: "var(--text-body)",
      border: "1px solid transparent"
    },
    subtle: {
      background: "var(--primary-soft)",
      color: "var(--primary-hover)",
      border: "1px solid var(--primary-soft-border)"
    },
    danger: {
      background: "var(--red-500)",
      color: "var(--text-on-solid)",
      border: "1px solid var(--red-500)"
    }
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    height: heights[size],
    padding: pads[size],
    width: fullWidth ? "100%" : "auto",
    font: "inherit",
    fontFamily: "var(--font-sans)",
    fontSize: fs[size],
    fontWeight: "var(--fw-medium)",
    lineHeight: 1,
    whiteSpace: "nowrap",
    borderRadius: "var(--radius-md)",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "var(--transition-control)",
    userSelect: "none",
    ...variants[variant],
    ...style
  };
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type,
      className: `swim-btn swim-btn--${variant}`,
      style: base,
      disabled: disabled || loading,
      onClick,
      ...rest
    },
    loading && /* @__PURE__ */ React.createElement(Spinner, null),
    !loading && iconLeft,
    children != null && /* @__PURE__ */ React.createElement("span", null, children),
    !loading && iconRight
  );
}
function Spinner() {
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      "aria-hidden": "true",
      style: {
        width: 13,
        height: 13,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "swim-spin 0.6s linear infinite"
      }
    }
  );
}
__ds_scope.Button = Button;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({ label, checked = false, indeterminate = false, disabled = false, onChange, id, error, style, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  const on = checked || indeterminate;
  const inputId = id || (label ? `check-${label.replace(/\s+/g, "-").toLowerCase()}` : void 0);
  const errorId = inputId ? `${inputId}-error` : void 0;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } }, /* @__PURE__ */ React.createElement(
    "label",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: "var(--fs-sm)",
        color: "var(--text-body)",
        userSelect: "none",
        ...style
      }
    },
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          position: "relative",
          width: 17,
          height: 17,
          flexShrink: 0,
          borderRadius: "var(--radius-xs)",
          border: `1.5px solid ${error ? "var(--red-500)" : on ? "var(--primary)" : "var(--border-strong)"}`,
          background: on ? "var(--primary)" : "var(--surface-card)",
          transition: "var(--transition-control)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      checked && !indeterminate && /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M5 12.5l4.2 4.2L19 6.5", stroke: "#fff", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" })),
      indeterminate && !checked && /* @__PURE__ */ React.createElement("span", { style: { width: 9, height: 2.5, background: "#fff", borderRadius: 2 } }),
      /* @__PURE__ */ React.createElement(
        "input",
        {
          ref,
          type: "checkbox",
          checked,
          disabled,
          onChange,
          id: inputId,
          "aria-invalid": error ? true : rest["aria-invalid"],
          "aria-describedby": error ? errorId : rest["aria-describedby"],
          style: { position: "absolute", opacity: 0, width: "100%", height: "100%", margin: 0, cursor: "inherit" },
          ...rest
        }
      )
    ),
    label && /* @__PURE__ */ React.createElement("span", null, label)
  ), error && /* @__PURE__ */ React.createElement("span", { id: errorId, className: "ops-field-error", role: "alert", style: { fontSize: "var(--fs-xs)", color: "var(--red-600)" } }, error));
}
__ds_scope.Checkbox = Checkbox;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function IconButton({
  children,
  label,
  size = "md",
  variant = "default",
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const dims = { sm: 26, md: 32, lg: 38 };
  const d = dims[size];
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      "aria-label": label,
      title: label,
      disabled,
      onClick,
      className: `swim-iconbtn${variant === "danger" ? " is-danger" : ""}`,
      style: {
        width: d,
        height: d,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: "var(--text-muted)",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "var(--transition-control)",
        ...style
      },
      ...rest
    },
    children
  );
}
__ds_scope.IconButton = IconButton;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function Input({
  label,
  hint,
  error,
  required = false,
  prefix = null,
  suffix = null,
  size = "md",
  id,
  style,
  containerStyle,
  ...rest
}) {
  const heights = { sm: "var(--control-h-sm)", md: "var(--control-h-md)", lg: "var(--control-h-lg)" };
  const inputId = id || (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : void 0);
  const errorId = inputId ? `${inputId}-error` : void 0;
  const hasAffix = prefix || suffix;
  const field = /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        height: heights[size],
        background: "var(--surface-card)",
        border: `1px solid ${error ? "var(--red-500)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-md)",
        padding: "0 10px",
        gap: 7,
        transition: "var(--transition-control)",
        boxShadow: error ? "0 0 0 3px rgba(214,63,54,0.14)" : "none"
      },
      className: "swim-input-shell"
    },
    prefix && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-faint)", display: "inline-flex", fontSize: "var(--fs-sm)" } }, prefix),
    /* @__PURE__ */ React.createElement(
      "input",
      {
        id: inputId,
        className: "swim-input",
        style: {
          flex: 1,
          minWidth: 0,
          height: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          font: "inherit",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-sm)",
          color: "var(--text-strong)",
          ...style
        },
        ...rest,
        "aria-invalid": error ? true : rest["aria-invalid"],
        "aria-describedby": error ? errorId : rest["aria-describedby"]
      }
    ),
    suffix && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-faint)", display: "inline-flex", fontSize: "var(--fs-sm)" } }, suffix)
  );
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, ...containerStyle } }, label && /* @__PURE__ */ React.createElement("label", { htmlFor: inputId, style: labelStyle }, label, required && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--red-500)", marginLeft: 3 } }, "*")), hasAffix ? field : /* @__PURE__ */ React.createElement(
    "input",
    {
      id: inputId,
      className: "swim-input",
      style: {
        height: heights[size],
        width: "100%",
        background: "var(--surface-card)",
        border: `1px solid ${error ? "var(--red-500)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-md)",
        padding: "0 11px",
        font: "inherit",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-sm)",
        color: "var(--text-strong)",
        outline: "none",
        transition: "var(--transition-control)",
        boxShadow: error ? "0 0 0 3px rgba(214,63,54,0.14)" : "none",
        ...style
      },
      ...rest,
      "aria-invalid": error ? true : rest["aria-invalid"],
      "aria-describedby": error ? errorId : rest["aria-describedby"]
    }
  ), error ? /* @__PURE__ */ React.createElement("span", { id: errorId, className: "ops-field-error", role: "alert", style: { fontSize: "var(--fs-xs)", color: "var(--red-600)" } }, error) : hint ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-muted)" } }, hint) : null);
}
const labelStyle = {
  font: "var(--text-label)",
  color: "var(--text-body)"
};
__ds_scope.Input = Input;
__ds_scope.labelStyle = labelStyle;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function Radio({ label, checked = false, disabled = false, name, value, onChange, id, style, ...rest }) {
  return /* @__PURE__ */ React.createElement(
    "label",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: "var(--fs-sm)",
        color: "var(--text-body)",
        userSelect: "none",
        ...style
      }
    },
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          position: "relative",
          width: 17,
          height: 17,
          flexShrink: 0,
          borderRadius: "50%",
          border: `1.5px solid ${checked ? "var(--primary)" : "var(--border-strong)"}`,
          background: "var(--surface-card)",
          transition: "var(--transition-control)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      checked && /* @__PURE__ */ React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", background: "var(--primary)" } }),
      /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "radio",
          name,
          value,
          checked,
          disabled,
          onChange,
          id,
          style: { position: "absolute", opacity: 0, width: "100%", height: "100%", margin: 0, cursor: "inherit" },
          ...rest
        }
      )
    ),
    label && /* @__PURE__ */ React.createElement("span", null, label)
  );
}
__ds_scope.Radio = Radio;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const { labelStyle } = __ds_scope;
function Select({ label, hint, error, required = false, size = "md", children, id, style, containerStyle, ...rest }) {
  const heights = { sm: "var(--control-h-sm)", md: "var(--control-h-md)", lg: "var(--control-h-lg)" };
  const inputId = id || (label ? `sel-${label.replace(/\s+/g, "-").toLowerCase()}` : void 0);
  const errorId = inputId ? `${inputId}-error` : void 0;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, ...containerStyle } }, label && /* @__PURE__ */ React.createElement("label", { htmlFor: inputId, style: labelStyle }, label, required && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--red-500)", marginLeft: 3 } }, "*")), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", display: "flex" } }, /* @__PURE__ */ React.createElement(
    "select",
    {
      id: inputId,
      className: "swim-select",
      style: {
        appearance: "none",
        WebkitAppearance: "none",
        width: "100%",
        height: heights[size],
        background: "var(--surface-card)",
        border: `1px solid ${error ? "var(--red-500)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-md)",
        padding: "0 30px 0 11px",
        font: "inherit",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-sm)",
        color: "var(--text-strong)",
        outline: "none",
        cursor: "pointer",
        transition: "var(--transition-control)",
        ...style
      },
      ...rest,
      "aria-invalid": error ? true : rest["aria-invalid"],
      "aria-describedby": error ? errorId : rest["aria-describedby"]
    },
    children
  ), /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      style: { position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }
    },
    /* @__PURE__ */ React.createElement("path", { d: "M6 9l6 6 6-6", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
  )), error ? /* @__PURE__ */ React.createElement("span", { id: errorId, className: "ops-field-error", role: "alert", style: { fontSize: "var(--fs-xs)", color: "var(--red-600)" } }, error) : hint ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-muted)" } }, hint) : null);
}
__ds_scope.Select = Select;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({ checked = false, disabled = false, onChange, label, id, error, style, ...rest }) {
  const inputId = id || (label ? `switch-${label.replace(/\s+/g, "-").toLowerCase()}` : void 0);
  const errorId = inputId ? `${inputId}-error` : void 0;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } }, /* @__PURE__ */ React.createElement(
    "label",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: "var(--fs-sm)",
        color: "var(--text-body)",
        userSelect: "none",
        ...style
      }
    },
    /* @__PURE__ */ React.createElement(
      "span",
      {
        style: {
          position: "relative",
          width: 34,
          height: 20,
          flexShrink: 0,
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--primary)" : "var(--slate-300)",
          transition: "background-color var(--dur-normal) var(--ease-standard)"
        }
      },
      /* @__PURE__ */ React.createElement(
        "span",
        {
          style: {
            position: "absolute",
            top: 2,
            left: checked ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "var(--shadow-sm)",
            transition: "left var(--dur-normal) var(--ease-out)"
          }
        }
      ),
      /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          checked,
          disabled,
          onChange,
          id: inputId,
          "aria-invalid": error ? true : rest["aria-invalid"],
          "aria-describedby": error ? errorId : rest["aria-describedby"],
          style: { position: "absolute", opacity: 0, width: "100%", height: "100%", margin: 0, cursor: "inherit" },
          ...rest
        }
      )
    ),
    label && /* @__PURE__ */ React.createElement("span", null, label)
  ), error && /* @__PURE__ */ React.createElement("span", { id: errorId, className: "ops-field-error", role: "alert", style: { fontSize: "var(--fs-xs)", color: "var(--red-600)" } }, error));
}
__ds_scope.Switch = Switch;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
const { labelStyle } = __ds_scope;
function Textarea({ label, hint, error, required = false, rows = 3, id, style, containerStyle, ...rest }) {
  const inputId = id || (label ? `ta-${label.replace(/\s+/g, "-").toLowerCase()}` : void 0);
  const errorId = inputId ? `${inputId}-error` : void 0;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, ...containerStyle } }, label && /* @__PURE__ */ React.createElement("label", { htmlFor: inputId, style: labelStyle }, label, required && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--red-500)", marginLeft: 3 } }, "*")), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      id: inputId,
      rows,
      className: "swim-textarea",
      style: {
        width: "100%",
        resize: "vertical",
        background: "var(--surface-card)",
        border: `1px solid ${error ? "var(--red-500)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-md)",
        padding: "8px 11px",
        font: "inherit",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-sm)",
        lineHeight: "var(--lh-normal)",
        color: "var(--text-strong)",
        outline: "none",
        transition: "var(--transition-control)",
        ...style
      },
      ...rest,
      "aria-invalid": error ? true : rest["aria-invalid"],
      "aria-describedby": error ? errorId : rest["aria-describedby"]
    }
  ), error ? /* @__PURE__ */ React.createElement("span", { id: errorId, className: "ops-field-error", role: "alert", style: { fontSize: "var(--fs-xs)", color: "var(--red-600)" } }, error) : hint ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-xs)", color: "var(--text-muted)" } }, hint) : null);
}
__ds_scope.Textarea = Textarea;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Banner.jsx
try { (() => {
const TONES = {
  info: ["--status-info-bg", "--status-info-fg", "--status-info-bd"],
  success: ["--status-paid-bg", "--status-paid-fg", "--status-paid-bd"],
  warning: ["--status-pending-bg", "--status-pending-fg", "--status-pending-bd"],
  danger: ["--status-overdue-bg", "--status-overdue-fg", "--status-overdue-bd"]
};
const ICONS = {
  info: "M12 8h.01M11 12h1v4h1"
  // rendered below via paths
};
function Banner({ children, title, tone = "info", icon, onClose, action, style }) {
  const [bg, fg, bd] = TONES[tone] || TONES.info;
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "status",
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        background: `var(${bg})`,
        border: `1px solid var(${bd})`,
        borderRadius: "var(--radius-md)",
        color: `var(${fg})`,
        fontSize: "var(--fs-sm)",
        lineHeight: "var(--lh-normal)",
        ...style
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { flexShrink: 0, marginTop: 1, color: `var(${fg})` } }, icon || /* @__PURE__ */ React.createElement(BannerIcon, { tone })),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, title && /* @__PURE__ */ React.createElement("div", { style: { fontWeight: "var(--fw-semibold)", marginBottom: children ? 2 : 0 } }, title), children && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-body)" } }, children)),
    action,
    onClose && /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": "Zamknij", style: { background: "none", border: "none", cursor: "pointer", color: `var(${fg})`, opacity: 0.7, padding: 2, lineHeight: 0 } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })))
  );
}
function BannerIcon({ tone }) {
  if (tone === "success") {
    return /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M8 12.5l2.5 2.5L16 9", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
  }
  if (tone === "danger" || tone === "warning") {
    return /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M12 3l9 16H3L12 3z", stroke: "currentColor", strokeWidth: "1.8", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M12 10v4M12 17h.01", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
  }
  return /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M12 11v5M12 8h.01", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
}
__ds_scope.Banner = Banner;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Banner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
const { Button } = __ds_scope;
function Dialog({
  open = true,
  title,
  description,
  children,
  onClose,
  onConfirm,
  confirmLabel = "Potwierdź",
  cancelLabel = "Anuluj",
  tone = "primary",
  width = 460,
  hideFooter = false,
  irreversible = false,
  dismissOnBackdrop = true
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogId = `design-dialog-${React.useId()}`;
  const dialogRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return void 0;
    const lifecycle = window.SwimCRMUiLifecycle;
    if (lifecycle) {
      return lifecycle.registerOverlay({
        id: dialogId,
        getElement: () => dialogRef.current,
        requestClose: () => {
          if (!onCloseRef.current) return false;
          onCloseRef.current();
          return true;
        },
        initialFocus: "[data-dialog-cancel]"
      });
    }
    const previousFocus = document.activeElement;
    const focusCancel = window.requestAnimationFrame(() => {
      var _a, _b;
      (_b = (_a = dialogRef.current) == null ? void 0 : _a.querySelector("[data-dialog-cancel]")) == null ? void 0 : _b.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusCancel);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [dialogId, open]);
  function requestClose(reason) {
    if (!onClose) return false;
    const lifecycle = window.SwimCRMUiLifecycle;
    if (lifecycle) return lifecycle.requestOverlayClose(dialogId, reason);
    onClose();
    return true;
  }
  function handleDialogKeyDown(event) {
    var _a;
    if (window.SwimCRMUiLifecycle) return;
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      requestClose("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...((_a = dialogRef.current) == null ? void 0 : _a.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')) || []];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (!open) return null;
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: dialogRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": title ? titleId : void 0,
      "aria-describedby": description ? descriptionId : void 0,
      tabIndex: -1,
      onKeyDown: handleDialogKeyDown,
      style: {
        position: "fixed",
        inset: 0,
        // Confirmations can be opened from FormModal (1000) and its discard guard (1010).
        // Keep the active confirmation above both so it remains visible and clickable.
        zIndex: 1100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 16px 16px",
        background: "rgba(26,33,41,0.44)",
        backdropFilter: "blur(2px)",
        animation: "swim-fade var(--dur-normal) var(--ease-standard)"
      },
      onMouseDown: (e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) requestClose("backdrop");
      }
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width,
          maxWidth: "100%",
          background: "var(--surface-card)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-pop)",
          border: "1px solid var(--border-subtle)",
          overflow: "hidden",
          animation: "swim-pop var(--dur-normal) var(--ease-out)"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { padding: "18px 20px 0" } }, irreversible && /* @__PURE__ */ React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, color: "var(--red-600)", fontSize: "var(--fs-2xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" } }, /* @__PURE__ */ React.createElement(WarnIcon, null), " Działanie nieodwracalne"), title && /* @__PURE__ */ React.createElement("h2", { id: titleId, style: { margin: 0, font: "var(--text-card-title)", color: "var(--text-strong)" } }, title), description && /* @__PURE__ */ React.createElement("p", { id: descriptionId, style: { margin: "7px 0 0", fontSize: "var(--fs-sm)", color: "var(--text-muted)", lineHeight: "var(--lh-normal)" } }, description)),
      /* @__PURE__ */ React.createElement("div", { style: { padding: children ? "16px 20px" : "10px 20px" } }, children),
      !hideFooter && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", background: "var(--surface-sunken)", borderTop: "1px solid var(--border-subtle)" } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", "data-dialog-cancel": true, onClick: () => requestClose("cancel") }, cancelLabel), /* @__PURE__ */ React.createElement(Button, { variant: tone === "danger" ? "danger" : "primary", onClick: onConfirm }, confirmLabel))
    )
  );
}
function WarnIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M12 3l9 16H3L12 3z", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M12 10v4M12 17h.01", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }));
}
__ds_scope.Dialog = Dialog;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function EmptyState({ icon, title, description, action, compact = false, style }) {
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: compact ? "28px 20px" : "48px 24px",
        color: "var(--text-muted)",
        ...style
      }
    },
    icon && /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          borderRadius: "50%",
          background: "var(--primary-soft)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14
        }
      },
      icon
    ),
    /* @__PURE__ */ React.createElement("div", { style: { font: "var(--text-card-title)", color: "var(--text-strong)", marginBottom: 5 } }, title),
    description && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-sm)", maxWidth: 340, lineHeight: "var(--lh-normal)", marginBottom: action ? 16 : 0 } }, description),
    action
  );
}
__ds_scope.EmptyState = EmptyState;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const TONES = {
  success: ["--green-500", "M8 12.5l2.5 2.5L16 9"],
  danger: ["--red-500", "M15 9l-6 6M9 9l6 6"],
  info: ["--blue-500", "M12 11v5M12 8h.01"]
};
function Toast({ children, title, tone = "success", onClose, style }) {
  const [colorVar, path] = TONES[tone] || TONES.success;
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "status",
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        minWidth: 260,
        maxWidth: 380,
        padding: "11px 13px",
        background: "var(--surface-inverse)",
        color: "#fff",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        fontSize: "var(--fs-sm)",
        animation: "swim-toast var(--dur-normal) var(--ease-out)",
        ...style
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { flexShrink: 0, marginTop: 1, color: `var(${colorVar})` } }, /* @__PURE__ */ React.createElement("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none" }, tone !== "info" && tone !== "danger" && /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), tone === "danger" && /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), tone === "info" && /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: path, stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }))),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, title && /* @__PURE__ */ React.createElement("div", { style: { fontWeight: "var(--fw-semibold)", marginBottom: children ? 2 : 0 } }, title), children && /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.82)" } }, children)),
    onClose && /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": "Zamknij", style: { background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", padding: 2, lineHeight: 0 } }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })))
  );
}
__ds_scope.Toast = Toast;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNav.jsx
try { (() => {
function SidebarNav({ items, active, onSelect, brand = "H2O", product = "SwimCRM", roleLabel, footer, style }) {
  const sections = [];
  const map = {};
  items.forEach((it) => {
    const s = it.section || "";
    if (!map[s]) {
      map[s] = [];
      sections.push(s);
    }
    map[s].push(it);
  });
  return /* @__PURE__ */ React.createElement(
    "nav",
    {
      style: {
        width: "var(--sidebar-w)",
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-card)",
        borderRight: "1px solid var(--border-subtle)",
        ...style
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, height: "var(--topbar-h)", padding: "0 16px", borderBottom: "1px solid var(--border-subtle)" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "var(--radius-md)", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: "-0.02em" } }, brand), /* @__PURE__ */ React.createElement("div", { style: { lineHeight: 1.1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: "var(--fs-base)", color: "var(--text-strong)" } }, product), roleLabel && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-2xs)", color: "var(--text-muted)" } }, roleLabel))),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: "8px" } }, sections.map((s, si) => /* @__PURE__ */ React.createElement("div", { key: si, style: { marginBottom: 6 } }, s && /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 8px 4px", fontSize: "var(--fs-2xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-faint)" } }, s), map[s].map((it) => {
      const isActive = it.key === active;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: it.key,
          className: "swim-nav-item",
          onClick: () => onSelect && onSelect(it.key),
          style: {
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "7px 9px",
            marginBottom: 1,
            background: isActive ? "var(--primary-soft)" : "transparent",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-sm)",
            fontWeight: isActive ? "var(--fw-semibold)" : "var(--fw-medium)",
            color: isActive ? "var(--primary-hover)" : "var(--text-body)",
            transition: "var(--transition-control)"
          }
        },
        isActive && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", left: -8, top: 6, bottom: 6, width: 3, borderRadius: "0 3px 3px 0", background: "var(--primary)" } }),
        it.icon && /* @__PURE__ */ React.createElement("span", { style: { flexShrink: 0, display: "inline-flex", color: isActive ? "var(--primary)" : "var(--text-muted)" } }, it.icon),
        /* @__PURE__ */ React.createElement("span", { style: { flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, it.label),
        it.count != null && /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--font-mono)", fontSize: "var(--fs-2xs)", fontWeight: 600, minWidth: 18, textAlign: "center", padding: "1px 6px", borderRadius: "var(--radius-pill)", background: it.countTone === "danger" ? "var(--red-500)" : isActive ? "var(--white)" : "var(--surface-sunken)", color: it.countTone === "danger" ? "#fff" : isActive ? "var(--primary-hover)" : "var(--text-muted)" } }, it.count)
      );
    })))),
    footer && /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--border-subtle)", padding: 10 } }, footer)
  );
}
__ds_scope.SidebarNav = SidebarNav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({ items, value, onChange, style }) {
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "tablist",
      style: {
        display: "flex",
        gap: 2,
        borderBottom: "1px solid var(--border-subtle)",
        ...style
      }
    },
    items.map((it) => {
      const active = it.value === value;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: it.value,
          role: "tab",
          "aria-selected": active,
          className: "swim-tab",
          onClick: () => onChange && onChange(it.value),
          style: {
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 12px 11px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-sm)",
            fontWeight: active ? "var(--fw-semibold)" : "var(--fw-medium)",
            color: active ? "var(--text-strong)" : "var(--text-muted)",
            transition: "var(--transition-control)"
          }
        },
        it.label,
        it.count != null && /* @__PURE__ */ React.createElement(
          "span",
          {
            style: {
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-2xs)",
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: "var(--radius-pill)",
              background: active ? "var(--primary-soft)" : "var(--surface-sunken)",
              color: active ? "var(--primary-hover)" : "var(--text-muted)"
            }
          },
          it.count
        ),
        /* @__PURE__ */ React.createElement(
          "span",
          {
            style: {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -1,
              height: 2,
              borderRadius: "2px 2px 0 0",
              background: active ? "var(--primary)" : "transparent"
            }
          }
        )
      );
    })
  );
}
__ds_scope.Tabs = Tabs;
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/data.jsx
try { (() => {
(function() {
  const trainers = [
    { id: "t1", name: "Marek Zieliński", phone: "+48 601 220 145", active: true, groups: 3 },
    { id: "t2", name: "Anna Lewandowska", phone: "+48 602 118 907", active: true, groups: 2 },
    { id: "t3", name: "Piotr Kaczmarek", phone: "+48 605 771 330", active: false, groups: 1 }
  ];
  const groups = [
    { id: "g1", name: "Delfiny", trainer: "Marek Zieliński", students: 12, active: true },
    { id: "g2", name: "Rekiny", trainer: "Anna Lewandowska", students: 9, active: true },
    { id: "g3", name: "Foki", trainer: "Marek Zieliński", students: 8, active: true },
    { id: "g4", name: "Żółwie (początkujący)", trainer: "Piotr Kaczmarek", students: 6, active: false }
  ];
  const clients = [
    { id: "c1", first: "Zofia", last: "Kowalska", born: "2015-04-12", parent: "Ewa Kowalska", phone: "+48 600 100 200", email: "ewa.k@example.pl", group: "Delfiny", trainer: "Marek Zieliński", status: "active", balance: -240, sub: "8 zajęć", subLeft: 3, subEnds: "2026-07-20", med: "Astma — inhalator w torbie", emergency: "Ewa Kowalska · +48 600 100 200" },
    { id: "c2", first: "Jan", last: "Nowak", born: "2014-09-30", parent: "Tomasz Nowak", phone: "+48 601 233 991", email: "tnowak@example.pl", group: "Rekiny", trainer: "Anna Lewandowska", status: "active", balance: 0, sub: "12 zajęć", subLeft: 9, subEnds: "2026-08-04", med: "", emergency: "Tomasz Nowak · +48 601 233 991" },
    { id: "c3", first: "Lena", last: "Wiśniewska", born: "2016-01-18", parent: "Marta Wiśniewska", phone: "+48 602 550 771", email: "marta.w@example.pl", group: "Foki", trainer: "Marek Zieliński", status: "active", balance: 80, sub: "8 zajęć (zamr.)", subLeft: 5, subEnds: "2026-07-28", med: "Alergia na chlor — łagodna", emergency: "Marta Wiśniewska · +48 602 550 771" },
    { id: "c4", first: "Antoni", last: "Wójcik", born: "2015-11-02", parent: "Paweł Wójcik", phone: "+48 603 812 400", email: "pwojcik@example.pl", group: "Delfiny", trainer: "Marek Zieliński", status: "active", balance: -120, sub: "4 zajęcia", subLeft: 1, subEnds: "2026-07-08", med: "", emergency: "Paweł Wójcik · +48 603 812 400" },
    { id: "c5", first: "Maja", last: "Kamińska", born: "2017-03-25", parent: "Karolina Kamińska", phone: "+48 604 119 233", email: "k.kaminska@example.pl", group: "Żółwie (początkujący)", trainer: "Piotr Kaczmarek", status: "inactive", balance: 0, sub: "Wygasł", subLeft: 0, subEnds: "2026-06-10", med: "", emergency: "Karolina Kamińska · +48 604 119 233" },
    { id: "c6", first: "Filip", last: "Zawadzki", born: "2014-07-14", parent: "Anna Zawadzka", phone: "+48 605 660 187", email: "a.zawadzka@example.pl", group: "Rekiny", trainer: "Anna Lewandowska", status: "active", balance: -360, sub: "12 zajęć", subLeft: 2, subEnds: "2026-07-11", med: "Cukrzyca typu 1", emergency: "Anna Zawadzka · +48 605 660 187" },
    { id: "c7", first: "Nadia", last: "Sokołowska", born: "2016-10-08", parent: "Robert Sokołowski", phone: "+48 606 200 415", email: "r.sokol@example.pl", group: "Foki", trainer: "Marek Zieliński", status: "active", balance: 0, sub: "Bez limitu", subLeft: null, subEnds: "2026-09-01", med: "", emergency: "Robert Sokołowski · +48 606 200 415" },
    { id: "c8", first: "Igor", last: "Baran", born: "2015-05-19", parent: "Monika Baran", phone: "+48 607 341 998", email: "m.baran@example.pl", group: "Delfiny", trainer: "Marek Zieliński", status: "active", balance: -80, sub: "8 zajęć", subLeft: 4, subEnds: "2026-07-22", med: "", emergency: "Monika Baran · +48 607 341 998" }
  ];
  const sessions = [
    { id: "s1", start: "15:00", end: "15:45", group: "Żółwie (początkujący)", trainer: "Piotr Kaczmarek", location: "Basen mały", count: 6, limit: 8, status: "done" },
    { id: "s2", start: "16:00", end: "16:45", group: "Foki", trainer: "Marek Zieliński", location: "Basen mały", count: 8, limit: 10, status: "done" },
    { id: "s3", start: "17:00", end: "17:45", group: "Delfiny", trainer: "Marek Zieliński", location: "Basen duży · tor 3-4", count: 12, limit: 12, status: "planned", conflict: false },
    { id: "s4", start: "17:00", end: "17:45", group: "Rekiny", trainer: "Anna Lewandowska", location: "Basen duży · tor 1-2", count: 9, limit: 10, status: "planned" },
    { id: "s5", start: "18:00", end: "18:45", group: "Rekiny", trainer: "Anna Lewandowska", location: "Basen duży · tor 1-2", count: 9, limit: 10, status: "cancelled" }
  ];
  const roster = [
    { id: "c1", name: "Zofia Kowalska", phone: "+48 600 100 200", status: "present", med: "Astma" },
    { id: "c4", name: "Antoni Wójcik", phone: "+48 603 812 400", status: "present", med: "" },
    { id: "c8", name: "Igor Baran", phone: "+48 607 341 998", status: "absent", med: "" },
    { id: "c9", name: "Hanna Duda", phone: "+48 608 190 552", status: "excused", med: "" },
    { id: "c10", name: "Oskar Wróbel", phone: "+48 609 771 300", status: "moved", med: "Alergia — orzechy" },
    { id: "c11", name: "Alicja Mazur", phone: "+48 512 004 881", status: null, med: "" },
    { id: "c12", name: "Szymon Górski", phone: "+48 513 660 240", status: null, med: "" }
  ];
  const payments = [
    { id: "p1", child: "Zofia Kowalska", parent: "Ewa Kowalska", amount: 240, method: "Przelew", date: "2026-07-02", status: "pending", receipt: "przelew_240.pdf" },
    { id: "p2", child: "Filip Zawadzki", parent: "Anna Zawadzka", amount: 360, method: "Przelew", date: "2026-07-02", status: "pending", receipt: "blik_pokwitowanie.jpg" },
    { id: "p3", child: "Igor Baran", parent: "Monika Baran", amount: 80, method: "Gotówka", date: "2026-07-01", status: "pending", receipt: null },
    { id: "p4", child: "Antoni Wójcik", parent: "Paweł Wójcik", amount: 120, method: "Przelew", date: "2026-07-01", status: "pending", receipt: "wplata.png" },
    { id: "p5", child: "Maja Kamińska", parent: "Karolina Kamińska", amount: 200, method: "Przelew", date: "2026-06-30", status: "paid", receipt: "ok.pdf" },
    { id: "p6", child: "Nadia Sokołowska", parent: "Robert Sokołowski", amount: 300, method: "Karta", date: "2026-06-29", status: "rejected", receipt: "zla_kwota.jpg" }
  ];
  const debtors = [
    { id: "c6", child: "Filip Zawadzki", parent: "Anna Zawadzka", group: "Rekiny", trainer: "Anna Lewandowska", reason: "Przeterminowane naliczenie", balance: -360, last: "2026-05-18" },
    { id: "c1", child: "Zofia Kowalska", parent: "Ewa Kowalska", group: "Delfiny", trainer: "Marek Zieliński", reason: "Dług", balance: -240, last: "2026-06-04" },
    { id: "c4", child: "Antoni Wójcik", parent: "Paweł Wójcik", group: "Delfiny", trainer: "Marek Zieliński", reason: "Abonament wygasa · dług", balance: -120, last: "2026-06-20" },
    { id: "c8", child: "Igor Baran", parent: "Monika Baran", group: "Delfiny", trainer: "Marek Zieliński", reason: "Dług", balance: -80, last: "2026-06-22" }
  ];
  window.AdminData = { trainers, groups, clients, sessions, roster, payments, debtors };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/Attendance.jsx
try { (() => {
(function() {
  const { StatusPill, Button, Avatar, Banner, Money } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;
  const OPTIONS = ["present", "absent", "excused", "moved"];
  const LABELS = { present: "Obecny", absent: "Nieobecny", excused: "Uspr.", moved: "Przeł." };
  function Attendance({ go }) {
    const [rows, setRows] = React.useState(D.roster.map((r) => ({ ...r })));
    const [saved, setSaved] = React.useState(false);
    const set = (id, status) => {
      setRows((rs) => rs.map((r) => r.id === id ? { ...r, status } : r));
      setSaved(false);
    };
    const markAll = () => {
      setRows((rs) => rs.map((r) => r.status ? r : { ...r, status: "present" }));
      setSaved(false);
    };
    const done = rows.filter((r) => r.status).length;
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { onClick: () => go("schedule"), style: { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "var(--fs-xs)", padding: 0, marginBottom: 6 } }, /* @__PURE__ */ React.createElement(I.ArrowLeft, { size: 14 }), " Grafik"), /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Delfiny · 17:00–17:45"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Czw 3.07.2026 · Marek Zieliński · Basen duży, tor 3-4")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: markAll }, "Zaznacz wszystkich obecnych"), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Check, { size: 15 }), onClick: () => setSaved(true) }, "Zapisz"))), /* @__PURE__ */ React.createElement(Banner, { tone: "info", style: { marginBottom: 14 } }, "Statusy ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-strong)" } }, "Obecny"), " i ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-strong)" } }, "Nieobecny"), " spisują zajęcie z abonamentu (−1). Zmiana statusu tworzy korektę, nie edytuje starego wpisu."), saved && /* @__PURE__ */ React.createElement(Banner, { tone: "success", style: { marginBottom: 14 }, onClose: () => setSaved(false) }, "Frekwencja zapisana. Utworzono ", rows.filter((r) => r.status === "present" || r.status === "absent").length, " spisań."), /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", padding: "9px 16px", background: "var(--surface-sunken)", borderBottom: "1px solid var(--border-subtle)" } }, /* @__PURE__ */ React.createElement("span", { className: "eyebrow", style: { flex: 1 } }, "Uczeń (", done, "/", rows.length, " odznaczonych)"), /* @__PURE__ */ React.createElement("span", { className: "eyebrow", style: { width: 320 } }, "Status & spisanie")), rows.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none", background: r.status ? "transparent" : "var(--amber-50)" } }, /* @__PURE__ */ React.createElement(Avatar, { name: r.name, size: 30 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { display: "flex", alignItems: "center", gap: 7 } }, r.name, r.med && /* @__PURE__ */ React.createElement("span", { title: r.med, style: { display: "inline-flex", alignItems: "center", gap: 3, color: "var(--red-600)", fontSize: "var(--fs-2xs)", fontWeight: 600, background: "var(--red-50)", padding: "1px 6px", borderRadius: 999 } }, /* @__PURE__ */ React.createElement(I.Heart, { size: 11 }), r.med)), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: "var(--fs-2xs)", color: "var(--text-faint)" } }, r.phone)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, width: 300, justifyContent: "flex-end" } }, OPTIONS.map((o) => {
      const on = r.status === o;
      const consumes = o === "present" || o === "absent";
      return /* @__PURE__ */ React.createElement("button", { key: o, onClick: () => set(r.id, o), title: consumes ? "Spisuje zajęcie (−1)" : "Nie spisuje", style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 9px",
        cursor: "pointer",
        border: `1px solid ${on ? `var(--status-${o}-fg)` : "var(--border-default)"}`,
        background: on ? `var(--status-${o}-bg)` : "var(--surface-card)",
        color: on ? `var(--status-${o}-fg)` : "var(--text-muted)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--fs-xs)",
        fontWeight: on ? 600 : 500,
        fontFamily: "var(--font-sans)"
      } }, LABELS[o], consumes && /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: "var(--fs-2xs)", opacity: on ? 1 : 0.5 } }, "−1"));
    }))))));
  }
  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Attendance = Attendance;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/Attendance.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/Clients.jsx
try { (() => {
(function() {
  const { Table, StatusPill, Money, Avatar, Button, IconButton, Select, Tabs, Banner, Dialog } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;
  function ClientDrawer({ client, onClose }) {
    const [tab, setTab] = React.useState("main");
    const [anon, setAnon] = React.useState(false);
    if (!client) return null;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "drawer-scrim", onClick: onClose }), /* @__PURE__ */ React.createElement("aside", { className: "drawer" }, /* @__PURE__ */ React.createElement("div", { className: "drawer-head" }, /* @__PURE__ */ React.createElement(Avatar, { name: `${client.first} ${client.last}`, size: 38 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-md)" } }, client.last, " ", client.first), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, client.group, " · ", client.trainer)), /* @__PURE__ */ React.createElement(StatusPill, { status: client.status, size: "sm" }), /* @__PURE__ */ React.createElement(IconButton, { label: "Zamknij", onClick: onClose }, /* @__PURE__ */ React.createElement(I.X, null))), /* @__PURE__ */ React.createElement(Tabs, { value: tab, onChange: setTab, style: { padding: "0 18px" }, items: [
      { value: "main", label: "Dane" },
      { value: "finance", label: "Finanse" },
      { value: "attendance", label: "Frekwencja" }
    ] }), /* @__PURE__ */ React.createElement("div", { className: "drawer-body" }, client.med && /* @__PURE__ */ React.createElement(Banner, { tone: "danger", icon: /* @__PURE__ */ React.createElement(I.Heart, { size: 16 }), style: { marginBottom: 16 }, title: "Dane medyczne" }, client.med, " · Kontakt: ", client.emergency), tab === "main" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "Podstawowe"), /* @__PURE__ */ React.createElement("dl", { className: "dl", style: { marginBottom: 20 } }, /* @__PURE__ */ React.createElement("dt", null, "Imię i nazwisko"), /* @__PURE__ */ React.createElement("dd", null, client.first, " ", client.last), /* @__PURE__ */ React.createElement("dt", null, "Data urodzenia"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, client.born), /* @__PURE__ */ React.createElement("dt", null, "Grupa"), /* @__PURE__ */ React.createElement("dd", null, client.group), /* @__PURE__ */ React.createElement("dt", null, "Trener"), /* @__PURE__ */ React.createElement("dd", null, client.trainer)), /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "Rodzina"), /* @__PURE__ */ React.createElement("dl", { className: "dl" }, /* @__PURE__ */ React.createElement("dt", null, "Rodzic"), /* @__PURE__ */ React.createElement("dd", null, client.parent), /* @__PURE__ */ React.createElement("dt", null, "Telefon rodziny"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, client.phone), /* @__PURE__ */ React.createElement("dt", null, "Email"), /* @__PURE__ */ React.createElement("dd", null, client.email))), tab === "finance" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, marginBottom: 18 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Saldo"), /* @__PURE__ */ React.createElement(Money, { amount: client.balance, signed: true, size: "var(--fs-xl)" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Abonament"), /* @__PURE__ */ React.createElement("div", { className: "strong" }, client.sub)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Koniec"), /* @__PURE__ */ React.createElement("div", { className: "mono strong" }, client.subEnds))), /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, "Journal ruchów abonamentu"), /* @__PURE__ */ React.createElement("div", { className: "card", style: { marginBottom: 18 } }, [["Zakup 8 zajęć", "+8", "2026-06-20"], ["Obecność · Delfiny", "−1", "2026-06-24"], ["Obecność · Delfiny", "−1", "2026-06-27"], ["Korekta administratora", "+1", "2026-06-28"], ["Obecność · Delfiny", "−1", "2026-07-01"]].map((r, i, a) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderBottom: i < a.length - 1 ? "1px solid var(--border-subtle)" : "none", fontSize: "var(--fs-sm)" } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { width: 40, fontWeight: 600, color: r[1][0] === "+" ? "var(--money-credit)" : "var(--money-debt)" } }, r[1]), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, r[0]), /* @__PURE__ */ React.createElement("span", { className: "mono muted", style: { fontSize: "var(--fs-xs)" } }, r[2])))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", iconLeft: /* @__PURE__ */ React.createElement(I.Plus, { size: 14 }) }, "Nowe naliczenie"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm" }, "Dodaj płatność"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", iconLeft: /* @__PURE__ */ React.createElement(I.Snowflake, { size: 14 }) }, "Zamroź"))), tab === "attendance" && /* @__PURE__ */ React.createElement("div", { className: "card" }, [["2026-07-01", "present"], ["2026-06-27", "present"], ["2026-06-24", "absent"], ["2026-06-20", "excused"], ["2026-06-17", "moved"]].map((r, i, a) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < a.length - 1 ? "1px solid var(--border-subtle)" : "none" } }, /* @__PURE__ */ React.createElement("span", { className: "mono muted", style: { width: 92, fontSize: "var(--fs-sm)" } }, r[0]), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: "var(--fs-sm)" } }, "Delfiny · 17:00"), /* @__PURE__ */ React.createElement(StatusPill, { status: r[1], size: "sm", showConsumes: true }))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", iconLeft: /* @__PURE__ */ React.createElement(I.Pencil, { size: 14 }) }, "Edytuj"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { variant: "danger", size: "md", iconLeft: /* @__PURE__ */ React.createElement(I.Shield, { size: 14 }), onClick: () => setAnon(true) }, "Anonimizuj (RODO)"))), anon && /* @__PURE__ */ React.createElement(
      Dialog,
      {
        open: true,
        irreversible: true,
        tone: "danger",
        title: "Anonimizacja rodziny",
        confirmLabel: "Anonimizuj dane",
        cancelLabel: "Anuluj",
        onClose: () => setAnon(false),
        onConfirm: () => setAnon(false),
        description: "Dane osobowe dziecka i rodzica zostaną nieodwracalnie usunięte zgodnie z RODO. Historia finansowa pozostanie w formie zanonimizowanej."
      }
    ));
  }
  function Clients() {
    const [q, setQ] = React.useState("");
    const [filter, setFilter] = React.useState("all");
    const [group, setGroup] = React.useState("");
    const [sel, setSel] = React.useState([]);
    const [open, setOpen] = React.useState(null);
    let rows = D.clients;
    if (filter === "active") rows = rows.filter((c) => c.status === "active");
    if (filter === "inactive") rows = rows.filter((c) => c.status === "inactive");
    if (filter === "debtors") rows = rows.filter((c) => c.balance < 0);
    if (group) rows = rows.filter((c) => c.group === group);
    if (q) rows = rows.filter((c) => `${c.first} ${c.last} ${c.parent} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
    return /* @__PURE__ */ React.createElement("div", { className: "page page-wide" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Klienci"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, D.clients.length, " rodzin · ", D.clients.filter((c) => c.balance < 0).length, " z długiem")), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Plus, { size: 15 }) }, "Nowe dziecko")), /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement(Tabs, { value: filter, onChange: setFilter, items: [
      { value: "all", label: "Wszyscy", count: D.clients.length },
      { value: "active", label: "Aktywni" },
      { value: "inactive", label: "Nieaktywni" },
      { value: "debtors", label: "Dłużnicy", count: D.clients.filter((c) => c.balance < 0).length }
    ], style: { border: "none", flex: "none" } }), /* @__PURE__ */ React.createElement("span", { className: "spacer" }), /* @__PURE__ */ React.createElement("div", { className: "searchbox", style: { width: 240 } }, /* @__PURE__ */ React.createElement(I.Search, { size: 15 }), /* @__PURE__ */ React.createElement("input", { placeholder: "Szukaj dziecka, rodzica, telefonu…", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React.createElement(Select, { value: group, onChange: (e) => setGroup(e.target.value), size: "md" }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Wszystkie grupy"), D.groups.map((g) => /* @__PURE__ */ React.createElement("option", { key: g.id }, g.name)))), sel.length > 0 && /* @__PURE__ */ React.createElement(
      Banner,
      {
        tone: "info",
        style: { marginBottom: 12 },
        action: /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "subtle" }, "Zmień grupę"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "subtle" }, "Eksport"))
      },
      "Zaznaczono ",
      sel.length,
      " ",
      sel.length === 1 ? "klienta" : "klientów",
      "."
    ), /* @__PURE__ */ React.createElement(
      Table,
      {
        selectable: true,
        selectedIds: sel,
        onToggleRow: (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]),
        onToggleAll: () => setSel((s) => s.length === rows.length ? [] : rows.map((r) => r.id)),
        onRowClick: (c) => setOpen(c),
        rows,
        emptyLabel: "Brak klientów dla wybranych filtrów",
        columns: [
          { key: "name", header: "Dziecko", render: (c) => /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 9 } }, /* @__PURE__ */ React.createElement(Avatar, { name: `${c.first} ${c.last}`, size: 28 }), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { className: "strong" }, c.last, " ", c.first), c.med && /* @__PURE__ */ React.createElement("span", { title: "Dane medyczne", style: { marginLeft: 6, color: "var(--red-500)", verticalAlign: "middle" } }, /* @__PURE__ */ React.createElement(I.Heart, { size: 13 })))) },
          { key: "parent", header: "Rodzic", muted: true, render: (c) => /* @__PURE__ */ React.createElement("span", null, c.parent, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: "var(--fs-2xs)", color: "var(--text-faint)" } }, c.phone)) },
          { key: "group", header: "Grupa", render: (c) => c.group },
          { key: "sub", header: "Abonament", muted: true, render: (c) => /* @__PURE__ */ React.createElement("span", null, c.sub, c.subLeft != null && /* @__PURE__ */ React.createElement("span", { className: "mono", style: { marginLeft: 6, color: c.subLeft <= 2 ? "var(--amber-600)" : "var(--text-faint)" } }, "· ", c.subLeft, " zaj.")) },
          { key: "balance", header: "Saldo", align: "right", width: 110, render: (c) => /* @__PURE__ */ React.createElement(Money, { amount: c.balance, signed: true }) },
          { key: "status", header: "Status", width: 110, render: (c) => /* @__PURE__ */ React.createElement(StatusPill, { status: c.status, size: "sm" }) }
        ]
      }
    ), open && /* @__PURE__ */ React.createElement(ClientDrawer, { client: open, onClose: () => setOpen(null) }));
  }
  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Clients = Clients;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/Clients.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/Debtors.jsx
try { (() => {
(function() {
  const { Table, Money, Button, Avatar, Badge, IconButton, Banner } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;
  function Debtors() {
    const [range, setRange] = React.useState("30");
    const total = D.debtors.reduce((s, d) => s + d.balance, 0);
    return /* @__PURE__ */ React.createElement("div", { className: "page page-wide" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Dłużnicy"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, D.debtors.length, " rodzin · łączny dług ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--money-debt)", fontWeight: 600 } }, Math.abs(total).toLocaleString("pl-PL", { minimumFractionDigits: 2 }), " zł"))), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Bell, { size: 15 }) }, "Wyślij przypomnienia (", D.debtors.length, ")")), /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "seg" }, [["today", "Dziś"], ["3", "3 dni"], ["7", "7 dni"], ["14", "14 dni"], ["30", "30 dni"]].map(([v, l]) => /* @__PURE__ */ React.createElement("button", { key: v, className: v === range ? "on" : "", onClick: () => setRange(v) }, l))), /* @__PURE__ */ React.createElement("span", { className: "spacer" }), /* @__PURE__ */ React.createElement(Badge, { tone: "danger", dot: true }, "Przeterminowane naliczenia")), /* @__PURE__ */ React.createElement(
      Table,
      {
        rows: D.debtors,
        columns: [
          { key: "child", header: "Dziecko", render: (d) => /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement(Avatar, { name: d.child, size: 26 }), /* @__PURE__ */ React.createElement("span", { className: "strong" }, d.child)) },
          { key: "parent", header: "Rodzic", muted: true, render: (d) => /* @__PURE__ */ React.createElement("span", null, d.parent) },
          { key: "group", header: "Grupa", muted: true },
          { key: "reason", header: "Powód", render: (d) => /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--red-600)", fontSize: "var(--fs-xs)", fontWeight: 500 } }, /* @__PURE__ */ React.createElement(I.Alert, { size: 13 }), d.reason) },
          { key: "last", header: "Ostatnia wpłata", muted: true, render: (d) => /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: "var(--fs-xs)" } }, d.last) },
          { key: "balance", header: "Saldo", align: "right", width: 120, render: (d) => /* @__PURE__ */ React.createElement(Money, { amount: d.balance, signed: true }) },
          { key: "act", header: "", width: 96, render: (d) => /* @__PURE__ */ React.createElement("div", { className: "row-actions" }, /* @__PURE__ */ React.createElement(IconButton, { label: "Karta klienta", size: "sm" }, /* @__PURE__ */ React.createElement(I.User, { size: 16 })), /* @__PURE__ */ React.createElement(IconButton, { label: "Wyślij przypomnienie", size: "sm" }, /* @__PURE__ */ React.createElement(I.Bell, { size: 16 }))) }
        ]
      }
    ));
  }
  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Debtors = Debtors;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/Debtors.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/Overview.jsx
try { (() => {
(function() {
  const { StatusPill, Money, Button, Banner } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;
  function Kpi({ icon, label, value, sub, tone }) {
    return /* @__PURE__ */ React.createElement("div", { className: "kpi" }, /* @__PURE__ */ React.createElement("div", { className: "kpi-label" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, icon), label), /* @__PURE__ */ React.createElement("div", { className: "kpi-value", style: tone ? { color: tone } : null }, value), sub && /* @__PURE__ */ React.createElement("div", { className: "kpi-sub" }, sub));
  }
  function Overview({ go }) {
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Przegląd"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Czwartek, 3 lipca 2026 · Europe/Warsaw")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", iconLeft: /* @__PURE__ */ React.createElement(I.Calendar, { size: 15 }), onClick: () => go("schedule") }, "Grafik na dziś"), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Cash, { size: 15 }), onClick: () => go("payments") }, "Płatności do sprawdzenia"))), /* @__PURE__ */ React.createElement(
      Banner,
      {
        tone: "warning",
        title: "4 płatności czekają na weryfikację",
        style: { marginBottom: 16 },
        action: /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "subtle", onClick: () => go("payments") }, "Otwórz")
      },
      "Rodzice przesłali potwierdzenia przelewu. Sprawdź kwoty przed potwierdzeniem."
    ), /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "Dziś"), /* @__PURE__ */ React.createElement("div", { className: "kpi-grid", style: { marginBottom: 20 } }, /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Calendar, { size: 15 }), label: "Zajęcia dziś", value: "5", sub: "Najbliższe: Delfiny 17:00" }), /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Whistle, { size: 15 }), label: "Trenerzy dziś", value: "2", sub: "Marek, Anna" }), /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.X, { size: 15 }), label: "Odwołane", value: "1", sub: "Rekiny 18:00", tone: "var(--money-debt)" }), /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Users, { size: 15 }), label: "Uczniowie dziś", value: "44", sub: "Frekwencja 86%" })), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "Finanse"), /* @__PURE__ */ React.createElement("div", { className: "kpi-grid", style: { gridTemplateColumns: "1fr 1fr" } }, /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Wallet, { size: 15 }), label: "Nieopłacone naliczenia", value: /* @__PURE__ */ React.createElement(Money, { amount: 2480 }), sub: "14 pozycji" }), /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Alert, { size: 15 }), label: "Przeterminowane", value: /* @__PURE__ */ React.createElement("span", { style: { color: "var(--money-debt)" } }, "4"), sub: "−800,00 zł łącznie", tone: "var(--money-debt)" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 10 } }, "Abonamenty"), /* @__PURE__ */ React.createElement("div", { className: "kpi-grid", style: { gridTemplateColumns: "1fr 1fr" } }, /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Clock, { size: 15 }), label: "Skoro koniec (7 dni)", value: "6", sub: "Zaproponuj przedłużenie" }), /* @__PURE__ */ React.createElement(Kpi, { icon: /* @__PURE__ */ React.createElement(I.Layers, { size: 15 }), label: "Mało zajęć (≤2)", value: "3", sub: "Filip, Antoni, Zofia" })))), /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { margin: "20px 0 10px" } }, "Najbliższe zajęcia"), /* @__PURE__ */ React.createElement("div", { className: "card" }, D.sessions.filter((s) => s.status !== "done").map((s, i, arr) => /* @__PURE__ */ React.createElement("div", { key: s.id, style: { display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border-subtle)" : "none" } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-strong)", width: 96 } }, s.start, "–", s.end), /* @__PURE__ */ React.createElement("span", { className: "strong", style: { flex: 1 } }, s.group), /* @__PURE__ */ React.createElement("span", { className: "muted", style: { fontSize: "var(--fs-sm)", width: 150 } }, s.trainer), /* @__PURE__ */ React.createElement("span", { className: "muted", style: { fontSize: "var(--fs-xs)", width: 150 } }, s.location), /* @__PURE__ */ React.createElement("span", { className: "mono muted", style: { fontSize: "var(--fs-xs)", width: 54, textAlign: "right" } }, s.count, "/", s.limit), /* @__PURE__ */ React.createElement(StatusPill, { status: s.status, size: "sm" })))));
  }
  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Overview = Overview;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/Overview.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/Payments.jsx
try { (() => {
(function() {
  const { Table, StatusPill, Money, Button, IconButton, Tabs, Banner, Dialog, Avatar } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;
  function ReceiptDrawer({ pay, onClose, onConfirm, onReject }) {
    if (!pay) return null;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "drawer-scrim", onClick: onClose }), /* @__PURE__ */ React.createElement("aside", { className: "drawer", style: { width: 440 } }, /* @__PURE__ */ React.createElement("div", { className: "drawer-head" }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-md)" } }, "Płatność ", pay.id.toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, pay.child, " · ", pay.parent)), /* @__PURE__ */ React.createElement(IconButton, { label: "Zamknij", onClick: onClose }, /* @__PURE__ */ React.createElement(I.X, null))), /* @__PURE__ */ React.createElement("div", { className: "drawer-body" }, /* @__PURE__ */ React.createElement("dl", { className: "dl", style: { marginBottom: 18 } }, /* @__PURE__ */ React.createElement("dt", null, "Kwota"), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement(Money, { amount: pay.amount })), /* @__PURE__ */ React.createElement("dt", null, "Sposób"), /* @__PURE__ */ React.createElement("dd", null, pay.method), /* @__PURE__ */ React.createElement("dt", null, "Data wpłaty"), /* @__PURE__ */ React.createElement("dd", { className: "mono" }, pay.date), /* @__PURE__ */ React.createElement("dt", null, "Zgłosił"), /* @__PURE__ */ React.createElement("dd", null, pay.parent, " (rodzic)")), /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, "Czek / potwierdzenie"), pay.receipt ? /* @__PURE__ */ React.createElement("div", { style: { border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: 200, background: "repeating-linear-gradient(135deg, var(--slate-100), var(--slate-100) 12px, var(--slate-50) 12px, var(--slate-50) 24px)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)" } }, /* @__PURE__ */ React.createElement(I.File, { size: 40 })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderTop: "1px solid var(--border-subtle)" } }, /* @__PURE__ */ React.createElement(I.File, { size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { flex: 1, fontSize: "var(--fs-xs)" } }, pay.receipt), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", iconLeft: /* @__PURE__ */ React.createElement(I.Download, { size: 14 }) }, "Pobierz"))) : /* @__PURE__ */ React.createElement(Banner, { tone: "warning" }, "Brak załączonego czeku — płatność gotówkowa zgłoszona przez administratora.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" } }, /* @__PURE__ */ React.createElement(Button, { variant: "danger", fullWidth: true, onClick: onReject }, "Odrzuć"), /* @__PURE__ */ React.createElement(Button, { variant: "primary", fullWidth: true, iconLeft: /* @__PURE__ */ React.createElement(I.Check, { size: 15 }), onClick: onConfirm }, "Potwierdź płatność"))));
  }
  function Payments() {
    const [tab, setTab] = React.useState("review");
    const [open, setOpen] = React.useState(null);
    const [reject, setReject] = React.useState(null);
    const [list, setList] = React.useState(D.payments.map((p) => ({ ...p })));
    const [toast, setToast] = React.useState(null);
    const counts = {
      all: list.length,
      review: list.filter((p) => p.status === "pending").length,
      rejected: list.filter((p) => p.status === "rejected").length
    };
    let rows = list;
    if (tab === "review") rows = list.filter((p) => p.status === "pending");
    if (tab === "rejected") rows = list.filter((p) => p.status === "rejected");
    const confirm = (p) => {
      setList((l) => l.map((x) => x.id === p.id ? { ...x, status: "paid" } : x));
      setOpen(null);
      setToast(`Płatność ${p.id.toUpperCase()} potwierdzona`);
    };
    const doReject = (p) => {
      setList((l) => l.map((x) => x.id === p.id ? { ...x, status: "rejected" } : x));
      setOpen(null);
      setReject(null);
      setToast(`Płatność ${p.id.toUpperCase()} odrzucona`);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "page page-wide" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Płatności"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Naliczenia i płatności są rozdzielone. Weryfikuj kwotę czeku przed potwierdzeniem.")), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", iconLeft: /* @__PURE__ */ React.createElement(I.Download, { size: 15 }) }, "Eksport (XLSX)")), toast && /* @__PURE__ */ React.createElement(Banner, { tone: "success", style: { marginBottom: 12 }, onClose: () => setToast(null) }, toast), /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement(Tabs, { value: tab, onChange: setTab, style: { border: "none" }, items: [
      { value: "all", label: "Wszystkie", count: counts.all },
      { value: "review", label: "Na weryfikacji", count: counts.review },
      { value: "rejected", label: "Odrzucone", count: counts.rejected }
    ] })), /* @__PURE__ */ React.createElement(
      Table,
      {
        rows,
        onRowClick: (p) => p.status === "pending" && setOpen(p),
        emptyLabel: "Brak płatności w tej kategorii",
        columns: [
          { key: "child", header: "Dziecko", render: (p) => /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement(Avatar, { name: p.child, size: 26 }), /* @__PURE__ */ React.createElement("span", { className: "strong" }, p.child)) },
          { key: "parent", header: "Zgłosił", muted: true },
          { key: "method", header: "Sposób", muted: true },
          { key: "date", header: "Data", muted: true, render: (p) => /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: "var(--fs-xs)" } }, p.date) },
          { key: "receipt", header: "Czek", render: (p) => p.receipt ? /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-link)", fontSize: "var(--fs-xs)" } }, /* @__PURE__ */ React.createElement(I.File, { size: 14 }), " ", p.receipt) : /* @__PURE__ */ React.createElement("span", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, "—") },
          { key: "amount", header: "Kwota", align: "right", width: 110, render: (p) => /* @__PURE__ */ React.createElement(Money, { amount: p.amount }) },
          { key: "status", header: "Status", width: 130, render: (p) => /* @__PURE__ */ React.createElement(StatusPill, { status: p.status, size: "sm" }) },
          { key: "act", header: "", width: 90, render: (p) => p.status === "pending" ? /* @__PURE__ */ React.createElement("div", { className: "row-actions", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement(IconButton, { label: "Potwierdź", size: "sm", onClick: () => confirm(p) }, /* @__PURE__ */ React.createElement(I.Check, { size: 16 })), /* @__PURE__ */ React.createElement(IconButton, { label: "Odrzuć", size: "sm", variant: "danger", onClick: () => setReject(p) }, /* @__PURE__ */ React.createElement(I.X, { size: 16 }))) : null }
        ]
      }
    ), open && /* @__PURE__ */ React.createElement(ReceiptDrawer, { pay: open, onClose: () => setOpen(null), onConfirm: () => confirm(open), onReject: () => setReject(open) }), reject && /* @__PURE__ */ React.createElement(
      Dialog,
      {
        open: true,
        tone: "danger",
        title: "Odrzucić płatność?",
        confirmLabel: "Odrzuć",
        cancelLabel: "Anuluj",
        onClose: () => setReject(null),
        onConfirm: () => doReject(reject),
        description: `Płatność ${reject.child} na ${reject.amount},00 zł zostanie odrzucona. Rodzic otrzyma powiadomienie z powodem.`
      }
    ));
  }
  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Payments = Payments;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/Payments.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/Schedule.jsx
try { (() => {
(function() {
  const { StatusPill, Button, IconButton, Banner, Badge } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.AdminData;
  const HOURS = ["15:00", "16:00", "17:00", "18:00", "19:00"];
  function Schedule({ go }) {
    const [day, setDay] = React.useState("Czw 3.07");
    return /* @__PURE__ */ React.createElement("div", { className: "page page-wide" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Grafik"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Widok dnia · Europe/Warsaw")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", iconLeft: /* @__PURE__ */ React.createElement(I.Plus, { size: 15 }) }, "Indywidualne zajęcie"), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Layers, { size: 15 }) }, "Generuj z szablonu"))), /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "seg" }, ["Pon 30.06", "Wt 1.07", "Śr 2.07", "Czw 3.07", "Pt 4.07"].map((d) => /* @__PURE__ */ React.createElement("button", { key: d, className: d === day ? "on" : "", onClick: () => setDay(d) }, d))), /* @__PURE__ */ React.createElement("span", { className: "spacer" }), /* @__PURE__ */ React.createElement(Badge, { tone: "danger", dot: true }, "1 odwołane"), /* @__PURE__ */ React.createElement(Badge, { tone: "warning", dot: true }, "1 pełne")), /* @__PURE__ */ React.createElement(Banner, { tone: "warning", title: "Uwaga: pełna grupa", style: { marginBottom: 14 } }, "Delfiny 17:00 osiągnęły limit 12/12 uczestników."), /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, HOURS.map((h, hi) => {
      const items = D.sessions.filter((s) => s.start === h);
      return /* @__PURE__ */ React.createElement("div", { key: h, style: { display: "flex", borderBottom: hi < HOURS.length - 1 ? "1px solid var(--border-subtle)" : "none", minHeight: 62 } }, /* @__PURE__ */ React.createElement("div", { className: "mono muted", style: { width: 64, flexShrink: 0, padding: "12px 0 0 16px", fontSize: "var(--fs-sm)" } }, h), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", gap: 10, padding: 10, flexWrap: "wrap" } }, items.length === 0 && /* @__PURE__ */ React.createElement("span", { className: "muted", style: { fontSize: "var(--fs-xs)", alignSelf: "center" } }, "—"), items.map((s) => {
        const full = s.count >= s.limit;
        const cancelled = s.status === "cancelled";
        return /* @__PURE__ */ React.createElement("div", { key: s.id, style: {
          flex: "1 1 300px",
          minWidth: 280,
          maxWidth: 440,
          border: `1px solid ${cancelled ? "var(--border-subtle)" : full ? "var(--amber-100)" : "var(--border-default)"}`,
          borderLeft: `3px solid ${cancelled ? "var(--slate-300)" : full ? "var(--amber-500)" : "var(--primary)"}`,
          borderRadius: "var(--radius-md)",
          background: cancelled ? "var(--surface-sunken)" : "var(--surface-card)",
          padding: "9px 12px",
          opacity: cancelled ? 0.7 : 1,
          display: "flex",
          flexDirection: "column",
          gap: 5
        } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "strong", style: { flex: 1, textDecoration: cancelled ? "line-through" : "none" } }, s.group), cancelled ? /* @__PURE__ */ React.createElement(StatusPill, { status: "cancelled", size: "sm" }) : full ? /* @__PURE__ */ React.createElement(Badge, { tone: "warning" }, s.count, "/", s.limit) : /* @__PURE__ */ React.createElement("span", { className: "mono muted", style: { fontSize: "var(--fs-xs)" } }, s.count, "/", s.limit)), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)", display: "flex", gap: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(I.Whistle, { size: 13 }), s.trainer), /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(I.Location, { size: 13 }), s.location)), !cancelled && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, marginTop: 3 } }, /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "subtle", onClick: () => go("attendance") }, "Frekwencja"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost" }, "Edytuj"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(IconButton, { label: "Odwołaj", size: "sm", variant: "danger" }, /* @__PURE__ */ React.createElement(I.X, { size: 15 }))));
      })));
    })));
  }
  window.AdminScreens = window.AdminScreens || {};
  window.AdminScreens.Schedule = Schedule;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/Schedule.jsx", error: String((e && e.message) || e) }); }

// ui_kits/parent/data.jsx
try { (() => {
(function() {
  const children = [
    {
      id: "k1",
      name: "Zofia Kowalska",
      group: "Delfiny",
      trainer: "Marek Zieliński",
      born: "2015-04-12",
      sub: "8 zajęć",
      subLeft: 3,
      subEnds: "2026-07-20",
      balance: -240
    },
    {
      id: "k2",
      name: "Kacper Kowalski",
      group: "Foki",
      trainer: "Marek Zieliński",
      born: "2017-08-03",
      sub: "Bez limitu",
      subLeft: null,
      subEnds: "2026-09-01",
      balance: 0
    }
  ];
  const schedule = {
    k1: [
      { date: "Dziś · Czw 3.07", start: "17:00", end: "17:45", group: "Delfiny", trainer: "Marek Zieliński", location: "Basen duży · tor 3-4", status: "planned" },
      { date: "Pon 7.07", start: "17:00", end: "17:45", group: "Delfiny", trainer: "Marek Zieliński", location: "Basen duży", status: "planned" },
      { date: "Śr 9.07", start: "17:00", end: "17:45", group: "Delfiny", trainer: "Marek Zieliński", location: "Basen duży", status: "cancelled" }
    ],
    k2: [
      { date: "Wt 8.07", start: "16:00", end: "16:45", group: "Foki", trainer: "Marek Zieliński", location: "Basen mały", status: "planned" }
    ]
  };
  const ledger = {
    k1: [
      { label: "Zakup — abonament 8 zajęć", delta: "+8", date: "2026-06-20" },
      { label: "Obecność · Delfiny", delta: "−1", date: "2026-06-24" },
      { label: "Obecność · Delfiny", delta: "−1", date: "2026-06-27" },
      { label: "Korekta administratora", delta: "+1", date: "2026-06-28" },
      { label: "Obecność · Delfiny", delta: "−1", date: "2026-07-01" }
    ]
  };
  const attendance = {
    k1: [
      { date: "2026-07-01", label: "Delfiny · 17:00", status: "present" },
      { date: "2026-06-27", label: "Delfiny · 17:00", status: "present" },
      { date: "2026-06-24", label: "Delfiny · 17:00", status: "absent" },
      { date: "2026-06-20", label: "Delfiny · 17:00", status: "excused" }
    ]
  };
  const charges = [
    { id: "ch1", child: "Zofia Kowalska", desc: "Abonament 8 zajęć — lipiec", amount: 240, due: "2026-07-05", status: "overdue" },
    { id: "ch2", child: "Kacper Kowalski", desc: "Abonament bez limitu — lipiec", amount: 300, due: "2026-07-10", status: "awaiting" }
  ];
  const payments = [
    { id: "pp1", child: "Zofia Kowalska", amount: 240, date: "2026-07-02", method: "Przelew", status: "pending", receipt: "przelew_240.pdf" },
    { id: "pp2", child: "Zofia Kowalska", amount: 240, date: "2026-06-04", method: "Przelew", status: "paid", receipt: "czerwiec.pdf" },
    { id: "pp3", child: "Kacper Kowalski", amount: 300, date: "2026-05-30", method: "Karta", status: "paid", receipt: "maj.pdf" }
  ];
  window.ParentData = { children, schedule, ledger, attendance, charges, payments };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/parent/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/parent/screens.jsx
try { (() => {
(function() {
  const { StatusPill, Money, Button, Avatar, Banner, Badge, Tabs, Dialog, Input, Select, Switch } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.ParentData;
  function ChildSwitch({ kid, setKid }) {
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, D.children.map((c) => {
      const on = c.id === kid;
      return /* @__PURE__ */ React.createElement("button", { key: c.id, onClick: () => setKid(c.id), style: { display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", cursor: "pointer", border: `1px solid ${on ? "var(--primary)" : "var(--border-default)"}`, background: on ? "var(--primary-soft)" : "var(--surface-card)", borderRadius: "var(--radius-pill)", fontFamily: "var(--font-sans)" } }, /* @__PURE__ */ React.createElement(Avatar, { name: c.name, size: 26 }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-sm)", fontWeight: on ? 600 : 500, color: on ? "var(--primary-hover)" : "var(--text-body)" } }, c.name.split(" ")[0]));
    }));
  }
  function Home({ kid, setKid, go }) {
    const c = D.children.find((x) => x.id === kid);
    const next = (D.schedule[kid] || []).find((s) => s.status === "planned");
    return /* @__PURE__ */ React.createElement("div", { className: "page", style: { maxWidth: 900 } }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Cześć, Ewa"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Twoje dzieci w szkole H2O")), /* @__PURE__ */ React.createElement(ChildSwitch, { kid, setKid })), c.balance < 0 && /* @__PURE__ */ React.createElement(
      Banner,
      {
        tone: "danger",
        title: "Zaległość do opłacenia",
        style: { marginBottom: 14 },
        action: /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "subtle", onClick: () => go("payments") }, "Zapłać")
      },
      c.name,
      ": saldo ",
      /* @__PURE__ */ React.createElement("strong", null, Math.abs(c.balance), ",00 zł"),
      ". Prześlij potwierdzenie przelewu."
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { className: "kpi-label" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(I.Calendar, { size: 15 })), "Następny trening"), next ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-lg)", margin: "4px 0 2px" } }, next.date.replace("Dziś · ", ""), " · ", next.start), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-sm)" } }, next.group, " · ", next.trainer), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6 } }, /* @__PURE__ */ React.createElement(I.Location, { size: 13 }), next.location)) : /* @__PURE__ */ React.createElement("div", { className: "muted", style: { marginTop: 8 } }, "Brak zaplanowanych zajęć.")), /* @__PURE__ */ React.createElement("div", { className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { className: "kpi-label" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(I.Layers, { size: 15 })), "Abonament"), /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-lg)", margin: "4px 0 2px" } }, c.sub), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 14, marginTop: 4 } }, /* @__PURE__ */ React.createElement("span", { className: "muted", style: { fontSize: "var(--fs-sm)" } }, "Pozostało: ", /* @__PURE__ */ React.createElement("strong", { className: "mono", style: { color: c.subLeft != null && c.subLeft <= 2 ? "var(--amber-600)" : "var(--text-strong)" } }, c.subLeft == null ? "∞" : `${c.subLeft} zaj.`)), /* @__PURE__ */ React.createElement("span", { className: "muted", style: { fontSize: "var(--fs-sm)" } }, "Koniec: ", /* @__PURE__ */ React.createElement("strong", { className: "mono" }, c.subEnds))), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "secondary", style: { marginTop: 12 }, onClick: () => go("subscription") }, "Zobacz historię")), /* @__PURE__ */ React.createElement("div", { className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { className: "kpi-label" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(I.Wallet, { size: 15 })), "Płatność"), c.balance < 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { margin: "4px 0 2px" } }, /* @__PURE__ */ React.createElement(Money, { amount: c.balance, signed: true, size: "var(--fs-lg)" })), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, "Termin: 05.07.2026")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-lg)", margin: "4px 0 2px", color: "var(--money-credit)" } }, "Brak zaległości"), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, "Wszystko opłacone")), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: c.balance < 0 ? "primary" : "secondary", style: { marginTop: 12 }, iconLeft: /* @__PURE__ */ React.createElement(I.Upload, { size: 14 }), onClick: () => go("payments") }, "Prześlij czek")), /* @__PURE__ */ React.createElement("div", { className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { className: "kpi-label" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(I.Bell, { size: 15 })), "Powiadomienia"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-sm)", color: "var(--text-body)", lineHeight: 1.5, marginTop: 4 } }, /* @__PURE__ */ React.createElement("div", null, "· Zajęcia 9.07 zostały ", /* @__PURE__ */ React.createElement("strong", null, "odwołane"), "."), /* @__PURE__ */ React.createElement("div", null, "· Abonament Zofii kończy się za ", /* @__PURE__ */ React.createElement("strong", null, "3 zajęcia"), ".")))));
  }
  function Schedule({ kid, setKid }) {
    const list = D.schedule[kid] || [];
    return /* @__PURE__ */ React.createElement("div", { className: "page", style: { maxWidth: 900 } }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Rozkład"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Nie możesz sam zapisać ani przełożyć zajęć — skontaktuj się z administracją.")), /* @__PURE__ */ React.createElement(ChildSwitch, { kid, setKid })), /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, list.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderBottom: i < list.length - 1 ? "1px solid var(--border-subtle)" : "none", opacity: s.status === "cancelled" ? 0.6 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 120 } }, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-sm)" } }, s.date), /* @__PURE__ */ React.createElement("div", { className: "mono muted", style: { fontSize: "var(--fs-xs)" } }, s.start, "–", s.end)), /* @__PURE__ */ React.createElement("span", { className: "strong", style: { width: 100, textDecoration: s.status === "cancelled" ? "line-through" : "none" } }, s.group), /* @__PURE__ */ React.createElement("span", { className: "muted", style: { flex: 1, fontSize: "var(--fs-xs)" } }, s.trainer, " · ", s.location), /* @__PURE__ */ React.createElement(StatusPill, { status: s.status, size: "sm" })))));
  }
  function Subscription({ kid, setKid }) {
    const c = D.children.find((x) => x.id === kid);
    const rows = D.ledger[kid] || [];
    return /* @__PURE__ */ React.createElement("div", { className: "page", style: { maxWidth: 760 } }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Abonament"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, c.name, " · ", c.sub)), /* @__PURE__ */ React.createElement(ChildSwitch, { kid, setKid })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, marginBottom: 18 } }, /* @__PURE__ */ React.createElement("div", { className: "card card-pad", style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Pozostało zajęć"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: "var(--fs-3xl)", fontWeight: 600, color: "var(--text-strong)" } }, c.subLeft == null ? "∞" : c.subLeft)), /* @__PURE__ */ React.createElement("div", { className: "card card-pad", style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Data końca"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: "var(--fs-xl)", fontWeight: 600, color: "var(--text-strong)", marginTop: 8 } }, c.subEnds)), /* @__PURE__ */ React.createElement("div", { className: "card card-pad", style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm" }, "Zgłoś przedłużenie"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm" }, "Kontakt z administracją"))), rows.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, "Historia ruchów — czytelna: zakup +8, obecność −1, korekta +1"), /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, rows.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none" } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { width: 44, fontWeight: 600, fontSize: "var(--fs-md)", color: r.delta[0] === "+" ? "var(--money-credit)" : "var(--money-debt)" } }, r.delta), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: "var(--fs-sm)" } }, r.label), /* @__PURE__ */ React.createElement("span", { className: "mono muted", style: { fontSize: "var(--fs-xs)" } }, r.date))))));
  }
  function Payments({ kid, setKid }) {
    const [tab, setTab] = React.useState("charges");
    const [upload, setUpload] = React.useState(false);
    const [file, setFile] = React.useState(null);
    return /* @__PURE__ */ React.createElement("div", { className: "page", style: { maxWidth: 860 } }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Płatności"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Naliczenia, historia wpłat i przesłane czeki")), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Upload, { size: 15 }), onClick: () => setUpload(true) }, "Prześlij czek")), /* @__PURE__ */ React.createElement(Tabs, { value: tab, onChange: setTab, style: { marginBottom: 16 }, items: [
      { value: "charges", label: "Do zapłaty", count: D.charges.length },
      { value: "history", label: "Historia wpłat" }
    ] }), tab === "charges" && /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, D.charges.map((ch, i) => /* @__PURE__ */ React.createElement("div", { key: ch.id, style: { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < D.charges.length - 1 ? "1px solid var(--border-subtle)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "strong" }, ch.desc), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, ch.child, " · termin ", ch.due)), /* @__PURE__ */ React.createElement(Money, { amount: ch.amount }), /* @__PURE__ */ React.createElement(StatusPill, { status: ch.status, size: "sm" }), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "subtle", iconLeft: /* @__PURE__ */ React.createElement(I.Upload, { size: 13 }), onClick: () => setUpload(true) }, "Czek")))), tab === "history" && /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, D.payments.map((p, i) => /* @__PURE__ */ React.createElement("div", { key: p.id, style: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < D.payments.length - 1 ? "1px solid var(--border-subtle)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "strong" }, p.child), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, p.method, " · ", p.date)), p.receipt && /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-link)", fontSize: "var(--fs-xs)" } }, /* @__PURE__ */ React.createElement(I.File, { size: 14 }), p.receipt), /* @__PURE__ */ React.createElement(Money, { amount: p.amount }), /* @__PURE__ */ React.createElement(StatusPill, { status: p.status, size: "sm" })))), upload && /* @__PURE__ */ React.createElement(
      Dialog,
      {
        open: true,
        title: "Prześlij potwierdzenie płatności",
        width: 480,
        confirmLabel: "Wyślij do weryfikacji",
        cancelLabel: "Anuluj",
        onClose: () => {
          setUpload(false);
          setFile(null);
        },
        onConfirm: () => {
          setUpload(false);
          setFile(null);
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React.createElement(Select, { label: "Dziecko", defaultValue: "Zofia Kowalska" }, /* @__PURE__ */ React.createElement("option", null, "Zofia Kowalska"), /* @__PURE__ */ React.createElement("option", null, "Kacper Kowalski")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10 } }, /* @__PURE__ */ React.createElement(Input, { label: "Kwota", suffix: "zł", defaultValue: "240,00", containerStyle: { flex: 1 } }), /* @__PURE__ */ React.createElement(Input, { label: "Data wpłaty", type: "date", defaultValue: "2026-07-03", containerStyle: { flex: 1 } })), /* @__PURE__ */ React.createElement(Select, { label: "Sposób płatności", defaultValue: "Przelew" }, /* @__PURE__ */ React.createElement("option", null, "Przelew"), /* @__PURE__ */ React.createElement("option", null, "Gotówka"), /* @__PURE__ */ React.createElement("option", null, "Karta")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { font: "var(--text-label)", color: "var(--text-body)", marginBottom: 5 } }, "Plik (PDF / JPG / PNG)"), /* @__PURE__ */ React.createElement("label", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px", border: `1.5px dashed ${file ? "var(--primary)" : "var(--border-strong)"}`, borderRadius: "var(--radius-md)", background: file ? "var(--primary-soft)" : "var(--surface-sunken)", cursor: "pointer", color: "var(--text-muted)" } }, /* @__PURE__ */ React.createElement(I.Upload, { size: 22 }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-sm)" } }, file ? file : "Kliknij lub przeciągnij plik"), /* @__PURE__ */ React.createElement("input", { type: "file", style: { display: "none" }, onChange: (e) => setFile(e.target.files[0] ? e.target.files[0].name : "przelew.pdf") }))), /* @__PURE__ */ React.createElement(Banner, { tone: "info" }, "Płatność online nie jest dostępna. Administrator zweryfikuje czek i potwierdzi wpłatę."))
    ));
  }
  function Consents({ kid, setKid }) {
    const [ch, setCh] = React.useState({ rodo: true, email: true, sms: false, tg: true });
    const t = (k) => setCh((s) => ({ ...s, [k]: !s[k] }));
    const ITEMS = [
      ["rodo", "Przetwarzanie danych (RODO)", "Wymagane do korzystania ze szkoły. Wycofanie: skontaktuj się z administracją.", true],
      ["email", "Powiadomienia e-mail", "Przypomnienia o zajęciach i płatnościach."],
      ["sms", "Powiadomienia SMS", "Tylko krytyczne sytuacje (odwołane zajęcia)."],
      ["tg", "Powiadomienia Telegram", "Połączony czat: @ewa_k."]
    ];
    return /* @__PURE__ */ React.createElement("div", { className: "page", style: { maxWidth: 680 } }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Zgody i powiadomienia"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Zarządzasz kanałami kontaktu i zgodami RODO"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, ITEMS.map(([k, title, desc, req], i) => /* @__PURE__ */ React.createElement("div", { key: k, style: { display: "flex", alignItems: "flex-start", gap: 14, padding: "15px 18px", borderBottom: i < ITEMS.length - 1 ? "1px solid var(--border-subtle)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { display: "inline-flex", alignItems: "center", gap: 7 } }, title, req && /* @__PURE__ */ React.createElement(Badge, { tone: "neutral" }, "Wymagane")), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)", marginTop: 3 } }, desc)), /* @__PURE__ */ React.createElement(Switch, { checked: ch[k], onChange: () => !req && t(k) })))), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { fontSize: "var(--fs-xs)", marginTop: 12 } }, "Wersja polityki prywatności: 2.1 · zgoda udzielona 2026-01-14"));
  }
  window.ParentScreens = { Home, Schedule, Subscription, Payments, Consents };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/parent/screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trainer/data.jsx
try { (() => {
(function() {
  const sessions = [
    { id: "s1", date: "Dziś · Czw 3.07", start: "16:00", end: "16:45", group: "Foki", location: "Basen mały", count: 8, status: "done" },
    { id: "s2", date: "Dziś · Czw 3.07", start: "17:00", end: "17:45", group: "Delfiny", location: "Basen duży · tor 3-4", count: 12, status: "planned" },
    { id: "s3", date: "Jutro · Pt 4.07", start: "16:00", end: "16:45", group: "Foki", location: "Basen mały", count: 8, status: "planned" },
    { id: "s4", date: "Jutro · Pt 4.07", start: "17:00", end: "17:45", group: "Delfiny", location: "Basen duży · tor 3-4", count: 12, status: "planned" },
    { id: "s5", date: "Pon 7.07", start: "17:00", end: "17:45", group: "Delfiny", location: "Basen duży", count: 12, status: "cancelled" }
  ];
  const roster = [
    { id: "c1", name: "Zofia Kowalska", emergency: "Ewa Kowalska · +48 600 100 200", med: "Astma — inhalator w torbie", status: "present" },
    { id: "c4", name: "Antoni Wójcik", emergency: "Paweł Wójcik · +48 603 812 400", med: "", status: "present" },
    { id: "c8", name: "Igor Baran", emergency: "Monika Baran · +48 607 341 998", med: "", status: null },
    { id: "c9", name: "Hanna Duda", emergency: "Robert Duda · +48 608 190 552", med: "", status: null },
    { id: "c10", name: "Oskar Wróbel", emergency: "Julia Wróbel · +48 609 771 300", med: "Alergia — orzechy", status: null },
    { id: "c11", name: "Alicja Mazur", emergency: "Piotr Mazur · +48 512 004 881", med: "", status: null },
    { id: "c12", name: "Szymon Górski", emergency: "Ewa Górska · +48 513 660 240", med: "", status: null }
  ];
  const groups = [
    { id: "g1", name: "Delfiny", students: 12, next: "Dziś 17:00", schedule: "Pon, Śr, Czw · 17:00" },
    { id: "g3", name: "Foki", students: 8, next: "Dziś 16:00", schedule: "Wt, Czw · 16:00" },
    { id: "g5", name: "Wieloryby", students: 10, next: "Pt 18:00", schedule: "Pt · 18:00" }
  ];
  window.TrainerData = { sessions, roster, groups };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trainer/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trainer/screens.jsx
try { (() => {
(function() {
  const { StatusPill, Button, Avatar, Banner, Badge, IconButton } = window.SwimCRMDesignSystem_546643;
  const I = window.SwimIcons;
  const D = window.TrainerData;
  function Sessions({ go }) {
    const [range, setRange] = React.useState("week");
    const grouped = {};
    D.sessions.forEach((s) => {
      (grouped[s.date] = grouped[s.date] || []).push(s);
    });
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Moje zajęcia"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Marek Zieliński · widzisz tylko swoje zajęcia")), /* @__PURE__ */ React.createElement("div", { className: "seg" }, [["today", "Dziś"], ["week", "Tydzień"], ["all", "Wszystkie"]].map(([v, l]) => /* @__PURE__ */ React.createElement("button", { key: v, className: v === range ? "on" : "", onClick: () => setRange(v) }, l)))), Object.entries(grouped).map(([date, items]) => /* @__PURE__ */ React.createElement("div", { key: date, style: { marginBottom: 18 } }, /* @__PURE__ */ React.createElement("div", { className: "eyebrow", style: { marginBottom: 8 } }, date), /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, items.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: s.id, style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--border-subtle)" : "none", opacity: s.status === "cancelled" ? 0.65 : 1 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { width: 104, fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-strong)" } }, s.start, "–", s.end), /* @__PURE__ */ React.createElement("span", { className: "strong", style: { width: 120, textDecoration: s.status === "cancelled" ? "line-through" : "none" } }, s.group), /* @__PURE__ */ React.createElement("span", { className: "muted", style: { flex: 1, fontSize: "var(--fs-xs)", display: "inline-flex", alignItems: "center", gap: 5 } }, /* @__PURE__ */ React.createElement(I.Location, { size: 13 }), s.location), /* @__PURE__ */ React.createElement("span", { className: "mono muted", style: { fontSize: "var(--fs-xs)", display: "inline-flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(I.Users, { size: 13 }), s.count), /* @__PURE__ */ React.createElement(StatusPill, { status: s.status, size: "sm" }), s.status !== "cancelled" && /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: s.status === "done" ? "ghost" : "subtle", onClick: () => go("session") }, s.status === "done" ? "Podgląd" : "Frekwencja")))))));
  }
  const OPTIONS = ["present", "absent", "excused", "moved"];
  const LABELS = { present: "Obecny", absent: "Nieobecny", excused: "Uspr.", moved: "Przeł." };
  function Session({ go }) {
    const [rows, setRows] = React.useState(D.roster.map((r) => ({ ...r })));
    const [saved, setSaved] = React.useState(false);
    const set = (id, status) => {
      setRows((rs) => rs.map((r) => r.id === id ? { ...r, status } : r));
      setSaved(false);
    };
    const done = rows.filter((r) => r.status).length;
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { onClick: () => go("sessions"), style: { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "var(--fs-xs)", padding: 0, marginBottom: 6 } }, /* @__PURE__ */ React.createElement(I.ArrowLeft, { size: 14 }), " Moje zajęcia"), /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Delfiny · 17:00–17:45"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, "Czw 3.07 · Basen duży, tor 3-4 · ", rows.length, " uczniów")), /* @__PURE__ */ React.createElement(Button, { variant: "primary", iconLeft: /* @__PURE__ */ React.createElement(I.Check, { size: 15 }), onClick: () => setSaved(true) }, "Zapisz frekwencję")), /* @__PURE__ */ React.createElement(Banner, { tone: "info", style: { marginBottom: 14 } }, "Statusy ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-strong)" } }, "Obecny"), " i ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--text-strong)" } }, "Nieobecny"), " spisują zajęcie (−1). Nie przedłużasz abonamentów ani nie zmieniasz płatności."), saved && /* @__PURE__ */ React.createElement(Banner, { tone: "success", style: { marginBottom: 14 }, onClose: () => setSaved(false) }, "Frekwencja zapisana (", done, "/", rows.length, ")."), /* @__PURE__ */ React.createElement("div", { className: "card", style: { overflow: "hidden" } }, rows.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none", background: r.status ? "transparent" : "var(--amber-50)" } }, /* @__PURE__ */ React.createElement(Avatar, { name: r.name, size: 32 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { display: "flex", alignItems: "center", gap: 7 } }, r.name, r.med && /* @__PURE__ */ React.createElement("span", { title: r.med, style: { display: "inline-flex", alignItems: "center", gap: 3, color: "var(--red-600)", fontSize: "var(--fs-2xs)", fontWeight: 600, background: "var(--red-50)", padding: "1px 6px", borderRadius: 999 } }, /* @__PURE__ */ React.createElement(I.Heart, { size: 11 }), r.med)), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-2xs)", display: "inline-flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(I.Phone, { size: 11 }), "Kontakt: ", r.emergency)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4 } }, OPTIONS.map((o) => {
      const on = r.status === o;
      const consumes = o === "present" || o === "absent";
      return /* @__PURE__ */ React.createElement("button", { key: o, onClick: () => set(r.id, o), style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", cursor: "pointer", border: `1px solid ${on ? `var(--status-${o}-fg)` : "var(--border-default)"}`, background: on ? `var(--status-${o}-bg)` : "var(--surface-card)", color: on ? `var(--status-${o}-fg)` : "var(--text-muted)", borderRadius: "var(--radius-sm)", fontSize: "var(--fs-xs)", fontWeight: on ? 600 : 500, fontFamily: "var(--font-sans)" } }, LABELS[o], consumes && /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: "var(--fs-2xs)", opacity: on ? 1 : 0.5 } }, "−1"));
    }))))));
  }
  function Groups() {
    return /* @__PURE__ */ React.createElement("div", { className: "page" }, /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Moje grupy"), /* @__PURE__ */ React.createElement("p", { className: "page-desc" }, D.groups.length, " grupy przypisane do Ciebie"))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 } }, D.groups.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.id, className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-md)", background: "var(--primary-soft)", color: "var(--primary)" } }, /* @__PURE__ */ React.createElement(I.Waves, { size: 18 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "strong", style: { fontSize: "var(--fs-md)" } }, g.name), /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "var(--fs-xs)" } }, g.students, " uczniów"))), /* @__PURE__ */ React.createElement("dl", { className: "dl", style: { gridTemplateColumns: "92px 1fr" } }, /* @__PURE__ */ React.createElement("dt", null, "Grafik"), /* @__PURE__ */ React.createElement("dd", { style: { fontWeight: 500 } }, g.schedule), /* @__PURE__ */ React.createElement("dt", null, "Najbliższe"), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement(Badge, { tone: "primary", dot: true }, g.next)))))));
  }
  window.TrainerScreens = { Sessions, Session, Groups };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trainer/screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;
__ds_ns.Badge = __ds_scope.Badge;
__ds_ns.Money = __ds_scope.Money;
__ds_ns.STATUS = __ds_scope.STATUS;
__ds_ns.StatusPill = __ds_scope.StatusPill;
__ds_ns.Table = __ds_scope.Table;
__ds_ns.Banner = __ds_scope.Banner;
__ds_ns.Dialog = __ds_scope.Dialog;
__ds_ns.EmptyState = __ds_scope.EmptyState;
__ds_ns.Toast = __ds_scope.Toast;
__ds_ns.Button = __ds_scope.Button;
__ds_ns.Checkbox = __ds_scope.Checkbox;
__ds_ns.IconButton = __ds_scope.IconButton;
__ds_ns.Input = __ds_scope.Input;
__ds_ns.Radio = __ds_scope.Radio;
__ds_ns.Select = __ds_scope.Select;
__ds_ns.Switch = __ds_scope.Switch;
__ds_ns.Textarea = __ds_scope.Textarea;
__ds_ns.SidebarNav = __ds_scope.SidebarNav;
__ds_ns.Tabs = __ds_scope.Tabs;
})();
