/**
 * pcb.js — orchestrator: Incomes + Accounts + PCB
 *
 * opts:
 *   - dateStr (string) REQUIRED
 *   - from (string) optional
 *   - to   (string) optional
 *   - flags (object) optional: { incomes, accounts, pcb, debug }
 */

const path = require('path');

function asBool(v, def = true) {
  return typeof v === 'boolean' ? v : def;
}

function reqFresh(p) {
  try {
    delete require.cache[require.resolve(p)];
  } catch (_) {}
  return require(p);
}

async function runSection(parts, title, fn) {
  try {
    const md = await fn();
    if (md) parts.push(typeof md === 'string' ? md : String(md));
  } catch (e) {
    parts.push(`## ⚠️ ${title} failed`);
    parts.push('```');
    parts.push(e?.stack ?? String(e));
    parts.push('```');
    parts.push('');
  }
}

module.exports = async function pcb(opts = {}) {
  // Obsidian/Templater environment assumption
  if (typeof app === 'undefined') {
    throw new Error(
      'pcb.js: global `app` is missing (not running inside Obsidian).'
    );
  }

  const dateStr = opts.dateStr;
  if (!dateStr) throw new Error('pcb.js: opts.dateStr is required');

  const vaultBase = app.vault.adapter.getBasePath();

  // flags can be passed as opts.flags or as second positional arg in old callers
  const f = opts.flags ?? {};
  const showIncomes = asBool(f.incomes, true);
  const showAccounts = asBool(f.accounts, true);
  const showPCB = asBool(f.pcb, true);
  const debug = asBool(f.debug, false);

  const incomesPath = path.join(vaultBase, 'Engine Room', 'lib', 'incomes.js');
  const accountsPath = path.join(
    vaultBase,
    'Engine Room',
    'lib',
    'accounts.js'
  );
  const rowsPath = path.join(vaultBase, 'Engine Room', 'lib', 'pcb_rows.js');
  const mdPath = path.join(vaultBase, 'Engine Room', 'lib', 'pcb_markdown.js');

  const parts = [];

  if (debug) {
    parts.push('## Debug');
    parts.push('```');
    parts.push(`date: ${dateStr}`);
    parts.push(`from: ${opts.from ?? ''}`);
    parts.push(`to:   ${opts.to ?? ''}`);
    parts.push(
      `flags: ${JSON.stringify({
        incomes: showIncomes,
        accounts: showAccounts,
        pcb: showPCB,
      })}`
    );
    parts.push('```');
    parts.push('');
  }

  if (showIncomes) {
    await runSection(parts, 'Incomes', async () => {
      const incomes = reqFresh(incomesPath);
      return await incomes({ dateStr, from: opts.from, to: opts.to });
    });
  }

  if (showAccounts) {
    await runSection(parts, 'Accounts', async () => {
      const accounts = reqFresh(accountsPath);
      return await accounts({ dateStr, from: opts.from, to: opts.to });
    });
  }

  if (showPCB) {
    await runSection(parts, 'PCB', async () => {
      const pcb_rows = reqFresh(rowsPath);
      const pcb_markdown = reqFresh(mdPath);
      const rows = await pcb_rows({ dateStr, from: opts.from, to: opts.to });
      return pcb_markdown(rows, { dateStr, from: opts.from, to: opts.to });
    });
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
};
