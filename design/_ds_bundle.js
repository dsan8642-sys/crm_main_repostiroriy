/* @ds-bundle: {"format":4,"namespace":"SwimCRMDesignSystem_546643","components":[{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"Money","sourcePath":"components/data/Money.jsx"},{"name":"STATUS","sourcePath":"components/data/StatusPill.jsx"},{"name":"StatusPill","sourcePath":"components/data/StatusPill.jsx"},{"name":"Table","sourcePath":"components/data/Table.jsx"},{"name":"Banner","sourcePath":"components/feedback/Banner.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"SidebarNav","sourcePath":"components/navigation/SidebarNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"assets/icons.jsx":"3ea60936d1f0","components/data/Avatar.jsx":"671d0dab0cb2","components/data/Badge.jsx":"ed0aa3033c94","components/data/Money.jsx":"85eddda66503","components/data/StatusPill.jsx":"7a47cce4c3f6","components/data/Table.jsx":"0739116ccae8","components/forms/Button.jsx":"d515b677698e","components/forms/Checkbox.jsx":"e8519173e668","components/forms/IconButton.jsx":"616567f2a33c","components/forms/Input.jsx":"f9aababef51a","components/forms/Radio.jsx":"5ad05167f384","components/forms/Select.jsx":"63fc8b0831ed","components/forms/Switch.jsx":"3fbe898249dc","components/forms/Textarea.jsx":"0870c4205f77","components/feedback/Banner.jsx":"3cd502ece8b4","components/feedback/Dialog.jsx":"3e1e60dd07ab","components/feedback/EmptyState.jsx":"151a7f51c963","components/feedback/Toast.jsx":"c7482bdd87c5","components/navigation/SidebarNav.jsx":"dbbf326806fb","components/navigation/Tabs.jsx":"bbbcc232ebaa"},"inlinedExternals":[],"unexposedExports":[{"name":"labelStyle","sourcePath":"components/forms/Input.jsx"},{"name":"tdBase","sourcePath":"components/data/Table.jsx"},{"name":"thBase","sourcePath":"components/data/Table.jsx"}]} */

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
function Money({ amount, currency = "zł", locale = "pl-PL", signed = false, muted = false, size = "inherit", style }) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
function StatusPill({
  status,
  label,
  tone,
  showConsumes = false,
  consumesLabel = "Zajęcie zostaje spisane",
  doesNotConsumeLabel = "Zajęcie nie jest spisane",
  size = "md",
  style
}) {
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
      title: def.consumes ? consumesLabel : doesNotConsumeLabel,
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
function Banner({ children, title, tone = "info", icon, onClose, closeLabel = "Zamknij", action, style }) {
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
    onClose && /* @__PURE__ */ React.createElement("button", { onClick: onClose, "aria-label": closeLabel, style: { background: "none", border: "none", cursor: "pointer", color: `var(${fg})`, opacity: 0.7, padding: 2, lineHeight: 0 } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" })))
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
  irreversibleLabel = "Działanie nieodwracalne",
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
      /* @__PURE__ */ React.createElement("div", { style: { padding: "18px 20px 0" } }, irreversible && /* @__PURE__ */ React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10, color: "var(--red-600)", fontSize: "var(--fs-2xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" } }, /* @__PURE__ */ React.createElement(WarnIcon, null), " ", irreversibleLabel), title && /* @__PURE__ */ React.createElement("h2", { id: titleId, style: { margin: 0, font: "var(--text-card-title)", color: "var(--text-strong)" } }, title), description && /* @__PURE__ */ React.createElement("p", { id: descriptionId, style: { margin: "7px 0 0", fontSize: "var(--fs-sm)", color: "var(--text-muted)", lineHeight: "var(--lh-normal)" } }, description)),
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
