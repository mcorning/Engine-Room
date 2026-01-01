
---
template_type: pcb_section
section: upcoming_outflows
version: 1.0
---

### 3) Upcoming Outflows

```dataviewjs
// ===== Proforma Checkbook · Upcoming Outflows =====
// Assumes bill/obligation pages have: tags: [bill] (or [debt]/[creditCard]), 
// date or dueDate (YYYY-MM-DD), label, amount (number; positive).

let today = window.moment(dv.current().file.frontmatter?.date ?? window.moment().format("YYYY-MM-DD"));
if (!window.moment.isMoment(today)) today = window.moment(today);

// Establish horizon as the next income
let incomesAll = dv.pages('#income').where(p => p.date && typeof p.amount === "number");
let upcomingIncome = Array.from(incomesAll
  .where(p => window.moment(p.date).isSameOrAfter(today, 'day'))
  .sort(p => window.moment(p.date).valueOf())
)[0];
let horizon = upcomingIncome ? window.moment(upcomingIncome.date) : window.moment(today).add(14,'days');

// Gather outflows across tags
let bills = dv.pages('#bill');
let debts = dv.pages('#debt');
let cards = dv.pages('#creditCard');

function normalizeDate(p){
  let raw = p.date ?? p.dueDate ?? null;
  return raw ? window.moment(raw) : null;
}
function normalizeAmount(p){
  return Number(p.amount ?? p.payment ?? 0);
}
function normalizeLabel(p){
  return p.label ?? p.name ?? (p.file?.link ?? "—");
}

let pages = Array.from(bills.concat(debts).concat(cards))
  .where(p => normalizeDate(p) && typeof normalizeAmount(p) === "number")
  .where(p => {
    let d = normalizeDate(p);
    return d && d.isSameOrAfter(today,'day') && d.isSameOrBefore(horizon,'day');
  })
  .sort(p => normalizeDate(p).valueOf());

let rows = pages.map(p => [
  normalizeDate(p).format("YYYY-MM-DD"),
  normalizeLabel(p),
  `$${normalizeAmount(p).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`
]);

dv.table(["Date","Label","Amount"], rows);
let total = pages.map(p => normalizeAmount(p)).reduce((a,b)=>a+b,0);
dv.paragraph(`**Total Out:** -$${total.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`);
```
