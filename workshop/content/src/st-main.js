// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Author / Autor: KAMIL PADULA
// Networking core (Electron main process).
// Transports: Steam P2P (internet, zero-config via lobby + overlay invites)
//             and a minimal dependency-free WebSocket (LAN / local testing).
// All network state lives here because the renderer reloads between scenes.
// ============================================================================

'use strict';

const net = require('net');
const os = require('os'); // UPnP: wykrycie wlasnego adresu LAN
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TAG = '[SandTogether:net]';
let fileLog = null;
try { fileLog = require('./logger').createLogger('SandTogether'); } catch (e) { /* brak loggera gry */ }
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? String(v) : v)))).join(' ');
  console.log(TAG, line);
  if (fileLog) fileLog.info(line);
};

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PROTO_VER = 5;

// ---------------------------------------------------------------------------
// Stan
// ---------------------------------------------------------------------------
const S = {
  getMainWindow: null,
  steam: null,          // steamworks client (z steam.js gry)
  role: 'idle',         // idle | host | client
  transport: null,      // 'steam' | 'ws'
  lobby: null,          // Steam lobby (host i klient)
  peers: new Map(),     // id(string) -> peer {id, kind:'steam'|'ws', steamId64?, sock?, nick}
  wsServer: null,
  wsClient: null,       // socket klienta WS (rola client, transport ws)
  p2pPoll: null,
  myNick: 'Player',
  myId: 'local',
};

function sendRenderer(channel, payload) {
  try {
    const win = S.getMainWindow && S.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  } catch (e) { /* okno w trakcie przeładowania */ }
}
const emitEvent = (kind, data) => { log('event:', kind, data ? JSON.stringify(data).slice(0, 200) : ''); sendRenderer('st:event', { kind, ...data }); };
const emitMsg = (from, obj) => sendRenderer('st:msg', { from, msg: obj });

// ---------------------------------------------------------------------------
// Minimalny WebSocket (RFC6455) — serwer i klient na surowym net, bez zależności
// ---------------------------------------------------------------------------
function wsEncodeFrame(payload, mask) {
  // 0.9.111: ta sama funkcja obsluguje teraz ramki tekstowe (opcode 1) i binarne (opcode 2).
  const isBin = Buffer.isBuffer(payload) || payload instanceof Uint8Array;
  const data = isBin ? (Buffer.isBuffer(payload) ? payload : Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)) : Buffer.from(payload, "utf8");
  const op = isBin ? 0x82 : 0x81;
  const len = data.length;
  let header;
  if (len < 126) header = Buffer.from([op, len | (mask ? 0x80 : 0)]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = op; header[1] = 126 | (mask ? 0x80 : 0); header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = op; header[1] = 127 | (mask ? 0x80 : 0); header.writeBigUInt64BE(BigInt(len), 2); }
  if (!mask) return Buffer.concat([header, data]);
  const key = crypto.randomBytes(4);
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i++) masked[i] ^= key[i & 3];
  return Buffer.concat([header, key, masked]);
}

// Parser strumienia ramek; onText(str), zwraca funkcję feed(chunk)
function wsFrameParser(sock, onText, onBinary) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskKey = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3]; }
      buf = buf.subarray(off + len);
      if (opcode === 8) { try { sock.end(); } catch (e) {} return; }
      if (opcode === 9) { try { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {} continue; }
      if (opcode === 1 && fin) onText(payload.toString('utf8'));
      // 0.9.111: ramka binarna = paczka swiata bez base64 (kopiujemy, bo bufor parsera jest wspoldzielony)
      if (opcode === 2 && fin && onBinary) onBinary(Buffer.from(payload));
      // fragmentacja i binarne pomijamy — protokół używa krótkich ramek tekstowych
    }
  };
}

function startWsServer(port) {
  stopNetworking('restart');
  S.role = 'host'; S.transport = 'ws';
  S.wsServer = net.createServer((sock) => {
    // Nagle trzyma male zapisy do czasu ACK poprzedniego segmentu — a my piszemy osobnym write() kazda
    // wiadomosc, w tym pozycje gracza 30x/s. Przy RTT 80 ms przepuszcza to ~12 malych pakietow/s i akcje
    // gracza stoja w tej samej kolejce (friberg, 24.08.2026). Na LAN roznicy nie widac, przez internet decyduje.
    try { sock.setNoDelay(true); } catch (e) {}
    let upgraded = false;
    let headerBuf = Buffer.alloc(0);
    const peerId = 'ws:' + sock.remoteAddress + ':' + sock.remotePort;
    sock.on('data', (chunk) => {
      if (upgraded) return;
      headerBuf = Buffer.concat([headerBuf, chunk]);
      const idx = headerBuf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const head = headerBuf.toString('utf8', 0, idx);
      const m = /Sec-WebSocket-Key:\s*(.+)\r\n/i.exec(head + '\r\n');
      if (!m || !/upgrade/i.test(head)) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
      const accept = crypto.createHash('sha1').update(m[1].trim() + WS_GUID).digest('base64');
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      upgraded = true;
      const peer = { id: peerId, kind: 'ws', sock, nick: '?' };
      S.peers.set(peerId, peer);
      const feed = wsFrameParser(sock, (text) => handleIncoming(peerId, text), (bin) => handleIncomingBin(peerId, bin));
      const rest = headerBuf.subarray(idx + 4);
      sock.on('data', feed);
      if (rest.length) feed(rest);
      emitEvent('peer-connected', { id: peerId });
      // fix (DwoaC): serwer WS też musi się PRZYWITAĆ — bez hello hosta klient nigdy nie odpowiada
      // mver i host po 5s widział fałszywy alarm "OLD mod" (Steam robi to w refreshLobbyMembers)
      sendToPeer(peer, { t: 'hello', nick: S.myNick, ver: PROTO_VER });
    });
    sock.on('close', () => { if (S.peers.delete(peerId)) emitEvent('peer-disconnected', { id: peerId }); });
    sock.on('error', () => {});
  });
  S.wsServer.on('error', (e) => emitEvent('error', { where: 'ws-server', message: e.message }));
  S.wsServer.listen(port, () => emitEvent('hosting', { transport: 'ws', port }));
}

