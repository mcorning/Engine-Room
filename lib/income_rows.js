/**
 * Engine Room/lib/income_rows.js
 * Patched: emit rows across [from..to] multi-month horizon
 */

const fs = require('fs');
const path = require('path');

/* ---------- Frontmatter parsing (simple) ---------- */
function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return {};
  const body = m[1];

  const out = {};
  const lines = body.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)\s*$/);
    if (!kv) {
      i++;
      continue;
    }

    const key = kv[1];
    let val = kv[2];

    if (val === '') {
      const arr = [];
      i++;
      while (i < lines.length) {
        const mm = lines[i].match(/^\s*-\s*(.*)\s*$/);
        if (!mm) break;
        arr.push(castScalar(mm[1]));
        i++;
      }
      out[key] = arr;
      continue;
    }

    out[key] = castScalar(val);
    i++;
  }

  return out;
}

function castScalar(v) {
  if (v == null) return v;
  const s = String(v).trim();

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  )
    return s.slice(1, -1);

  if (s === 'true') return true;
  if (s === 'false') return false;

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return s;
}

/* ---------- Date helpers ---------- */
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function parseDateFlexible(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [_, Y, M, D] = m;
    const d = new Date(Number(Y), Number(M) - 1, Number(D));
    return isNaN(d) ? null : d;
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [_, MM, DD, YYYY] = m;
    const d = new Date(Number(YYYY), Number(MM) - 1, Number(DD));
    return isNaN(d) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// weekday: 0=Sun..6=Sat, nth: 1..5
function nthWeekdayOfMonth(year, month1to12, weekday, nth) {
  const monthIdx = month1to12 - 1;
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, monthIdx, day);
    if (d.getMonth() !== monthIdx) break;
    if (d.getDay() === weekday) {
      count++;
      if (count === nth) return d;
    }
  }
  return null;
}

function firstBusinessDayOfMonth(year, month1to12) {
  const monthIdx = month1to12 - 1;
  for (let day = 1; day <= 7; day++) {
    const d = new Date(year, monthIdx, day);
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) return d;
  }
  return new Date(year, monthIdx, 1);
}

function resolveScheduleOnDate(year, month1to12, schedule) {
  const token = String(schedule || '').trim();

  if (token === '1st_week') return firstBusinessDayOfMonth(year, month1to12);
  if (token === '2nd_wed') return nthWeekdayOfMonth(year, month1to12, 3, 2);
  if (token === '4th_wed') {
    const secondWed = nthWeekdayOfMonth(year, month1to12, 3, 2);
    if (!secondWed) return null;
    const fourth = new Date(secondWed);
    fourth.setDate(fourth.getDate() + 14);
    return fourth;
  }
  return null;
}

/* ---------- IO helpers ---------- */
function listMarkdownFiles(dirPath) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function hasIncomeTag(tags) {
  if (!tags) return false;
  if (Array.isArray(tags))
    return tags.map(String).some((t) => t.toLowerCase() === 'income');
  return String(tags).toLowerCase().includes('income');
}

function monthsBetweenInclusive(fromDate, toDate) {
  const out = [];
  let y = fromDate.getFullYear();
  let m = fromDate.getMonth() + 1;

  const endY = toDate.getFullYear();
  const endM = toDate.getMonth() + 1;

  while (y < endY || (y === endY && m <= endM)) {
    out.push({ y, m });
    m++;
    if (m === 13) {
      m = 1;
      y++;
    }
  }
  return out;
}

/* ---------- Main ---------- */
module.exports = function income_rows({ vaultBase, dateStr, from, to } = {}) {
  if (!vaultBase) throw new Error('income_rows: vaultBase required');
  if (!dateStr) throw new Error('income_rows: dateStr required');

  const fromDate = parseDateFlexible(from ?? dateStr);
  const toDate = parseDateFlexible(to ?? dateStr);
  if (!fromDate || !toDate)
    throw new Error(`income_rows: invalid from/to: ${from} .. ${to}`);

  const fromStr = ymd(
    new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()),
  );
  const toStr = ymd(
    new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()),
  );

  const incomeDir = path.join(vaultBase, 'Engine Room', 'Income');
  const files = listMarkdownFiles(incomeDir);

  const rows = [];
  const months = monthsBetweenInclusive(fromDate, toDate);

  for (const file of files) {
    const fp = path.join(incomeDir, file);
    const md = fs.readFileSync(fp, 'utf-8');
    const fm = parseFrontmatter(md);

    if (fm.tags && !hasIncomeTag(fm.tags)) continue;

    const ref = String(fm.ref ?? fm.name ?? file.replace('.md', '')).trim();
    const amount = Number(fm.amount ?? fm.base_amount ?? fm.value);
    if (!Number.isFinite(amount) || amount === 0) continue;

    for (const { y, m } of months) {
      const onDate = resolveScheduleOnDate(y, m, fm.schedule);
      if (!onDate) continue;

      const on = ymd(onDate);
      if (on < fromStr || on > toStr) continue;

      rows.push({
        bill: 'Income',
        label: `Income: ${ref}`,
        on,
        due_date: on,
        amount: Math.abs(amount),
        cycle: 'computed',
        row_type: 'income',
        source: `Engine Room/Income/${file}`,
      });
    }
  }

  return rows;
};
