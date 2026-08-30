// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Author / Autor: KAMIL PADULA
// Patcher: applies the mod onto the unpacked game copy (resources/app).
// Idempotent — safe to run repeatedly and after every game update.
// Usage: node patch.js [path-to-resources/app]
// ============================================================================

'use strict';
const fs = require('fs');
const path = require('path');

const APP = process.argv[2] || 'F:/SteamLibrary/steamapps/common/Sandustry/resources/app';
const SRC = __dirname;

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');
let changes = 0;
const done = (msg) => { changes++; console.log('  [+]', msg); };
const skip = (msg) => console.log('  [=]', msg, '(już nałożone)');

console.log('SandTogether patcher — cel:', APP);
if (!fs.existsSync(path.join(APP, 'main.js'))) { console.error('BŁĄD: nie znaleziono main.js w ' + APP); process.exit(1); }

// 1. Kopiowanie plików moda
fs.copyFileSync(path.join(SRC, 'sandtogether.js'), path.join(APP, 'dist/js/sandtogether.js'));
done('dist/js/sandtogether.js skopiowany');
fs.copyFileSync(path.join(SRC, 'st-main.js'), path.join(APP, 'st-main.js'));
done('st-main.js skopiowany');

// 2. index.html — tag <script> przed bundle.js
{
  const p = path.join(APP, 'dist/index.html');
  let s = read(p);
  if (s.includes('js/sandtogether.js')) skip('index.html');
  else {
    s = s.replace('<script type="module" src="js/bundle.js"></script>',
      '<script src="js/sandtogether.js"></script>\n    <script type="module" src="js/bundle.js"></script>');
    if (!s.includes('js/sandtogether.js')) { console.error('BŁĄD: kotwica w index.html nie znaleziona'); process.exit(1); }
    write(p, s);
    done('index.html: script tag');
  }
}

// 3. bundle.js — hooki (multi-wersja: próbuje wariantów z patches.json)
{
  const p = path.join(APP, 'dist/js/bundle.js');
  const defs = JSON.parse(read(path.join(SRC, 'patches.json')));
  let s = read(p);
  let dirty = false;
  let criticalFail = false;
  // Steam potrafi serwować rozne PRZEMINIFIKOWANE buildy pod tym samym numerem wersji (zgloszenie
  // cayden.sieteski 29.08: u niego alias modulu FH to "se", u nas "ie" — kotwice doslowne nie trafialy
  // i instalator klamal "niewspierana wersja"). Wykrywamy alias FH z samego bundle'a i gdy doslowna
  // kotwica nie pasuje, probujemy wariantu z przepisanym aliasem (tylko prefiks "<alias>.FH").
  let fhAlias = null;
  {
    // Wykrycie musi dzialac takze na JUZ spatchowanym bundle (po nalozeniu hooka forma
    // `emit(e,"frame:update"` znika — 30.08: falszywy "krytyczny" przy ponownym patch.js).
    // Bierzemy alias z dowolnego `X.FH.events.emit(` majacego "frame:update" tuz za soba.
    const re = /([A-Za-z_$][A-Za-z0-9_$]{0,3})\.FH\.events\.emit\(/g;
    let mFH;
    while ((mFH = re.exec(s))) {
      if (s.slice(mFH.index, mFH.index + 220).includes('"frame:update"')) { fhAlias = mFH[1]; break; }
    }
    if (fhAlias && fhAlias !== 'ie') console.log('  [i] alias modulu FH w tym buildzie: "' + fhAlias + '" (przeminifikowany bundle — kotwice beda przepisane z "ie.FH")');
  }
  const adapt = (t) => (fhAlias && fhAlias !== 'ie') ? t.split('ie.FH').join(fhAlias + '.FH') : t;
  for (const pt of defs.bundle) {
    let applied = false, already = false;
    for (const v of pt.variants) {
      for (const [anch, patched] of (fhAlias && fhAlias !== 'ie')
        ? [[v.anchor, v.patched], [adapt(v.anchor), adapt(v.patched)]]
        : [[v.anchor, v.patched]]) {
        if (s.includes(patched)) { already = true; break; }
        const count = s.split(anch).length - 1;
        if (count === 0) continue;
        if (count !== 1) { console.error('BŁĄD: wariant "' + pt.name + '" wystąpień=' + count); continue; }
        s = s.replace(anch, patched);
        applied = true; dirty = true;
        break;
      }
      if (applied || already) break;
    }
    if (applied) done('bundle.js: ' + pt.name);
    else if (already) skip('bundle.js ' + pt.name);
    else if (pt.critical) { console.error('  [X] KRYTYCZNY hak "' + pt.name + '" nie pasuje — niewspierana wersja gry'); criticalFail = true; }
    else console.warn('  [!] pominięto (funkcja wyłączona na tym buildzie): ' + pt.name);
  }
  if (dirty) write(p, s);
  if (criticalFail) { console.error('BŁĄD: niewspierana wersja gry (nawet po adaptacji aliasu "' + (fhAlias || '?') + '"). Wspierane: ' + defs.supportedVersions.join(', ')); process.exit(1); }
}

// 4. preload.js — bridge sieciowy
{
  const p = path.join(APP, 'preload.js');
  let s = read(p);
  // bridge jest WYMIENIANY miedzy markerami (nie tylko doklejany) — inaczej stare instalacje
  // zostaja bez nowych metod IPC (np. hostDirect z 0.9.79).
  const BRIDGE_START = '// --- SandTogether by Kamil Padula: network bridge (appended by patch.js) ---';
  const BRIDGE_END = '// --- /SandTogether ---';
  const fresh = read(path.join(SRC, 'st-preload-append.js'));
  const i0 = s.indexOf(BRIDGE_START), i1 = s.indexOf(BRIDGE_END);
  if (i0 >= 0 && i1 > i0) {
    const cur = s.slice(i0, i1 + BRIDGE_END.length);
    const want = fresh.slice(fresh.indexOf(BRIDGE_START));
    if (cur.trim() === want.trim()) skip('preload.js');
    else { write(p, s.slice(0, i0) + want.trim() + s.slice(i1 + BRIDGE_END.length)); done('preload.js: bridge zaktualizowany'); }
  }
  else if (s.includes('sandtogetherNet')) skip('preload.js');
  else {
    s += '\n' + read(path.join(SRC, 'st-preload-append.js'));
    write(p, s);
    done('preload.js: sandtogetherNet bridge');
  }
}

// 5. main.js — inicjalizacja networkingu (blok między markerami, wymieniany przy każdym patchu)
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
  // usuń też stary blok v1 bez markerów
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
  else { console.error('BŁĄD: kotwica single-instance nie znaleziona'); process.exit(1); }
}


// 7. logger.js — osobny plik logu na instancje (diagnostyka coopa)
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
    else if (s.includes(anchor)) { s = s.replace(anchor, patched); write(p, s); done('logger.js: osobny log na instancje'); }
    else console.log('  [!] logger.js: kotwica nie pasuje (build gry zmieniony) — logi zostaja wspolne');
  }
}

// 8. main.js — WCZESNY blok: userData override + nazwa pliku logu (musi byc PRZED kodem gry,
//    bo logger rozwiazuje sciezke przy pierwszym wpisie)
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
    else { write(p, s.slice(0, i0) + early + s.slice(i1 + END.length)); done('main.js: early block zaktualizowany'); }
  } else {
    write(p, early + '\n' + s);
    done('main.js: early block (log na instancje)');
  }
}

console.log('Gotowe. Zmian:', changes);
