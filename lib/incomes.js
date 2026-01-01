/**
 * Engine Room/lib/incomes.js
 * Build 1 (real): read Engine Room/Income notes and render a deterministic markdown snapshot.
 * - No Dataview.
 * - Deterministic ordering.
 * - Guards: strings vs numbers, missing keys, etc.
 */

const fs = require('fs');
const path = require('path');

function safeReadFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseFrontmatter(md) {
  // Minimal YAML frontmatter parser for simple `key: value` scalars.
  // Returns {} if no FM found.
  const lines = md.split(/\r?\n/);
  if (lines[0] !== '---') return {};
  let i = 1;
  const out = {};
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') break;
    const m = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1].trim().replace(/ /g, '_');
    let val = m[2].trim();

    // Coerce numbers when safe
    if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);

    out[key] = val;
  }
  return out;
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))
    .map((d) => path.join(dirPath, d.name));
}

function dollars(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

module.exports = async function incomes({ dateStr } = {}) {
  const vaultBase = app.vault.adapter.getBasePath();
  const incomeRoot = path.join(vaultBase, 'Engine Room', 'Income');
  const fixedRoot = path.join(incomeRoot, 'Fixed');

  // Deterministic file order
  const files = [
    ...listMarkdownFiles(incomeRoot),
    ...listMarkdownFiles(fixedRoot),
  ].sort((a, b) => a.localeCompare(b, 'en'));

  const rows = [];

  for (const fp of files) {
    const md = safeReadFile(fp);
    const fm = parseFrontmatter(md);

    const ref = typeof fm.ref === 'string' ? fm.ref : path.basename(fp, '.md');
    const amount =
      typeof fm.amount === 'number'
        ? fm.amount
        : typeof fm.amount === 'string' && /^-?\d+(\.\d+)?$/.test(fm.amount)
        ? Number(fm.amount)
        : undefined;

    // Optional schedule hints (present in some notes)
    const week =
      typeof fm.week === 'number'
        ? fm.week
        : typeof fm.week === 'string' && /^\d+$/.test(fm.week)
        ? Number(fm.week)
        : '';

    const bankKey = typeof fm.bank_key === 'string' ? fm.bank_key : '';

    rows.push({
      ref,
      amount,
      week,
      bankKey,
      file: path.relative(vaultBase, fp).replaceAll('\\', '/'),
    });
  }

  // Deterministic row order by ref
  rows.sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'en'));

  const ds =
    typeof dateStr === 'string' && dateStr.trim() ? dateStr.trim() : '';

  const mdOut = [];
  mdOut.push('## Incomes');
  if (ds) mdOut.push(`- date_str: \`${ds}\``);
  mdOut.push('');
  mdOut.push('| ref | amount | week | bank_key | source |');
  mdOut.push('| --- | ---: | ---: | --- | --- |');

  for (const r of rows) {
    mdOut.push(
      `| ${String(r.ref)} | ${dollars(r.amount)} | ${r.week ?? ''} | ${
        r.bankKey
      } | \`${r.file}\` |`
    );
  }

  mdOut.push('');
  return mdOut.join('\n');
};
