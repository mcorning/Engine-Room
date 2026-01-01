---
template: Proforma_Checkbook
debug: true
# Link to your Accounts base (or change to your path)
base: Bases/accounts.base

# Optional tag controls (defaults shown)
income_tags: [income]
bill_tags: [bill]
debt_tags: [debt, loan, creditCard]

# Field names (override here if your schema differs)
fields:
  amount: amount
  date_of_deposit: date_of_deposit   # income
  deposit_to: deposit_to             # income
  source: source                     # income
  schedule: schedule                 # income
  dueDay: dueDay                     # bills
  payee: payee                       # bills
  apr: apr                           # debts (optional)
  minimum: minimum                   # debts (optional)
---

# Proforma Checkbook — Starter Pack

This single file gives you four drop‑in DataviewJS blocks you can copy into any note.  
It is **defensive** (Bug Protocol‑ready) and writes `starting_cash` back to YAML when possible.

---

## 1) Starting Cash — probe + YAML write

```dataviewjs
const Debug = dv.current().debug ?? false;

// 1) Resolve base link / path
const BASE = dv.current().base ?? "Bases/accounts.base";
const F = dv.current().fields ?? {};
const money = (v) => Number(v ?? 0);
const fmt = (v) => money(v).toLocaleString(undefined, { style: "currency", currency: "USD" });

// 2) If the base page provides a query, honor it; else fallback to tags
//    You can optionally add 'accounts_query: "tag=account -tag=stock"' to the base's YAML.
let basePage = dv.page(BASE);
let query = basePage?.accounts_query;

// Defensive: build a pageset
let pageset;
if (query && typeof query === "string") {
  try {
    pageset = dv.pages(query);
  } catch (e) {
    if (Debug) dv.paragraph(`⚠️ Query on base failed: ${e}`);
  }
}

// Fallback: tag=account -tag=stock
if (!pageset) pageset = dv.pages("#account").where(p => !(p.file?.etags ?? []).includes("stock"));

// Defensive array-ization
let rows = Array.from(pageset ?? []).map(p => ({
  link: p.file?.link ?? p.file?.path ?? "⚠️",
  balance: money(p.balance ?? p.starting_balance ?? p.amount ?? 0)
}));

const total = rows.reduce((s, r) => s + money(r.balance), 0);

// 3) Render
dv.header(4, "Computed starting cash");
dv.paragraph(`💰 **${fmt(total)}**`);

if (Debug) {
  dv.table(["Account", "Balance"], rows.map(r => [r.link, fmt(r.balance)]));
}

// 4) Write back to YAML via MetaEdit if present
try {
  const plugin = app?.plugins?.plugins?.["metaedit"];
  if (plugin?.api?.update) {
    await plugin.api.update("starting_cash", Number(total.toFixed(2)));
    dv.paragraph(`✅ Wrote \`starting_cash: ${total.toFixed(2)}\` to YAML.`);
  } else {
    dv.paragraph("ℹ️ MetaEdit not available — showing computed value only.");
  }
} catch (e) {
  dv.paragraph(`⚠️ Could not write starting_cash to YAML: ${e}`);
}
```
---

## 2) Income — upcoming / recent listing (defensive)

```dataviewjs
const F = dv.current().fields ?? {};
const field = (k, alt) => F[k] ?? alt;

const AMT = field("amount", "amount");
const DOD = field("date_of_deposit", "date_of_deposit");
const TO  = field("deposit_to", "deposit_to");
const SRC = field("source", "source");
const SCH = field("schedule", "schedule");

const tags = (dv.current().income_tags ?? ["income"]).map(t => `#${t}`);
let pages = dv.pages(tags.join(" OR "));

// Normalize to array and coerce
let rows = Array.from(pages).map(p => {
  const amt = Number(p[AMT] ?? 0);
  const dateRaw = p[DOD];
  const date = moment.isMoment(dateRaw) ? dateRaw : (dateRaw ? window.moment(dateRaw) : null);
  return {
    page: p.file?.link ?? "⚠️",
    amount: amt,
    deposited: date,
    to: p[TO] ?? "",
    source: p[SRC] ?? "",
    schedule: p[SCH] ?? ""
  };
});

// Sort by deposited date (desc with nulls last)
rows.sort((a, b) => {
  const ax = a.deposited ? a.deposited.valueOf() : -Infinity;
  const bx = b.deposited ? b.deposited.valueOf() : -Infinity;
  return bx - ax;
});

const fmt = (n) => Number(n ?? 0).toLocaleString(undefined, {style:"currency", currency:"USD"});

dv.table(
  ["Page", "amount", "deposited", "to", "source", "schedule"],
  rows.map(r => [
    r.page,
    fmt(r.amount),
    r.deposited ? r.deposited.format("YYYY‑MM‑DD") : "—",
    r.to || "—",
    r.source || "—",
    r.schedule || "—"
  ])
);

const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
dv.paragraph(`**Income total (listed rows):** ${fmt(total)}`);
```

---

## 3) Bills — classic by due day

```dataviewjs
const F = dv.current().fields ?? {};
const field = (k, alt) => F[k] ?? alt;

const AMT = field("amount", "amount");
const DUE = field("dueDay", "dueDay");
const PAY = field("payee", "payee");

const tags = (dv.current().bill_tags ?? ["bill"]).map(t => `#${t}`);
let pages = dv.pages(tags.join(" OR ")).where(p => p[DUE] != null && p[AMT] != null);

let rows = Array.from(pages).map(p => ({
  page: p.file?.link ?? "⚠️",
  dueDay: Number(p[DUE]),
  amount: Number(p[AMT]),
  payee: p[PAY] ?? ""
}));

rows.sort((a,b) => a.dueDay - b.dueDay);

const fmt = (n) => Number(n ?? 0).toLocaleString(undefined, {style:"currency", currency:"USD"});
dv.table(["due", "payee", "amount", "page"],
  rows.map(r => [r.dueDay, r.payee || "—", fmt(r.amount), r.page]));

const total = rows.reduce((s,r)=> s + Number(r.amount ?? 0), 0);
dv.paragraph(`**Bills total (listed rows):** ${fmt(total)}`);
```

---

## 4) Debt Service — snapshot

```dataviewjs
const F = dv.current().fields ?? {};
const field = (k, alt) => F[k] ?? alt;

const AMT = field("amount", "amount");
const MIN = field("minimum", "minimum");
const APR = field("apr", "apr");

const tags = (dv.current().debt_tags ?? ["debt","loan","creditCard"]).map(t => `#${t}`);
let pages = dv.pages(tags.join(" OR "));

let rows = Array.from(pages).map(p => ({
  page: p.file?.link ?? "⚠️",
  amount: Number(p[AMT] ?? 0),
  minimum: Number(p[MIN] ?? 0),
  apr: Number(p[APR] ?? 0)
}));

const fmt = (n) => Number(n ?? 0).toLocaleString(undefined, {style:"currency", currency:"USD"});
dv.table(["Page","balance","minimum","apr%"],
  rows.map(r => [r.page, fmt(r.amount), fmt(r.minimum), (r.apr || 0).toFixed(2)]));

const bal = rows.reduce((s,r)=> s + Number(r.amount ?? 0), 0);
const min = rows.reduce((s,r)=> s + Number(r.minimum ?? 0), 0);
dv.paragraph(`**Debt totals — balance:** ${fmt(bal)} &nbsp;&nbsp; **minimums:** ${fmt(min)}`);
```
