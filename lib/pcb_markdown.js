/**
 * Engine Room/lib/pcb_markdown.js
 * rows → markdown (pure presentation)
 *
 * Target table schema (phone-friendly):
 * | Flow | On | Amount | Cycle |
 */

function fmtMoney(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}$${s}`;
}

function baseNoteName(s) {
  if (s == null) return '';
  const str = String(s).trim();
  // If already a wiki link, strip any alias: [[Note|Alias]] -> Note
  const m = str.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  if (m) return m[1].trim();
  return str;
}

function wikiLink(name) {
  const n = baseNoteName(name);
  return n ? `[[${n}]]` : '';
}

/**
 * @param {Array<Object>} rows
 * @param {{dateStr?:string, from?:string, to?:string}} opts
 */
module.exports = function pcb_markdown(rows, { dateStr, from, to } = {}) {
  const out = [];
  out.push('## PCB');
  if (dateStr) out.push(`- date: \`${dateStr}\``);
  if (from) out.push(`- From: \`${from}\``);
  if (to) out.push(`- To: \`${to}\``);
  out.push('');

  if (!Array.isArray(rows) || rows.length === 0) {
    out.push('_No events in window._');
    out.push('');
    return out.join('\n');
  }

  out.push('| Flow | On | Amount | Running | Cycle |');
  out.push('| --- | ---:| ---:| ---:| --- |');

  for (const r of rows) {
    // use label when present (preferred display name)
    const flow = wikiLink(r.label ?? r.flow ?? r.item ?? r.bill ?? r.ref ?? '');
    const on = String(r.on ?? r.date ?? r.due_date ?? '');
    const amt = fmtMoney(r.amount);
    const cycle = String(r.cycle ?? '');
    const running = fmtMoney(r.running_total);
    out.push(`| ${flow} | ${on} | ${amt} | ${running} | ${cycle} |`);
  }

  out.push('');
  return out.join('\n');
};