function joinWs(host, port, _retry) {
  stopNetworking('restart');
  S.role = 'client'; S.transport = 'ws';
  const retryCount = _retry || 0;
  const key = crypto.randomBytes(16).toString('base64');
  const sock = net.connect(port, host, () => {
    try { sock.setNoDelay(true); } catch (e) {}   // patrz komentarz w startWsServer
    sock.write('GET / HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
  });
  S.wsClient = sock;
  let upgraded = false;
  let headerBuf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    if (upgraded) return;
    headerBuf = Buffer.concat([headerBuf, chunk]);
    const idx = headerBuf.indexOf('\r\n\r\n');
    if (idx === -1) return;
    if (!/ 101 /.test(headerBuf.toString('utf8', 0, idx))) { emitEvent('error', { where: 'ws-join', message: 'handshake failed' }); sock.end(); return; }
    upgraded = true;
    S.peers.set('host', { id: 'host', kind: 'ws', sock, nick: 'Host' });
    const feed = wsFrameParser(sock, (text) => handleIncoming('host', text), (bin) => handleIncomingBin('host', bin));
    const rest = headerBuf.subarray(idx + 4);
    sock.on('data', feed);
    if (rest.length) feed(rest);
    emitEvent('joined', { transport: 'ws', host, port });
    netSend({ t: 'hello', nick: S.myNick, ver: PROTO_VER });
  });
  sock.on('close', () => {
    S.peers.delete('host');
    emitEvent('peer-disconnected', { id: 'host' });
    // AUTO-RECONNECT (LAN): zerwane łącze wskrzeszamy co 3s. Licznik prób jedzie przez parametr _retry
    // (przetrwa kolejne sockety!). Udany handshake = stabilne łącze → przyszłe zerwanie znów ma 5 prób.
    // Stop usera / inne połączenie w międzyczasie przerywa (role/transport/peers check).
    if (S.role === 'client' && S.transport === 'ws' && S.wsClient === sock) {
      const next = upgraded ? 1 : retryCount + 1; // po stabilnym łączu licz od 1; po nieudanej próbie +1
      if (next > 5) { emitEvent('error', { where: 'ws-join', message: 'reconnect failed after 5 tries' }); return; }
      setTimeout(() => {
        if (S.role !== 'client' || S.transport !== 'ws' || S.peers.size > 0) return;
        log('WS reconnect próba', next, '/5 →', host + ':' + port);
        emitEvent('reconnecting', { transport: 'ws', attempt: next });
        try { joinWs(host, port, next); } catch (e) {}
      }, 3000);
    }
  });
  sock.on('error', (e) => emitEvent('error', { where: 'ws-join', message: e.message }));
}

// ---------------------------------------------------------------------------
// Steam P2P
// ---------------------------------------------------------------------------
function ensureP2pPoll() {
  if (S.p2pPoll) return;
  S.p2pPoll = setInterval(() => {
    try {
      const n = S.steam.networking;
      let size;
      let guard = 0;
      while ((size = n.isP2PPacketAvailable()) > 0 && guard++ < 256) {
        const pkt = n.readP2PPacket(size);
        if (!pkt) break;
        const sid = String(pkt.steamId && (pkt.steamId.steamId64 !== undefined ? pkt.steamId.steamId64 : pkt.steamId));
        const text = pkt.data.toString('utf8');
        handleIncoming('steam:' + sid, text, sid);
      }
    } catch (e) { /* nie zabijaj pętli */ }
  }, 15);
}

// Pola callbacków steamworks.js różnią się per platforma: binarka win64 daje
// camelCase (lobbySteamId), binarka osx snake_case (lobby_steam_id). Bierzemy
// pierwsze zdefiniowane pole.
function pickField(o, ...keys) {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}

