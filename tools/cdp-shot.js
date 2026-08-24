// Zrzut ekranu okna gry przez Chrome DevTools Protocol.
// Uzycie: node tools/cdp-shot.js <port> <plik.png> [x y w h [scale]]   (opcjonalny wycinek w px CSS + powiekszenie)
'use strict';
const fs = require('fs');
const port = Number(process.argv[2]);
const out = process.argv[3] || 'shot.png';
if (!port) { console.error('usage: node tools/cdp-shot.js <port> <plik.png>'); process.exit(2); }
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params: params || {} })); });
  const clip = process.argv.length >= 8 ? { x: +process.argv[4], y: +process.argv[5], width: +process.argv[6], height: +process.argv[7], scale: +(process.argv[8] || 1) } : undefined;
  const r = await send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip } : {}));
  ws.close();
  if (!r.result || !r.result.data) { console.error('brak zrzutu'); process.exit(1); }
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log('zapisano ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
}
main().catch((e) => { console.error('SHOT ERROR:', e.message); process.exit(1); });
