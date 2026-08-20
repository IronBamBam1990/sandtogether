// SandTogether: profil CPU okna gry przez Chrome DevTools Protocol.
// Użycie: node tools/cdp-profile.js <port> [sekundy]
// Zwraca listę funkcji o największym CZASIE WŁASNYM — czyli co realnie zjada klatkę.
'use strict';
const port = Number(process.argv[2]);
const secs = Number(process.argv[3] || 4);
if (!port) { console.error('usage: node tools/cdp-profile.js <port> [sekundy]'); process.exit(2); }

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  if (!page) throw new Error('brak strony');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  const send = (method, params) => new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
  });

  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 200 });
  await send('Profiler.start');
  await new Promise((r) => setTimeout(r, secs * 1000));
  const stopped = await send('Profiler.stop');
  ws.close();

  const prof = stopped.result && stopped.result.profile;
  if (!prof) { console.error('brak profilu'); process.exit(1); }

  // czas własny per węzeł
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const total = prof.samples.length || 1;
  for (const sid of prof.samples) self.set(sid, (self.get(sid) || 0) + 1);

  const rows = [];
  for (const [nid, count] of self) {
    const n = byId.get(nid); if (!n) continue;
    const cf = n.callFrame || {};
    const name = cf.functionName || '(anonim)';
    const url = (cf.url || '').split('/').pop() || '';
    rows.push({ name, url, line: cf.lineNumber, pct: (100 * count) / total });
  }
  rows.sort((a, b) => b.pct - a.pct);

  const durMs = (prof.endTime - prof.startTime) / 1000;
  console.log('=== profil ' + secs + ' s (port ' + port + '), probek: ' + total + ', czas: ' + Math.round(durMs) + ' ms ===');
  for (const r of rows.slice(0, 18)) {
    console.log('  ' + r.pct.toFixed(1).padStart(5) + '%  ' + r.name.slice(0, 42).padEnd(42) + ' ' + r.url + (r.line != null ? ':' + (r.line + 1) : ''));
  }
  const idle = rows.filter((r) => r.name === '(idle)' || r.name === '(program)').reduce((a, b) => a + b.pct, 0);
  console.log('  --- bezczynnosc/silnik: ' + idle.toFixed(1) + '%');
}
main().catch((e) => { console.error('PROFILER ERROR:', e.message); process.exit(1); });
