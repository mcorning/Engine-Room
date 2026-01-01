/**
 * Engine Room/scripts/runaccounts.js
 * Build 2 entry point (accounts-only).
 * Returns markdown string. Any thrown error is caught by the template block.
 */

const path = require('path');

module.exports = async function runaccounts({ dateStr } = {}) {
  const vaultBase = app.vault.adapter.getBasePath();
  const accountsPath = path.join(
    vaultBase,
    'Engine Room',
    'lib',
    'accounts.js'
  );

  // Dev-mode: avoid stale modules
  try {
    delete require.cache[require.resolve(accountsPath)];
  } catch (_) {}

  const accounts = require(accountsPath);

  if (typeof accounts !== 'function') {
    throw new Error(
      `runaccounts: expected Engine Room/lib/accounts.js to export a function, got ${typeof accounts}`
    );
  }

  const md = await accounts({ dateStr });
  return typeof md === 'string' ? md : String(md);
};
