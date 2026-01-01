```dataviewjs
// in helpers
const WDAY = {sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6};

function nthWeekdayOfMonth(year, monthIndex, weekday, nth){
  let d = window.moment({year, month: monthIndex, day:1});
  while (d.day() !== weekday) d.add(1,'day');
  d.add((nth-1)*7,'day');
  return d;
}

function parseScheduleToken(s){
  if (!s || typeof s !== 'string') return null;
  const mWed = s.match(/^([1-5])(st|nd|rd|th)_wed$/i);
  if (mWed) return {kind:'nth_wed', nth: Number(mWed[1])};
  const mWk = s.match(/^([1-5])(st|nd|rd|th)_week$/i);
  if (mWk) return {kind:'nth_week', nth: Number(mWk[1])};
  return null;
}

// choose a display weekday for variable week placeholders (keeps visuals tidy)
const PLACEHOLDER_WEEKDAY = WDAY.wed;

// Return the bank date for a row, preferring date_of_deposit.
// If absent, compute from schedule as described above.
function bankDateFor(row, monthMoment){
  const dod = row.date_of_deposit ? window.moment(row.date_of_deposit) : null;
  if (dod?.isValid()) return dod;

  const token = parseScheduleToken(String(row.schedule||''));
  if (!token || !monthMoment) return null;

  const y = monthMoment.year(), m = monthMoment.month();
  if (token.kind === 'nth_wed'){
    return nthWeekdayOfMonth(y, m, WDAY.wed, token.nth);
  }
  if (token.kind === 'nth_week'){
    // take the nth Wednesday of the month as a placeholder (purely illustrative)
    return nthWeekdayOfMonth(y, m, PLACEHOLDER_WEEKDAY, token.nth);
  }
  return null;
}

```
```dataviewjs
/***** DVJS COMPONENT: helpers (embed this or keep copy-pasted in each block) *****/
function normTags(p){ return (p.file?.tags ?? []).map(t=>String(t).toLowerCase().replace(/^#/,'')); }
const num = v => Number.isFinite(+v) ? +v : 0;
const asMoment = v => v ? window.moment(v) : null;
function linkOrName(p){ return p.file?.link ?? (p.title ?? p.file?.name ?? '—'); }
function wlTitle(s){
  if (typeof s !== 'string') return null;
  const m = s.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  return m ? m[1] : s;
}
function fmtUSD(n){ return Number(n ?? 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
function safe(p, k, d='—'){ return (p?.[k] ?? d); }
function isDeposited(p){
  const st = String(p.status ?? '').toLowerCase();
  return st === 'deposited' || st === 'cleared' || st === 'posted';
}
const startDate = (()=>{
  const d = dv.current().file?.day;
  return d ? window.moment(d.toString()).startOf('day') : window.moment().startOf('day');
})();
```