function registerSteamCallbacks() {
  const cb = S.steam.callback;
  const CB = cb.SteamCallback;
  cb.register(CB.P2PSessionRequest, (data) => {
    try {
      const sid = pickField(data, 'remote', 'steam_id_remote', 'remoteSteamId', 'remote_steam_id');
      const sidVal = sid !== undefined ? sid : data;
      const sid64 = typeof sidVal === 'object' && sidVal !== null && sidVal.steamId64 !== undefined ? sidVal.steamId64 : sidVal;
      S.steam.networking.acceptP2PSession(BigInt(sid64));
      log('P2P session accepted:', String(sid64));
    } catch (e) { log('P2PSessionRequest error:', e.message, JSON.stringify(data)); }
  });
  cb.register(CB.P2PSessionConnectFail, (data) => {
    emitEvent('error', { where: 'p2p', message: 'P2P connect fail', data: safeJson(data) });
    // klient: rejoin dopiero po POWTÓRNYM failu w 10s (pojedynczy chwilowy błąd nie zrywa sesji)
    const now = Date.now();
    S._p2pFails = (S._p2pFails || []).filter((t) => now - t < 10000);
    S._p2pFails.push(now);
    if (S._p2pFails.length >= 2) { S._p2pFails = []; steamRejoin(1); }
  });
  cb.register(CB.GameLobbyJoinRequested, async (data) => {
    // Znajomy kliknął "Dołącz" w Steam — dołączamy do lobby hosta.
    try {
      const lobbyId = pickField(data, 'lobbySteamId', 'steamIdLobby', 'lobby_steam_id', 'steam_id_lobby');
      log('GameLobbyJoinRequested:', safeJson(data));
      if (lobbyId !== undefined && lobbyId !== null) await joinSteamLobby(String(typeof lobbyId === 'object' ? lobbyId.steamId64 : lobbyId));
      else emitEvent('error', { where: 'lobby-join', message: 'lobby id not found in callback payload: ' + JSON.stringify(safeJson(data)) });
    } catch (e) { emitEvent('error', { where: 'lobby-join', message: e.message }); }
  });
  cb.register(CB.LobbyChatUpdate, (data) => {
    log('LobbyChatUpdate:', safeJson(data));
    if (S.role === 'host' && S.lobby) refreshLobbyMembers();
  });
}

function refreshLobbyMembers() {
  try {
    const me = String(S.steam.localplayer.getSteamId().steamId64);
    const members = S.lobby.getMembers();
    const current = new Set();
    for (const m of members) {
      const sid = String(m.steamId64 !== undefined ? m.steamId64 : m);
      if (sid === me) continue;
      current.add('steam:' + sid);
      if (!S.peers.has('steam:' + sid)) {
        S.peers.set('steam:' + sid, { id: 'steam:' + sid, kind: 'steam', steamId64: sid, nick: '?' });
        emitEvent('peer-connected', { id: 'steam:' + sid });
        // przywitaj się, żeby ustanowić sesję P2P
        sendToPeer(S.peers.get('steam:' + sid), { t: 'hello', nick: S.myNick, ver: PROTO_VER });
      }
    }
    for (const [id, p] of S.peers) if (p.kind === 'steam' && !current.has(id)) { S.peers.delete(id); emitEvent('peer-disconnected', { id }); }
  } catch (e) { log('refreshLobbyMembers error:', e.message); }
}

// Parsuje lobby ID z argumentów uruchomienia i dołącza. Obsługuje:
//   +connect_lobby <id>   (standardowy launch param Steam)
//   steam://joinlobby/<appid>/<lobbyid>/<ownerid>
function tryJoinFromArgv(argv, source) {
  try {
    if (!Array.isArray(argv)) return false;
    let id = null;
    const i = argv.indexOf('+connect_lobby');
    if (i >= 0 && argv[i + 1]) id = argv[i + 1];
    if (!id) for (const a of argv) { const m = /joinlobby\/\d+\/(\d+)/.exec(String(a)); if (m) { id = m[1]; break; } }
    if (!id) return false;
    if (!S.steam) { log('argv lobby ' + id + ' — Steam jeszcze nieinicjalizowany, czekam'); S._pendingJoin = id; return false; }
    log('Auto-join lobby z argv (' + source + '):', id);
    joinSteamLobby(String(id)).catch((e) => emitEvent('error', { where: 'argv-join', message: e.message }));
    return true;
  } catch (e) { log('tryJoinFromArgv error:', e.message); return false; }
}

async function hostSteam() {
  if (!S.steam) throw new Error('Steam client niedostępny');
  stopNetworking('restart');
  S.role = 'host'; S.transport = 'steam';
  const { LobbyType } = S.steam.matchmaking;
  S.lobby = await S.steam.matchmaking.createLobby(LobbyType.FriendsOnly, 4);
  ensureP2pPoll();
  try { S.lobby.setJoinable(true); } catch (e) { log('setJoinable error:', e.message); }
  // Rich presence "connect" => Steam pokazuje "Dołącz do gry" w liście znajomych
  // i przekazuje ten string jako launch param dołączającemu.
  try { S.steam.localplayer.setRichPresence('connect', '+connect_lobby ' + String(S.lobby.id)); } catch (e) { log('setRichPresence error:', e.message); }
  emitEvent('hosting', { transport: 'steam', lobbyId: String(S.lobby.id) });
  return { lobbyId: String(S.lobby.id) };
}

