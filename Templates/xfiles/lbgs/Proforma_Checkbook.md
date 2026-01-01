---
title: Proforma Checkbook — Cash vs Income (v4b)
template: Proforma_Checkbook
debug: true
base: "[[accounts.base]]"
starting_cash:
---

> [!NOTE] Starting Cash
> This page should automatically sum all cash balances and renders the value in starting_cash above.

# Proforma Checkbook — Cash vs Income (v4b)

- **Tier A (Cash):** current balances in Accounts (`#account/*`) → sums to `starting_cash`.
- **Tier B/C (Expected Inflows):** `#income/*` items not yet deposited or scheduled in the future.
- **No double counting:** deposited income that hits tracked accounts is not listed as expected inflow.
- Optional MetaEdit write for `starting_cash` is idempotent and guarded (no flash loop).

---

## Tier A — Account Balances (Bases-style filter) + Optional YAML Update

```dataviewjs
/***** SETTINGS *****/
const WANT_INCOME = 'income';              // tag family for free-form income notes
const INCOME_FOLDERS = null;               // e.g. '"Engine Room/Income"' or null to scan vault
const KNOWN_CASH_ACCOUNTS = new Set(['SSC Checking','US Bank','PayPal','Stripe','Swipe','MidOregon','First Tech']);

/* === FIXED INCOME CONFIG (edit these amounts) ========================== */
const AMT_MICHAEL_SSI = 0;   // <-- set your SSI amount
const AMT_KATY_SSI    = 0;   // <-- set Katy's SSI amount
const AMT_MIKE        = 0;   // <-- set Mike's per-week contribution (each of two weeks)
/* ====================================================================== */

/***** Helpers *****/
function normTags(p){ return (p.file?.tags ?? []).map(t=>String(t).toLowerCase().replace(/^#/,'')); }
const num = v => Number.isFinite(+v) ? +v : 0;
const getStart = () => {
  const d = dv.current().file?.day;
  return d ? window.moment(d.toString()).startOf('day') : window.moment().startOf('day');
};
function extractWikilinkTitle(s){
  if (typeof s !== 'string') return null;
  const m = s.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  return m ? m[1] : s;
}
function isDeposited(p){
  const st = String(p.status ?? '').toLowerCase();
  return st === 'deposited' || st === 'cleared' || st === 'posted';
}

/***** Date rules for fixed items *****/
// weekday: 0=Sun ... 3=Wed ... 6=Sat
function nthWeekdayOfMonth(year, monthIndex, weekday, nth){
  let d = window.moment({year, month: monthIndex, day: 1});
  // move to first desired weekday
  while (d.day() !== weekday) d.add(1,'day');
  d.add((nth-1)*7, 'day');
  return d;
}

// first and second Wednesday helpers
const wednesday = 3;
const secondWednesday = (y,m)=>nthWeekdayOfMonth(y,m,wednesday,2);
const fourthWednesday = (y,m)=>nthWeekdayOfMonth(y,m,wednesday,4);

// Given a rule fn(year,month) -> moment, yield next occurrences >= start across a lookahead window
function occurrencesFrom(start, ruleFn, lookaheadMonths=2){
  const out=[];
  let d = start.clone().startOf('month');
  for(let i=0;i<=lookaheadMonths;i++){
    const y = d.year(), m = d.month();
    const when = ruleFn(y,m);
    if (when.isSameOrAfter(start,'day')) out.push(when);
    d.add(1,'month');
  }
  return out;
}

/***** Build FIXED incomes relative to chosen start date *****/
const start = getStart();

// Michael SSI: 4th Wednesday
const michaelSSIOcc = occurrencesFrom(start, (y,m)=>fourthWednesday(y,m), 2)
  .map(dt => ({
    _kind: 'fixed',
    _name: 'Michael SSI',
    as_of: dt,
    amount: AMT_MICHAEL_SSI,
    deposit_to: '[[SSC Checking]]',
    tag: 'income/ssi/michael'
  }));

// Katy SSI: 2nd Wednesday
const katySSIOcc = occurrencesFrom(start, (y,m)=>secondWednesday(y,m), 2)
  .map(dt => ({
    _kind: 'fixed',
    _name: 'Katy SSI',
    as_of: dt,
    amount: AMT_KATY_SSI,
    deposit_to: '[[SSC Checking]]',
    tag: 'income/ssi/katy'
  }));

// Mike contributions: week 1 & week 2 Wednesdays of each month (tweak if you change his pattern)
function firstWednesday(y,m){ return nthWeekdayOfMonth(y,m,wednesday,1); }
function secondWed(y,m){ return nthWeekdayOfMonth(y,m,wednesday,2); }
const mikeOcc = occurrencesFrom(start, (y,m)=>firstWednesday(y,m), 2)
  .concat(occurrencesFrom(start, (y,m)=>secondWed(y,m), 2))
  .sort((a,b)=>+a-+b)
  .map(dt => ({
    _kind: 'fixed',
    _name: 'Mike contribution',
    as_of: dt,
    amount: AMT_MIKE,
    deposit_to: '[[SSC Checking]]',
    tag: 'income/mike'
  }));

const fixedIncomes = [...michaelSSIOcc, ...katySSIOcc, ...mikeOcc];

/***** Pull “free-form” income pages from the vault (your existing notes) *****/
let incomePages = (INCOME_FOLDERS ? dv.pages(INCOME_FOLDERS) : dv.pages())
  .where(p => normTags(p).some(t => t === WANT_INCOME || t.startsWith(WANT_INCOME + '/')))
  .array();

/***** Partition expected vs ignore for free-form pages *****/
let expected = [];
let ignored  = [];
for (const p of incomePages) {
  const amount = num(p.amount);
  const as_of  = p.as_of ? window.moment(p.as_of) : null;
  const depositToName = extractWikilinkTitle(p.deposit_to ?? '');
  const hitsKnownAccount = depositToName ? KNOWN_CASH_ACCOUNTS.has(depositToName) : false;

  // Ignore if already deposited to a known cash account before the start date
  if (isDeposited(p) && hitsKnownAccount && as_of && as_of.isBefore(start, 'day')) {
    ignored.push(p);
    continue;
  }
  const qualifiesFuture = (as_of ? !as_of.isBefore(start, 'day') : true);
  if (!isDeposited(p) && qualifiesFuture) {
    expected.push(p);
  } else if (isDeposited(p) && hitsKnownAccount && qualifiesFuture) {
    expected.push(p);
  } else {
    ignored.push(p);
  }
}

/***** Merge FIXED + FREE-FORM, sort, render *****/
const merged = expected
  .map(p => ({
    _kind: 'page',
    link: p.file?.link,
    name: p.source ?? p.title ?? p.file?.name ?? '—',
    as_of: p.as_of ? window.moment(p.as_of) : null,
    amount: num(p.amount),
    deposit_to: p.deposit_to ?? '—',
    tag: (normTags(p).find(t => t.startsWith('income/')) ?? 'income')
  }))
  .concat(fixedIncomes)
  // keep only items on/after start date (defensive guard for any nulls)
  .filter(x => x.as_of && !x.as_of.isBefore(start, 'day'))
  .sort((a,b) => +a.as_of - +b.as_of);

if (merged.length === 0){
  dv.paragraph('🛈 No expected inflows after the chosen start date.');
} else {
  const rows = merged.map(x => {
    const when = x.as_of ? x.as_of.format('MMM D') : '—';
    const dep  = extractWikilinkTitle(x.deposit_to ?? '') ?? '—';
    if (x._kind === 'page'){
      return [x.link ?? x.name, x.name, when, num(x.amount), dep, x.tag];
    } else { // fixed
      return [x._name, x._name, when, num(x.amount), dep, x.tag];
    }
  });
  dv.table(['Page / Source','Source','As of','Amount','Deposit To','Tag'], rows);
  const total = merged.reduce((a,x)=>a+num(x.amount),0);
  dv.paragraph('**Expected inflows total:** ' + total.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}));
}

```
