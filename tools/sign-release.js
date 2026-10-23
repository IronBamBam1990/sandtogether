// Release signing for the Workshop auto-updater (st-main.js RELEASE_PUBKEY).
//   node tools/sign-release.js keygen <private-key.pem>    one-time: new Ed25519 key, prints the public key
//   node tools/sign-release.js sign <private-key.pem> [dir] writes dir/release.json + dir/release.sig (default workshop/content/src)
//   node tools/sign-release.js verify <public-key-b64> [dir]
// Keep the private key outside the repo. Sign after the last change to the release files, right before publishing.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILES = ['sandtogether.js', 'st-main.js', 'st-preload-append.js', 'patches.json'];
const [cmd, a1, a2] = process.argv.slice(2);
const dir = path.resolve(a2 || path.join(__dirname, '..', 'workshop', 'content', 'src'));

function manifest() {
  const ver = (/const VER = "([^"]+)"/.exec(fs.readFileSync(path.join(dir, 'sandtogether.js'), 'utf8').slice(0, 4000)) || [])[1];
  if (!ver) throw new Error('VER not found in ' + path.join(dir, 'sandtogether.js'));
  const files = {};
  for (const f of FILES) files[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
  return { ver, files };
}

if (cmd === 'keygen' && a1) {
  if (fs.existsSync(a1)) throw new Error(a1 + ' exists, not overwriting');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(a1, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log('private key written to ' + a1);
  console.log("public key (put into st-main.js RELEASE_PUBKEY):\n" + publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
} else if (cmd === 'sign' && a1) {
  const key = crypto.createPrivateKey(fs.readFileSync(a1));
  const body = Buffer.from(JSON.stringify(manifest(), null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'release.json'), body);
  fs.writeFileSync(path.join(dir, 'release.sig'), crypto.sign(null, body, key).toString('base64') + '\n');
  console.log('signed ' + JSON.parse(body).ver + ' in ' + dir);
} else if (cmd === 'verify' && a1) {
  const key = crypto.createPublicKey({ key: Buffer.from(a1, 'base64'), format: 'der', type: 'spki' });
  const body = fs.readFileSync(path.join(dir, 'release.json'));
  const sig = Buffer.from(fs.readFileSync(path.join(dir, 'release.sig'), 'utf8').trim(), 'base64');
  if (!crypto.verify(null, body, key, sig)) { console.error('BAD signature'); process.exit(1); }
  const want = manifest(), got = JSON.parse(body);
  const bad = FILES.filter((f) => got.files[f] !== want.files[f]);
  if (got.ver !== want.ver || bad.length) { console.error('signature OK but stale: ' + (bad.join(', ') || 'version')); process.exit(1); }
  console.log('OK ' + got.ver);
} else {
  console.error('usage: sign-release.js keygen <key.pem> | sign <key.pem> [dir] | verify <pubkey-b64> [dir]');
  process.exit(2);
}
