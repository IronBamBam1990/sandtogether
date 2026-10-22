// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Shared bundle.js patch engine: patch.js (and so install.js / install.ps1)
// and the st-main.js auto-updater all apply patches.json through this file,
// so they pick the same variants. No dependencies.
// ============================================================================
'use strict';
const fs = require('fs');
const vm = require('vm');

// First line of a patched bundle: which hooks applied. The renderer reads it as SandTogether._hooks.
const MANIFEST_TAG = '/*ST_HOOKS*/';

// FH module alias of this build. Steam can serve re-minified builds of one version ("se.FH" vs "ie.FH").
// Works on an already patched bundle too (the vanilla emit(e,"frame:update" form is gone then).
function detectFhAlias(s) {
  const re = /([A-Za-z_$][A-Za-z0-9_$]{0,3})\.FH\.events\.emit\(/g;
  let m;
  while ((m = re.exec(s))) if (s.slice(m.index, m.index + 220).includes('"frame:update"')) return m[1];
  return null;
}

// --- wildcard matching -------------------------------------------------------
// Minified locals (2 chars or fewer, not a property or object key, not in a string) become captures
// with backreferences. Longer names, property names and strings stay literal.
const KEYWORDS = new Set(['if', 'do', 'in']);
const CAPTURE = '(?<![\\w$.])(?!(?:if|do|in|var|let|new|for|try)(?![\\w$]))([A-Za-z_$][\\w$]{0,2})(?![\\w$])';
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function tokens(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out.push({ v: src.slice(i, j + 1) });
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      const v = src.slice(i, j);
      const prop = (src[i - 1] === '.' && src[i - 2] !== '.') || ((src[i - 1] === '{' || src[i - 1] === ',') && src[j] === ':');
      const keyword = KEYWORDS.has(v) || (v === 'of' && src[i - 1] === ' ');
      out.push({ v, local: !prop && !keyword && v.length <= 2 });
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\w$.]/.test(src[j])) j++;
      out.push({ v: src.slice(i, j) });
      i = j;
    } else { out.push({ v: c }); i++; }
  }
  return out;
}

// Regex for a text: every local is a capture, repeats are backreferences. Returns { re, locals[] }.
function toPattern(text) {
  const locals = [];
  let re = '';
  for (const t of tokens(text)) {
    if (!t.local) { re += esc(t.v); continue; }
    const k = locals.indexOf(t.v);
    if (k >= 0) re += '\\' + (k + 1);
    else { locals.push(t.v); re += CAPTURE; }
  }
  return { re: new RegExp(re, 'g'), locals };
}

// Wildcard plan for one variant, or { refuse } when `patched` uses locals the anchor doesn't bind:
// a match would prove nothing about them (the review caveat, e.g. `f` in the volcanizer hook).
function wildcardPlan(anchor, patched) {
  const a = toPattern(anchor);
  const unbound = [...new Set(tokens(patched).filter((t) => t.local && !a.locals.includes(t.v)).map((t) => t.v))];
  if (unbound.length) return { refuse: 'patched uses locals not in the anchor: ' + unbound.join(', ') };
  return a;
}

function matchesUpTo2(re, s) {
  re.lastIndex = 0;
  const hits = [];
  let m;
  while (hits.length < 2 && (m = re.exec(s))) { hits.push(m); if (m[0] === '') re.lastIndex++; }
  return hits;
}

// Try a variant with wildcards: { text, map } on a unique, consistent match, else { reason }.
function applyWildcard(s, v) {
  const plan = wildcardPlan(v.anchor, v.patched);
  if (plan.refuse) return { reason: plan.refuse };
  if (!plan.locals.length) return { reason: 'no locals to adapt' };
  const hits = matchesUpTo2(plan.re, s);
  if (!hits.length) return { reason: 'no match' };
  if (hits.length > 1) return { reason: 'ambiguous' };
  const m = hits[0];
  const map = {};
  plan.locals.forEach((name, k) => { map[name] = m[k + 1]; });
  // two different locals must not land on one name
  if (new Set(Object.values(map)).size !== plan.locals.length) return { reason: 'locals collapse onto one name' };
  const out = tokens(v.patched).map((t) => (t.local ? map[t.v] : t.v)).join('');
  return { text: s.slice(0, m.index) + out + s.slice(m.index + m[0].length), map };
}

// The variant as it reads in the new build (check-anchors.js --emit), for review before it goes into patches.json.
function adaptVariant(v, map) {
  const sub = (text) => tokens(text).map((t) => (t.local && map[t.v] ? map[t.v] : t.v)).join('');
  return { anchor: sub(v.anchor), patched: sub(v.patched), note: 'auto-adapted from: ' + (v.note || 'unnamed variant') };
}

function wildcardAlready(s, v) {
  const p = toPattern(v.patched);
  return p.locals.length > 0 && matchesUpTo2(p.re, s).length > 0;
}

