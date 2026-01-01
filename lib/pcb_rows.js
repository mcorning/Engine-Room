/**
 * Engine Room/lib/pcb_rows.js
 * Build 4: compute PCB rows (DATA ONLY).
 *
 * Reads bill notes from: Engine Room/Bills/*.md
 *
 * Supports frontmatter keys (based on your bill example):
 * - ref: string (bill name)
 * - amount: number
 * - autopay: boolean
 * - account: string
 * - cycle: string (e.g., monthly)
 * - due_days: number OR list of numbers (e.g., 21 or [1,15])
 *
 * Also tolerates legacy/alt keys:
 * - due_day (number)
 * - account_key (string)
 */

const fs = require("fs");
const path = require("path");

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
      // start list
      out[key] = [];
      currentListKey = key;
      continue;
    }

    currentListKey = null;

    // inline list: [a, b]
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      const parts = inner ? inner.split(",").map(s => s.trim()) : [];
      out[key] = parts.map(coerceScalar);
      continue;
    }

    out[key] = coerceScalar(raw);
  }

  return out;
}

function coerceScalar(v) {
  // strip quotes
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) v = v.slice(1, -1);

  // boolean
  if (v === "true") return true;
  if (v === "false") return false;

  // number
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);

  return v;
}

function ymd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = async function pcb_rows({ dateStr } = {}) {
  if (!dateStr) throw new Error("pcb_rows: dateStr required (YYYY-MM-DD)");

  const [Y, M, D] = dateStr.split("-").map(Number);
  const start = new Date(Y, M - 1, D);
  const end = new Date(Y, M, 0); // end of month (for now; later we can use next-income window)

  const vaultBase = app.vault.adapter.getBasePath();
  const billsRoot = path.join(vaultBase, "Engine Room", "Bills");

  if (!fs.existsSync(billsRoot)) return [];

  const files = fs
    .readdirSync(billsRoot, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".md"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  const rows = [];

  for (const file of files) {
    const fp = path.join(billsRoot, file);
    const md = fs.readFileSync(fp, "utf8");
    const fm = parseFrontmatter(md);

    const bill = (typeof fm.ref === "string" && fm.ref.trim())
      ? fm.ref.trim()
      : path.basename(file, ".md");

    const amount = (typeof fm.amount === "number" && isFinite(fm.amount))
      ? fm.amount
      : 0;

    const autopay = fm.autopay === true;

    // Support both "account" (your current schema) and older "account_key"
    const account = (typeof fm.account === "string" && fm.account.trim())
      ? fm.account.trim()
      : (typeof fm.account_key === "string" ? fm.account_key.trim() : "");

    const cycle = (typeof fm.cycle === "string" && fm.cycle.trim()) ? fm.cycle.trim() : "";

    // due_days may be a number, a list, or a legacy "due_day"
    let dueDays = [];
    if (typeof fm.due_days === "number") dueDays = [fm.due_days];
    else if (Array.isArray(fm.due_days)) dueDays = fm.due_days.filter(x => typeof x === "number");
    else if (typeof fm.due_day === "number") dueDays = [fm.due_day];

    // Nothing schedulable yet? Skip.
    if (!dueDays.length) continue;

    // For Build 4 we only implement monthly due days within the current month window.
    for (const dueDay of dueDays) {
      if (typeof dueDay !== "number" || dueDay < 1 || dueDay > 31) continue;

      const due = new Date(Y, M - 1, dueDay);
      if (due < start || due > end) continue;

      rows.push({
        bill,
        due_date: ymd(due),
        amount,
        account,
        autopay,
        cycle,
        source: `Engine Room/Bills/${file}`,
      });
    }
  }

  // Deterministic sort: due_date then bill
  rows.sort((a, b) =>
    a.due_date.localeCompare(b.due_date) || String(a.bill).localeCompare(String(b.bill), "en")
  );

  return rows;
};
