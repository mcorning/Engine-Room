/**
 * pcb.js — orchestrator: Incomes + Checking + PCB
 *
 * opts:
 *   - dateStr (string) REQUIRED
 *   - from (string) optional
 *   - to   (string) optional
 *   - flags (object) optional: { incomes, checking, pcb, debug }
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
  const showInjectors = asBool(f.injectors, true);
  const showChecking = asBool(f.checking, true);
  const showPCB = asBool(f.pcb, true);
  const debug = asBool(f.debug, false);

  const incomesPath = path.join(vaultBase, 'Engine Room', 'lib', 'incomes.js');
  const injectorsPath = path.join(vaultBase, 'Engine Room', 'lib', 'injectors.js');
  const checkingPath = path.join(
    vaultBase,
    'Engine Room',
    'lib',
    'checking.js'
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
        injectors: showInjectors,
        checking: showChecking,
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
  if (showInjectors) {
    await runSection(parts, 'Injectors', async () => {
      const injectors = reqFresh(injectorsPath);
      return await injectors({ dateStr, from: opts.from, to: opts.to });
    });
  }
  if (showChecking) {
    await runSection(parts, 'Checking', async () => {
      const checking = reqFresh(checkingPath);
      return await checking({ dateStr, from: opts.from, to: opts.to });
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
