// Unit tests for src/st-patch-engine.js. Run: node --test "tools/test/*.test.js"
// ST_GAME_VERSIONS=<dir of <version>/app builds> adds the real-bundle checks.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const engine = require('../../src/st-patch-engine.js');

const defs = (...variants) => ({ bundle: [{ id: 'h', name: 'hook', variants }] });
const run = (src, d, opts) => engine.applyBundle(src, d, opts);
const body = (text) => text.slice(text.indexOf('\n') + 1);

test('tokens: properties, object keys, strings and keywords stay literal', () => {
  const locals = engine.tokens('if(a.b)c={x:d,"e":f};for(const g of h)i in j').filter((t) => t.local).map((t) => t.v);
  assert.deepStrictEqual(locals, ['a', 'c', 'd', 'f', 'g', 'h', 'i', 'j']);
  assert.deepStrictEqual(engine.tokens('...e').filter((t) => t.local).map((t) => t.v), ['e']);
});

test('literal: first unique variant wins, ambiguous anchors are skipped', () => {
  const src = 'var a=1;f(a);f(a);g(a);';
  const r = run(src, defs({ anchor: 'f(a)', patched: 'X' }, { anchor: 'g(a)', patched: 'g(a),Y' }), { wildcard: false });
  assert.strictEqual(r.results[0].status, 'applied');
  assert.strictEqual(r.results[0].variant, 1);
  assert.strictEqual(r.results[0].ambiguous, 1);
  assert.strictEqual(body(r.text), 'var a=1;f(a);f(a);g(a),Y;');
});

test('literal: replacement text is not interpreted ($& stays $&)', () => {
  const r = run('a=1;', defs({ anchor: 'a=1', patched: 'a="$&"' }), { wildcard: false });
  assert.strictEqual(body(r.text), 'a="$&";');
});

test('FH alias: ie.FH anchors are rewritten for a se.FH build', () => {
  const src = 'se.FH.events.emit(e,"frame:update",{state:e});';
  const r = run(src, defs({ anchor: 'ie.FH.events.emit(e,', patched: 'ie.FH.events.emit((Hook(),e),' }), { wildcard: false });
  assert.strictEqual(r.fhAlias, 'se');
  assert.strictEqual(body(r.text), 'se.FH.events.emit((Hook(),e),"frame:update",{state:e});');
});

test('already applied: a patched bundle is left as is and the old manifest replaced', () => {
  const d = defs({ anchor: 'q(a)', patched: 'q(a),Zed(a)' });
  const once = run('q(a);', d).text;
  const twice = run(once, d);
  assert.strictEqual(twice.results[0].status, 'already');
  assert.strictEqual(twice.text, once);
});

test('wildcard: renamed locals are recovered with a consistent map', () => {
  const v = { anchor: 'const o=b-r.x,i=v-r.y;if(n>=1)', patched: 'const o=b-r.x,i=v-r.y;Hook(o,i);if(n>=1)' };
  const r = run('const s=q-t.x,u=w-t.y;if(m>=1)go();', defs(v));
  assert.strictEqual(r.results[0].status, 'wildcard');
  assert.strictEqual(body(r.text), 'const s=q-t.x,u=w-t.y;Hook(s,u);if(m>=1)go();');
  assert.deepStrictEqual(r.results[0].map, { o: 's', b: 'q', r: 't', i: 'u', v: 'w', n: 'm' });
  assert.deepStrictEqual(engine.adaptVariant(v, r.results[0].map).anchor, 'const s=q-t.x,u=w-t.y;if(m>=1)');
});

test('wildcard: re-running on an adapted bundle without its pristine copy changes nothing', () => {
  const d = defs({ anchor: 'const o=b;', patched: 'const o=b;Hook(o);' });
  const once = run('const s=q;', d);
  assert.strictEqual(once.results[0].status, 'wildcard');
  const twice = run(once.text, d);
  assert.strictEqual(twice.results[0].status, 'already');
  assert.strictEqual(twice.text, once.text);
});

test('wildcard: repeated locals must repeat in the target', () => {
  const r = run('f(a,b);', defs({ anchor: 'f(x,x)', patched: 'f(x,x),Hook(x)' }));
  assert.strictEqual(r.results[0].status, 'missing');
});

test('wildcard: two locals collapsing onto one name are refused', () => {
  const r = run('t=k+k;', defs({ anchor: 't=a+b', patched: 't=a+b,Hook(a,b)' }));
  assert.strictEqual(r.results[0].status, 'missing');
  assert.match(r.results[0].reason, /collapse/);
});

