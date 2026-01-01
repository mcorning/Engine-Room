// pcb-core.js
// Core PCB math — no Dataview, no Obsidian.

// Row shape we expect:
//
// {
//   date: "2025-01-15",  // or any string
//   label: "Rocket Mortgage",
//   delta: -4612.00      // + for inflow, - for outflow, NUMBER
// }

function normalizeRows(rowsLike) {
  // Accept Array, DataviewArray-like, etc.
  return Array.from(rowsLike ?? []).map((r) => ({
    ...r,
    delta: Number(r.delta ?? 0),
  }));
}

function computeTotals(rowsLike) {
  const rows = normalizeRows(rowsLike);

  const inflow = rows
    .filter((r) => r.delta > 0)
    .reduce((s, r) => s + r.delta, 0);

  const outflow = -rows
    .filter((r) => r.delta < 0)
    .reduce((s, r) => s + r.delta, 0);

  return { inflow, outflow };
}
function computeForecast(beginBalance, rowsLike) {
  const totals = computeTotals(rowsLike); // inflow + outflow
  const net = totals.inflow - totals.outflow;

  const running = Number(beginBalance ?? 0) + net;
  console.log(`Checking\t ${formatCurrency(beginBalance)}`);
  console.log(`Net   \t\t${formatCurrency(net)}`);
  console.log('\t\t---------')
console.log('\t\t', formatCurrency(running));
  return {
    ...totals,
    net,
    running,
  };
}

function formatCurrency(value) {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

// Convenience for building the exact string your DVJS block prints.
function totalsLine({ inflow, outflow, running }) {
  return `Totals — In: ${formatCurrency(inflow)}  Out: ${formatCurrency(
    outflow
  )}  Projected: ${formatCurrency(running)}`;
}

module.exports = { materializePCB };

module.exports = {
  normalizeRows,
  computeTotals,
  computeForecast,
  formatCurrency,
  totalsLine,
};
// ===============================
// Test harness (only runs via CLI)
// ===============================
if (require.main === module) {
  console.log('Running pcb-core.js test...');

  const sampleRows = [
    { date: '2025-12-15', label: 'Rocket Mortgage', delta: -1500 },
    { date: '2025-12-10', label: 'SSI Deposit', delta: 1026 },
    { date: '2025-12-14', label: 'Verizon', delta: -200 },
  ];

  const beginBalance = 2722.46; // ⬅️ put TODAY’s real checking balance here

  const forecast = computeForecast(beginBalance, sampleRows);

  console.log('Forecast object:', forecast);
  console.log('Formatted line:', totalsLine(forecast));
}

