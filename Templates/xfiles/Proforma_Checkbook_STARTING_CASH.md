---
template: Proforma_Checkbook
debug: true
base: "[[Bases/accounts.base]]"
starting_cash: 2855.52
---

### Proforma Checkbook — Starting Cash Probe

> This block resolves the **base** link above, reads its frontmatter if available, and
> totals account balances using the same logic we saved in *summing a base.md*.
> Nothing here modifies your YAML — it only **displays** the computed starting cash.

```dataviewjs
/***** WRITE STARTING_CASH BACK TO YAML *****/
const WRITE_BACK = true; // ← set false if you only want to view

// --- inputs pulled from your probe block (reuse or compute again) ---
function normalizeBase(b){
  if (!b) return null;
  if (typeof b === "object") return b.path ?? b.file?.path ?? b.file?.name ?? null;
  let s = String(b).trim();
  if (s.startsWith("[[") && s.includes("]]")) s = s.slice(2, s.indexOf("]]"));
  s = s.split("|")[0].split("#")[0].trim();
  return s || null;
}
function resolveTFile(target){
  if (!target) return null;
  const from = dv.current().file?.path ?? "/";
  return app.metadataCache.getFirstLinkpathDest(String(target), from);
}

const rawBase   = dv.current().base;
const baseName  = normalizeBase(rawBase);
const baseTFile = resolveTFile(baseName);

// read base frontmatter (if present) for defaults
let fm = {};
if (baseTFile){
  const cache = app.metadataCache.getFileCache(baseTFile);
  fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
}
const folder  = fm.folder  ?? "Engine Room/Accounts";
const include = Array.isArray(fm.include) ? fm.include : ["account"];
const exclude = Array.isArray(fm.exclude) ? fm.exclude : ["stock"];

// --- Bases-style helpers (folder-safe) ---
const normTags = p =>
  new Set((p.file?.tags ?? []).map(t => String(t).toLowerCase().replace(/^#/, "")));

const hasTag = (tagsSet, tag, hierarchical=true) =>
  hierarchical
    ? [...tagsSet].some(t => t === tag || t.startsWith(tag + "/"))
    : tagsSet.has(tag);

function pagesByTags({
  folder = null,
  include = [],
  exclude = [],
  requireAll = false,
  hierarchical = true,
  hierarchicalFolder = true
} = {}) {

  let q = dv.pages();
  if (folder) {
    q = q.where(p => {
      const pf = p.file?.folder ?? "";
      return hierarchicalFolder ? pf.startsWith(folder) : (pf === folder);
    });
  }

  return q.where(p => {
      const T = normTags(p);
      const okInc = include.length
        ? (requireAll
            ? include.every(tag => hasTag(T, tag, hierarchical))
            : include.some(tag => hasTag(T, tag, hierarchical)))
        : true;
      const okExc = exclude.length
        ? !exclude.some(tag => hasTag(T, tag, hierarchical))
        : true;
      return okInc && okExc;
    })
    .sort(p => p.file.name, 'asc')
    .array(); // important in DVJS
}

// --- compute total ---
const pages = pagesByTags({ folder, include, exclude, hierarchicalFolder: true });
const total = pages.reduce((a,p) => a + Number(p.balance ?? 0), 0);
const rounded = Number(total.toFixed(2));

dv.paragraph("**💰 Computed starting cash:** " +
  rounded.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}));

// --- write back to this note's YAML ---
if (WRITE_BACK){
  try {
    const thisPath = dv.current().file.path;
    const thisFile = app.vault.getAbstractFileByPath(thisPath);
    await app.fileManager.processFrontMatter(thisFile, fm => {
      fm.starting_cash = rounded;
    });
    dv.paragraph("✅ Wrote `starting_cash: " + rounded + "` to YAML.");
  } catch (e){
    dv.paragraph("⚠️ Failed to write starting_cash: " + e.message);
  }
}
