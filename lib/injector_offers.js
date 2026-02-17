/**
 * Engine Room/lib/injector_offers.js
 *
 * Injectors are time-dependent state vectors (offers), not scalars.
 *
 * Responsibilities:
 *   - Parse injector notes under Engine Room/Injectors
 *   - Normalize frontmatter with sensible defaults and alias keys
 *   - Compute an "offer" for a target date:
 *       { id, name, priority, latency_days, available_on, cap, remaining, cost }
 *
 * Notes:
 *   - We intentionally keep this module side-effect free.
 *   - All values are best-effort: missing fields fall back to safe defaults.
 */

const fs = require('fs');
const path = require('path');

function getVaultBase() {
  if (typeof app !== 'undefined' && app?.vault?.adapter?.getBasePath) {
    return app.vault.adapter.getBasePath();
  }
  return process.cwd();
}

/* ---------- Frontmatter parsing (flat) ---------- */

function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return {};

  const body = m[1];
  const out = {};
  const lines = body.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)\s*$/);
    if (!kv) {
      i++;
      continue;
    }

    const key = kv[1];
    let val = kv[2];

    // flat arrays only (for compatibility)
    if (val === '') {
      const arr = [];
      i++;
      while (i < lines.length) {
        const mm = lines[i].match(/^\s*-\s*(.*)\s*$/);
        if (!mm) break;
        arr.push(castScalar(mm[1]));
        i++;
      }
      out[key] = arr;
      continue;
    }

    out[key] = castScalar(val);
    i++;
  }

  return out;
}

function castScalar(v) {
  if (v == null) return v;
  const s = String(v).trim();

  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  if (s === 'true') return true;
  if (s === 'false') return false;

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }

  return s;
}

/* ---------- Helpers ---------- */

function listMarkdownFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .flatMap((d) => {
      const full = path.join(dirPath, d.name);
      if (d.isDirectory()) return listMarkdownFilesRecursive(full);
      if (d.isFile() && d.name.toLowerCase().endsWith('.md')) return [full];
      return [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const [Y, M, D] = String(dateStr).split('-').map(Number);
  if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) return dateStr;
  const dt = new Date(Y, M - 1, D);
  dt.setDate(dt.getDate() + Number(days || 0));
  return ymd(dt);
}

function pickNumber(fm, keys, def = 0) {
  for (const k of keys) {
    const v = fm[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return def;
}

function pickBool(fm, keys, def = true) {
  for (const k of keys) {
    const v = fm[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return def;
}

function pickString(fm, keys, def = '') {
  for (const k of keys) {
    const v = fm[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return def;
}

/* ---------- Public API ---------- */

function loadInjectors({ vaultBase } = {}) {
  const base = vaultBase || getVaultBase();
  const injectorsDir = path.join(base, 'Engine Room', 'Injectors');

  const files = listMarkdownFilesRecursive(injectorsDir);
  const out = [];

  for (const fp of files) {
    const md = fs.readFileSync(fp, 'utf8');
    const fm = parseFrontmatter(md);

    const name = path.basename(fp, '.md');

    const enabled = pickBool(fm, ['injector_enabled', 'enabled'], true);
    const priority = pickNumber(fm, ['injector_priority', 'priority'], 100);
    const latency_days = pickNumber(fm, ['injector_latency_days', 'latency_days', 'latency'], 0);

    // cap: explicit injector_cap, else holdings, else balance, else 0
    const cap = pickNumber(fm, ['injector_cap', 'cap', 'holdings', 'balance'], 0);

    // optional proxy friction (tax/fees/emotional), for later optimization
    const cost = pickNumber(fm, ['injector_cost', 'cost'], 0);

    // chunking: if set, injections will be rounded up to nearest chunk
    const chunk = pickNumber(fm, ['injector_chunk', 'chunk'], 0);

    // human reference label (optional)
    const ref = pickString(fm, ['ref', 'name'], name);

    out.push({
      id: fp,
      file: fp,
      name,
      ref,
      enabled,
      priority,
      latency_days,
      cap,
      cost,
      chunk,
      fm,
    });
  }

  return out;
}

function buildOffers(injectors, { dateStr } = {}) {
  const target = dateStr || ymd(new Date());
  return (injectors || [])
    .filter((x) => x && x.enabled)
    .map((x) => {
      const available_on = addDays(target, x.latency_days);
      return {
        id: x.id,
        name: x.name,
        ref: x.ref,
        priority: x.priority,
        latency_days: x.latency_days,
        available_on,
        cap: Number(x.cap) || 0,
        remaining: Number(x.cap) || 0,
        cost: Number(x.cost) || 0,
        chunk: Number(x.chunk) || 0,
        source: x.file,
      };
    })
    .sort((a, b) => (a.priority - b.priority) || (a.cost - b.cost) || a.name.localeCompare(b.name));
}

module.exports = {
  loadInjectors,
  buildOffers,
  addDays,
  ymd,
};
