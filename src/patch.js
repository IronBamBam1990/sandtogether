// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Author / Autor: KAMIL PADULA
// Patcher: applies the mod onto the unpacked game copy (resources/app).
// Idempotent — safe to run repeatedly and after every game update.
// Usage: node patch.js <path-to-resources/app> [--report <file.json>] [--no-wildcard]
// ============================================================================

'use strict';
const fs = require('fs');
const path = require('path');
const engine = require('./st-patch-engine.js');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const REPORT = opt('--report');
const WILDCARD = !(args.includes('--no-wildcard') || process.env.ST_NO_WILDCARD === '1');
const APP = args.find((a) => !a.startsWith('--'));
const SRC = __dirname;
if (!APP) { console.error('Usage: node patch.js <path-to-resources/app> [--report <file.json>] [--no-wildcard]'); process.exit(1); }

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');
let changes = 0;
const done = (msg) => { changes++; console.log('  [+]', msg); };
const skip = (msg) => console.log('  [=]', msg, '(already applied)');
// install.ps1 reads this file to know the patcher really ran (and how it went)
const report = (o) => { if (REPORT) try { write(REPORT, JSON.stringify(o)); } catch (e) { console.error('report:', e.message); } };

console.log('SandTogether patcher - target:', APP);
report({ ran: true });
if (!fs.existsSync(path.join(APP, 'main.js'))) { console.error('ERROR: main.js not found in ' + APP); report({ ran: true, ok: false, error: 'main.js not found' }); process.exit(1); }

// 1. Copying mod files
for (const [from, to] of [['sandtogether.js', 'dist/js/sandtogether.js'], ['st-main.js', 'st-main.js'], ['st-patch-engine.js', 'st-patch-engine.js']]) {
  fs.copyFileSync(path.join(SRC, from), path.join(APP, to));
  done(to + ' copied');
}

// 2. index.html — tag <script> przed bundle.js
{
  const p = path.join(APP, 'dist/index.html');
  let s = read(p);
  if (s.includes('js/sandtogether.js')) skip('index.html');
  else {
    s = s.replace('<script type="module" src="js/bundle.js"></script>',
      '<script src="js/sandtogether.js"></script>\n    <script type="module" src="js/bundle.js"></script>');
    if (!s.includes('js/sandtogether.js')) { console.error('ERROR: index.html anchor not found'); process.exit(1); }
    write(p, s);
    done('index.html: script tag');
  }
}

let bundleRes = null;
// 3. bundle.js — hooks (multi-version: variants from patches.json, see st-patch-engine.js)
{
  const p = path.join(APP, 'dist/js/bundle.js');
  const defs = JSON.parse(read(path.join(SRC, 'patches.json')));
  const res = engine.patchBundleFile(p, defs, { wildcard: WILDCARD });
  if (res.fhAlias && res.fhAlias !== 'ie') console.log('  [i] FH module alias in this build: "' + res.fhAlias + '" (re-minified bundle - anchors rewritten from "ie.FH")');
  if (res.wildcardDropped) console.warn('  [!] auto-adapted hooks broke the bundle syntax - applied without them');
  for (const r of res.results) {
    if (r.ambiguous) console.error('ERROR: variant "' + r.name + '" occurrences>1 (' + r.ambiguous + 'x)');
    if (r.status === 'applied') done('bundle.js: ' + r.name);
    else if (r.status === 'already') skip('bundle.js ' + r.name);
    else if (r.status === 'wildcard') { changes++; console.log('  [~] bundle.js: ' + r.name + ' (auto-adapted from variant ' + r.variant + ': ' + Object.entries(r.map).map(([a, b]) => a + '->' + b).join(' ') + ')'); }
    else if (r.critical) console.error('  [X] CRITICAL hook "' + r.name + '" did not match - this game build is not supported yet');
    else console.warn('  [!] skipped (feature unavailable on this game build): ' + r.name);
  }
  if (res.error) { console.error('ERROR: ' + res.error + ' - bundle.js left unpatched'); report({ ran: true, ok: false, error: res.error }); process.exit(1); }
  if (res.featureMiss > 8) {
    console.error('  WARNING: ' + res.featureMiss + ' hooks did not match this game build - the game is likely NEWER than the mod.');
    console.error('  Co-op will connect, but many tools will NOT sync. Update the mod (Workshop) and run the installer again.');
  }
  if (res.criticalFail) {
    const msg = 'unsupported game build (even after adapting the module alias "' + (res.fhAlias || '?') + '"). Mod supports game: ' + defs.supportedVersions.join(', ') + '. Your game may have updated - watch the Workshop page for a mod update.';
    console.error('ERROR: ' + msg);
    report({ ran: true, ok: false, critical: true, error: msg });
    process.exit(1);
  }
  bundleRes = res;
}

// 4. preload.js — bridge sieciowy
{
  const p = path.join(APP, 'preload.js');
  let s = read(p);
  // the bridge is REPLACED between markers (not just appended) — otherwise old installations
  // are left without new IPC methods (e.g. hostDirect from 0.9.79).
  const BRIDGE_START = '// --- SandTogether by Kamil Padula: network bridge (appended by patch.js) ---';
  const BRIDGE_END = '// --- /SandTogether ---';
  const fresh = read(path.join(SRC, 'st-preload-append.js'));
  const i0 = s.indexOf(BRIDGE_START), i1 = s.indexOf(BRIDGE_END);
  if (i0 >= 0 && i1 > i0) {
    const cur = s.slice(i0, i1 + BRIDGE_END.length);
    const want = fresh.slice(fresh.indexOf(BRIDGE_START));
    if (cur.trim() === want.trim()) skip('preload.js');
    else { write(p, s.slice(0, i0) + want.trim() + s.slice(i1 + BRIDGE_END.length)); done('preload.js: bridge updated'); }
  }
  else if (s.includes('sandtogetherNet')) skip('preload.js');
  else {
    s += '\n' + read(path.join(SRC, 'st-preload-append.js'));
    write(p, s);
    done('preload.js: sandtogetherNet bridge');
  }
}

