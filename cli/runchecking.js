/**
 * Engine Room/scripts/runchecking.js
 * Build 2 entry point (checking-only).
 * Returns markdown string. Any thrown error is caught by the template block.
 */

const path = require('path');

module.exports = async function runchecking({ dateStr } = {}) {
  const vaultBase = app.vault.adapter.getBasePath();
  const checkingPath = path.join(
    vaultBase,
    'Engine Room',
    'lib',
    'checking.js'
  );

  // Dev-mode: avoid stale modules
  try {
    delete require.cache[require.resolve(checkingPath)];
  } catch (_) {}

  const checking = require(checkingPath);

  if (typeof checking !== 'function') {
    throw new Error(
      `runchecking: expected Engine Room/lib/checking.js to export a function, got ${typeof checking}`
    );
  }

  const md = await checking({ dateStr });
  return typeof md === 'string' ? md : String(md);
};
