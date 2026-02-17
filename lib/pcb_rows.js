/**
 * Engine Room/lib/pcb_rows.js
 * Build 5 — canonical (patched for from/to multi-month horizon)
 */

const fs = require('fs');
const path = require('path');
const { loadInjectors, buildOffers } = require('./injector_offers');

const income_rows = require('./income_rows');

/* ---------- Frontmatter parsing ---------- */

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

/* ---------- Utilities ---------- */

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

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeCycle(fm) {
  const c = (fm.cycle ?? fm.pay_cycle ?? fm.payCycle ?? '')
    .toString()
    .trim()
    .toLowerCase();
  if (
    c === 'biweekly' ||
    c === 'bi-weekly' ||
    c === 'byweekly' ||
    c === 'by-weekly'
  )
    return 'biweekly';
  if (c === 'semi-monthly' || c === 'semimonthly' || c === 'semi_monthly')
    return 'semi-monthly';
  if (c === 'monthly') return 'monthly';
  return c || 'monthly';
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

function biWeeklyDatesInMonth(anchorDate, year, month1to12) {
  if (!anchorDate) return [];
  const monthIdx = month1to12 - 1;
  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 1); // exclusive

  const out = [];
  const a = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate()
  );
  const ms14 = 14 * 24 * 60 * 60 * 1000;

  let t = a.getTime();
  while (t >= end.getTime()) t -= ms14;
  while (t < start.getTime()) t += ms14;

  while (t < end.getTime()) {
    out.push(new Date(t));
    t += ms14;
  }
  return out;
}

function normalizeDueDays(fm) {
  const v =
    fm.due_days ??
    fm.due_day ??
    fm.dueDay ??
    fm.pay_days ??
    fm.pay_day ??
    fm.payDay;

  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
  const n = Number(v);
  return Number.isFinite(n) ? [n] : [];
}

function normalizeDueAmounts(fm) {
  const v = fm.due_amounts ?? fm.due_amount ?? fm.dueAmount;
  if (Array.isArray(v))
    return v.map(Number).filter((n) => Number.isFinite(n) || n === 0);
  const n = Number(v);
  return Number.isFinite(n) ? [n] : [];
}

function baseAmount(fm) {
  const n = Number(fm.amount ?? fm.payment ?? fm.pay_amount ?? fm.payAmount);
  return Number.isFinite(n) ? n : 0;
}

function amountForIndex(fm, i) {
  const arr = normalizeDueAmounts(fm);
  if (i < arr.length && Number.isFinite(arr[i])) return arr[i];
  return baseAmount(fm);
}

function amountForOccurrence(fm, k) {
  const arr = normalizeDueAmounts(fm);
  if (arr.length > 0) {
    const idx = ((k % arr.length) + arr.length) % arr.length;
    if (Number.isFinite(arr[idx])) return arr[idx];
  }
  return baseAmount(fm);
}

/* ---------- Injector planning constants ---------- */

function cashBufferDefault() {
  return 100;
}

function roundUpToChunk(needed, chunk) {
  const c = Number(chunk) || 0;
  if (!(c > 0)) return needed;
  return Math.ceil(needed / c) * c;
}

/* ---------- Opening balance ---------- */

function computeOpeningBalance(vaultBase) {
  const checkingDir = path.join(vaultBase, 'Engine Room', 'Checking');
  const baseDir = path.join(checkingDir, 'base');

  const files = [
    ...listMarkdownFiles(checkingDir).map((f) => path.join(checkingDir, f)),
    ...listMarkdownFiles(baseDir).map((f) => path.join(baseDir, f)),
  ];

  let sum = 0;
  for (const fp of files) {
    const fm = parseFrontmatter(fs.readFileSync(fp, 'utf-8'));
    if (Number.isFinite(fm.balance)) sum += fm.balance;
  }
  return sum;
}

/* ---------- Month iterator ---------- */