// AUTO-REJOIN Steam (odpowiednik reconnectu WS): po utracie P2P/hosta próbujemy wrócić do
// ostatniego lobby co 3s, max 5 razy. Nowe świadome połączenie/Stop zeruje licznik.
function steamRejoin(attempt) {
  if (S.role !== 'client' || S.transport !== 'steam' || !S.lastLobbyId) return;
  if (S._rejoinPending) return; // jedna pętla naraz
  if (attempt > 5) { emitEvent('error', { where: 'steam-rejoin', message: 'rejoin failed after 5 tries' }); return; }
  S._rejoinPending = true;
  setTimeout(async () => {
    S._rejoinPending = false;
    if (S.role !== 'client' || S.transport !== 'steam') return;
    log('Steam rejoin próba', attempt, '/5 → lobby', S.lastLobbyId);
    emitEvent('reconnecting', { transport: 'steam', attempt });
    try { await joinSteamLobby(S.lastLobbyId); } catch (e) { steamRejoin(attempt + 1); }
  }, 3000);
}

async function joinSteamLobby(lobbyIdStr) {
  if (!S.steam) throw new Error('Steam client niedostępny');
  stopNetworking('restart');
  S.role = 'client'; S.transport = 'steam';
  S.lastLobbyId = lobbyIdStr;
  S.lobby = await S.steam.matchmaking.joinLobby(BigInt(lobbyIdStr));
  const owner = S.lobby.getOwner();
  const sid = String(owner.steamId64 !== undefined ? owner.steamId64 : owner);
  S.peers.set('steam:' + sid, { id: 'steam:' + sid, kind: 'steam', steamId64: sid, nick: 'Host' });
  ensureP2pPoll();
  emitEvent('joined', { transport: 'steam', lobbyId: lobbyIdStr, hostId: sid });
  netSend({ t: 'hello', nick: S.myNick, ver: PROTO_VER });
  return { hostId: sid };
}

// ---------------------------------------------------------------------------
// Wspólny routing
// ---------------------------------------------------------------------------
function handleIncoming(peerId, text, steamSid) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return; }
  // auto-rejestracja peera steam, który jeszcze nie jest w mapie (np. hello przed LobbyChatUpdate)
  if (steamSid && !S.peers.has(peerId)) {
    S.peers.set(peerId, { id: peerId, kind: 'steam', steamId64: steamSid, nick: '?' });
    emitEvent('peer-connected', { id: peerId });
  }
  const peer = S.peers.get(peerId);
  if (peer && obj.t === 'hello') {
    peer.nick = obj.nick || '?';
    emitEvent('peer-hello', { id: peerId, nick: peer.nick });
    if (obj.ver != null && obj.ver !== PROTO_VER) emitEvent('version-mismatch', { id: peerId, theirs: obj.ver, ours: PROTO_VER });
  }
  emitMsg(peerId, obj);
  // host relays player positions/hellos to the other clients (3+ player support)
  if (S.role === 'host' && (obj.t === 'pos' || obj.t === 'hello' || obj.t === 'chat' || obj.t === 'myproj' || obj.t === 'snd') && S.peers.size > 1) {
    const relay = { t: 'relay', from: peerId, msg: obj };
    for (const p of S.peers.values()) if (p.id !== peerId) sendToPeer(p, relay);
  }
}

// 0.9.111: pakiet binarny = [2B dlugosc naglowka JSON][naglowek][dane]. Naglowek trafia do renderera
// jako zwykla wiadomosc, dane jako Uint8Array obok — bez zadnej konwersji tekstowej po drodze.
function handleIncomingBin(peerId, buf) {
  try {
    if (!buf || buf.length < 2) return;
    const hl = buf.readUInt16BE(0);
    if (buf.length < 2 + hl) return;
    const obj = JSON.parse(buf.subarray(2, 2 + hl).toString("utf8"));
    sendRenderer("st:msg", { from: peerId, msg: obj, bin: buf.subarray(2 + hl) });
  } catch (e) { log("bin frame blad:", e.message); }
}
function sendToPeer(peer, obj) {
  const isBin = Buffer.isBuffer(obj) || obj instanceof Uint8Array;
  const text = isBin ? null : JSON.stringify(obj);
  try {
    if (peer.kind === 'ws') peer.sock.write(wsEncodeFrame(isBin ? obj : text, S.role === 'client'));
    else if (peer.kind === 'steam') {
      // ping, pong and wcack MUST bypass the reliable channel. Steam's reliable channel is ORDERED, so
      // neither can overtake a backlog of world packets: the HUD would report send queue depth instead of
      // RTT, and the mirror ack would feed the congestion controller state from tens of seconds ago,
      // which defeats the whole point of measuring. Losing one is harmless, ping goes out every 1 s and
      // wcack 10x per second, and both carry absolute state rather than a delta.
      if (isBin) return; // binarne tylko po WS (LAN/direct); Steam trzyma sciezke tekstowa
      const reliable = obj.t !== 'pos' && obj.t !== 'ping' && obj.t !== 'pong' && obj.t !== 'wcack';
      S.steam.networking.sendP2PPacket(BigInt(peer.steamId64), reliable ? S.steam.networking.SendType.Reliable : S.steam.networking.SendType.UnreliableNoDelay, Buffer.from(text, 'utf8'));
    }
  } catch (e) { log('send error to', peer.id, e.message); }
}

