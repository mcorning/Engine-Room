/**
 * Engine Room/lib/Checking.js
 * Phone-friendly Checking snapshot.
 * Columns: Account | Balance | As Of
 */

const fs = require("fs");
const path = require("path");

function getVaultBase() {
  if (typeof app !== "undefined" && app?.vault?.adapter?.getBasePath) {
    return app.vault.adapter.getBasePath();
  }
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

module.exports = function checking({ dateStr } = {}) {
  const vaultBase = getVaultBase();
  const checkingDir = path.join(vaultBase, "Engine Room", "Checking");

  const files = listMarkdownFiles(checkingDir);

  const rows = [];
  for (const fp of files) {
    const md = fs.readFileSync(fp, "utf8");
    const fm = parseFrontmatter(md);
    const noteName = path.basename(fp, ".md");
    const balance = fm.balance ?? "";
    const asOf = fm.as_of ?? fm.asof ?? "";
    rows.push({ noteName, balance, asOf });
  }

  const out = [];
  out.push('## Checking');
  if (dateStr) out.push(`- As of: \`${dateStr}\``);
  out.push("");

  if (rows.length === 0) {
    out.push("_No account notes found._");
    out.push("");
    return out.join("\n");
  }

  out.push("| Account | Balance | As Of |");
  out.push("| --- | ---: | --- |");

  for (const r of rows) {
    out.push(`| [[${r.noteName}]] | ${fmtMoney(r.balance)} | ${r.asOf} |`);
  }

  out.push("");
  return out.join("\n");
};
