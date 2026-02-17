---
type: daily_note
created: <% tp.date.now("YYYY-MM-DD HH:mm") %>
date: <% tp.file.title %>
pcb_horizon_mode: days
pcb_horizon_days: 15
---

# Daily Note — <% tp.file.title %>
- Created: <% tp.date.now("dddd, MMMM D, YYYY") %>
---
<%*


// Debug toggles (Build 3 requirement)
const PCB_FLAGS = {
  incomes: true,
  accounts: true,
  pcb: true,          // stub for now; we'll wire real PCB markdown later
  debug: true,
};

try {
  const path = (window.require ?? require)("path");
  const vaultBase = app.vault.adapter.getBasePath();
  const modPath = path.join(vaultBase, "Engine Room", "scripts", "runpcb.js");

  try { delete (window.require ?? require).cache[(window.require ?? require).resolve(modPath)] } catch(e) {}

  const runpcb = (window.require ?? require)(modPath);
const fm = tp.frontmatter ?? {};
const pcbHorizonMode = fm.pcb_horizon_mode ?? "eom";
const pcbHorizonDays = fm.pcb_horizon_days ?? 30;

console.log("PCB horizon:", fm.pcb_horizon_mode, fm.pcb_horizon_days);

const out = await runpcb({
  dateStr: tp.file.title,
  flags: PCB_FLAGS,
  horizon: { mode: pcbHorizonMode, days: pcbHorizonDays },
});


  tR += "\n" + out + "\n";
} catch (e) {
  tR += "\n⚠️ runpcb failed:\n" + (e?.stack ?? String(e)) + "\n";
}
%>









---

## Notes
- 

## Actions
- 

