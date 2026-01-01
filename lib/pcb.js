/**
 * Engine Room/lib/pcb.js
 * Compose incomes/accounts/pcb markdown from lib modules.
 * No template dependencies.
 */

const path = require("path");

function asBool(v, def = true) {
  return typeof v === "boolean" ? v : def;
}

function reqFresh(p) {
  try { delete require.cache[require.resolve(p)]; } catch (_) {}
  return require(p);
}

module.exports = async function pcb({ dateStr, flags } = {}) {
  const vaultBase = app.vault.adapter.getBasePath();

  const f = flags ?? {};
  const showIncomes = asBool(f.incomes, true);
  const showAccounts = asBool(f.accounts, true);
  const showPCB = asBool(f.pcb, true);
  const debug = asBool(f.debug, false);

  const parts = [];

  if (debug) {
    parts.push("## Debug");
    parts.push(`- date: \`${String(dateStr ?? "")}\``);
    parts.push(`- flags: \`${JSON.stringify({ incomes: showIncomes, accounts: showAccounts, pcb: showPCB })}\``);
    parts.push("");
  }

  const incomesPath = path.join(vaultBase, "Engine Room", "lib", "incomes.js");
  const accountsPath = path.join(vaultBase, "Engine Room", "lib", "accounts.js");
  const rowsPath = path.join(vaultBase, "Engine Room", "lib", "pcb_rows.js");
  const mdPath = path.join(vaultBase, "Engine Room", "lib", "pcb_markdown.js");

  if (showIncomes) {
    const incomes = reqFresh(incomesPath);
    const md = await incomes({ dateStr });
    parts.push(typeof md === "string" ? md : String(md));
  }

  if (showAccounts) {
    const accounts = reqFresh(accountsPath);
    const md = await accounts({ dateStr });
    parts.push(typeof md === "string" ? md : String(md));
  }

  if (showPCB) {
    const pcb_rows = reqFresh(rowsPath);
    const pcb_markdown = reqFresh(mdPath);

    const rows = await pcb_rows({ dateStr });
    const md = pcb_markdown(rows, { dateStr });
    parts.push(md);
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
};
