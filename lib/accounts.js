/**
 * Engine Room/lib/accounts.js
 * Build 2 (real): read Engine Room/Accounts notes and render markdown snapshot.
 *
 * SSA bug-protocol moves:
 * - No Dataview. No PageSet. No reduce() on non-arrays.
 * - Guard strings vs numbers.
 * - No moment assumptions.
 */

const fs = require('fs');
const path = require('path');

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))
    .map((d) => path.join(dirPath, d.name));
}

function parseFrontmatter(md) {
  const lines = md.split(/\r?\n/);
  if (lines[0] !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') break;

    // simple scalar `key: value`
    const m = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)\s*$/);
    if (!m) continue;

    const key = m[1].trim().replace(/ /g, '_');
    let val = m[2].trim();

    // strip wrapping quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    // numeric coercion (only when safe)
    if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);

    out[key] = val;
  }
  return out;
}

function money(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

module.exports = async function accounts({ dateStr } = {}) {
  const vaultBase = app.vault.adapter.getBasePath();

  // You can change this ONE place if your canonical folder name differs.
  const accountsRoot = path.join(vaultBase, 'Engine Room', 'Accounts');
  const fixedRoot = path.join(accountsRoot, 'Fixed');

  const files = [
    ...listMarkdownFiles(accountsRoot),
    ...listMarkdownFiles(fixedRoot),
  ].sort((a, b) => a.localeCompare(b, 'en'));

  const rows = [];

  for (const fp of files) {
    const md = fs.readFileSync(fp, 'utf8');
    const fm = parseFrontmatter(md);

    // Prefer explicit keys; otherwise fall back sanely.
    const account_key =
      typeof fm.account_key === 'string'
        ? fm.account_key
        : typeof fm.bank_key === 'string'
        ? fm.bank_key
        : path.basename(fp, '.md');

    const label =
      typeof fm.label === 'string'
        ? fm.label
        : typeof fm.name === 'string'
        ? fm.name
        : path.basename(fp, '.md');

    const balance =
      typeof fm.balance === 'number'
        ? fm.balance
        : typeof fm.current_balance === 'number'
        ? fm.current_balance
        : typeof fm.available === 'number'
        ? fm.available
        : undefined;

    const as_of =
      typeof fm.as_of === 'string'
        ? fm.as_of
        : typeof fm.as_of_date === 'string'
        ? fm.as_of_date
        : '';

    const kind =
      typeof fm.kind === 'string'
        ? fm.kind
        : typeof fm.type === 'string'
        ? fm.type
        : '';

    rows.push({
      label,
      account_key,
      kind,
      balance,
      as_of,
      file: path.relative(vaultBase, fp).replaceAll('\\', '/'),
    });
  }

  // Deterministic ordering
  rows.sort((a, b) => String(a.label).localeCompare(String(b.label), 'en'));

  const ds =
    typeof dateStr === 'string' && dateStr.trim() ? dateStr.trim() : '';

  const out = [];
  out.push('## Accounts');
  if (ds) out.push(`- date_str: \`${ds}\``);
  out.push('');

  out.push('| label | account_key | kind | balance | as_of | source |');
  out.push('| --- | --- | --- | ---: | --- | --- |');

  for (const r of rows) {
    out.push(
      `| ${String(r.label)} | ${String(r.account_key)} | ${
        r.kind || ''
      } | ${money(r.balance)} | ${r.as_of || ''} | \`${r.file}\` |`
    );
  }

  out.push('');
  return out.join('\n');
};
