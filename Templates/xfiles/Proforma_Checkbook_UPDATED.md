---
template: Proforma_Checkbook
title: Proforma Checkbook (Income-Aware)
debug: true

# Starting cash: set explicitly or leave blank to compute from Accounts base
starting_cash:
starting_account_page: Accounts/USBank
base: Bases/accounts.base

# Window
window_days: 45
as_of:           # optional ISO date; default = today

# Ordering (when dates match)
inflows_first: true

# Tags
income_tags: [income]
bill_tags: [bill]
debt_tags: [debt, creditCard, loan]

# Field names (override if needed)
fields:
  amount: amount
  payee: payee
  due_days: due_days
  due_amounts: due_amounts
  amount_paid: amount_paid
  amount_paid_date: amount_paid_date
  next_payment_date: next_payment_date
  next_payment_amount_due: next_payment_amount_due
  as_of: as_of

  # Income-specific
  date_of_deposit: date_of_deposit
  deposit_to: deposit_to
  source: source
  schedule: schedule
  deposit_days: deposit_days
  deposit_amounts: deposit_amounts
  next_deposit_date: next_deposit_date
  next_deposit_amount: next_deposit_amount
---

# Proforma Checkbook — Income Streams Included

This version projects **income streams** into the ledger. Supported income schemas:
- `deposit_days: [2, 16]` + `deposit_amounts: [500, 200]`
- (alias) `pay_days[]` + `pay_amounts[]`
- `next_deposit_date` / `next_deposit_amount`
- `next_payment_date` / `next_payment_amount_due` (compat)
- a single future `date_of_deposit`

---

## Accounts

- USBank → [[Accounts/USBank]]