function netSend(obj, toId) {
  if (toId) { const p = S.peers.get(toId); if (p) sendToPeer(p, obj); return; }
  for (const p of S.peers.values()) sendToPeer(p, obj);
}

function stopNetworking(reason) {
  if (S.wsServer) { try { S.wsServer.close(); } catch (e) {} S.wsServer = null; }
  if (S.wsClient) { try { S.wsClient.end(); } catch (e) {} S.wsClient = null; }
  if (S.lobby) { try { S.lobby.leave(); } catch (e) {} S.lobby = null; }
  // wyczyść "Join Game" ze Steama, żeby nie zostało nieaktualne
  if (S.steam) { try { S.steam.localplayer.setRichPresence('connect', ''); } catch (e) {} }
  if (S.p2pPoll) { clearInterval(S.p2pPoll); S.p2pPoll = null; }
  S.peers.clear();
  S.role = 'idle'; S.transport = null;
  if (reason !== 'restart') emitEvent('stopped', {});
}

function safeJson(o) { try { return JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'bigint' ? String(v) : v)); } catch (e) { return String(o); } }

// ============================================================================
// AUTO-UPDATE Z WARSZTATU: przy każdym starcie gry porównujemy wersję moda w folderze
// Workshop (Steam aktualizuje go sam) z zainstalowaną. Nowsza → kopiujemy pliki, nakładamy
// patche bundle (idempotentnie, jak install.ps1) i restartujemy grę. Gracz robi install.bat
// tylko RAZ — każda kolejna aktualizacja wchodzi sama. Autor z nowszą lokalną wersją niż
// Workshop NIE jest cofany (porównanie numeryczne, update tylko w górę).
// ============================================================================
const WORKSHOP_ITEM = '3784750764';
function parseVer(file) {
  try {
    const m = /const VER = "(\d+)\.(\d+)\.(\d+)/.exec(fs.readFileSync(file, 'utf8').slice(0, 4000));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  } catch (e) { return null; }
}
function applyBundlePatches(bundlePath, patches) {
  let s = fs.readFileSync(bundlePath, 'utf8');
  let dirty = false, criticalFail = false, appliedN = 0;
  for (const pt of patches.bundle || []) {
    let applied = false, already = false;
    for (const v of pt.variants || []) {
      if (s.indexOf(v.patched) >= 0) { already = true; break; }
      const i1 = s.indexOf(v.anchor);
      if (i1 < 0) continue;
      if (s.indexOf(v.anchor, i1 + 1) >= 0) continue; // kotwica nieunikalna w tym wariancie
      s = s.slice(0, i1) + v.patched + s.slice(i1 + v.anchor.length);
      dirty = true; applied = true; appliedN++;
      break;
    }
    if (!applied && !already && pt.critical) criticalFail = true;
  }
  if (dirty) fs.writeFileSync(bundlePath, s);
  return { criticalFail, appliedN };
}

// ============================================================================
// UPnP: automatyczne otwarcie portu na routerze + publiczny IP.
// Cel: ruch gry ma isc BEZPOSREDNIO miedzy graczami, a nie przez relay Steama
// (ktory dlawi pasmo i podbija ping do sekund). Bez zadnych zaleznosci:
// SSDP przez UDP (odkrycie routera) + SOAP przez HTTP (mapowanie portu).
// ============================================================================
const dgram = require("dgram");
const http = require("http");
const urlMod = require("url");

function localIPv4() {
  const ifs = os.networkInterfaces();
  const cands = [];
  for (const name of Object.keys(ifs)) for (const a of ifs[name] || []) {
    if (a.family !== "IPv4" && a.family !== 4) continue;
    if (a.internal) continue;
    cands.push(a.address);
  }
  // preferuj adresy prywatne (192.168/10./172.16-31)
  const priv = cands.filter((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
  return priv[0] || cands[0] || null;
}

// 1) SSDP: znajdz bramke internetowa (router) w sieci lokalnej
function upnpDiscover(timeoutMs) {
  return new Promise((resolve) => {
    const targets = [
      "urn:schemas-upnp-org:service:WANIPConnection:1",
      "urn:schemas-upnp-org:service:WANPPPConnection:1",
      "urn:schemas-upnp-org:device:InternetGatewayDevice:1",
    ];
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = (loc) => { if (done) return; done = true; try { sock.close(); } catch (e) {} resolve(loc); };
    sock.on("error", () => finish(null));
    sock.on("message", (msg) => {
      const txt = msg.toString("utf8");
      const m = /LOCATION:\s*(\S+)/i.exec(txt);
      if (m) finish(m[1]);
    });
    sock.bind(0, () => {
      try { sock.setBroadcast(true); } catch (e) {}
      for (const t of targets) {
        const q = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + t + "\r\n\r\n";
        try { sock.send(Buffer.from(q), 1900, "239.255.255.250"); } catch (e) {}
      }
    });
    setTimeout(() => finish(null), timeoutMs || 2500);
  });
}

function httpGet(u, timeoutMs) {
  return new Promise((resolve) => {
    let req;
    try { req = http.get(u, { timeout: timeoutMs || 3000 }, (res) => { let d = ""; res.setEncoding("utf8"); res.on("data", (c) => (d += c)); res.on("end", () => resolve(d)); }); }
    catch (e) { return resolve(null); }
    req.on("timeout", () => { try { req.destroy(); } catch (e) {} resolve(null); });
    req.on("error", () => resolve(null));
  });
}

// 2) z opisu urzadzenia wyciagnij adres uslugi sterujacej (WANIPConnection / WANPPPConnection)
async function upnpControl(locationUrl) {
  const xml = await httpGet(locationUrl, 3000);
  if (!xml) return null;
  const svcRe = /<service>([\s\S]*?)<\/service>/g;
  let m;
  while ((m = svcRe.exec(xml))) {
    const blk = m[1];
    const type = (/<serviceType>([^<]+)<\/serviceType>/i.exec(blk) || [])[1];
    const ctrl = (/<controlURL>([^<]+)<\/controlURL>/i.exec(blk) || [])[1];
    if (!type || !ctrl) continue;
    if (!/WAN(IP|PPP)Connection:\d/i.test(type)) continue;
    const base = urlMod.parse(locationUrl);
    const ctrlUrl = /^https?:\/\//i.test(ctrl) ? ctrl : (base.protocol + "//" + base.host + (ctrl.charAt(0) === "/" ? "" : "/") + ctrl);
    return { controlUrl: ctrlUrl, serviceType: type };
  }
  return null;
}

// 3) SOAP
function soap(ctrl, serviceType, action, bodyXml, timeoutMs) {
  return new Promise((resolve) => {
    const u = urlMod.parse(ctrl);
    const payload = '<?xml version="1.0"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      "<s:Body><u:" + action + ' xmlns:u="' + serviceType + '">' + (bodyXml || "") + "</u:" + action + "></s:Body></s:Envelope>";
    const req = http.request({
      host: u.hostname, port: u.port || 80, path: u.path, method: "POST",
      timeout: timeoutMs || 4000,
      headers: {
        "Content-Type": 'text/xml; charset="utf-8"',
        "Content-Length": Buffer.byteLength(payload),
        SOAPAction: '"' + serviceType + "#" + action + '"',
      },
    }, (res) => { let d = ""; res.setEncoding("utf8"); res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d })); });
    req.on("timeout", () => { try { req.destroy(); } catch (e) {} resolve(null); });
    req.on("error", () => resolve(null));
    req.end(payload);
  });
}

