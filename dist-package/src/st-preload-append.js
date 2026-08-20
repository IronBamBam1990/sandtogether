
// --- SandTogether by Kamil Padula: network bridge (appended by patch.js) ---
contextBridge.exposeInMainWorld('sandtogetherNet', {
  hostSteam: () => ipcRenderer.invoke('st:host-steam'),
  joinSteam: (lobbyId) => ipcRenderer.invoke('st:join-steam', lobbyId),
  invite: () => ipcRenderer.invoke('st:invite'),
  hostWs: (port) => ipcRenderer.invoke('st:host-ws', port),
  hostDirect: (port) => ipcRenderer.invoke('st:host-direct', port),
  joinWs: (host, port) => ipcRenderer.invoke('st:join-ws', host, port),
  stop: () => ipcRenderer.invoke('st:stop'),
  status: () => ipcRenderer.invoke('st:status'),
  send: (payload, toId) => ipcRenderer.send('st:send', payload, toId),
  onMsg: (cb) => { ipcRenderer.on('st:msg', (ev, data) => cb(data)); },
  onEvent: (cb) => { ipcRenderer.on('st:event', (ev, data) => cb(data)); },
});
// --- /SandTogether ---
