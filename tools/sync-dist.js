// ============================================================================
// SandTogether — regenerates the shipped copies of the mod sources:
//   src/<runtime files>  ->  dist-package/src/
//   dist-package/        ->  workshop/content/   (what publish-workshop.js uploads)
// Usage: node tools/sync-dist.js [--check]   (--check: list stale copies, exit 1 if any)
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
// files the installers and the auto-updater need at runtime (dev tools stay in src/ only)
const RUNTIME = ['patch.js', 'patches.json', 'sandtogether.js', 'st-main.js', 'st-patch-engine.js', 'st-preload-append.js'];

const pairs = RUNTIME.map((f) => [path.join(ROOT, 'src', f), path.join(ROOT, 'dist-package', 'src', f)]);
const shipped = new Set(pairs.map(([, to]) => to));
(function walk(rel) {
  for (const e of fs.readdirSync(path.join(ROOT, 'dist-package', rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r);
    else shipped.add(path.join(ROOT, 'dist-package', r));
  }
})('');
for (const f of shipped) pairs.push([f, path.join(ROOT, 'workshop', 'content', path.relative(path.join(ROOT, 'dist-package'), f))]);
// dist-package/src is refreshed first, so the workshop copy gets its new content (and the real source's mode)
const want = new Map();
for (const [from, to] of pairs) want.set(to, want.has(from) ? want.get(from) : { buf: fs.readFileSync(from), mode: fs.statSync(from).mode & 0o777 });

let stale = 0, orphans = 0;
for (const [to, { buf, mode }] of want) {
  const cur = fs.existsSync(to) ? fs.readFileSync(to) : null;
  if (cur && cur.equals(buf) && !(fs.statSync(to).mode & 0o111) === !(mode & 0o111)) continue; // git tracks only the exec bit
  stale++;
  console.log((CHECK ? 'stale: ' : 'updated: ') + path.relative(ROOT, to));
  if (!CHECK) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf); fs.chmodSync(to, mode); }
}
// copies without a source (a file removed from src/ or dist-package/)
for (const dir of [path.join(ROOT, 'dist-package', 'src'), path.join(ROOT, 'workshop', 'content')]) {
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!want.has(p)) { orphans++; console.log('orphan: ' + path.relative(ROOT, p) + ' (no source; remove it by hand)'); }
    }
  })(dir);
}
console.log(stale + orphans ? (stale ? stale + ' file(s) ' + (CHECK ? 'out of date' : 'updated') : '') + (orphans ? ' ' + orphans + ' orphan(s)' : '') : 'all copies up to date');
process.exit(CHECK && stale + orphans ? 1 : 0);
