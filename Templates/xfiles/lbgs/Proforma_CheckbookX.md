---
template: Proforma_Checkbook
starting_cash: 1188.35
debug: true
base: "[[accounts.base]]"
---

# Proforma Checkbook

> v3.6 adds **income cycle control**:
> - `due_week` + `due_weekday` (e.g., 1st Wed → `due_week: 1`, `due_weekday: 3`)
> - `due_days: [..]` still supported
> - `last_received:` skips the current cycle if paid on/after that cycle's picked date
> - Past‑due income is **hidden by default** once the picked date is behind `as_of` (assume it's in checking already). Set `show_past_due: true` in an income note to keep showing it.

---

## Next 45 days

```dataviewjs
/*==========================================
  Proforma Checkbook – v3.6
  - Income: due_week/weekday, due_days, next_payment_date, as_of
  - Income respects last_received
  - Past-due income hidden by default unless show_past_due
==========================================*/

// ---------- helpers ----------
const $N = x => Number(x ?? 0);
const cur = x => $N(x).toLocaleString("en-US",{style:"currency",currency:"USD"});
const asLink = p => p?.file?.link ?? "⚠️";
const today = window.moment();
const AS_OF = dv.current().as_of ? window.moment(dv.current().as_of) : today;
const RANGE_DAYS = 45;
const END = window.moment(AS_OF).add(RANGE_DAYS, "days");
let beginCash = $N(dv.current().starting_cash);
const DEBUG = dv.current().debug === true;

// ---------- collections (tags OR folders) ----------
const inFolder = (p, folder) => p?.file?.path?.toLowerCase()?.startsWith(folder.toLowerCase());
const BILLS = dv.pages('#bill').concat(dv.pages().where(p => inFolder(p, 'Engine Room/Bills')));
const DEBTS = dv.pages('#debt OR #creditCard').concat(dv.pages().where(p => inFolder(p, 'Engine Room/Debts')));
const INCOME = dv.pages('#income').concat(dv.pages().where(p => inFolder(p, 'Engine Room/Income')));

// ---------- date helpers ----------
function buildMonthDatesFromDays(baseMoment, days) {
  const out = [];
  for (const d of days) {
    const m = window.moment(baseMoment).date(d); // clone + set DOM
    if (m.isValid()) out.push(m);
  }
  out.sort((a,b) => a.valueOf() - b.valueOf());
  return out;
}

// nth weekday in a given month (1=first ... 5=fifth), weekday 0=Sun..6=Sat
function nthWeekdayOfMonth(baseMoment, n, weekday) {
  const firstOfMonth = window.moment(baseMoment).startOf('month');
  let d = window.moment(firstOfMonth).day(weekday);
  if (d.isBefore(firstOfMonth)) d.add(1, 'week');
  d.add(n-1, 'weeks');
  return d;
}

function pickScheduledDate(p) {
  if (p.next_payment_date) {
    const d = window.moment(p.next_payment_date);
    if (d.isValid()) return d;
  }
  const days = Array.isArray(p.due_days) ? p.due_days : null;
  if (days && days.length) {
    for (let m = 0; m < 2; m++) {
      const base = window.moment(AS_OF).add(m, "months");
      const cand = buildMonthDatesFromDays(base, days).find(d => d.isSameOrAfter(AS_OF));
      if (cand) return cand;
    }
  }
  if (p.due_week && (p.due_weekday || p.weekday)) {
    const n = Number(p.due_week);
    const w = Number(p.due_weekday ?? p.weekday);
    for (let m = 0; m < 2; m++) {
      const base = window.moment(AS_OF).add(m, 'months');
      const cand = nthWeekdayOfMonth(base, n, w);
      if (cand.isSameOrAfter(AS_OF)) return cand;
    }
  }
  if (p.as_of) {
    const d = window.moment(p.as_of);
    if (d.isValid()) return d;
  }
  return null;
}

// ---------- collect rows ----------
let rows = [];
let incomeDebug = [];

// Bills
for (const p of BILLS) {
  const d = pickScheduledDate(p);
  if (d) {
    const amt = $N(p.amount);
    if (amt) rows.push({date:d, type:"Bill", item:asLink(p), delta:-amt});
  }
}

// Debts
function occurrencesInWindow(p) {
  const out = [];
  const days = Array.isArray(p.due_days) ? p.due_days : [];
  const amts = Array.isArray(p.due_amounts) ? p.due_amounts : [];
  if (!days.length) return out;

  for (let m = 0; m < 2; m++) {
    const base = window.moment(AS_OF).add(m, "months");
    const dates = buildMonthDatesFromDays(base, days);
    dates.forEach((d, idxInMonth) => {
      if (d.isSameOrAfter(AS_OF) && d.isBefore(END)) {
        const ai = (idxInMonth % (amts.length || 1));
        const amt = $N(amts.length ? amts[ai] : p.next_payment_amount_due ?? p.amount ?? p.payment ?? 0);
        if (amt !== 0) out.push({date:d, amount:amt, indexInMonth:idxInMonth});
      }
    });
  }
  out.sort((a,b) => a.date.valueOf() - b.date.valueOf());
  return out;
}

function applyOneOffToOccurrences(p, occs) {
  const paid = Number(p.amount_paid ?? 0);
  const paidDate = p.amount_paid_date ? window.moment(p.amount_paid_date) : null;
  if (!paid || !paidDate?.isValid() || occs.length === 0) return occs;
  const first = occs[0];
  if (paidDate.isAfter(first.date)) return occs;
  if (paidDate.isBefore(window.moment(first.date).subtract(35,'days'))) return occs;
  const residual = Math.max(0, first.amount - paid);
  if (residual === 0) return occs.slice(1);
  return [{...first, amount:residual}, ...occs.slice(1)];
}

// Debts pass
for (const p of DEBTS) {
  let occs = occurrencesInWindow(p);
  if (!occs.length) {
    const d = pickScheduledDate(p);
    if (d) {
      const amt = $N(p.next_payment_amount_due ?? p.amount ?? p.payment ?? 0);
      if (amt) occs = [{date:d, amount:amt}];
    }
  }
  occs = applyOneOffToOccurrences(p, occs);
  for (const o of occs) rows.push({date:o.date, type:"Debt", item:asLink(p), delta: -$N(o.amount)});
}

// Income pass
for (const p of INCOME) {
  const picked = pickScheduledDate(p);
  const amt = $N(p.amount ?? p.expected ?? 0);
  const last = p.last_received ? window.moment(p.last_received) : null;
  const showPastDue = p.show_past_due === true;

  let status = "skipped";
  let reason = "—";
  let inWindow = false;

  if (!picked) {
    reason = "no schedule";
  } else {
    inWindow = picked.isSameOrAfter(AS_OF) && picked.isBefore(END);
    // Hide past-due (picked before AS_OF) unless opted-in
    if (picked.isBefore(AS_OF) && !showPastDue) {
      reason = "past-due hidden";
    } else if (last && last.isSameOrAfter(picked)) {
      reason = "already received";
    } else if (!amt) {
      reason = "no amount";
    } else {
      // OK to include if in window
      if (inWindow) {
        rows.push({date:picked, type:"Income", item:asLink(p), delta: amt});
        status = "included";
        reason = "scheduled";
      } else {
        reason = "out of window";
      }
    }
  }

  if (DEBUG) {
    incomeDebug.push([asLink(p),
      picked ? picked.format("YYYY-MM-DD") : "—",
      last ? last.format("YYYY-MM-DD") : "—",
      amt ? cur(amt) : "—",
      status,
      reason]);
  }
}

// ---------- sort & render ----------
rows.sort((a,b) => a.date.valueOf() - b.date.valueOf());
let running = beginCash;
const table = rows.map(r => {
  running += r.delta;
  return [r.date.format("MMM D"), r.type, r.item, cur(r.delta), cur(running)];
});

dv.header(3, `Today's Cash: ${cur(beginCash)} • Window: ${AS_OF.format("MMM D")} → ${END.format("MMM D")}`);

if (DEBUG) {
  dv.header(4, "Income debug");
  dv.table(["Item","Picked Date","Last Received","Amount","Status","Reason"], incomeDebug);
}

if (table.length) dv.table(["Date","Type","Item","Δ","Balance"], table);
else dv.paragraph("No items in window.");
```
