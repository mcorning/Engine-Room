/**
 * Engine Room/lib/pcb_rows.js
 * Build 5 — canonical
 *
 * Responsibilities:
 *  - Opening balance from Checking (+ Checking/base)
 *  - Bills + Debts scheduled rows
 *  - Running total computation
 *  - Injector rows when running_total <= 0 (guard-railed)
 *
 * NOTE:
 *  - Bills / Debts are always money OUT (negative)
 *  - Income is handled elsewhere (intentionally)
 */

const fs = require('fs');
const path = require('path');

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
function defaultInjectAmount() {
  return 500;
}

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

/* ---------- Domain rules ---------- */

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

/* ---------- Main ---------- */

module.exports = async function pcb_rows(opts = {}) {
  if (typeof app === 'undefined')
    throw new Error('pcb_rows: not running inside Obsidian');

  const { dateStr } = opts;
  if (!dateStr) throw new Error('pcb_rows: dateStr required');

  const [Y, M] = dateStr.split('-').map(Number);
  if (!Number.isFinite(Y) || !Number.isFinite(M))
    throw new Error(`pcb_rows: invalid dateStr ${dateStr}`);

  const vaultBase = app.vault.adapter.getBasePath();
  const rows = [];

  const openingBalance = computeOpeningBalance(vaultBase);

  rows.push({
    bill: 'Opening balance',
    label: 'Opening balance',
    on: dateStr,
    due_date: dateStr,
    amount: 0,
    cycle: 'computed',
    row_type: 'opening',
  });

  /* ---------- Bills ---------- */

  const billsDir = path.join(vaultBase, 'Engine Room', 'Bills');
  for (const file of listMarkdownFiles(billsDir)) {
    const fm = parseFrontmatter(
      fs.readFileSync(path.join(billsDir, file), 'utf-8')
    );

    const bill = String(
      fm.ref ?? fm.bill ?? fm.name ?? file.replace('.md', '')
    );
    const amount = -Math.abs(baseAmount(fm));
    if (fm.covered) continue;

    const dueDays = normalizeDueDays(fm);

    for (const d of dueDays) {
      const due = new Date(Y, M - 1, d);
      if (due.getMonth() + 1 !== M) continue;

      rows.push({
        bill,
        label: bill,
        on: ymd(due),
        due_date: ymd(due),
        amount,
        autopay: fm.autopay === true,
        cycle: fm.cycle ?? 'monthly',
        account: fm.account ?? '',
        source: `Engine Room/Bills/${file}`,
        row_type: 'bill',
      });
    }
  }

  /* ---------- Debts ---------- */

  const debtsDir = path.join(vaultBase, 'Engine Room', 'Debts');
  for (const file of listMarkdownFiles(debtsDir)) {
    const fm = parseFrontmatter(
      fs.readFileSync(path.join(debtsDir, file), 'utf-8')
    );

    const bill = String(
      fm.ref ?? fm.debt ?? fm.name ?? file.replace('.md', '')
    );
    const dueDays = normalizeDueDays(fm);

    for (let i = 0; i < dueDays.length; i++) {
      const due = new Date(Y, M - 1, dueDays[i]);
      if (due.getMonth() + 1 !== M) continue;

      const amt = amountForIndex(fm, i);
      if (!amt) continue;

      rows.push({
        bill,
        label: bill,
        on: ymd(due),
        due_date: ymd(due),
        amount: -Math.abs(amt),
        autopay: fm.autopay === true,
        cycle: fm.cycle ?? 'monthly',
        account: fm.account ?? '',
        source: `Engine Room/Debts/${file}`,
        row_type: 'debt',
      });
    }
  }

  /* ---------- Sort + running totals + injectors ---------- */

  rows.sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) || a.bill.localeCompare(b.bill)
  );

  const openIdx = rows.findIndex((r) => r.row_type === 'opening');
  if (openIdx > 0) rows.unshift(rows.splice(openIdx, 1)[0]);

  let running = openingBalance;
  rows[0].running_total = running;

  let injections = 0;
  const MAX = 25;

  for (let i = 1; i < rows.length; i++) {
    running += rows[i].amount || 0;
    rows[i].running_total = running;

    if (running <= 0 && injections < MAX) {
      const injectAmt = defaultInjectAmount();
      const d = rows[i].on;

      const inj = {
        bill: 'Injector',
        label: 'Injector',
        on: d,
        due_date: d,
        amount: injectAmt,
        cycle: 'computed',
        row_type: 'injector',
        running_total: running + injectAmt,
      };

      running += injectAmt;
      rows.splice(i + 1, 0, inj);
      injections++;
      i++;
    }
  }

  return rows;
};
