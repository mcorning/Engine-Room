
---
template_type: pcb_section
section: inputs_snapshot
version: 1.0
---

### 1) Inputs Snapshot

```dataviewjs
// ===== Proforma Checkbook · Inputs Snapshot =====
// Uses SSA Dashboard Bug Protocol guards.
//
// CONFIG — set in your Accounts notes' YAML:
//   tags: [account]
//   include_in_pcb: true
//   name: "USB Checking" (display)
//   balance: 2050.25 (number)
//
// OPTIONAL: You can also set `pcb_horizon_days: 14` in the daily note's YAML.
// If not present, we default to 14 days.
//
// TODAY
let today = window.moment(dv.current().file.frontmatter?.date ?? window.moment().format("YYYY-MM-DD"));
if (!window.moment.isMoment(today)) today = window.moment(today);

// HORIZON — next income date within N days (or fallback to today)
const horizonDays = Number(dv.current().file.frontmatter?.pcb_horizon_days ?? 14);
let windowEnd = window.moment(today).add(horizonDays, "days");

// ACCOUNTS — sum balances where include_in_pcb=true
let accounts = dv.pages('#account').where(p => p.include_in_pcb && typeof p.balance === "number");
let accountNames = Array.from(accounts.map(p => p.name ?? p.file?.name ?? "Unnamed"));
let startBalance = Array.from(accounts.map(p => Number(p.balance ?? 0))).reduce((a,b)=>a+b, 0);

// NEXT INCOME — nearest income on/after today
// Assumes income pages have: tags: [income], date: YYYY-MM-DD, label, amount (number)
let incomesAll = dv.pages('#income').where(p => p.date && typeof p.amount === "number");
let upcoming = Array.from(incomesAll
  .where(p => window.moment(p.date).isSameOrAfter(today, 'day'))
  .sort(p => window.moment(p.date).valueOf())
);

let nextIncome = upcoming[0];
let nextIncomeDate = nextIncome ? window.moment(nextIncome.date) : null;
let nextIncomeLabel = nextIncome?.label ?? (nextIncome?.file?.link ?? "—");

// RENDER
dv.list([
  `**today:** ${today.format("YYYY-MM-DD")}`,
  `**Horizon (next income):** ${nextIncomeDate ? nextIncomeDate.format("YYYY-MM-DD") : "—"} — ${nextIncomeLabel}`,
  `**Start Balance:** $${Number(startBalance).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})} — ${accountNames.join(" + ") || "No accounts flagged include_in_pcb"}`
]);
```
