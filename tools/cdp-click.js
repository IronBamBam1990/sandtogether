// Prawdziwe kliknięcie myszą w oknie gry przez CDP (Input.dispatchMouseEvent). Użycie: node tools/cdp-click.js <port> <x> <y>
'use strict';
const port = Number(process.argv[2]), x = Number(process.argv[3]), y = Number(process.argv[4]);
if (!port || !Number.isFinite(x) || !Number.isFinite(y)) { console.error('usage: node tools/cdp-click.js <port> <x> <y>'); process.exit(2); }
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  ws.close(); console.log('clicked', x, y); process.exitCode = 0;
})().catch((e) => { console.error('CLICK ERROR:', e.message); process.exitCode = 1; });
