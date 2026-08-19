// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry (macOS + Linux installer)
// Runs under plain Node OR under the game's own Electron binary via
// ELECTRON_RUN_AS_NODE=1 (see install.command / install-linux.sh) —
// no dependencies either way.
//
// Mirrors install.ps1: locate game -> close it -> extract app.asar fresh ->
// sideline app.asar -> run src/patch.js on the unpacked app.
// Idempotent; re-run after every game or mod update.
// Usage: install.js [path-to-Sandustry.app | path-to-game-folder]
// ============================================================================
'use strict';
// Under ELECTRON_RUN_AS_NODE, Electron wraps fs so any path containing
// ".asar" is read as an archive member, not a file. Disable that — this
// script must treat app.asar as a plain file (read, rename, delete).
process.noAsar = true;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function fail(msg) {
  console.error('\nERROR: ' + msg);
  console.error('Send a screenshot of this window to the mod author for help.');
  process.exit(1);
}

// --- 1. Locate the game bundle ----------------------------------------------
// macOS: the game is Sandustry.app; Linux: a plain folder with resources/.
const IS_MAC = process.platform === 'darwin';

function gameValid(dir) {
  if (IS_MAC) return fs.existsSync(path.join(dir, 'Contents/MacOS/Sandustry'));
  return fs.existsSync(path.join(dir, 'resources', 'app.asar')) ||
         fs.existsSync(path.join(dir, 'resources', 'app.asar.bak')) ||
         fs.existsSync(path.join(dir, 'resources', 'app'));
}

function findGame() {
  const arg = process.argv[2];
  if (arg) {
    if (gameValid(arg)) return arg;
    fail('No Sandustry at ' + arg);
  }
  const roots = IS_MAC
    ? [path.join(os.homedir(), 'Library/Application Support/Steam')]
    : [ // classic install, XDG, Flatpak, old symlink — first hit wins
        path.join(os.homedir(), '.steam/steam'),
        path.join(os.homedir(), '.local/share/Steam'),
        path.join(os.homedir(), '.var/app/com.valvesoftware.Steam/.local/share/Steam'),
        path.join(os.homedir(), '.steam/root'),
      ];
  const sub = IS_MAC ? 'steamapps/common/Sandustry/Sandustry.app' : 'steamapps/common/Sandustry';
  const candidates = [];
  for (const root of roots) {
    candidates.push(path.join(root, sub));
    const vdf = path.join(root, 'steamapps/libraryfolders.vdf');
    if (!fs.existsSync(vdf)) continue;
    for (const m of fs.readFileSync(vdf, 'utf8').matchAll(/"path"\s+"(.+?)"/g)) {
      candidates.push(path.join(m[1], sub));
    }
  }
  for (const c of candidates) if (gameValid(c)) return c;
  fail('Sandustry not found. Checked:\n  ' + candidates.join('\n  ') +
       '\nPass the path explicitly: install.js ' +
       (IS_MAC ? '/path/to/Sandustry.app' : '/path/to/steamapps/common/Sandustry'));
}

const gameApp = findGame();
const res = IS_MAC ? path.join(gameApp, 'Contents/Resources') : path.join(gameApp, 'resources');
console.log('Game: ' + gameApp);

// --- 2. Close the game -------------------------------------------------------
if (IS_MAC) {
  spawnSync('pkill', ['-x', 'Sandustry']);
} else {
  // Linux: this script RUNS UNDER the game's own binary (ELECTRON_RUN_AS_NODE),
  // so a bare pkill would kill the installer itself — kill only other pids.
  let binName = 'sandustry';
  try {
    for (const name of fs.readdirSync(gameApp)) {
      const st = fs.statSync(path.join(gameApp, name));
      if (st.isFile() && (st.mode & 0o111) && /^sandustry(\.[\w-]+)?$/i.test(name)) { binName = name; break; }
    }
  } catch (e) {}
  const out = spawnSync('pgrep', ['-x', binName], { encoding: 'utf8' });
  for (const p of String(out.stdout || '').trim().split(/\s+/)) {
    const pid = Number(p);
    if (pid && pid !== process.pid && pid !== process.ppid) {
      try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    }
  }
}

