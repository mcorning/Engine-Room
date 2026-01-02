---
type: daily_note
created: <% tp.date.now("YYYY-MM-DD HH:mm") %>
date: <% tp.file.title %>
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
  debug: false,
};

try {
  const path = (window.require ?? require)("path");
  const vaultBase = app.vault.adapter.getBasePath();
  const modPath = path.join(vaultBase, "Engine Room", "scripts", "runpcb.js");

  try { delete (window.require ?? require).cache[(window.require ?? require).resolve(modPath)] } catch(e) {}

  const runpcb = (window.require ?? require)(modPath);
  const out = await runpcb({ dateStr: tp.file.title, flags: PCB_FLAGS });

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

