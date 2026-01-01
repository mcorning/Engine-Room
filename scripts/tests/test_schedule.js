// test_schedule.js

// instantiate the schedule API
const s = require('../../lib/schedule');

function fmt(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

// Sanity check: 2nd Wednesday Jan 2026
const d = s.nthWeekdayOfMonth(2026, 0, s.WDAY.wed, 2);
console.log('2nd Wed Jan 2026:', fmt(d));

// Token test
const token = s.parseScheduleToken('2nd_wed');
console.log('Parsed token:', token);

// bankDateFor test (single-date API)
const ssiRow = { schedule: '2nd_wed' };
console.log('bankDateFor Jan 2026:', fmt(s.bankDateFor(ssiRow, 2026, 0)));
console.log(
  '2nd Wed Jan 2026:',
  s.nthWeekdayOfMonth(2026, 0, s.WDAY.wed, 2)?.toISOString().slice(0, 10)
);
console.log(
  '4th Wed Jan 2026:',
  s.nthWeekdayOfMonth(2026, 0, s.WDAY.wed, 4)?.toISOString().slice(0, 10)
);