/**
 * Engine Room/lib/pcb_rows.js
 * Build 5: compute PCB event rows (DATA ONLY).
 *
 * Produces a single deterministic event stream for the current window:
 *   window = [dateStr .. end-of-month]
 *
 * Sources:
 * - Bills:  Engine Room/Bills/*.md
 * - Debts:  Engine Room/Debts/*.md
 * - Income: Engine Room/Income/*.md + Engine Room/Income/Fixed/*.md
 *
 * Output rows (normalized):
 * {
 *   date: 'YYYY-MM-DD',
 *   label: string,           // human label (usually note basename or `ref`)
 *   kind: 'bill'|'debt'|'income',
 *   amount: number,          // signed: income positive, outflows negative
 *   account: string,         // optional
 *   autopay: boolean,        // optional
 *   cycle: string,           // optional
 *   source: 'Engine Room/.../file.md'
 * }
 */

const fs = require("fs");
const path = require("path");

// ---------------------------
// Frontmatter parsing (small, deterministic)
// ---------------------------

/**
 * Minimal YAML frontmatter parser for:
 * - key: value
 * - key:
 *     - item
 *     - item
 * - key: [a, b, c]
 * Booleans: true/false
 * Numbers: 123 or 123.45
 * Strings: everything else (quotes optional)
 */
function parseFrontmatter(md) {
  const lines = md.split(/\r?\n/);
  if (lines[0] !== "---") return {};

  const out = {};
  let i = 1;
  let currentListKey = null;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === "---") break;

    // List item
    const li = line.match(/^\s*-\s*(.+)\s*$/);
    if (li && currentListKey) {
      out[currentListKey].push(coerceScalar(li[1].trim()));
      continue;
    }

    // key: value OR key:
    const m = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)\s*$/);
    if (!m) {
      currentListKey = null;
      continue;
    }

    const key = m[1].trim().replace(/ /g, "_");
    let raw = m[2].trim();

    if (raw === "") {
      out[key] = [];
      currentListKey = key;
      continue;
    }

    currentListKey = null;

    // inline list: [a, b]
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      const parts = inner ? inner.split(",").map((s) => s.trim()) : [];
      out[key] = parts.map(coerceScalar);
      continue;
    }

    out[key] = coerceScalar(raw);
  }

  return out;
}

function coerceScalar(v) {
  if (typeof v !== "string") return v;

  // strip quotes
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }

  // boolean
  if (v === "true") return true;
  if (v === "false") return false;

  // number
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);

  return v;
}

function normalizeNoteName(v) {
  // Accept plain strings or Obsidian wikilinks like [[US Bank]] or [[US Bank|USB]]
  if (typeof v !== "string") return "";
  let s = v.trim();
  const wl = s.match(/^\[\[([^\]]+)\]\]$/);
  if (wl) s = wl[1];
  // strip alias if present
  if (s.includes("|")) s = s.split("|")[0];
  return s.trim();
}

function firstString(v) {
  if (typeof v === "string") return normalizeNoteName(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = normalizeNoteName(String(x ?? ""));
      if (s) return s;
    }
  }
  return "";
}