function monthKey(y, m1) {
  return `${y}-${String(m1).padStart(2, '0')}`;
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

module.exports = async function pcb_rows(opts = {}) {
  if (typeof app === 'undefined')
    throw new Error('pcb_rows: not running inside Obsidian');

  const { dateStr } = opts;
  if (!dateStr) throw new Error('pcb_rows: dateStr required');

  const fromDate = parseDateFlexible(opts.from ?? dateStr);
  const toDate = parseDateFlexible(opts.to ?? dateStr);

  if (!fromDate || !toDate) {
    throw new Error(`pcb_rows: invalid from/to: ${opts.from} .. ${opts.to}`);
  }

  // Normalize to YYYY-MM-DD strings for comparisons
  const fromStr = ymd(new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()));
  const toStr = ymd(new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()));

  const vaultBase = app.vault.adapter.getBasePath();
  const rows = [];

  // Precompute injector offers for this run.
  const injectorModels = loadInjectors({ vaultBase });
  const offers = buildOffers(injectorModels, { dateStr });
  const offerById = new Map(offers.map((o) => [o.id, o]));
  const buffer = cashBufferDefault();

  const openingBalance = computeOpeningBalance(vaultBase);

  // Opening row should align to window start.
  rows.push({
    bill: 'Opening balance',
    label: 'Opening balance',
    on: fromStr,
    due_date: fromStr,
    amount: 0,
    cycle: 'computed',
    row_type: 'opening',
  });

  /* ---------- Incomes (multi-month) ---------- */
  // Note: income_rows will be patched to honor from/to.
  const incomes = income_rows({ vaultBase, dateStr, from: fromStr, to: toStr });
  for (const r of incomes) rows.push(r);

  /* ---------- Bills + Debts (multi-month) ---------- */
  const months = monthsBetweenInclusive(fromDate, toDate);

  const billsDir = path.join(vaultBase, 'Engine Room', 'Bills');
  const debtsDir = path.join(vaultBase, 'Engine Room', 'Debts');

  const billFiles = listMarkdownFiles(billsDir);
  const debtFiles = listMarkdownFiles(debtsDir);

  // Bills (day-of-month)
  for (const file of billFiles) {
    const fm = parseFrontmatter(fs.readFileSync(path.join(billsDir, file), 'utf-8'));

    const bill = String(fm.ref ?? fm.bill ?? fm.name ?? file.replace('.md', ''));
    const amount = -Math.abs(baseAmount(fm));
    if (fm.covered) continue;

    const dueDays = normalizeDueDays(fm);

    for (const { y, m } of months) {
      for (const d of dueDays) {
        const due = new Date(y, m - 1, d);
        if (due.getMonth() + 1 !== m) continue;

        const on = ymd(due);
        rows.push({
          bill,
          label: bill,
          on,
          due_date: on,
          amount,
          autopay: fm.autopay === true,
          cycle: fm.cycle ?? 'monthly',
          account: fm.account ?? '',
          source: `Engine Room/Bills/${file}`,
          row_type: 'bill',
        });
      }
    }
  }

  // Debts (biweekly or day-of-month)
  for (const file of debtFiles) {
    const fm = parseFrontmatter(fs.readFileSync(path.join(debtsDir, file), 'utf-8'));

    const bill = String(fm.ref ?? fm.debt ?? fm.name ?? file.replace('.md', ''));

    const cycleNorm = normalizeCycle(fm);

    if (cycleNorm === 'biweekly') {
      const anchor = parseDateFlexible(
        fm.anchor_date ?? fm.anchorDate ?? fm.as_of ?? fm.asOf
      );

      for (const { y, m } of months) {
        const dates = biWeeklyDatesInMonth(anchor, y, m);

        for (let k = 0; k < dates.length; k++) {
          const due = dates[k];
          const amt = amountForOccurrence(fm, k);
          if (!amt) continue;

          const on = ymd(due);
          rows.push({
            bill,
            label: bill,
            on,
            due_date: on,
            amount: -Math.abs(amt),
            autopay: fm.autopay === true,
            cycle: fm.cycle ?? 'by-weekly',
            account: fm.account ?? '',
            source: `Engine Room/Debts/${file}`,
            row_type: 'debt',
          });
        }
      }

      continue;
    }

    const dueDays = normalizeDueDays(fm);

    for (const { y, m } of months) {
      for (let i = 0; i < dueDays.length; i++) {
        const due = new Date(y, m - 1, dueDays[i]);
        if (due.getMonth() + 1 !== m) continue;

        const amt = amountForIndex(fm, i);
        if (!amt) continue;

        const on = ymd(due);
        rows.push({
          bill,
          label: bill,
          on,
          due_date: on,
          amount: -Math.abs(amt),
          autopay: fm.autopay === true,
          cycle: fm.cycle ?? 'monthly',
          account: fm.account ?? '',
          source: `Engine Room/Debts/${file}`,
          row_type: 'debt',
        });
      }
    }
  }

  /* ---------- Filter to window + sort + injectors ---------- */

  // Keep only rows in [fromStr, toStr] (inclusive)
  const inWindow = rows.filter((r) => {
    const d = r.due_date ?? r.on;
    return d >= fromStr && d <= toStr;
  });

  // Sort by date, then by row type (income before outflows), then by label.
