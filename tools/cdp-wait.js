// SandTogether e2e helper: czekaj az instancja gry (CDP port) odpowie i wyrazenie JS zwroci wartosc truthy.
// Uzycie: node tools/cdp-wait.js <port> "<wyrazenie JS>" [timeoutMs=90000] [intervalMs=1500]
// Wypisuje wynik (JSON) i konczy kodem 0; po timeout kod 1. Node >= 22 (globalny WebSocket).
'use strict';
const port = Number(process.argv[2]);
const expr = process.argv[3];
const timeoutMs = Number(process.argv[4] || 90000);
const intervalMs = Number(process.argv[5] || 1500);
if (!port || !expr) { console.error('usage: node tools/cdp-wait.js <port> "<js>" [timeoutMs] [intervalMs]'); process.exit(2); }

async function evalOnce() {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
  try {
    const result = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('eval timeout')), 30000);
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) { clearTimeout(t); res(d); } };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    });
    if (result.error) throw new Error(JSON.stringify(result.error));
    const r = result.result;
    if (r.exceptionDetails) throw new Error('exception: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  } finally { ws.close(); }
}

(async () => {
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await evalOnce();
      if (v) { console.log(typeof v === 'string' ? v : JSON.stringify(v)); process.exitCode = 0; return; }
    } catch (e) { lastErr = e.message; }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error('TIMEOUT po ' + timeoutMs + ' ms' + (lastErr ? ' (ostatni blad: ' + lastErr + ')' : ''));
  process.exitCode = 1;
})();
