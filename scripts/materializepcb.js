/**
 * pcb_materialize_wrapper
 * - Called via direct require() from a Templater template
 * - Signature: await pcb_materialize_wrapper(tp)
 */

const path = require('path');

module.exports = async function pcb_materialize_wrapper(tp) {
  if (!tp || !tp.app) {
    throw new Error(
      'pcb_materialize_wrapper: missing tp.\n' +
        'Call with: await pcb_materialize_wrapper(tp)'
    );
  }

  const vaultBase = tp.app.vault.adapter.getBasePath();
  const corePath = path.join(
    vaultBase,
    'Engine Room',
    'scripts',
    'pcb-core.js'
  );

  // Force reload pcb-core every run (kills Groundhog Day)
  try {
    delete require.cache[require.resolve(corePath)];
  } catch (_) {}

  const core = require(corePath);

  // Resolve materializePCB across common export styles:
  //  A) module.exports = { materializePCB }
  //  B) module.exports = async function materializePCB() {}
  //  C) module.exports = { default: fn }   (some bundlers)
  //  D) module.exports = { default: { materializePCB: fn } } (ESM interop weirdness)
  const materializePCB =
    (core && typeof core === 'object' ? core.materializePCB : undefined) ??
    (core && typeof core === 'object' ? core.default : undefined) ??
    (core &&
    typeof core === 'object' &&
    core.default &&
    typeof core.default === 'object'
      ? core.default.materializePCB
      : undefined) ??
    core;

  if (typeof materializePCB !== 'function') {
    const keys =
      core && typeof core === 'object' ? Object.keys(core).join(', ') : '(n/a)';
    const defaultKeys =
      core &&
      typeof core === 'object' &&
      core.default &&
      typeof core.default === 'object'
        ? Object.keys(core.default).join(', ')
        : '(n/a)';

    throw new Error(
      'pcb_materialize_wrapper: pcb-core.js does not export a callable function.\n' +
        `core typeof: ${typeof core}\n` +
        `core keys: ${keys}\n` +
        `core.default typeof: ${
          core && typeof core === 'object' ? typeof core.default : '(n/a)'
        }\n` +
        `core.default keys: ${defaultKeys}\n` +
        `corePath: ${corePath}`
    );
  }

  return await materializePCB({
    app: tp.app,
    dateStr: tp.file.title,
  });
};
