
---
template_type: pcb_section
section: upcoming_inflows
version: 1.0
---

### 2) Upcoming Inflows

```dataviewjs
// ===== Proforma Checkbook · Upcoming Inflows =====
// Assumes income pages have: tags: [income], date: YYYY-MM-DD, label, amount (number)

let today = window.moment(dv.current().file.frontmatter?.date ?? window.moment().format("YYYY-MM-DD"));
if (!window.moment.isMoment(today)) today = window.moment(today);

// Find the next scheduled income as the "horizon"
let incomesAll = dv.pages('#income').where(p => p.date && typeof p.amount === "number");
let upcoming = Array.from(incomesAll
  .where(p => window.moment(p.date).isSameOrAfter(today, 'day'))
  .sort(p => window.moment(p.date).valueOf())
);

let horizon = upcoming[0] ? window.moment(upcoming[0].date) : today;
let inflows = Array.from(incomesAll
  .where(p => {
    let d = window.moment(p.date);
    return d.isSameOrAfter(today, 'day') && d.isSameOrBefore(horizon, 'day');
  })
  .sort(p => window.moment(p.date).valueOf())
);

let rows = inflows.map(p => [
  window.moment(p.date).format("YYYY-MM-DD"),
  p.label ?? (p.file?.link ?? "—"),
  `$${Number(p.amount ?? 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`
]);

dv.table(["Date","Label","Amount"], rows);
let total = inflows.map(p => Number(p.amount ?? 0)).reduce((a,b)=>a+b,0);
dv.paragraph(`**Total In:** $${total.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`);
```