// 4) calosc: otworz port i zwroc publiczny IP
async function upnpOpenPort(port) {
  const out = { upnp: false, publicIp: null, port: port, error: null };
  try {
    const loc = await upnpDiscover(2500);
    if (!loc) { out.error = "router nie odpowiedzial na SSDP (UPnP wylaczone?)"; return out; }
    const svc = await upnpControl(loc);
    if (!svc) { out.error = "brak uslugi WANIPConnection w routerze"; return out; }
    const lan = localIPv4();
    if (!lan) { out.error = "nie znam wlasnego adresu LAN"; return out; }
    const body = "<NewRemoteHost></NewRemoteHost><NewExternalPort>" + port + "</NewExternalPort>" +
      "<NewProtocol>TCP</NewProtocol><NewInternalPort>" + port + "</NewInternalPort>" +
      "<NewInternalClient>" + lan + "</NewInternalClient><NewEnabled>1</NewEnabled>" +
      "<NewPortMappingDescription>SandTogether</NewPortMappingDescription><NewLeaseDuration>0</NewLeaseDuration>";
    const add = await soap(svc.controlUrl, svc.serviceType, "AddPortMapping", body, 5000);
    if (!add || add.status !== 200) { out.error = "router odmowil mapowania portu" + (add ? " (HTTP " + add.status + ")" : ""); }
    else { out.upnp = true; S.upnp = { ctrl: svc.controlUrl, type: svc.serviceType, port: port }; }
    const parseIp = (body) => { const mm = /<(?:[A-Za-z0-9]+:)?NewExternalIPAddress>\s*([^<\s]*)\s*<\/(?:[A-Za-z0-9]+:)?NewExternalIPAddress>/i.exec(body || ""); return mm && mm[1] ? mm[1].trim() : null; };
    for (let attempt = 0; attempt < 2 && !out.publicIp; attempt++) {
      if (attempt) await new Promise((r2) => setTimeout(r2, 1500));
      const ip = await soap(svc.controlUrl, svc.serviceType, "GetExternalIPAddress", "", 5000);
      if (ip && ip.body) out.publicIp = parseIp(ip.body);
    }
    if (!out.publicIp) { out.publicIp = await publicIpFallback(); if (out.publicIp) log("UPnP: router nie podal adresu — ustalony zewnetrznie"); }
  } catch (e) { out.error = e.message; }
  return out;
}

