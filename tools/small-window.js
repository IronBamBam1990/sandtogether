// Zmniejsza i odsuwa okno instancji gry przez CDP — testy nie moga przejmowac ekranu usera.
// Uzycie: node tools/small-window.js <port> [szerokosc] [wysokosc] [left] [top]
'use strict';
const port = Number(process.argv[2]);
const W = Number(process.argv[3] || 900), H = Number(process.argv[4] || 560);
const L = Number(process.argv[5] || 40), T = Number(process.argv[6] || 40);
if (!port) { console.error('uzycie: node tools/small-window.js <port> [w] [h] [left] [top]'); process.exit(2); }
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params) => new Promise((res) => { const my = ++id; pending.set(my, res); ws.send(JSON.stringify({ id: my, method, params })); });
  const w = await send('Browser.getWindowForTarget', {});
  const wid = w && w.result && w.result.windowId;
  if (wid) await send('Browser.setWindowBounds', { windowId: wid, bounds: { left: L, top: T, width: W, height: H, windowState: 'normal' } });
  ws.close();
  console.log('okno ' + port + ' -> ' + W + 'x' + H + ' @' + L + ',' + T);
})().catch((e) => { console.error('WINDOW ERROR:', e.message); process.exitCode = 1; });
