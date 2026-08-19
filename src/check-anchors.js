// ============================================================================
// SandTogether — weryfikacja kotwic patchy na NOWYM buildzie gry.
// Po każdym updacie Sandustry: pobierz depot głównego brancha (Steam console:
// download_depot 2764460 2764461) i odpal:
//   node src/check-anchors.js <ścieżka do bundle.js albo folderu depotu>
// Dla każdego patcha i wariantu raportuje: OK (anchor 1x) / ALREADY (patched
// obecny) / MISS (brak) / AMBIGUOUS (anchor >1x — patcher by odmówił).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

let target = process.argv[2];
if (!target) { console.error('Użycie: node src/check-anchors.js <bundle.js | folder depotu>'); process.exit(1); }

// folder → znajdź dist/js/bundle.js (depot ma strukturę resources/app.asar albo rozpakowaną)
if (fs.statSync(target).isDirectory()) {
  const cands = [
    path.join(target, 'dist', 'js', 'bundle.js'),
    path.join(target, 'resources', 'app', 'dist', 'js', 'bundle.js'),
  ];
  const hit = cands.find((c) => fs.existsSync(c));
  if (hit) target = hit;
  else {
    // może być app.asar — wypakuj bundle.js prosto z archiwum (ten sam parser co install.js)
    const asar = [path.join(target, 'resources', 'app.asar'), path.join(target, 'app.asar')].find((c) => fs.existsSync(c));
    if (!asar) { console.error('Nie znalazłem bundle.js ani app.asar pod: ' + target); process.exit(1); }
    const buf = fs.readFileSync(asar);
    const headerSize = buf.readUInt32LE(4);
    const jsonLen = buf.readUInt32LE(12);
    const index = JSON.parse(buf.toString('utf8', 16, 16 + jsonLen));
    const node = index.files.dist && index.files.dist.files.js && index.files.dist.files.js.files['bundle.js'];
    if (!node || node.offset === undefined) { console.error('bundle.js nie znaleziony w app.asar (albo unpacked)'); process.exit(1); }
    const base = 8 + headerSize;
    const off = base + Number(node.offset);
    const out = path.join(require('os').tmpdir(), 'sandustry-bundle-' + node.size + '.js');
    fs.writeFileSync(out, buf.subarray(off, off + node.size));
    console.log('bundle.js wypakowany z app.asar →', out);
    target = out;
  }
}

const bundle = fs.readFileSync(target, 'utf8');
console.log('Bundle:', target, '(' + Math.round(bundle.length / 1024) + ' KB)');

// wersja gry, jeśli obok leży package.json
for (const pj of [path.join(path.dirname(target), '..', '..', 'package.json')]) {
  try { console.log('Wersja gry:', JSON.parse(fs.readFileSync(pj, 'utf8')).version); } catch (e) {}
}

const count = (s) => { let n = 0, i = -1; while ((i = bundle.indexOf(s, i + 1)) >= 0) n++; return n; };
const patches = require('./patches.json');
let ok = 0, already = 0, miss = 0, ambig = 0;
for (const p of patches.bundle) {
  let best = null; // najlepszy wynik spośród wariantów
  for (const [vi, v] of p.variants.entries()) {
    const na = count(v.anchor), np = count(v.patched);
    let st;
    if (np > 0) st = 'ALREADY';
    else if (na === 1) st = 'OK';
    else if (na === 0) st = 'MISS';
    else st = 'AMBIGUOUS(' + na + ')';
    if (!best || st === 'OK' || (st === 'ALREADY' && best.st.indexOf('OK') < 0)) best = { st, vi };
    if (st === 'OK' || st === 'ALREADY') break; // wystarczy jeden pasujący wariant
  }
  const mark = best.st === 'OK' ? '[OK]  ' : best.st === 'ALREADY' ? '[=]   ' : best.st.startsWith('AMBIG') ? '[!?]  ' : '[MISS]';
  if (best.st === 'OK') ok++; else if (best.st === 'ALREADY') already++; else if (best.st === 'MISS') miss++; else ambig++;
  console.log(mark, p.name, '(wariant ' + best.vi + (p.critical ? ', CRITICAL' : '') + ')');
}
console.log('\nPodsumowanie: OK=' + ok + '  ALREADY=' + already + '  MISS=' + miss + '  AMBIGUOUS=' + ambig + '  / ' + patches.bundle.length);
process.exit(miss + ambig > 0 ? 2 : 0);