```dataviewjs
const acct = dv.page("Accounts/USBank");
if (!acct) {
  dv.paragraph("⚠️ USBank account not found.");
} else {
  const bal = Number(acct.current_balance ?? acct.balance ?? 0);
  const asOf = acct.as_of ?? "unknown date";
  dv.paragraph(`**USBank balance:** $${bal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`);
  dv.paragraph(`*as of ${asOf}*`);
}
```

---

## Next N Days (with running balance)

```dataviewjs
/* Proforma Checkbook – v3.6 income-aware */

// ---------- helpers ----------
const CFG = dv.current();
const F = (k, alt=null) => (CFG.fields && CFG.fields[k] !== undefined) ? CFG.fields[k] : alt;
const $N = x => Number(x ?? 0);
const cur = x => $N(x).toLocaleString("en-US",{style:"currency",currency:"USD"});
const asLink = p => p?.file?.link ?? "⚠️";
const Debug = CFG.debug ?? false;

const today = window.moment();
const AS_OF = CFG.as_of ? window.moment(CFG.as_of) : today;
const END = window.moment(AS_OF).add(Number(CFG.window_days ?? 45), "days");
let beginCash = CFG.starting_cash;
if (beginCash == null || beginCash === "") {
  // first preference: a specific starting account page (e.g. Accounts/USBank)
  const acctPath = CFG.starting_account_page ?? "Accounts/USBank";
  const acctPage = dv.page(acctPath);
  if (acctPage) {
    beginCash = $N(acctPage.current_balance ?? acctPage.balance ?? acctPage.starting_balance ?? acctPage.amount);
  }
}
if (beginCash == null || beginCash === "") {
  // fallback: compute from base accounts
  const BASE = CFG.base ?? "Bases/accounts.base";
  let pageset;
  const basePage = dv.page(BASE);
  if (basePage?.accounts_query && typeof basePage.accounts_query === "string") {
    try { pageset = dv.pages(basePage.accounts_query); } catch(e) { if (Debug) dv.paragraph(`⚠️ base query failed: ${e}`); }
  }
  if (!pageset) pageset = dv.pages("#account").where(p => !(p.file?.etags ?? []).includes("stock"));
  beginCash = Array.from(pageset ?? []).reduce((s,p)=> s + $N(p.balance ?? p.starting_balance ?? p.amount), 0);
}
beginCash = Number(beginCash.toFixed(2));

// tag helpers
const joinTags = (tags=[]) => tags.map(t=>`#${t}`).join(" OR ");

// ---------- date helpers ----------
function buildMonthDatesFromDays(baseMoment, days) {
  const out = [];
  for (const d of (days || [])) {
    const m = window.moment(baseMoment).date(Number(d));
    if (m.isValid()) out.push(m);
  }
  return out.sort((a,b)=>a.valueOf()-b.valueOf());
}

function listOccurrencesByDays(baseAsOf, days, amounts) {
  const out = [];
  if (!Array.isArray(days) || days.length === 0) return out;
  for (let m = 0; m < 2; m++) {
    const base = window.moment(baseAsOf).add(m, "months");
    const dates = buildMonthDatesFromDays(base, days);
    dates.forEach((d, idxInMonth) => {
      if (d.isSameOrAfter(AS_OF) && d.isBefore(END)) {
        const ai = (idxInMonth % (amounts?.length || 1));
        const amt = $N((amounts && amounts.length) ? amounts[ai] : 0);
        out.push({date:d, amount:amt});
      }
    });
  }
  return out.sort((a,b)=>a.date.valueOf()-b.date.valueOf());
}

// ---------- collect rows ----------
let rows = [];

// Bills
for (const p of dv.pages(joinTags(CFG.bill_tags ?? ["bill"]))) {
  const due_days = p[F("due_days","due_days")];
  if (Array.isArray(due_days) && due_days.length) {
    const occs = listOccurrencesByDays(AS_OF, due_days, p[F("due_amounts","due_amounts")] );
    for (const o of occs) rows.push({date:o.date, type:"Bill", item:asLink(p), delta:-Math.abs($N(o.amount))});
  } else {
    // fallback to single next date
    const nd = p[F("next_payment_date","next_payment_date")] ? window.moment(p[F("next_payment_date","next_payment_date")]) : null;
    if (nd && nd.isSameOrAfter(AS_OF) && nd.isBefore(END)) {
      rows.push({date:nd, type:"Bill", item:asLink(p), delta:-Math.abs($N(p[F("amount","amount")]))});
    }
  }
}

// Debts
for (const p of dv.pages(joinTags(CFG.debt_tags ?? ["debt","creditCard","loan"]))) {
  const due_days = p[F("due_days","due_days")];
  let occs = [];
  if (Array.isArray(due_days) && due_days.length) {
    occs = listOccurrencesByDays(AS_OF, due_days, p[F("due_amounts","due_amounts")]);
  } else {
    const nd = p[F("next_payment_date","next_payment_date")] ? window.moment(p[F("next_payment_date","next_payment_date")]) : null;
    const amt = $N(p[F("next_payment_amount_due","next_payment_amount_due")] ?? p[F("amount","amount")] ?? p.payment);
    if (nd && nd.isSameOrAfter(AS_OF) && nd.isBefore(END) && amt) occs = [{date:nd, amount:amt}];
  }
  // apply one-off payment if present to first upcoming occurrence
  const paid = $N(p[F("amount_paid","amount_paid")]);
  const paidDateRaw = p[F("amount_paid_date","amount_paid_date")];
  const paidDate = paidDateRaw ? window.moment(paidDateRaw) : null;
  if (paid && paidDate?.isValid() && occs.length) {
    const first = occs[0];
    if (!paidDate.isAfter(first.date) && !paidDate.isBefore(window.moment(first.date).subtract(35,'days'))) {
      const residual = Math.max(0, $N(first.amount) - paid);
      if (residual === 0) occs = occs.slice(1);
      else occs = [{...first, amount:residual}, ...occs.slice(1)];
    }
  }
  for (const o of occs) rows.push({date:o.date, type:"Debt", item:asLink(p), delta:-Math.abs($N(o.amount))});
}

// Incomes
const IN_TAGS = joinTags(CFG.income_tags ?? ["income"]);
for (const p of dv.pages(IN_TAGS)) {
  const dep_days = p[F("deposit_days","deposit_days")] ?? p.pay_days;
  const dep_amts = p[F("deposit_amounts","deposit_amounts")] ?? p.pay_amounts;
  let occs = [];

  if (Array.isArray(dep_days) && dep_days.length) {
    occs = listOccurrencesByDays(AS_OF, dep_days, dep_amts);
  } else {
    // explicit next date forms
    const nd = p[F("next_deposit_date","next_deposit_date")] || p[F("next_payment_date","next_payment_date")] || p[F("as_of","as_of")] || p[F("date_of_deposit","date_of_deposit")];
    const d = nd ? window.moment(nd) : null;
    const amt = $N(p[F("next_deposit_amount","next_deposit_amount")] ?? p[F("next_payment_amount_due","next_payment_amount_due")] ?? p[F("amount","amount")] ?? p.expected);
    if (d && d.isValid() && d.isSameOrAfter(AS_OF) && d.isBefore(END) && amt) occs = [{date:d, amount:amt}];
  }

  for (const o of occs) rows.push({date:o.date, type:"Income", item:asLink(p), delta:Math.abs($N(o.amount))});
}

// ---------- sort & render ----------
rows = rows.filter(r => r.date && r.date.isSameOrAfter(AS_OF) && r.date.isBefore(END));

rows.sort((a,b) => {
  const da = a.date.valueOf(), db = b.date.valueOf();
  if (da !== db) return da - db;
  // same-day ordering
  if (CFG.inflows_first) {
    if (a.type === "Income" && b.type !== "Income") return -1;
    if (b.type === "Income" && a.type !== "Income") return 1;
  } else {
    if (a.type !== "Income" && b.type === "Income") return -1;
    if (b.type !== "Income" && a.type === "Income") return 1;
  }
  return 0;
});

let running = beginCash;
const table = rows.map(r => {
  running = Number((running + r.delta).toFixed(2));
  return [r.date.format("MMM D"), r.type, r.item, cur(r.delta), cur(running)];
});

dv.header(3, `Today's Cash: ${cur(beginCash)} • Window: ${AS_OF.format("MMM D")} → ${END.format("MMM D")}`);
if (table.length) dv.table(["Date","Type","Item","Δ","Balance"], table);
else dv.paragraph("No items in window.");

// Totals
const inflow  = rows.filter(r=>r.delta>0).reduce((s,r)=> s + r.delta, 0);
const outflow = -rows.filter(r=>r.delta<0).reduce((s,r)=> s + r.delta, 0);
dv.paragraph(`**Totals — In:** ${cur(inflow)} &nbsp;&nbsp; **Out:** ${cur(outflow)} &nbsp;&nbsp; **Projected:** ${cur(running)}`);
```
