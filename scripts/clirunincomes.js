const path = require('path');

(async () => {
  const dateStr = process.argv[2];
  if (!dateStr) {
    console.error('Usage: node cli_run_incomes.js YYYY-MM-DD');
    process.exit(1);
  }

  const run_incomes = require('./run_incomes.js');
  const out = await run_incomes({ dateStr, vaultBase: process.cwd() });
  console.log(out);
})();
