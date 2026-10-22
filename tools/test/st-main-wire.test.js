// Unit tests for the wire code in src/st-main.js (WebSocket frames, binary world packets).
// st-main.js runs in a vm with stubbed electron/logger, so nothing is exported just for tests.
// Run: node --test "tools/test/*.test.js"
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '../../src/st-main.js');
function load() {
  const sent = [];
  const ctx = vm.createContext({
    require: (m) => { if (m === 'electron' || m === './logger' || m === './steam') throw new Error('stub: ' + m); return require(m); },
    module: { exports: {} }, exports: {}, __dirname: path.dirname(SRC), __filename: SRC,
    console: { log() {}, error() {}, warn() {} }, process, Buffer, Uint8Array, BigInt, setTimeout, clearTimeout, setInterval, clearInterval,
  });
  vm.runInContext(fs.readFileSync(SRC, 'utf8') + '\n;globalThis.__t = { wsEncodeFrame, wsFrameParser, handleIncomingBin, S };', ctx, { filename: SRC });
  const t = ctx.__t;
  t.S.getMainWindow = () => ({ isDestroyed: () => false, webContents: { send: (ch, p) => sent.push([ch, p]) } });
  return { ...t, sent };
}

function collect(t) {
  const texts = [], bins = [], writes = [];
  const sock = { ended: false, end() { this.ended = true; }, write(b) { writes.push(b); } };
  const feed = t.wsFrameParser(sock, (s) => texts.push(s), (b) => bins.push(b));
  return { feed, texts, bins, writes, sock };
}

test('text frames round-trip at every length encoding, masked and unmasked', () => {
  const t = load();
  for (const len of [0, 1, 125, 126, 65535, 65536, 200000]) {
    for (const mask of [false, true]) {
      const c = collect(t);
      const msg = 'x'.repeat(len);
      c.feed(t.wsEncodeFrame(msg, mask));
      assert.deepStrictEqual(c.texts, [msg], 'len ' + len + ' mask ' + mask);
    }
  }
});

test('binary frames round-trip as a copy', () => {
  const t = load();
  const c = collect(t);
  const data = Buffer.from([0, 1, 2, 250, 255]);
  c.feed(t.wsEncodeFrame(new Uint8Array(data), true));
  assert.strictEqual(c.bins.length, 1);
  assert.ok(Buffer.from(c.bins[0]).equals(data));
});

test('frames split across chunks and several frames in one chunk', () => {
  const t = load();
  const c = collect(t);
  const wire = Buffer.concat([t.wsEncodeFrame('first', true), t.wsEncodeFrame('second'.repeat(30), true), t.wsEncodeFrame('third', false)]);
  for (let i = 0; i < wire.length; i++) c.feed(wire.subarray(i, i + 1));
  assert.deepStrictEqual(c.texts, ['first', 'second'.repeat(30), 'third']);
  const c2 = collect(t);
  c2.feed(wire);
  assert.deepStrictEqual(c2.texts, c.texts);
});

test('ping is answered with a pong, close ends the socket', () => {
  const t = load();
  const c = collect(t);
  c.feed(Buffer.from([0x89, 2, 0x41, 0x42]));
  assert.ok(c.writes[0].equals(Buffer.from([0x8a, 2, 0x41, 0x42])));
  c.feed(Buffer.from([0x88, 0]));
  assert.strictEqual(c.sock.ended, true);
});

test('binary world packet: [u16 header length][JSON header][payload] reaches the renderer split', () => {
  const t = load();
  const hdr = Buffer.from(JSON.stringify({ t: 'wc', n: 3 }));
  const payload = Buffer.from([9, 8, 7]);
  const pkt = Buffer.concat([Buffer.from([hdr.length >> 8, hdr.length & 255]), hdr, payload]);
  t.S.peers.set('ws:peer', { id: 'ws:peer', kind: 'ws' });   // packets are only taken from known peers
  t.handleIncomingBin('ws:peer', pkt);
  assert.strictEqual(t.sent.length, 1);
  const [ch, p] = t.sent[0];
  assert.strictEqual(ch, 'st:msg');
  assert.strictEqual(p.from, 'ws:peer');
  assert.deepStrictEqual({ ...p.msg }, { t: 'wc', n: 3 });
  assert.ok(Buffer.from(p.bin).equals(payload));
  t.handleIncomingBin('ws:peer', pkt.subarray(0, 5)); // truncated header: dropped
  assert.strictEqual(t.sent.length, 1);
});