// --- 3. Extract app.asar (no-dependency asar reader) --------------------------
// asar layout: u32@4 = header pickle size; u32@12 = JSON length; JSON at 16;
// file offsets are relative to 8 + headerSize. Same math as install.ps1.
function extractAsar(asarPath, outDir, unpackedDir) {
  console.log('Unpacking game code (1-2 minutes)...');
  const buf = fs.readFileSync(asarPath);
  const headerSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const index = JSON.parse(buf.toString('utf8', 16, 16 + jsonLen));
  const base = 8 + headerSize;
  let extracted = 0;

  (function walk(node, rel) {
    for (const [name, child] of Object.entries(node.files)) {
      const childRel = rel ? path.join(rel, name) : name;
      if (child.files) {
        fs.mkdirSync(path.join(outDir, childRel), { recursive: true });
        walk(child, childRel);
        continue;
      }
      const dest = path.join(outDir, childRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (child.unpacked) {
        const src = path.join(unpackedDir, childRel);
        if (fs.existsSync(src)) fs.copyFileSync(src, dest);
      } else if (child.link) {
        // rare in this game; keep parity with install.ps1 which skips links
      } else {
        const off = base + Number(child.offset);
        fs.writeFileSync(dest, buf.subarray(off, off + child.size));
        if (child.executable) fs.chmodSync(dest, 0o755);
      }
      if (++extracted % 200 === 0) console.log('  ... ' + extracted + ' files');
    }
  })(index, '');
  console.log('Unpacked ' + extracted + ' files.');
}

// app.asar PRESENT = fresh install OR Steam restored/updated it. Re-extract
// fresh so app/ matches the CURRENT build, then sideline the asar so Electron
// loads our patched folder instead of it.
const asar = path.join(res, 'app.asar');
const appDir = path.join(res, 'app');
if (fs.existsSync(asar)) {
  if (fs.existsSync(appDir)) {
    console.log('Steam replaced app.asar - re-extracting fresh to match current build...');
    fs.rmSync(appDir, { recursive: true, force: true });
  }
  extractAsar(asar, appDir, path.join(res, 'app.asar.unpacked'));
  fs.rmSync(asar + '.bak', { force: true });
  fs.renameSync(asar, asar + '.bak');
} else if (!fs.existsSync(path.join(appDir, 'main.js'))) {
  if (fs.existsSync(asar + '.bak')) {
    extractAsar(asar + '.bak', appDir, path.join(res, 'app.asar.unpacked'));
  } else {
    fail('app.asar not found in ' + res + ' (Steam: verify integrity of game files first)');
  }
}

// --- 4. Version check ---------------------------------------------------------
const SRC = path.join(__dirname, 'src');
try {
  const gv = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version;
  const sup = JSON.parse(fs.readFileSync(path.join(SRC, 'patches.json'), 'utf8')).supportedVersions;
  console.log('Game build: ' + gv + ' (mod supports: ' + sup.join(', ') + ')');
} catch (e) {}

// --- 5. Patch (reuses the cross-platform patcher) -----------------------------
const r = spawnSync(process.execPath, [path.join(SRC, 'patch.js'), appDir], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
if (r.status !== 0) fail('patch.js failed (see messages above)');

console.log('\n=== DONE! SandTogether installed. ===');
if (IS_MAC) {
  console.log('Launch via SandTogether-Launch.command (or Steam; if Steam restores');
  console.log('app.asar the game runs unmodded - the launcher guards against that).');
  console.log('Uninstall: Steam -> Sandustry -> Properties -> Installed Files ->');
  console.log('Verify integrity, then delete Contents/Resources/app.');
} else {
  console.log('Launch Sandustry from Steam as usual - the SandTogether panel');
  console.log('appears in the top-right corner. After a GAME update Steam restores');
  console.log('app.asar and the game runs unmodded - just re-run install-linux.sh.');
  console.log('Uninstall: Steam -> Sandustry -> Properties -> Installed Files ->');
  console.log('Verify integrity, then delete resources/app.');
}
