/**
 * Engine Room/scripts/runpcb.js
 * Build 3/4 entry point: compose incomes/checking/pcb markdown.
 */

const path = require('path');

module.exports = async function runpcb({
  dateStr,
  from,
  to,
  flags,
  horizon,
} = {}) {
  const path = require('path');

  const vaultBase = app.vault.adapter.getBasePath();
  const pcbPath = path.join(vaultBase, 'Engine Room', 'lib', 'pcb.js');

  // dev-mode cache bust
  try {
    delete require.cache[require.resolve(pcbPath)];
  } catch (_) {}

  const pcb = require(pcbPath);
  if (typeof pcb !== 'function') {
    throw new Error('runpcb: pcb.js did not export a function');
  }

  // -----------------------------
  // window normalization
  // -----------------------------
  const effectiveFrom = from ?? dateStr;

  const moment = window.moment ?? require('moment');
  const base = moment(effectiveFrom, 'YYYY-MM-DD', true);
  if (!base.isValid()) {
    throw new Error(`runpcb: invalid dateStr/from: ${effectiveFrom}`);
  }

  function getHorizonEnd(nowMoment, horizon) {
    const mode = horizon?.mode ?? 'eom';
    if (mode === 'days') {
      const days = Number(horizon?.days ?? 30);
      return nowMoment.clone().add(days, 'days').endOf('day');
    }
    return nowMoment.clone().endOf('month').endOf('day');
  }

  const effectiveTo = to ?? getHorizonEnd(base, horizon).format('YYYY-MM-DD');
console.log('PCB window:', { effectiveFrom, effectiveTo, horizon });
console.log('PCB call args:', {
  dateStr,
  from: effectiveFrom,
  to: effectiveTo,
  flags,
});

  // -----------------------------
  // single pcb call (authoritative)
  // -----------------------------
  const md = await pcb({
    dateStr,
    from: effectiveFrom,
    to: effectiveTo,
    flags,
  });

  return typeof md === 'string' ? md : String(md);
};