// This prevents same-day income from being applied after same-day bills and
// accidentally triggering an injector.
function rowTypeWeight(r) {
  switch (r.row_type) {
    case 'opening':
      return 0;
    case 'income':
      return 1;
    case 'bill':
    case 'debt':
      return 2;
    case 'injector':
      return 3;
    default:
      return 9;
  }
}

inWindow.sort((a, b) => {
  const da = a.due_date ?? a.on;
  const db = b.due_date ?? b.on;
  if (da !== db) return da.localeCompare(db);

  const wa = rowTypeWeight(a);
  const wb = rowTypeWeight(b);
  if (wa !== wb) return wa - wb;

  const la = String(a.label ?? a.bill ?? '');
  const lb = String(b.label ?? b.bill ?? '');
  return la.localeCompare(lb);
});


  // Ensure opening balance stays first
  const openIdx = inWindow.findIndex((r) => r.row_type === 'opening');
  if (openIdx > 0) inWindow.unshift(inWindow.splice(openIdx, 1)[0]);

  let running = openingBalance;
  inWindow[0].running_total = running;

  let injections = 0;
  const MAX = 50;

  for (let i = 1; i < inWindow.length; i++) {
    running += inWindow[i].amount || 0;
    inWindow[i].running_total = running;

    if (running < buffer && injections < MAX) {
      const d = inWindow[i].on;
      let needed = buffer - running;

      const available = offers.filter(
        (o) => o.remaining > 0 && o.available_on <= d
      );

      if (available.length === 0) continue;

      for (const o of available) {
        if (!(needed > 0)) break;

        const amountRaw = Math.min(needed, o.remaining);
        const amount = Math.min(
          roundUpToChunk(amountRaw, o.chunk),
          o.remaining
        );
        if (!(amount > 0)) continue;

        const inj = {
          bill: 'Injector',
          label: `Injector: ${o.ref ?? o.name}`,
          injector: o.name,
          on: d,
          due_date: d,
          amount,
          cycle: 'computed',
          row_type: 'injector',
          injector_priority: o.priority,
          injector_latency_days: o.latency_days,
          injector_cap_remaining: Number(o.remaining - amount),
          source: o.source,
          running_total: running + amount,
        };

        running += amount;
        o.remaining -= amount;
        offerById.get(o.id).remaining = o.remaining;

        inWindow.splice(i + 1, 0, inj);
        injections++;
        i++;
        needed = buffer - running;
        if (injections >= MAX) break;
      }
    }
  }

  return inWindow;
};
