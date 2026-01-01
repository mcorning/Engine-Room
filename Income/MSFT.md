---
tags:
  - ltcg
  - injection
source: Morgan Stanley
total_holdings: 48168.21
sharesAvailable: 90
account: AAA-8311
see_holdings: https://mso.morganstanleyclientserv.com/atrium/#/accounts/holdings
see_awards: https://stockplan.morganstanley.com/solium/servlet/ui/dashboard
note: the awards link may not work. go through holdings site
mb: true
as_of: 2025-09-24
amount: 1000
---


```dataviewjs

let file = dv.current();
const heldShares = file.sharesAvailable;

let matches = [];

for (let page of dv.pages('"Calendar"')) {
  let shares = Number(page.sharesSold);  // cast explicitly
  if (!isNaN(shares)) {
    matches.push({ date: page.file.name, shares });
  }
}

let totalSold = matches.reduce((sum, entry) => sum + entry.shares, 0);
let remaining = heldShares - totalSold;

dv.header(2, "📉 MSFT Activity");
dv.paragraph(`Total shares sold: **${totalSold}**`);
dv.paragraph(`Remaining shares: **${remaining}**`);
dv.table(["Date", "Shares Sold"], matches.map(m => [m.date, m.shares]));


```

---

AAA-8311 Holdings
[Holdings](https://mso.morganstanleyclientserv.com/atrium/#/accounts/holdings)

Stock Plan shows both Stock Awards and Holdings
[Morgan Stanley at Work Dashboard](https://stockplan.morganstanley.com/solium/servlet/ui/dashboard)

