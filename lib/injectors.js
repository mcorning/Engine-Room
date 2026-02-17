/**
 * Engine Room/lib/injectors.js
 *
 * Phone-friendly Injectors snapshot.
 *
 * Symmetry repair:
 *   Injectors are time-dependent offers (cap + availability), not a scalar.
 */

const { loadInjectors, buildOffers } = require('./injector_offers');

function fmtMoney(n) {
  const x = Number(n);
  if (!isFinite(x)) return '';
  const abs = Math.abs(x);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = x < 0 ? '-' : '';
  return `${sign}$${s}`;
}

module.exports = function injectors({ dateStr } = {}) {
  const injectors = loadInjectors();
  const offers = buildOffers(injectors, { dateStr });

  const out = [];
  out.push('## Injectors');
  if (dateStr) out.push(`- As of: \`${dateStr}\``);
  out.push('');

  if (offers.length === 0) {
    out.push('_No injector notes found._');
    out.push('');
    return out.join('\n');
  }

  out.push('| Injector | Priority | Cap | Latency (days) | Available on |');
  out.push('| --- | ---: | ---: | ---: | --- |');

  for (const o of offers) {
    out.push(`| [[${o.name}]] | ${o.priority} | ${fmtMoney(o.cap)} | ${o.latency_days} | ${o.available_on} |`);
  }

  out.push('');
  return out.join('\n');
};
