// ============================================================================
// SandTogether — checks patches.json against game builds, with the same engine
// the installers use (st-patch-engine.js). Run it after every Sandustry update.
// Usage: node src/check-anchors.js [--wildcard] [--emit] <target>...
//   target: bundle.js | resources/app | game folder (resources/app or app.asar) |
//           a folder of stored builds (<dir>/<version>/app, e.g. one per game version)
//   ST_GAME_VERSIONS=<dir> replaces the target list.
//   --wildcard  also report what the wildcard fallback would recover (installers do this)
//   --emit      print reviewed-ready 0.x variants for the wildcard recoveries (JSON)
// Per patch and build: OK (literal variant N), ALREADY, WILD (auto-adapted), MISS, AMBIGUOUS.
// Exit 2 when any build misses a patch or matches ambiguously without wildcards.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('./st-patch-engine.js');

const args = process.argv.slice(2);
const WILD = args.includes('--wildcard') || args.includes('--emit');
const EMIT = args.includes('--emit');
let targets = args.filter((a) => !a.startsWith('--'));
if (process.env.ST_GAME_VERSIONS) targets = [process.env.ST_GAME_VERSIONS];
if (!targets.length) { console.error('Usage: node src/check-anchors.js [--wildcard] [--emit] <bundle.js | app folder | game folder | folder of builds>...'); process.exit(1); }

// bundle.js straight out of an app.asar (no extraction to disk)
function bundleFromAsar(asar) {
  const buf = fs.readFileSync(asar);
  const headerSize = buf.readUInt32LE(4), jsonLen = buf.readUInt32LE(12);
  const index = JSON.parse(buf.toString('utf8', 16, 16 + jsonLen));
  const node = index.files.dist && index.files.dist.files.js && index.files.dist.files.js.files['bundle.js'];
  if (!node || node.offset === undefined) throw new Error('bundle.js not found in ' + asar);
  const off = 8 + headerSize + Number(node.offset);
  return buf.toString('utf8', off, off + node.size);
}

// -> [{ label, src }]
function resolve(t) {
  const st = fs.statSync(t);
  if (st.isFile()) return [{ label: t, src: t.endsWith('.asar') ? bundleFromAsar(t) : fs.readFileSync(t, 'utf8') }];
  for (const rel of ['dist/js/bundle.js', 'resources/app/dist/js/bundle.js']) {
    const p = path.join(t, rel);
    if (fs.existsSync(p)) {
      // an installed (patched) bundle: check its pristine copy when there is one
      const src = fs.existsSync(p + '.orig') ? p + '.orig' : p;
      let ver = '';
      try { ver = ' (game ' + JSON.parse(fs.readFileSync(path.join(path.dirname(p), '../../package.json'), 'utf8')).version + ')'; } catch (e) {}
      return [{ label: t + ver, src: fs.readFileSync(src, 'utf8') }];
    }
  }
  for (const a of ['resources/app.asar', 'app.asar']) if (fs.existsSync(path.join(t, a))) return [{ label: t, src: bundleFromAsar(path.join(t, a)) }];
  // a folder of builds: every child that resolves
  const out = [];
  for (const e of fs.readdirSync(t, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    const child = fs.existsSync(path.join(t, e.name, 'app')) ? path.join(t, e.name, 'app') : path.join(t, e.name);
    try { out.push(...resolve(child)); } catch (err) { /* not a build */ }
  }
  if (!out.length) throw new Error('no bundle.js / app.asar under ' + t);
  return out;
}

const defs = JSON.parse(fs.readFileSync(path.join(__dirname, 'patches.json'), 'utf8'));
let bad = 0;
const emitted = [];
for (const t of targets) {
  for (const b of resolve(t)) {
    const res = engine.applyBundle(b.src, defs, { wildcard: WILD });
    console.log('\n' + b.label + ' (' + Math.round(b.src.length / 1024) + ' KB)' + (res.fhAlias ? ', FH alias ' + res.fhAlias : ''));
    const n = {};
    for (const r of res.results) {
      n[r.status] = (n[r.status] || 0) + 1;
      const crit = r.critical ? ', CRITICAL' : '';
      if (r.status === 'applied') console.log('[OK]   ', r.id, '(variant ' + r.variant + crit + ')');
      else if (r.status === 'already') console.log('[=]    ', r.id, '(already patched' + crit + ')');
      else if (r.status === 'wildcard') {
        console.log('[WILD] ', r.id, '(variant ' + r.variant + ': ' + Object.entries(r.map).filter(([a, c]) => a !== c).map(([a, c]) => a + '->' + c).join(' ') + crit + ')');
        if (EMIT) emitted.push({ build: b.label, id: r.id, variant: engine.adaptVariant(defs.bundle.find((p) => (p.id || p.name) === r.id).variants[r.variant], r.map) });
      } else console.log(r.ambiguous ? '[!?]   ' : '[MISS] ', r.id, '(' + (r.ambiguous ? 'ambiguous' : 'no variant') + (r.reason ? '; wildcard: ' + r.reason : '') + crit + ')');
      if (r.status === 'missing') bad++;
    }
    if (res.error) { console.log('[X] ' + res.error); bad++; }
    console.log('Summary: ' + Object.entries(n).map(([k, v]) => k + '=' + v).join('  ') + '  / ' + res.results.length);
  }
}
if (EMIT && emitted.length) console.log('\n' + JSON.stringify(emitted, null, '\t'));
process.exit(bad ? 2 : 0);
