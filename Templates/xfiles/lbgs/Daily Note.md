```dataviewjs
/* Cash runway until SSI (NP as_of today + Katy 2nd Wed + Mike 2nd Wed + Michael on 24th) */

// ===== knobs =====
const CHECKING_PAGE = "Accounts/US Bank";
const INCOME_DIR = '"Engine Room/Income"';
const DEBT_DIR   = '"Engine Room/Debts"';
const BILLS_DIR  = '"Engine Room/Bills"';

const SSI_MATCH    = /ssi|social\s*security/i;
const NP_MATCHES   = [/^nuprime$/i, /^sonic\s*unity$/i, /^ssc$/i];
const KATY_MATCH   = /^katy$/i;
const MIKE_MATCH   = /(mike\s*room|mike\s*board)/i;
const MICHAEL_MATCH= /^michael$/i;           // <-- NEW

const MIN_STOCK_DEPOSIT = 1000;
// =================

const m = window.moment, n = x => Number(x ?? 0);
const cur = x => n(x).toLocaleString("en-US",{style:"currency",currency:"USD"});

const today = dv.current().file.day ? m(dv.current().file.day) : m();
const start = m(today).add(1, "month").startOf("month");
const end   = m(start).endOf("month");
const ym    = start.format("YYYY-MM");

const isNP   = name => NP_MATCHES.some(rx => rx.test(name ?? ""));
const isKaty = name => KATY_MATCH.test(name ?? "");
const isMike = name => MIKE_MATCH.test(name ?? "");
const isMichael = name => MICHAEL_MATCH.test(name ?? "");

function secondWednesdayOfMonth(monthStart){
  let firstWed = monthStart.clone().isoWeekday(3);
  if (firstWed.month() !== monthStart.month()) firstWed.add(1, "week");
  return firstWed.add(1, "week");
}
function latestAmountFor(rx, list){
  const mrec = list.filter(i => rx.test(i.name)).sort((a,b)=>b.date-a.date)[0];
  return n(mrec?.amt || 0);
}

// 1) start balance
let balance = n(dv.page(CHECKING_PAGE)?.balance || 0);

// 2) incomes (normalized)
let incomesAll = dv.pages(INCOME_DIR)
  .where(p => p.amount && p.as_of)
  .map(p => ({ name: p.file?.name ?? "", amt: n(p.amount), date: m(p.as_of) }))
  .array();

const ssi = incomesAll
  .filter(i => i.date.isSame(start,"month") && SSI_MATCH.test(i.name))
  .sort((a,b)=>a.date-b.date)[0];

let events = [];

// 3) NP as_of today → credit now
let todaysNP = incomesAll.filter(i => isNP(i.name) && i.date.isSame(today,"day") && i.amt>0);
if (todaysNP.length){
  todaysNP.forEach(i => events.push({date: today.clone(), kind:"Income",
    name:`${i.name} (as_of ${i.date.format("MMM D")})`, delta:+i.amt}));
}

// 4) Katy + Mike on 2nd Wednesday
const secondWed = secondWednesdayOfMonth(start.clone());
const katyAmt = latestAmountFor(KATY_MATCH, incomesAll);
if (katyAmt>0) events.push({date: secondWed.clone(), kind:"Income", name:"Katy (2nd Wed)", delta:+katyAmt});
const mikeAmt = latestAmountFor(MIKE_MATCH, incomesAll);
if (mikeAmt>0) events.push({date: secondWed.clone(), kind:"Income", name:"Mike (2nd Wed)", delta:+mikeAmt});

// 5) Michael on the 24th (fixed date)
const michaelAmt = latestAmountFor(MICHAEL_MATCH, incomesAll);
if (michaelAmt>0) {
  events.push({date: m(`${ym}-24`), kind:"Income", name:"Michael (4th Wed)", delta:+michaelAmt});
}

// 6) other incomes actually in target month (exclude SSI, Katy, Mike, Michael)
const otherMonthIncomes = incomesAll
  .filter(i =>
    i.date.isSame(start,"month") &&
    !SSI_MATCH.test(i.name) && !isKaty(i.name) && !isMike(i.name) && !isMichael(i.name) &&
    i.amt>0
  )
  .map(i => ({date:i.date, kind:"Income", name:i.name, delta:+i.amt}));
events.push(...otherMonthIncomes);

// 7) debits
function expandDue(p, kind){
  const amt=n(p.amount);
  const days=Array.isArray(p.due_days)?p.due_days:(p.due_day?[p.due_day]:[]);
  return days.map(d=>({date:m(`${ym}-${String(d).padStart(2,"0")}`), kind, name:p.file?.name ?? "❓", delta:-amt}));
}
const debits = [
  ...dv.pages(BILLS_DIR).where(p=>p.amount&&(p.due_days||p.due_day)).array().flatMap(p=>expandDue(p,"Bill")),
  ...dv.pages(DEBT_DIR ).where(p=>p.amount&&(p.due_days||p.due_day)).array().flatMap(p=>expandDue(p,"Debt")),
].filter(e=>e.date.isSame(start,"month"));
events.push(...debits);

// 8) order: credits before debits same day
events = events.sort((a,b)=>(a.date-b.date)||(b.delta-a.delta));

dv.header(2, `${start.format("YYYY-MM")} — Cash runway until SSI`);
dv.paragraph(`Today's Cash: ${cur(balance)} •  2nd Wed: ${secondWed.format("MMM D")} • 4th Wed: ${m(`${ym}-24`).format("MMM D")}`);

let injections=0, injectedTotal=0;
const rows=[];
for (const e of events){
  const pre = balance;
    balance += e.delta;
  if (balance < 0){
    const needed = -balance, deposit = Math.max(MIN_STOCK_DEPOSIT, needed);
    injections++; injectedTotal += deposit;
    rows.push([e.date.format("MMM D"), e.kind, e.name, e.delta>=0?cur(e.delta):`-${cur(-e.delta)}`, cur(pre+e.delta)]);
    balance += deposit;
    rows.push([e.date.format("MMM D"), "Stock", "Stock deposit", cur(deposit), cur(balance)]);
  } else {
    rows.push([e.date.format("MMM D"), e.kind, e.name, e.delta>=0?cur(e.delta):`-${cur(-e.delta)}`, cur(balance)]);
  }
}

dv.table(["Date","Type","Item","Δ","Balance"], rows);
dv.paragraph(`Final balance before SSI: ${cur(balance)} • Stock injections: ${injections} • Total injected: ${cur(injectedTotal)}`);


```
> [!NOTE] Use
> Track how each day changes the movement of cash based on the dynamics of your personal financial system.

