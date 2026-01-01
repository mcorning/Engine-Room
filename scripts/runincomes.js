/**
 * Engine Room/scripts/runincomes.js
 * Templater entry point for Build 1 (incomes-only).
 * Returns markdown string. Never throws uncaught; throws are turned into note text by the template try/catch.
 */


const path = require('path');

module.exports = async function runincomes({ dateStr } = {}) {
  // dateStr is expected like "YYYY-MM-DD" (tp.file.title for Daily Notes)
  // Keep deterministic: no Date.now(), no locale, no random.
  const vaultBase = app.vault.adapter.getBasePath();

  const incomesPath = path.join(vaultBase, 'Engine Room', 'lib', 'incomes.js');

  // Optional: bust cache during dev so edits show up immediately
  try {
    delete require.cache[require.resolve(incomesPath)];
  } catch (_) {}

  const incomes = require(incomesPath);

  if (typeof incomes !== 'function') {
    throw new Error(
      `runincomes: expected Engine Room/lib/incomes.js to export a function, got ${typeof incomes}`
    );
  }

  const md = await incomes({ dateStr });

  // Guarantee string output (deterministic & safe)
  return typeof md === 'string' ? md : String(md);
};
