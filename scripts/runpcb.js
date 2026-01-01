/**
 * Engine Room/scripts/runpcb.js
 * Build 3/4 entry point: compose incomes/accounts/pcb markdown.
 */

const path = require("path");

module.exports = async function runpcb({ dateStr, from, to, flags } = {}) {
  const vaultBase = app.vault.adapter.getBasePath();
  const pcbPath = path.join(vaultBase, 'Engine Room', 'lib', 'pcb.js');

  // Dev-mode: avoid stale modules
  try {
    delete require.cache[require.resolve(pcbPath)];
  } catch (_) {}

  const pcb = require(pcbPath);
  if (typeof pcb !== 'function') {
    throw new Error(
      `runpcb: expected Engine Room/lib/pcb.js to export a function, got ${typeof pcb}`
    );
  }

const md = await pcb({ dateStr, from, to, flags });
  return typeof md === 'string' ? md : String(md);
};