// 5. main.js — networking initialisation (block between markers, replaced on every patch)
{
  const p = path.join(APP, 'main.js');
  let s = read(p);
  const MARK_A = '// --- SandTogether init ---';
  const MARK_B = '// --- /SandTogether init ---';
  const block = `\n\n${MARK_A}\ntry {\n  const _stUd = process.argv.find((a) => a.startsWith('--st-userdata='));\n  if (_stUd) { app.setPath('userData', _stUd.split('=')[1]); console.log('[SandTogether] userData override:', _stUd.split('=')[1]); }\n} catch (e) { console.error('[SandTogether] userdata error:', e); }\ntry {\n  app.whenReady().then(() => {\n    try { require('./st-main.js').init({ getMainWindow: () => mainWindow }); }\n    catch (e) { console.error('[SandTogether] init error:', e); }\n  });\n} catch (e) { console.error('[SandTogether] bootstrap error:', e); }\n${MARK_B}\n`;
  const ia = s.indexOf(MARK_A);
  if (ia !== -1) {
    const ib = s.indexOf(MARK_B);
    s = s.slice(0, ia).replace(/\n+$/, '') + s.slice(ib + MARK_B.length);
  }
  // also remove the old v1 block without markers
  s = s.replace(/\n\/\/ --- SandTogether init \(appended by patch\.js\) ---[\s\S]*?\/\/ --- \/SandTogether ---\n/, '\n');
  s += block;
  write(p, s);
  done('main.js: init block');
}

// 6. main.js — bypass single-instance lock w trybie testowym (--st-*)
{
  const p = path.join(APP, 'main.js');
  let s = read(p);
  const anchor = 'const gotTheLock = app.requestSingleInstanceLock();';
  const patched = "const gotTheLock = process.argv.some((a) => a.startsWith('--st-')) ? true : app.requestSingleInstanceLock();";
  if (s.includes(patched)) skip('main.js single-instance bypass');
  else if (s.includes(anchor)) { s = s.replace(anchor, patched); write(p, s); done('main.js: single-instance bypass'); }
  else { console.error('ERROR: single-instance anchor not found'); process.exit(1); }
}


// 7. logger.js — separate log file per instance (co-op diagnostics)
{
  const p = path.join(APP, 'logger.js');
  if (!fs.existsSync(p)) skip('logger.js (brak pliku w tym buildzie)');
  else {
    let s = read(p);
    const anchor = "_logFile = path.join(dir, 'main.log')";
    const patched = [
      "/* ST_INSTANCE_LOG */ let _stName = 'main.log'",
      "    try {",
      "      const _lock = path.join(dir, 'st-instance.lock')",
      "      let _busy = false",
      "      try {",
      "        const _pid = parseInt(fs.readFileSync(_lock, 'utf8'), 10)",
      "        if (_pid && _pid !== process.pid) { try { process.kill(_pid, 0); _busy = true } catch (_) {} }",
      "      } catch (_) {}",
      "      if (_busy) _stName = 'main-' + process.pid + '.log'",
      "      else { try { fs.writeFileSync(_lock, String(process.pid)) } catch (_) {} }",
      "    } catch (_) {}",
      "    _logFile = path.join(dir, _stName)",
    ].join('\n');
    if (s.includes('ST_INSTANCE_LOG')) skip('logger.js per-instance');
    else if (s.includes(anchor)) { s = s.replace(anchor, patched); write(p, s); done('logger.js: per-instance log'); }
    else console.log('  [!] logger.js: anchor did not match (game build changed) - logs stay shared');
  }
}

// 8. main.js — EARLY block: userData override + log file name (must be BEFORE the game code,
//    because logger resolves the path on the first entry)
{
  const p = path.join(APP, 'main.js');
  let s = read(p);
  const START = '// --- SandTogether early ---';
  const END = '// --- /SandTogether early ---';
  const early = [
    START,
    "try {",
    "  const { app: _a } = require('electron');",
    "  const _ud = process.argv.find((a) => a.startsWith('--st-userdata='));",
    "  if (_ud) _a.setPath('userData', _ud.slice('--st-userdata='.length));",
    "} catch (e) { console.error('[SandTogether] early error:', e); }",
    END,  ].join('\n');
  const i0 = s.indexOf(START), i1 = s.indexOf(END);
  if (i0 >= 0 && i1 > i0) {
    const cur = s.slice(i0, i1 + END.length);
    if (cur.trim() === early.trim()) skip('main.js early block');
    else { write(p, s.slice(0, i0) + early + s.slice(i1 + END.length)); done('main.js: early block updated'); }
  } else {
    write(p, early + '\n' + s);
    done('main.js: early block (per-instance log)');
  }
}

report({ ran: true, ok: true, featureMiss: bundleRes.featureMiss, manifest: bundleRes.manifest });
console.log('Done. Changes:', changes);
