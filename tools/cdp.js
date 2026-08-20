// SandTogether e2e helper: wykonaj JS w oknie gry (Electron) przez Chrome DevTools Protocol.
// Użycie: node tools/cdp.js <port> "<wyrażenie JS>"   (wyrażenie może zwracać Promise)
// Gra musi być odpalona z --remote-debugging-port=<port>. Node >= 22 (globalny WebSocket).
'use strict';
const port = Number(process.argv[2]);
const expr = process.argv[3];
if (!port || !expr) { console.error('usage: node tools/cdp.js <port> "<js>"'); process.exit(2); }

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')); });
  const result = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout 60s')), 60000);
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id === 1) { clearTimeout(t); res(d); }
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  if (result.error) throw new Error(JSON.stringify(result.error));
  const r = result.result;
  if (r.exceptionDetails) { console.error('EXCEPTION:', r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails)); process.exit(1); }
  console.log(JSON.stringify(r.result.value === undefined ? r.result.description : r.result.value, null, 0));
}
main().catch((e) => { console.error('CDP ERROR:', e.message); process.exit(1); });