test('wildcard: refused when the patch uses locals the anchor does not bind', () => {
  const r = run('x=y+1;', defs({ anchor: 'a=b+1', patched: 'a=b+1,Hook(f)' }));
  assert.strictEqual(r.results[0].status, 'missing');
  assert.match(r.results[0].reason, /locals not in the anchor: f/);
});

test('wildcard: refused when ambiguous', () => {
  const r = run('x=y+1;z=w+1;', defs({ anchor: 'a=b+1', patched: 'a=b+1,Hook(a)' }));
  assert.strictEqual(r.results[0].reason, 'ambiguous');
});

test('wildcard: only the newest variant is adapted', () => {
  const r = run('p=q+2;', defs({ anchor: 'a=b*3', patched: 'Hook()' }, { anchor: 'a=b+2', patched: 'a=b+2,Hook()' }));
  assert.strictEqual(r.results[0].status, 'missing');
  assert.strictEqual(run('p=q+2;', defs({ anchor: 'a=b*3', patched: 'Hook()' }, { anchor: 'a=b+2', patched: 'a=b+2,Hook()' }), { wildcard: false }).results[0].status, 'missing');
});

test('wildcard can be switched off', () => {
  const r = run('const s=q;', defs({ anchor: 'const o=b;', patched: 'const o=b;Hook(o);' }), { wildcard: false });
  assert.strictEqual(r.results[0].status, 'missing');
});

test('a bundle that no longer parses is never returned', () => {
  const lit = run('f(1);', defs({ anchor: 'f(1)', patched: 'f(1)+' }), { wildcard: false });
  assert.strictEqual(lit.text, null);
  assert.match(lit.error, /does not parse/);
  // a broken wildcard patch is dropped, the literal ones stay
  const d = { bundle: [{ id: 'ok', name: 'ok', variants: [{ anchor: 'g(2)', patched: 'g(2),Gate()' }] }, { id: 'w', name: 'w', variants: [{ anchor: 'h(a)', patched: 'h(a' }] }] };
  const r = run('g(2);h(k);', d);
  assert.strictEqual(r.wildcardDropped, true);
  assert.strictEqual(body(r.text), 'g(2),Gate();h(k);');
  assert.deepStrictEqual(r.manifest.miss, ['w']);
});

test('manifest: first line lists applied, adapted and missing hooks', () => {
  const d = { bundle: [
    { id: 'a', name: 'a', variants: [{ anchor: 'Aaa()', patched: 'Aaa(),1' }] },
    { id: 'b', name: 'b', variants: [{ anchor: 'Bbb(x)', patched: 'Bbb(x),x' }] },
    { id: 'c', name: 'c', critical: true, variants: [{ anchor: 'Ccc()', patched: 'Ccc(),1' }] },
  ] };
  const r = run('Aaa();Bbb(y);', d);
  assert.ok(r.text.startsWith(engine.MANIFEST_TAG + 'window.SandTogether&&(window.SandTogether._hooks='));
  assert.deepStrictEqual(r.manifest, { v: 1, ok: ['a'], wild: ['b'], miss: ['c'] });
  assert.strictEqual(r.criticalFail, true);
  const w = { SandTogether: {} };
  new Function('window', r.text.split('\n')[0])(w);
  assert.deepStrictEqual(w.SandTogether._hooks.wild, ['b']);
});

test('patchBundleFile keeps a pristine copy and re-patches from it', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'st-engine-'));
  try {
    const p = path.join(dir, 'bundle.js');
    fs.writeFileSync(p, 'A();');
    const d = { bundle: [{ id: 'a', name: 'a', variants: [{ anchor: 'A()', patched: 'A(),1' }] }] };
    const first = engine.patchBundleFile(p, d);
    assert.strictEqual(first.written, true);
    assert.strictEqual(fs.readFileSync(p + '.orig', 'utf8'), 'A();');
    const out = fs.readFileSync(p, 'utf8');
    engine.patchBundleFile(p, d);
    assert.strictEqual(fs.readFileSync(p, 'utf8'), out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const builds = process.env.ST_GAME_VERSIONS;
test('stored game builds: every patch applies literally and the result parses', { skip: !builds && 'set ST_GAME_VERSIONS' }, () => {
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/patches.json'), 'utf8'));
  for (const v of fs.readdirSync(builds)) {
    const p = path.join(builds, v, 'app/dist/js/bundle.js');
    if (!fs.existsSync(p)) continue;
    const r = engine.applyBundle(fs.readFileSync(p, 'utf8'), real, { wildcard: false });
    assert.deepStrictEqual(r.results.filter((x) => x.status !== 'applied').map((x) => x.id), [], v);
    assert.strictEqual(r.error, null, v);
  }
});
