```dataviewjs
// ===== CONFIG YOU CAN TWEAK =====

// read checking balance from US Bank note
const checkingNote = dv.page("Accounts/US Bank");
const beginBalance = Number(checkingNote?.balance ?? 0);

// ===== END CONFIG =====


// === pcb-core logic (inline) ===
function normalizeRows(rowsLike) {
  return Array.from(rowsLike ?? []).map(r => ({
    ...r,
    delta: Number(r.delta ?? 0),
  }));
}

function computeTotals(rowsLike) {
  const rows = normalizeRows(rowsLike);
  const inflow = rows.filter(r => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const outflow = -rows.filter(r => r.delta < 0).reduce((s, r) => s + r.delta, 0);
  return { inflow, outflow };
}

function computeForecast(beginBalance, rowsLike) {
  const totals = computeTotals(rowsLike);
  const net = totals.inflow - totals.outflow;
  const running = Number(beginBalance ?? 0) + net;
  return { ...totals, net, running };
}

function formatCurrency(value) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function totalsLine({ inflow, outflow, running }) {
  return `Totals — In: ${formatCurrency(inflow)}  Out: ${formatCurrency(outflow)}  Projected: ${formatCurrency(running)}`;
}

// helper: normalize scalar / list / dataview-list into plain array
function toArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  try {
    if (typeof v === "object" && Symbol.iterator in Object(v)) {
      return Array.from(v);
    }
  } catch (_) {}
  return [v];
}
function getNthWednesday(year, month, n) {
  // month is 0-based
  let d = new Date(year, month, 1);
  let firstDay = d.getDay(); // 0=Sun … 3=Wed
  const WED = 3;

  // Offset from day 1 to first Wednesday in the month
  const offset = (WED - firstDay + 7) % 7;

  // First Wednesday is day = 1 + offset
  const firstWedDate = 1 + offset;

  // nth Wednesday is (n-1) weeks after first Wednesday
  const targetDate = firstWedDate + (n - 1) * 7;

  return new Date(year, month, targetDate);
}

function getNextSsiBySchedule(schedule, today) {
  if (!schedule) return null;

  // expect formats like "2nd_wed", "4th_wed"
  const m = schedule.toLowerCase().match(/^(\d+)(st|nd|rd|th)?_wed$/);
  if (!m) return null;

  const n = Number(m[1]); // nth Wednesday desired

  // First try this month
  const y = today.year();
  const mth = today.month();
  let d = moment(getNthWednesday(y, mth, n));

  // If already passed, advance to next month
  if (d.isBefore(today, "day")) {
    const next = today.clone().add(1, "month");
    d = moment(getNthWednesday(next.year(), next.month(), n));
  }

  return d;
}

// today context for outflows (and maybe inflows later)
const today = window.moment();
const year = today.year();
const month = today.month(); // 0-based

const inflowPages = dv.pages("#fixed-income or #income")
  .where(p => p.amount && (p.as_of || p.date_of_deposit));

const inflows = [];

for (const p of inflowPages) {
  const amount = Number(p.amount ?? 0);
  if (!amount) continue;

  let d = null;
  const source = (p.source ?? "").toLowerCase();

if (source === "ssa" && p.schedule) {
  d = getNextSsiBySchedule(p.schedule, today);
}



  if (!d) continue;

  inflows.push({
    date: d.format("YYYY-MM-DD"),
    label: p.ref ?? p.name ?? p.file?.name ?? "❓",
    delta: amount, // inflow is positive
  });
}



// === collect outflows from #bill and #debt pages ===

const billPages = dv.pages("#bill or #debt or #loan or #mortgage")
  .where(p => (p.amount || p.due_amounts) && (p.due_days || p.dueDay || p.due_day));

const outflows = [];

for (const p of billPages) {
  // amounts: prefer due_amounts list, else single amount
  const amountsList = toArray(p.due_amounts ?? p.amount);
  if (!amountsList.length) continue;

  // due days: prefer snake_case list, fallback to old names
  const daysList = toArray(p.due_days ?? p.dueDay ?? p.due_day);
  if (!daysList.length) continue;

  const label = p.ref ?? p.name ?? p.file?.name ?? "❓";

  daysList.forEach((dayVal, idx) => {
    const dayNum = Number(dayVal);
    if (!dayNum) return;

    const rawAmt = amountsList[idx] ?? amountsList[0];
    const amount = Number(rawAmt ?? 0);
    if (!amount) return;

    let due = window.moment({ year, month, day: dayNum });

    // if this month's day already passed, push to next month
    if (due.isBefore(today, "day")) {
      due = due.add(1, "month");
    }

    outflows.push({
      date: due.format("YYYY-MM-DD"),
      label: label,
      delta: -amount, // outflow
    });
  });
}

// Combine inflows + outflows into one forecast array
const rows = inflows.concat(outflows);

// Sort by date ascending so the table is chronological
rows.sort((a, b) => a.date.localeCompare(b.date));

// Compute forecast
const forecast = computeForecast(beginBalance, rows);

// Debug: show checking balance
dv.paragraph(`Checking: ${formatCurrency(beginBalance)}`);

// Output main line
dv.paragraph(totalsLine(forecast));

// Debug table so we can see what it's using
// Debug table with running balance
let running = beginBalance;

const tableRows = rows.map(r => {
  running += r.delta;  // apply this event
  return [
    r.date,
    r.label,
    formatCurrency(r.delta),
    formatCurrency(running),
  ];
});

dv.table(
  ["Date", "Label", "Delta", "Running"],
  tableRows
);

dv.table(
  ["file", "tags", "amount", "schedule"],
  dv.pages("#fixed-income or #income")
    .map(p => [p.file.name, p.tags, p.amount, p.schedule])
);
