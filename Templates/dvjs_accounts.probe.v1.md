---
title: dvjs_accounts.probe.v1
tags: [janus, dvjs, probe, accounts]
SCOPE: Bases/accounts
LIMIT: 50
---

## Accounts Probe (what does SCOPE return?)

```dataviewjs
(() => {
  const SCOPE = dv.current().SCOPE ?? "Bases/accounts";
  const LIMIT = Number(dv.current().LIMIT ?? 50);

  let pages = dv.pages(`"${SCOPE}"`);
  pages = Array.from(pages);
  const count = pages.length;

  dv.header(3, `SCOPE: "${SCOPE}" → ${count} page(s)`);

  const rows = pages.slice(0, LIMIT).map(p => {
    const fmTags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === "string" ? [p.tags] : []);
    const fileTags = (p.file?.etags ?? []);
    return [p.file?.link ?? p.file?.path ?? "—", p.file?.path ?? "—", fileTags.join(", "), fmTags.join(", ")];
  });
  dv.table(["Name", "Path", "file.etags", "frontmatter tags"], rows);
})();
```