// Gdy router nie chce podac adresu zewnetrznego — pytamy uslugi zwracajacej czysty tekst.
// To WLASNY adres hosta, potrzebny zeby podac go koledze; nic wiecej nie wysylamy.
function publicIpFallback() {
  return new Promise((resolve) => {
    try {
      const https = require("https");
      const req = https.get("https://api.ipify.org", { timeout: 4000 }, (res) => {
        let d = ""; res.setEncoding("utf8"); res.on("data", (c) => (d += c));
        res.on("end", () => resolve(/^\d{1,3}(\.\d{1,3}){3}$/.test(d.trim()) ? d.trim() : null));
      });
      req.on("timeout", () => { try { req.destroy(); } catch (e) {} resolve(null); });
      req.on("error", () => resolve(null));
    } catch (e) { resolve(null); }
  });
}
async function upnpClosePort() {
  const u = S.upnp; if (!u) return;
  S.upnp = null;
  try {
    await soap(u.ctrl, u.type, "DeletePortMapping",
      "<NewRemoteHost></NewRemoteHost><NewExternalPort>" + u.port + "</NewExternalPort><NewProtocol>TCP</NewProtocol>", 4000);
    log("UPnP: mapowanie portu " + u.port + " usuniete");
  } catch (e) {}
}

function autoUpdateFromWorkshop() {
  try {
    // FIX 0.9.72 (KRYTYCZNY): appDir zniknal w 0.9.40 przy walk-upie do steamapps, uzycia zostaly
    // -> 'appDir is not defined' przy KAZDYM starcie = auto-update martwy od 18.08 u wszystkich graczy.
    const appDir = __dirname; // .../resources/app (Win/Linux) lub .../Contents/Resources/app (macOS)
    // Windows: steamapps/common/Sandustry/resources/app (4 poziomy w górę)
    // macOS:   steamapps/common/Sandustry/Sandustry.app/Contents/Resources/app (6 poziomów)
    // → szukamy katalogu "steamapps" W GÓRĘ zamiast liczyć poziomy.
    let steamapps = __dirname;
    for (let i = 0; i < 8 && path.basename(steamapps).toLowerCase() !== 'steamapps'; i++) steamapps = path.dirname(steamapps);
    if (path.basename(steamapps).toLowerCase() !== 'steamapps') return;
    const ws = path.join(steamapps, 'workshop', 'content', '2764460', WORKSHOP_ITEM);
    const wsMod = path.join(ws, 'src', 'sandtogether.js');
    const localMod = path.join(appDir, 'dist', 'js', 'sandtogether.js');
    if (!fs.existsSync(wsMod) || !fs.existsSync(localMod)) return;
    const wv = parseVer(wsMod), lv = parseVer(localMod);
    if (!wv || !lv) return;
    const cmp = (wv[0] - lv[0]) || (wv[1] - lv[1]) || (wv[2] - lv[2]);
    if (cmp <= 0) return; // lokalna >= Workshop → nic do roboty (m.in. autor moda)
    log('AUTO-UPDATE: Workshop ma ' + wv.join('.') + ', lokalnie ' + lv.join('.') + ' — aktualizuję...');
    fs.copyFileSync(wsMod, localMod);
    try { fs.copyFileSync(path.join(ws, 'src', 'st-main.js'), path.join(appDir, 'st-main.js')); } catch (e) {}
    try {
      const pl = path.join(appDir, 'preload.js');
      let ps = fs.readFileSync(pl, 'utf8');
      // 0.9.142: mostek IPC WYMIENIAMY miedzy markerami (jak patch.js). Samo "jest sandtogetherNet" zostawialo
      // stary mostek bez hostDirect → "net.hostDirect is not a function" u graczy z instalacja sprzed 0.9.79.
      const fresh = fs.readFileSync(path.join(ws, 'src', 'st-preload-append.js'), 'utf8');
      const B0 = '// --- SandTogether by Kamil Padula: network bridge (appended by patch.js) ---', B1 = '// --- /SandTogether ---';
      const i0 = ps.indexOf(B0), i1 = ps.indexOf(B1);
      const want = fresh.slice(fresh.indexOf(B0)).trim();
      if (i0 >= 0 && i1 > i0) {
        if (ps.slice(i0, i1 + B1.length).trim() !== want) { fs.writeFileSync(pl, ps.slice(0, i0) + want + ps.slice(i1 + B1.length)); log('AUTO-UPDATE: preload.js — mostek IPC wymieniony na aktualny'); }
      } else if (ps.indexOf('sandtogetherNet') < 0) { fs.writeFileSync(pl, ps + '\n' + fresh); log('AUTO-UPDATE: preload.js — mostek IPC dodany'); }
      else log('AUTO-UPDATE: preload.js ma mostek bez markerow — uruchom patch.js recznie');
    } catch (e) {}
    const patches = JSON.parse(fs.readFileSync(path.join(ws, 'src', 'patches.json'), 'utf8'));
    const res = applyBundlePatches(path.join(appDir, 'dist', 'js', 'bundle.js'), patches);
    log('AUTO-UPDATE: pliki skopiowane, patche bundle: +' + res.appliedN + (res.criticalFail ? ' (UWAGA: krytyczna kotwica nie pasuje — build gry nowszy niż mod!)' : ''));
    // restart, żeby nowe pliki (bundle/renderer/main) faktycznie się załadowały
    const { app } = require('electron');
    log('AUTO-UPDATE: restart gry z nową wersją moda ' + wv.join('.'));
    app.relaunch();
    app.exit(0);
  } catch (e) { log('autoUpdate error:', e.message); }
}

