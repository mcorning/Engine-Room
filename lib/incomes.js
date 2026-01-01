/**
 * Engine Room/lib/incomes.js
 * Build: deterministic markdown snapshot of Income notes.
 *
 * Phone-friendly columns: Source | amount
 */

const fs = require("fs");
const path = require("path");

function getVaultBase() {
  // Obsidian/Templater context
  if (typeof app !== "undefined" && app?.vault?.adapter?.getBasePath) {
    return app.vault.adapter.getBasePath();
  }
  // Node/VSC context
  return process.cwd();
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .flatMap((d) => {
      const full = path.join(dirPath, d.name);
      if (d.isDirectory()) return listMarkdownFiles(full);
      if (d.isFile() && d.name.toLowerCase().endsWith(".md")) return [full];
      return [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function parseFrontmatter(md) {
  // Very small YAML frontmatter parser (simple scalars only)
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return {};
  const body = m[1];
  const out = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf(":");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    // strip quotes
    val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    out[key] = val;
  }
  return out;
}

function fmtMoney(n) {
  const x = Number(n);
  if (!isFinite(x)) return "";
  const abs = Math.abs(x);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = x < 0 ? "-" : "";
  return `${sign}$${s}`;
}

module.exports = function incomes({ dateStr } = {}) {
  const vaultBase = getVaultBase();
  const incomeDir = path.join(vaultBase, "Engine Room", "Income");

  const files = listMarkdownFiles(incomeDir);

  const rows = [];
  for (const fp of files) {
    const md = fs.readFileSync(fp, "utf8");
    const fm = parseFrontmatter(md);
    const ref = fm.ref || path.basename(fp, ".md");
    const amount = fm.amount ?? fm.base_amount ?? "";
    rows.push({ ref, amount });
  }

  const out = [];
  out.push("## Incomes");
  if (dateStr) out.push(`- As of: \`${dateStr}\``);
  out.push("");

  if (rows.length === 0) {
    out.push("_No income notes found._");
    out.push("");
    return out.join("\n");
  }

  out.push("| Source | amount |");
  out.push("| --- | ---: |");

  for (const r of rows) {
    out.push(`| ${r.ref} | ${fmtMoney(r.amount)} |`);
  }

  out.push("");
  return out.join("\n");
};