// --- engine ------------------------------------------------------------------
const countUpTo2 = (s, needle) => { const i = s.indexOf(needle); return i < 0 ? 0 : (s.indexOf(needle, i + 1) < 0 ? 1 : 2); };
const parseError = (src) => { try { new vm.Script(src, { filename: 'bundle.js' }); return null; } catch (e) { return e.message; } };

// Applies defs.bundle to the bundle text. Per patch: first variant whose literal anchor is unique
// (also with the FH alias rewritten), then, if allowed, the newest variant with wildcards.
// result.status: applied | already | wildcard | missing.
function applyBundle(src, defs, opts) {
  const wildcard = !opts || opts.wildcard !== false;
  // a bundle patched by this engine before (no pristine copy): its manifest says which hooks were adapted
  let prevWild = [];
  if (src.startsWith(MANIFEST_TAG)) try { prevWild = JSON.parse(/_hooks=(\{.*\})\);$/.exec(src.slice(0, src.indexOf('\n')))[1]).wild || []; } catch (e) { /* unreadable: treat as none */ }
  let s = src.startsWith(MANIFEST_TAG) ? src.slice(src.indexOf('\n') + 1) : src;
  const fhAlias = detectFhAlias(s);
  const adapt = (t) => (fhAlias && fhAlias !== 'ie') ? t.split('ie.FH').join(fhAlias + '.FH') : t;
  const results = [];
  for (const pt of defs.bundle || []) {
    const r = { id: pt.id || pt.name, name: pt.name, critical: !!pt.critical, status: 'missing' };
    results.push(r);
    const vs = pt.variants || [];
    for (let vi = 0; vi < vs.length && r.status === 'missing'; vi++) {
      const v = vs[vi];
      const pairs = fhAlias && fhAlias !== 'ie' ? [[v.anchor, v.patched], [adapt(v.anchor), adapt(v.patched)]] : [[v.anchor, v.patched]];
      for (const [anch, patched] of pairs) {
        if (s.includes(patched)) { r.status = 'already'; r.variant = vi; break; }
        const n = countUpTo2(s, anch);
        if (n === 2) r.ambiguous = (r.ambiguous || 0) + 1;
        if (n !== 1) continue;
        s = s.replace(anch, () => patched);
        r.status = 'applied'; r.variant = vi;
        break;
      }
    }
    // Wildcards adapt only the newest variant (the first): older ones describe older code and can
    // match an unrelated site of the same shape (measured: the oldest cryo variant on 0.6.0).
    if (r.status !== 'missing' || !wildcard || !vs.length) continue;
    if (prevWild.includes(r.id) && wildcardAlready(s, vs[0])) { r.status = 'already'; r.variant = 0; r.adapted = true; continue; }
    const w = applyWildcard(s, vs[0]);
    if (w.text) { s = w.text; r.status = 'wildcard'; r.variant = 0; r.map = w.map; }
    else r.reason = w.reason;
  }
  // a broken bundle must never be written: drop the wildcard patches first, then give up
  let error = null;
  if (s !== src && parseError(s) && !parseError(src)) {
    if (wildcard && results.some((r) => r.status === 'wildcard')) {
      const again = applyBundle(src, defs, { wildcard: false });
      again.wildcardDropped = true;
      return again;
    }
    error = 'patched bundle does not parse: ' + parseError(s);
  }
  const by = (f) => results.filter(f).map((r) => r.id);
  const manifest = {
    v: 1,
    ok: by((r) => r.status === 'applied' || (r.status === 'already' && !r.adapted)),
    wild: by((r) => r.status === 'wildcard' || r.adapted),
    miss: by((r) => r.status === 'missing'),
  };
  const text = error ? null : MANIFEST_TAG + 'window.SandTogether&&(window.SandTogether._hooks=' + JSON.stringify(manifest) + ');\n' + s;
  return {
    text, error, results, fhAlias, manifest,
    criticalFail: results.some((r) => r.critical && r.status === 'missing'),
    featureMiss: results.filter((r) => !r.critical && r.status === 'missing').length,
  };
}

// Start from the pristine bundle (kept as bundle.js.orig next to it), so patches.json only needs
// variants per GAME version. Without a pristine copy, an unpatched bundle becomes one.
function restorePristine(bundlePath) {
  const orig = bundlePath + '.orig';
  if (fs.existsSync(orig)) fs.copyFileSync(orig, bundlePath);
  else if (!fs.readFileSync(bundlePath, 'utf8').includes('window.SandTogether')) fs.copyFileSync(bundlePath, orig);
}

// File wrapper used by patch.js and the auto-updater. Writes only a bundle that parses.
function patchBundleFile(bundlePath, defs, opts) {
  try { restorePristine(bundlePath); } catch (e) { /* read-only copy: patch what is there */ }
  const src = fs.readFileSync(bundlePath, 'utf8');
  const res = applyBundle(src, defs, opts);
  res.written = !!res.text && res.text !== src;
  if (res.written) fs.writeFileSync(bundlePath, res.text, 'utf8');
  return res;
}

module.exports = { applyBundle, patchBundleFile, restorePristine, detectFhAlias, adaptVariant, tokens, toPattern, wildcardPlan, MANIFEST_TAG };
