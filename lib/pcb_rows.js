/**
 * Engine Room/lib/pcb_rows.js
 * Build 5: compute PCB rows (DATA ONLY) with:
 *  - Opening balance row (sum of Engine Room/Accounts balances)
 *  - Signed deltas for bills (negative)
 *  - running_total for each row
 *  - Auto-injector rows when running_total <= 0 (guard-railed)
 *
 * Reads bill notes from: Engine Room/Bills/*.md
 * Reads account notes from: Engine Room/Accounts/*.md (+ Accounts/base/*.md)
 *
 * Bill frontmatter keys (based on your bill example):
 * - ref: string (bill name)
 * - amount: number
 * - autopay: boolean
 * - account: string
 * - cycle: string (e.g., monthly)
 * - due_days: number OR list of numbers (e.g., 21 or [1,15])
 *
 * Also tolerates legacy/alt keys:
 * - due_day (number)
 */

const fs = require("fs");
const path = require("path");

/** Very small YAML-ish frontmatter parser (scalars + simple arrays). */
function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return {};
  const body = m[1];

  const out = {};
  const lines = body.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    // key: value
    const kv = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)\s*$/);
    if (!kv) { i++; continue; }

    const key = kv[1];
    let val = kv[2];

    // list block
    if (val === "" || val === null || typeof val === "undefined") {
      const arr = [];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const mm = l.match(/^\s*-\s*(.*)\s*$/);
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

  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  if (s === "true") return true;
  if (s === "false") return false;

  // number
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }

  return s;
}

function listMarkdownFiles(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map(e => e.name);
  } catch (_) {
    return [];
  }
}

function readFrontmatterFromFile(fp) {
  try {
    const md = fs.readFileSync(fp, "utf-8");
    return parseFrontmatter(md);
  } catch (_) {
    return {};
  }
}

function computeOpeningBalance(vaultBase) {
  const accountsDir = path.join(vaultBase, "Engine Room", "Accounts");
  const baseDir = path.join(accountsDir, "base");

  const files = [
    ...listMarkdownFiles(accountsDir).map(f => path.join(accountsDir, f)),
    ...listMarkdownFiles(baseDir).map(f => path.join(baseDir, f)),
  ];

  let sum = 0;
  for (const fp of files) {
    const fm = readFrontmatterFromFile(fp);
    const bal = fm.balance;
    if (typeof bal === "number" && Number.isFinite(bal)) sum += bal;
  }

  return sum;
}

function normalizeDueDays(fm) {
  // Prefer "due_days"
  if (Array.isArray(fm.due_days)) return fm.due_days.filter(n => Number.isFinite(Number(n))).map(n => Number(n));
  if (typeof fm.due_days === "number" && Number.isFinite(fm.due_days)) return [fm.due_days];

  // Tolerate legacy "due_day"
  if (typeof fm.due_day === "number" && Number.isFinite(fm.due_day)) return [fm.due_day];

  // Tolerate legacy "dueDay"
  if (typeof fm.dueDay === "number" && Number.isFinite(fm.dueDay)) return [fm.dueDay];

  return [];
}

function ymd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

module.exports = async function pcb_rows(opts = {}) {
  if (typeof app === "undefined") {
    throw new Error("pcb_rows: global `app` is missing (not running inside Obsidian).");
  }

  const dateStr = opts.dateStr;
  if (!dateStr) throw new Error("pcb_rows: opts.dateStr is required (YYYY-MM-DD).");

  const vaultBase = app.vault.adapter.getBasePath();

  // --- Opening balance (sum of account balances) ---
  const openingBalance = computeOpeningBalance(vaultBase);

  const billsDir = path.join(vaultBase, "Engine Room", "Bills");
  const billFiles = listMarkdownFiles(billsDir);

  // Build bill rows
  const rows = [];

  // Opening row always first (date = report date)
  rows.push({
    bill: "Opening balance",
    label: "Opening balance",
    due_date: dateStr,
    on: dateStr,
    amount: 0,
    cycle: "computed",
    source: "computed",
    row_type: "opening",
  });

  // Build window month/year from dateStr (only month used currently)
  const [Y, M] = dateStr.split("-").map(s => Number(s));
  if (!Number.isFinite(Y) || !Number.isFinite(M)) throw new Error(`pcb_rows: invalid dateStr: ${dateStr}`);

  for (const file of billFiles) {
    const fp = path.join(billsDir, file);
    const md = fs.readFileSync(fp, "utf-8");
    const fm = parseFrontmatter(md);

    const bill = String(fm.ref ?? fm.bill ?? fm.name ?? path.basename(file, ".md"));
    const cycle = String(fm.cycle ?? "monthly");
    const account = (typeof fm.account === "string" && fm.account.trim())
      ? fm.account.trim()
      : (typeof fm.account_key === "string" ? fm.account_key.trim() : "");

    const autopay = fm.autopay === true;

    const rawAmt = (typeof fm.amount === "number" && Number.isFinite(fm.amount)) ? fm.amount : 0;
    // Bills are deltas (money out): negative
    const amount = rawAmt > 0 ? -rawAmt : rawAmt;

    const dueDays = normalizeDueDays(fm);

    // Only monthly supported for now; due_days drives the instances in this month.
    for (const dueDay of dueDays) {
      if (dueDay < 1 || dueDay > 31) continue;

      const due = new Date(Y, M - 1, dueDay);
      if (due.getMonth() + 1 !== M) continue; // skip invalid (e.g., Feb 30)

      rows.push({
        bill,
        label: bill,
        due_date: ymd(due),
        on: ymd(due),
        amount,
        autopay,
        cycle,
        account,
        source: `Engine Room/Bills/${file}`,
        row_type: "bill",
      });
    }
  }

  // Sort by due_date then bill (opening will sit at top because same dateStr, but we force it first below)
  rows.sort((a, b) =>
    String(a.due_date).localeCompare(String(b.due_date)) ||
    String(a.bill).localeCompare(String(b.bill), "en")
  );

  // Ensure opening row is first even if dateStr > some due_dates (it should be a report anchor)
  const openingIdx = rows.findIndex(r => r.row_type === "opening");
  if (openingIdx > 0) {
    const [opening] = rows.splice(openingIdx, 1);
    rows.unshift(opening);
  }

  // --- running_total + injectors ---
  const MAX_INJECTIONS = 25;
  let injections = 0;

  // First pass running totals with insertion
  let running = openingBalance;

  // set opening running_total
  if (rows.length) {
    rows[0].running_total = running;
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const delta = (typeof r.amount === "number" && Number.isFinite(r.amount)) ? r.amount : 0;
    running += delta;
    r.running_total = running;

    if (running <= 0 && injections < MAX_INJECTIONS) {
      const injectAmt = (-running) + 1; // bring to +1.00
      const injectDate = r.on ?? r.due_date ?? dateStr;

      const inj = {
        bill: "Injector",
        label: "Injector",
        due_date: injectDate,
        on: injectDate,
        amount: injectAmt,
        autopay: true,
        cycle: "computed",
        account: "",
        source: "computed",
        row_type: "injector",
      };

      // apply injection immediately
      running += injectAmt;
      inj.running_total = running;

      rows.splice(i + 1, 0, inj);
      injections++;
      i++; // skip over inserted injector
    }
  }

  return rows;
};
