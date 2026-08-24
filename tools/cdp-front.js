// Wysuwa okno gry na pierwszy plan (Page.bringToFront) — bez tego gra wstrzymuje czas w tle.
'use strict';
const port = Number(process.argv[2]);
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  ws.send(JSON.stringify({ id: 1, method: 'Page.bringToFront', params: {} }));
  await new Promise((r) => setTimeout(r, 300));
  ws.close(); console.log('front'); process.exitCode = 0;
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
