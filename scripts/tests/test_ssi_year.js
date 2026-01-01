// scripts/test_ssi_year.js
const s = require('../../lib/schedule');

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function monthName(i) {
  return [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][i];
}

// SSI model (your design): 2nd, 3rd, 4th Wednesday each month
function ssiDatesForMonth(year, monthIndex) {
  return [2, 4].map((n) =>
    s.nthWeekdayOfMonth(year, monthIndex, s.WDAY.wed, n)
  );
}

const year = Number(process.argv[2] ?? 2026);
console.log(`SSI dates for ${year} (2nd & 4th Wednesday):\n`);

for (let m = 0; m < 12; m++) {
  const dates = ssiDatesForMonth(year, m);
  const doms = dates.map((d) => d.getDate());
  const okRange = doms.every((dd) => dd >= 8 && dd <= 28); // loose sanity
  console.log(
    `${monthName(m)}: ${dates.map(fmt).join(', ')}  | days: ${doms.join(', ')}${
      okRange ? '' : '  ⚠️'
    }`
  );
}
