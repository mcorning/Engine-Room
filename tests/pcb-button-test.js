// Engine Room/scripts/pcb-button-test.js

module.exports = async () => {
  const core = require('./pcb-core.js');

  const rows = [
    { date: '2025-12-15', label: 'Rocket Mortgage', delta: -1500 },
    { date: '2025-12-10', label: 'SSI Deposit', delta: 1026 },
    { date: '2025-12-14', label: 'Verizon', delta: -200 },
  ];

  const begin = 2722.46;

  const fc = core.computeForecast(begin, rows);
  const line = core.totalsLine(fc);

return (
  '\n' +
  [
    '### Output',
    `- Inflow: ${fc.inflow}`,
    `- Outflow: ${fc.outflow}`,
    `- Net: ${fc.net}`,
    `- Running: ${fc.running}`,
    '',
    `**${line}**`,
  ].join('\n')
);

};
