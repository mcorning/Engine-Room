
---
template_type: pcb_section
section: coverage_summary
version: 1.0
---

### 4) Coverage Summary (Projected Balance)

```dataviewjs
// ===== Proforma Checkbook · Coverage Summary =====
// Relies on same assumptions as Sections 1–3.

let today = window.moment(dv.current().file.frontmatter?.date ?? window.moment().format("YYYY-MM-DD"));
if (!window.moment.isMoment(today)) today = window.moment(today);

// ACCOUNTS
let accounts = dv.pages('#account').where(p => p.include_in_pcb && typeof p.balance === "number");
let startBalance = Array.from(accounts.map(p => Number(p.balance ?? 0))).reduce((a,b)=>a+b, 0);

// INCOME (HORIZON)
let incomesAll = dv.pages('#income').where(p => p.date && typeof p.amount === "number");
let upcoming = Array.from(incomesAll
  .where(p => window.moment(p.date).isSameOrAfter(today, 'day'))
  .sort(p => window.moment(p.date).valueOf())
);
let horizon = upcoming[0] ? window.moment(upcoming[0].date) : today;

// INFLOWS within window
let inflows = Array.from(incomesAll
  .where(p => {
    let d = window.moment(p.date);
    return d.isSameOrAfter(today, 'day') && d.isSameOrBefore(horizon, 'day');
  })
);
let totalIn = inflows.map(p => Number(p.amount ?? 0)).reduce((a,b)=>a+b,0);

// OUTFLOWS within window
let bills = dv.pages('#bill');
let debts = dv.pages('#debt');
let cards = dv.pages('#creditCard');

function normDate(p){ let raw = p.date ?? p.dueDate ?? null; return raw ? window.moment(raw) : null; }
function normAmt(p){ return Number(p.amount ?? p.payment ?? 0); }

let outs = Array.from(bills.concat(debts).concat(cards))
  .where(p => normDate(p) && typeof normAmt(p) === "number")
  .where(p => {
    let d = normDate(p);
    return d && d.isSameOrAfter(today,'day') && d.isSameOrBefore(horizon,'day');
  });

let totalOut = outs.map(p => normAmt(p)).reduce((a,b)=>a+b,0);

// PROJECTED
let projected = startBalance + totalIn - totalOut;
let projStr = `$${projected.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
let dateStr = horizon.format("YYYY-MM-DD");

// Color hint
let good = projected >= 0;
dv.paragraph(`Projected on ${dateStr}: ${good ? "**<span style='color:#22c55e'>" + projStr + "</span>**" : "**<span style='color:#ef4444'>" + projStr + "</span>**"}`);
```
