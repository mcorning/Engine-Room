```dataviewjs

const heldShares = 90;

let matches = [];

for (let page of dv.pages('"Calendar"')) {
for (let item of page.file.lists || []) {
  let line = item.text || "";

    const match = line.match(/Sold\s+(\d+)\s+shares\s+through Morgan Stanley/i);
    if (match) {
      matches.push({ date: page.file.name, shares: parseInt(match[1]) });
    }
  }
}

let totalSold = matches.reduce((sum, entry) => sum + entry.shares, 0);
let remaining = heldShares - totalSold;

dv.header(2, "📉 MSFT Share Tracking");
dv.paragraph(`Total shares sold: **${totalSold}**`);
dv.paragraph(`Remaining shares: **${remaining}**`);
dv.table(["Date", "Shares Sold"], matches.map(m => [m.date, m.shares]));
```