// schedule.js — Node/VSCode port of DVJS scheduling helpers (canonical semantics)
// Semantics source: dvjs_helpers.md

const WDAY = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };

// monthIndex is 0-based: 0=Jan ... 11=Dec
function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  if (!(nth >= 1 && nth <= 5)) throw new Error(`nth out of range: ${nth}`);
  const d = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + (nth - 1) * 7);
  return d;
}

function parseScheduleToken(s) {
  if (!s || typeof s !== 'string') return null;

  const mWed = s.match(/^([1-5])(st|nd|rd|th)_wed$/i);
  if (mWed) return { kind: 'nth_wed', nth: Number(mWed[1]) };

  const mWk = s.match(/^([1-5])(st|nd|rd|th)_week$/i);
  if (mWk) return { kind: 'nth_week', nth: Number(mWk[1]) };

  return null;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bankDateFor(row, year, monthIndex) {
  // Allow bankDateFor(date) convenience (used by template stubs/tests)
  if (row instanceof Date && !Number.isNaN(row.getTime())) return row;
  if (typeof row === 'string') {
    const d = toDate(row);
    if (d) return d;
  }

  const dod = toDate(row?.date_of_deposit);
  if (dod) return dod;

  const token = parseScheduleToken(String(row?.schedule || ''));
  if (!token) return null;

  if (token.kind === 'nth_wed') {
    return nthWeekdayOfMonth(year, monthIndex, WDAY.wed, token.nth);
  }
  if (token.kind === 'nth_week') {
    // placeholder Wednesday, purely illustrative (matches DVJS intent)
    return nthWeekdayOfMonth(year, monthIndex, WDAY.wed, token.nth);
  }
  return null;
}
module.exports = {
  WDAY,
  nthWeekdayOfMonth,
  parseScheduleToken,
  bankDateFor,
};

