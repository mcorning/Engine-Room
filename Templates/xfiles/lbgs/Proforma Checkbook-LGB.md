---
title: Proforma Checkbook
as_of:
starting_cash: 1188.35
---


# Proforma Checkbook

> Supports card pages using `due_days: [12,23]` **and** `due_amounts: [200,200]`, plus optional `amount_paid` / `amount_paid_date` to offset the **next** upcoming charge only.

---

## Next 45 days

```dataviewjs
/*==========================================
  Proforma Checkbook – v3.4
  - Accepts due_days[] + due_amounts[] (aligned by index)
  - Applies amount_paid only to the **next** upcoming due in-window
  - Keeps support for next_payment_* if present
  - Renders item name as link; shows running balance
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

// tune to your vault
const BILLS  = dv.pages('#bill');
const DEBTS  = dv.pages('#debt OR #creditCard');
const INCOME = dv.pages('#income');

// ---------- date helpers ----------
const pad2 = n => String(n).padStart(2,'0');

function buildMonthDatesFromDays(baseMoment, days) {
  const out = [];
  for (const d of days) {
    const m = window.moment(`${baseMoment.year()}-${pad2(baseMoment.month()+1)}-${pad2(d)}`, "YYYY-MM-DD");
    if (m.isValid()) out.push(m);
  }
  // ascending
  out.sort((a,b) => a.valueOf() - b.valueOf());
  return out;
}

function nextPaymentDate(p) {
  if (p.next_payment_date) {
    const d = window.moment(p.next_payment_date);
    if (d.isValid() && d.isSameOrAfter(AS_OF) && d.isBefore(END)) return d;
  }
  // if using due_days, compute the next one
  const days = Array.isArray(p.due_days) ? p.due_days : null;
  if (days && days.length) {
    // search this and next month
    for (let m = 0; m < 2; m++) {
      const base = window.moment(AS_OF).add(m, "months");
      const cand = buildMonthDatesFromDays(base, days).find(d => d.isSameOrAfter(AS_OF));
      if (cand && cand.isBefore(END)) return cand;
    }
  }
  // last resort: as_of
  if (p.as_of) {
    const d = window.moment(p.as_of);
    if (d.isValid() && d.isSameOrAfter(AS_OF) && d.isBefore(END)) return d;
  }
  return null;
}

// Return all occurrences (date + amount) for p within window using due_days/amounts
function occurrencesInWindow(p) {
  const out = [];
  const days = Array.isArray(p.due_days) ? p.due_days : [];
  const amts = Array.isArray(p.due_amounts) ? p.due_amounts : [];
  if (!days.length) return out;

  // this and next month only (window is 45d by default)
  for (let m = 0; m < 2; m++) {
    const base = window.moment(AS_OF).add(m, "months");
    const dates = buildMonthDatesFromDays(base, days);
    dates.forEach((d, idxInMonth) => {
      if (d.isSameOrAfter(AS_OF) && d.isBefore(END)) {
        // amount by index modulo due_amounts length (graceful if lengths differ)
        const ai = (idxInMonth % (amts.length || 1));
        const amt = $N(amts.length ? amts[ai] : p.next_payment_amount_due ?? p.amount ?? p.payment ?? 0);
        if (amt !== 0) out.push({date:d, amount:amt, indexInMonth:idxInMonth});
      }
    });
  }
  // sort
  out.sort((a,b) => a.date.valueOf() - b.date.valueOf());
  return out;
}

// Apply a one-off paydown to the FIRST upcoming occurrence only
function applyOneOffToOccurrences(p, occs) {
  const paid = $N(p.amount_paid);
  const paidDate = p.amount_paid_date ? window.moment(p.amount_paid_date) : null;
  if (!paid || !paidDate?.isValid() || occs.length === 0) return occs;

  // Only apply if paydown happened before or on first due AND within ~35 days prior
  const first = occs[0];
  if (paidDate.isAfter(first.date)) return occs;
  if (paidDate.isBefore(window.moment(first.date).subtract(35,'days'))) return occs;

  const residual = Math.max(0, first.amount - paid);
  if (residual === 0) {
    // drop the first occurrence entirely
    return occs.slice(1);
  } else {
    // replace first occurrence amount
    const updated = [{...first, amount:residual}, ...occs.slice(1)];
    return updated;
  }
}

// ---------- collect rows ----------
let rows = [];

// Bills (fixed)
for (const p of BILLS) {
  const d = nextPaymentDate(p);
  if (d) {
    const amt = $N(p.amount);
    if (amt) rows.push({date:d, type:"Bill", item:asLink(p), delta:-amt});
  }
}

// Debts (cards, loans)
// Prefer due_days + due_amounts; fall back to single next_payment_amount_due
for (const p of DEBTS) {
  let occs = occurrencesInWindow(p);
  if (!occs.length) {
    const d = nextPaymentDate(p);
    if (d) {
      const amt = $N(p.next_payment_amount_due ?? p.amount ?? p.payment ?? 0);
      if (amt) occs = [{date:d, amount:amt}];
    }
  }
  occs = applyOneOffToOccurrences(p, occs);
  for (const o of occs) rows.push({date:o.date, type:"Debt", item:asLink(p), delta: -$N(o.amount)});
}

// Income
for (const p of INCOME) {
  const d = p.next_payment_date ? window.moment(p.next_payment_date) : (p.as_of ? window.moment(p.as_of) : null);
  if (d && d.isSameOrAfter(AS_OF) && d.isBefore(END)) {
    const amt = $N(p.amount ?? p.expected ?? 0);
    if (amt) rows.push({date:d, type:"Income", item:asLink(p), delta: amt});
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

if (table.length) dv.table(["Date","Type","Item","Δ","Balance"], table);
else dv.paragraph("No items in window.");
```