function toNumber(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const cleaned = x.replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function ymd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".md"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

function parseYmdStrict(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function computeBiWeeklyAnchor(anchorYmd, refDate) {
  const anchor = parseYmdStrict(anchorYmd);
  if (!anchor || !(refDate instanceof Date)) return null;
  let a = anchor;
  while (addDays(a, 14) <= refDate) a = addDays(a, 14);
  return a;
}

function reqFresh(p) {
  try {
    delete require.cache[require.resolve(p)];
  } catch (_) {}
  return require(p);
}

// ---------------------------
// Main
// ---------------------------

module.exports = async function pcb_rows({ dateStr } = {}) {
  if (!dateStr) throw new Error("pcb_rows: dateStr required (YYYY-MM-DD)");

  const [Y, M, D] = dateStr.split("-").map(Number);
  const start = new Date(Y, M - 1, D, 0, 0, 0, 0);
  const end = new Date(Y, M, 0, 23, 59, 59, 999); // end of month

  const vaultBase = app.vault.adapter.getBasePath();
  const billsRoot = path.join(vaultBase, "Engine Room", "Bills");
  const debtsRoot = path.join(vaultBase, "Engine Room", "Debts");
  const incomeRoot = path.join(vaultBase, "Engine Room", "Income");
  const incomeFixedRoot = path.join(incomeRoot, "Fixed");
  const schedulePath = path.join(vaultBase, "Engine Room", "lib", "schedule.js");
  const schedule = reqFresh(schedulePath);

  const rows = [];

  // -------- Bills (outflows)
  for (const file of listMarkdownFiles(billsRoot)) {
    const fp = path.join(billsRoot, file);
    const md = fs.readFileSync(fp, "utf8");
    const fm = parseFrontmatter(md);

    if (fm.covered === true) continue;

    const label =
      typeof fm.ref === "string" && fm.ref.trim()
        ? fm.ref.trim()
        : path.basename(file, ".md");

    const amount = toNumber(fm.amount) ?? 0;
    const autopay = fm.autopay === true;
    const account =
      typeof fm.account === "string" && fm.account.trim()
        ? fm.account.trim()
        : typeof fm.account_key === "string"
          ? fm.account_key.trim()
          : "";

    const cycle = typeof fm.cycle === "string" ? fm.cycle.trim() : "";

    let dueDays = [];
    if (typeof fm.due_days === "number") dueDays = [fm.due_days];
    else if (Array.isArray(fm.due_days)) dueDays = fm.due_days.map(toNumber).filter((n) => Number.isFinite(n));
    else if (typeof fm.due_day === "number") dueDays = [fm.due_day];
    else if (typeof fm.due_day === "string") {
      const n = toNumber(fm.due_day);
      if (Number.isFinite(n)) dueDays = [n];
    }

    for (const dueDay of dueDays) {
      if (!(dueDay >= 1 && dueDay <= 31)) continue;
      const due = new Date(Y, M - 1, dueDay, 0, 0, 0, 0);
      if (due < start || due > end) continue;

      rows.push({
        date: ymd(due),
        label,
        kind: "bill",
        amount: -Math.abs(amount),
        account,
        autopay,
        cycle,
        source: `Engine Room/Bills/${file}`,
      });
    }
  }

  // -------- Debts (outflows)
  for (const file of listMarkdownFiles(debtsRoot)) {
    const fp = path.join(debtsRoot, file);
    const md = fs.readFileSync(fp, "utf8");
    const fm = parseFrontmatter(md);

    const label =
      typeof fm.ref === "string" && fm.ref.trim()
        ? fm.ref.trim()
        : path.basename(file, ".md");

    const autopay = fm.autopay === true;
    // Debt funding account: accept `account`, `account_key`, or `accounts` (list)
    // because many notes model accounts as a list property.
    const account =
      firstString(fm.account) ||
      firstString(fm.account_key) ||
      firstString(fm.accounts) ||
      "";
    const cycle = typeof fm.cycle === "string" ? fm.cycle.trim() : "";

    // Prefer due_amounts if present; else monthly_amount; else amount
    let amounts = [];
    if (Array.isArray(fm.due_amounts)) {
      amounts = fm.due_amounts.map(toNumber).filter((n) => Number.isFinite(n));
    }
    if (!amounts.length) {
      const m = toNumber(fm.monthly_amount);
      const a = toNumber(fm.amount);
      if (Number.isFinite(m)) amounts = [m];
      else if (Number.isFinite(a)) amounts = [a];
    }
    if (!amounts.length) continue;

    // Bi-weekly instruments are date-anchored, not day-of-month anchored.
    const isBiWeekly = cycle === "by-weekly" || cycle === "bi-weekly";
    const anchorYmd =
      typeof fm.anchor_date === "string" && fm.anchor_date.trim()
        ? fm.anchor_date.trim()
        : typeof fm.as_of === "string" && fm.as_of.trim()
          ? fm.as_of.trim()
          : null;

    if (isBiWeekly && anchorYmd) {
      const anchor = computeBiWeeklyAnchor(anchorYmd, start);
      if (!anchor) continue;

      // Move forward to first occurrence within the month window
      let d = anchor;
      while (d < start) d = addDays(d, 14);

      let idx = 0;
      while (d <= end) {
        const amt = amounts.length > 1 ? amounts[idx % amounts.length] : amounts[0];
        rows.push({
          date: ymd(d),
          label,
          kind: "debt",
          amount: -Math.abs(amt),
          account,
          autopay,
          cycle,
          source: `Engine Room/Debts/${file}`,
        });
        d = addDays(d, 14);
        idx++;
      }
      continue;
    }

    // Monthly day-of-month schedule (due_days)
    let dueDays = [];
    if (typeof fm.due_days === "number") dueDays = [fm.due_days];
    else if (Array.isArray(fm.due_days)) dueDays = fm.due_days.map(toNumber).filter((n) => Number.isFinite(n));
    else if (typeof fm.due_day === "number") dueDays = [fm.due_day];
    else if (typeof fm.due_day === "string") {
      const n = toNumber(fm.due_day);
      if (Number.isFinite(n)) dueDays = [n];
    }
    if (!dueDays.length) continue;

    if (amounts.length === dueDays.length) {
      for (let i = 0; i < dueDays.length; i++) {
        const dd = dueDays[i];
        if (!(dd >= 1 && dd <= 31)) continue;
        const due = new Date(Y, M - 1, dd, 0, 0, 0, 0);
        if (due < start || due > end) continue;
        rows.push({
          date: ymd(due),
          label,
          kind: "debt",
          amount: -Math.abs(amounts[i]),
          account,
          autopay,
          cycle,
          source: `Engine Room/Debts/${file}`,
        });
      }
    } else {
      // Single amount applies to all due days
      const amt = amounts[0];
      for (const dd of dueDays) {
        if (!(dd >= 1 && dd <= 31)) continue;
        const due = new Date(Y, M - 1, dd, 0, 0, 0, 0);
        if (due < start || due > end) continue;
        rows.push({
          date: ymd(due),
          label,
          kind: "debt",
          amount: -Math.abs(amt),
          account,
          autopay,
          cycle,
          source: `Engine Room/Debts/${file}`,
        });
      }
    }
  }

  // -------- Income (inflows)
  const incomeFiles = [
    ...listMarkdownFiles(incomeRoot).map((f) => ({ dir: incomeRoot, file: f, rel: `Engine Room/Income/${f}` })),
    ...listMarkdownFiles(incomeFixedRoot).map((f) => ({ dir: incomeFixedRoot, file: f, rel: `Engine Room/Income/Fixed/${f}` })),
  ].sort((a, b) => a.rel.localeCompare(b.rel, "en"));

  for (const { dir, file, rel } of incomeFiles) {
    const fp = path.join(dir, file);
    const md = fs.readFileSync(fp, "utf8");
    const fm = parseFrontmatter(md);

    const label =
      typeof fm.ref === "string" && fm.ref.trim()
        ? fm.ref.trim()
        : path.basename(file, ".md");

    const amount = toNumber(fm.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const depositTo = typeof fm.deposit_to === "string" ? fm.deposit_to.trim() : "";
    const cycle = typeof fm.schedule === "string" ? fm.schedule.trim() : "";

    // Determine deposit date for this month
    const depositDate = schedule.bankDateFor(
      {
        schedule: fm.schedule,
        date_of_deposit: fm.date_of_deposit,
      },
      Y,
      M - 1
    );

    if (!(depositDate instanceof Date) || Number.isNaN(depositDate.getTime())) continue;
    if (depositDate < start || depositDate > end) continue;

    rows.push({
      date: ymd(depositDate),
      label,
      kind: "income",
      amount: Math.abs(amount),
      account: depositTo,
      autopay: false,
      cycle,
      source: rel,
    });
  }

  // Deterministic sort: date, kind, label
  const kindOrder = { income: 0, bill: 1, debt: 2 };
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) ||
      String(a.label).localeCompare(String(b.label), "en")
  );

  return rows;
};
