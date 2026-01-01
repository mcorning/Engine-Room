// === SOURCE OF TRUTH ===
const L = dv.page("Liquidity");
if (!L) {
  dv.paragraph("⚠️ Liquidity note not found.");
} else {
    dv.paragraph('⚠️ Liquidity note found.');

  // === CONFIG FROM LIQUIDITY ===
  const DEF = L.defaults || {};
  const LEAD = Number(DEF.lead_days ?? 4);       // days ahead to check
  const WEEKEND_RULE = String(DEF.weekend_rule ?? "pay_friday"); // pay_friday|none

  // Known nested amounts (OBX-managed; optional)
  const AMT = {
    mortgage: Number(DEF.mortgage_amount ?? 0),
    verizon: Number(DEF.verizon_amount ?? 0),
    f150: Number(DEF.f150_amount ?? 0)
  };

  // === DATE HANDLING ===
  const title = dv.current().file.name;
  let today = window.moment();
  try {
    const d = window.moment(title.substring(0,10), "YYYY-MM-DD", true);
    if (d?.isValid()) today = d;
  } catch (e) {}

  // Helper: adjust due dates for weekend rule
  function adj(date) {
    if (WEEKEND_RULE !== "pay_friday") return date;
    const dow = date.day(); // 0 Sun ... 6 Sat
    if (dow === 0) return date.clone().subtract(2, "day"); // Sunday -> Friday
    if (dow === 6) return date.clone().subtract(1, "day"); // Saturday -> Friday
    return date;
  }

  // === COLLECT BALANCES (flat top-level keys only) ===
  const EXCLUDE = new Set(["file","tags","defaults","as_of"]);
  const entries = Object.entries(L).filter(([k]) => !EXCLUDE.has(k));
  const byCat = { cash: [], stripe: [], loc: [], credit: [] };
  for (const [k, vRaw] of entries) {
    const v = Number(vRaw) || 0;
    if (k.startsWith("stripe_")) byCat.stripe.push([k, v]);
    else if (k.startsWith("loc_")) byCat.loc.push([k, v]);
    else if (k.startsWith("credit_")) byCat.credit.push([k, v]);
    else byCat.cash.push([k, v]);
  }

  const sum = rows => rows.reduce((s,[,v]) => s+v, 0);
  const cashTotal   = sum(byCat.cash);
  const stripeTotal = sum(byCat.stripe);
  const locTotal    = sum(byCat.loc);
  const creditTotal = sum(byCat.credit);

  // Treat **cash** + **stripe** as near-term usable; LOC/credit are options
  const liquidAvailable = cashTotal + stripeTotal;

  // Optional equity fallback
  const msftShares = Number(L.msft_shares ?? 0);
  const msftPrice  = Number(L.msft_price ?? 0);

  // === OBLIGATIONS (minimal, common ones) ===
  const year = today.year(), month = today.month(); // 0-based
  const due = [
    { key: "mortgage", label: "Mortgage", day: 15, amount: AMT.mortgage },
    { key: "verizon",  label: "Verizon",  day: 17, amount: AMT.verizon  },
    { key: "f150",     label: "F150 loan (MidOr)", day: 25, amount: AMT.f150 }
  ].map(o => {
    const raw = window.moment({ year, month, day: o.day });
    const when = adj(raw);
    const daysOut = when.diff(today, "days");
    return { ...o, when, daysOut };
  });

  const upcoming = due.filter(o => o.daysOut >= 0 && o.daysOut <= LEAD && o.amount > 0);
  const needTotal = upcoming.reduce((s,o)=>s+o.amount, 0);

  const gap = Math.max(0, needTotal - liquidAvailable);
  const fmt = n => "$" + Number(n||0).toFixed(2);
  const listDue = upcoming.map(o => `${o.label} (${o.when.format("MMM D")}): ${fmt(o.amount)}`).join(", ");

  let shareLine = "";
  if (gap > 0 && msftPrice > 0) {
    const sharesNeeded = Math.ceil(gap / msftPrice);
    if (sharesNeeded > 0) {
      shareLine = ` Selling ~${sharesNeeded} MSFT share${sharesNeeded>1?"s":""} at ~${fmt(msftPrice)} would cover the shortfall.`;
    }
  }

  let creditLine = "";
  if (gap > 0 && (locTotal > 0 || creditTotal > 0)) {
    creditLine = " Alternatively, cover with LOC or credit and rebalance after the next income event.";
  }

  let para = "";
  if (upcoming.length === 0) {
    para = `Given your current balances, you have ${fmt(liquidAvailable)} in near‑term liquidity (cash + Stripe) and no obligations within the next ${LEAD} day${LEAD>1?"s":""}. You’re in a good position—consider paying down revolving balances or setting aside a buffer.`;
  } else if (gap <= 0) {
    para = `Given your current balances, you have ${fmt(liquidAvailable)} liquid and upcoming obligations of ${fmt(needTotal)} due soon (${listDue}). You’re covered. If you prefer extra margin, earmark ${fmt(needTotal)} now to avoid surprises.`;
  } else {
    para = `Given your current balances, you have ${fmt(liquidAvailable)} liquid versus ${fmt(needTotal)} due soon (${listDue}), leaving a gap of ${fmt(gap)}.` + shareLine + creditLine;
  }

  dv.paragraph(para);
}