// Odcisk buildu GRY (rozmiar bundle + sha1 pierwszych 256KB): Steam potrafi serwować różnym ludziom
// różne buildy o tym samym numerze wersji — różne enumy/kotwice. Porównywany przy wymianie mver.
let _gameFpCache;
function gameFingerprint() {
  if (_gameFpCache !== undefined) return _gameFpCache;
  try {
    const p = path.join(__dirname, 'dist', 'js', 'bundle.js');
    const st = fs.statSync(p);
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(Math.min(262144, st.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    _gameFpCache = st.size + '-' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  } catch (e) { _gameFpCache = null; }
  return _gameFpCache;
}

// ---------------------------------------------------------------------------
// Init + IPC
// ---------------------------------------------------------------------------
function init(opts) {
  S.getMainWindow = opts.getMainWindow;
  autoUpdateFromWorkshop(); // nowsza wersja w folderze Workshop → auto-instalacja + restart gry
  // Diagnostyka: pokaż argumenty startu (widać czy Steam podał +connect_lobby przy dołączaniu)
  try { log('start argv:', JSON.stringify(process.argv.slice(1))); } catch (e) {}
  // Steam inicjalizuje się asynchronicznie po starcie appki — próbuj do skutku
  let tries = 0;
  const grabSteam = setInterval(() => {
    tries++;
    try {
      const c = require('./steam').getSteamClient();
      if (c) {
        clearInterval(grabSteam);
        S.steam = c;
        S.myNick = c.localplayer.getName();
        S.myId = String(c.localplayer.getSteamId().steamId64);
        registerSteamCallbacks();
        log('Steam OK — nick:', S.myNick, 'id:', S.myId);
        // Zaproszenie zaakceptowane PRZY WYŁĄCZONEJ grze → Steam odpalił grę z +connect_lobby
        if (S._pendingJoin) { const id = S._pendingJoin; S._pendingJoin = null; setTimeout(() => joinSteamLobby(String(id)).catch(() => {}), 500); }
        else setTimeout(() => tryJoinFromArgv(process.argv, 'cold-launch'), 500);
        return;
      }
    } catch (e) { /* jeszcze nie gotowy */ }
    if (tries >= 30) { clearInterval(grabSteam); log('Steam niedostępny po 60s — tylko transport WS'); }
  }, 2000);

  const { ipcMain, app } = require('electron');
  // Zaproszenie zaakceptowane gdy gra DZIAŁA a użytkownik był poza overlayem:
  // Steam odpala drugą instancję → single-instance ją ubija, a my dostajemy jej argv tutaj.
  try { app.on('second-instance', (event, argv) => { log('second-instance argv:', JSON.stringify(argv)); tryJoinFromArgv(argv, 'second-instance'); }); } catch (e) {}
  ipcMain.handle('st:host-steam', async () => { try { return { ok: true, ...(await hostSteam()) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('st:join-steam', async (ev, lobbyId) => { try { return { ok: true, ...(await joinSteamLobby(lobbyId)) }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('st:invite', async () => { try { if (!S.lobby) return { ok: false, error: 'brak lobby' }; S.lobby.openInviteDialog(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('st:host-ws', async (ev, port) => { try { startWsServer(port || 27777); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('st:join-ws', async (ev, host, port) => { try { joinWs(host, port || 27777); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('st:host-direct', async (ev, port) => {
    try {
      const p = port || 27777;
      startWsServer(p);
      const r = await upnpOpenPort(p);
      log("HOST DIRECT: port " + p + (r.upnp ? " otwarty przez UPnP" : " BEZ UPnP (" + r.error + ")") + ", publiczny IP: " + (r.publicIp || "?"));
      return { ok: true, upnp: r.upnp, publicIp: r.publicIp, port: p, error: r.error };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('st:stop', async () => { upnpClosePort(); stopNetworking(); return { ok: true }; });
  ipcMain.on('st:send', (ev, payload, toId) => netSend(payload, toId));
  ipcMain.handle('st:status', async () => ({
    role: S.role, transport: S.transport, myNick: S.myNick, myId: S.myId,
    lobbyId: S.lobby ? String(S.lobby.id) : null,
    peers: [...S.peers.values()].map((p) => ({ id: p.id, kind: p.kind, nick: p.nick })),
    gameFp: gameFingerprint(),
  }));
  // Tryb autotestu: --st-autotest=host | --st-autotest=join (testy dwóch instancji bez klikania)
  const autotest = process.argv.find((a) => a.startsWith('--st-autotest='));
  if (autotest) {
    const mode = autotest.split('=')[1];
    log('AUTOTEST:', mode, '(start za 10s)');
    setTimeout(() => {
      try {
        if (mode === 'host') startWsServer(27777);
        else if (mode === 'join') joinWs('127.0.0.1', 27777);
      } catch (e) { log('autotest error:', e.message); }
    }, 10000);
  }

  log('init OK (proto v' + PROTO_VER + ')');
}

module.exports = { init };
