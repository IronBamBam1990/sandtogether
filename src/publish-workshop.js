// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Author / Autor: KAMIL PADULA
// Steam Workshop publisher. Creates/updates the Workshop item as PRIVATE so the
// author can review the page before making it public.
// Usage: node publish-workshop.js [existingItemId]
// ============================================================================
'use strict';
const path = require('path');

const APP_ID = 2764460; // Sandustry
const GAME_SW = 'F:/SteamLibrary/steamapps/common/Sandustry/resources/app/node_modules/steamworks.js';
const CONTENT = path.resolve(__dirname, '../workshop/content');
const PREVIEW = path.resolve(__dirname, '../workshop/preview.png');

const TITLE = 'SandTogether — Co-op Multiplayer';
const DESCRIPTION = `[h1]SandTogether — Co-op Multiplayer for Sandustry[/h1]
[b]Author: Kamil Padula[/b] — [b]Contributors: dotNine, Knight-HD, DwoaC, Cr0ss0vr, TCentraL, AlyxiaFox, NanYu_sad.[/b]

Play Sandustry together over the internet — no server, no port forwarding. Connect through Steam friend invites. Up to 4 players.

[h2]⚠ AFTER SUBSCRIBING — READ THIS (ONE-TIME setup, ever)[/h2]
Sandustry cannot auto-load this kind of mod yet, so after subscribing you run the installer [b]once[/b] — after that the mod [b]updates itself automatically[/b] at every game launch:
[olist]
[*] Subscribe (you already did) and let Steam finish downloading.
[*] Open the mod folder. In Steam: right-click Sandustry → Manage → Browse local files, go up one level, then open: steamapps\\workshop\\content\\2764460\\3784750764\\  (or just search your PC for "SandTogether")
[*] [b]Windows:[/b] right-click [b]install.bat[/b] → Run. [b]macOS:[/b] double-click [b]install.command[/b] (or run it in Terminal; no dependencies — it uses the game's own engine), then launch via [b]SandTogether-Launch.command[/b] or Steam. [b]Linux (experimental):[/b] in a terminal run [b]bash install-linux.sh[/b]. The installer finds your game and installs the mod automatically.
[*] Launch Sandustry from Steam. A [b]SandTogether[/b] panel appears in the top-right corner.
[/olist]
That's it — [b]forever[/b]. From v0.9.39 the mod checks the Workshop folder at every launch and installs newer versions by itself (the game restarts once when it does). Both players are always on the same version automatically.

[b]Po polsku:[/b] Po zasubskrybowaniu wejdź do folderu moda (Steam → prawy na Sandustry → Zarządzaj → Przeglądaj pliki lokalne → folder wyżej → steamapps\\workshop\\content\\2764460\\3784750764\\), kliknij prawym [b]install.bat[/b] → Uruchom — [b]tylko RAZ[/b]. Od wersji 0.9.39 mod aktualizuje się sam przy każdym starcie gry (gra raz się zrestartuje przy aktualizacji). Odpal grę — panel SandTogether jest w prawym górnym rogu. Pełna instrukcja: INSTRUKCJA.md.

[h2]Features (v0.9.39 — full co-op)[/h2]
[list]
[*] AUTO-UPDATE: install once, the mod keeps itself (and both players) up to date at every launch
[*] Steam invites (or LAN) with AUTO-RECONNECT on both transports — zero network setup
[*] Shared live world: sand, fluids, digging, unlocked zones — one authoritative simulation streamed in real time (row-delta protocol + fog-of-war skipping = low bandwidth, fast joins even on huge maps)
[*] Team chat in the panel; item drops appear instantly for everyone
[*] Every player tool works for everyone: shovel, spray, firearms & rockets, vacuum, grabber, flamethrower, cryoblaster, demolisher
[*] One shared factory: build, demolish, move, copy-paste blueprints, pipes, signal wiring & buttons — on both sides
[*] Shared team progression: research/upgrades pool, tech tree, story steps, objectives, critter collection, factory processes
[*] Item pickup with full effects (artifacts, orbs, keys), shared resources; creatures, drones and projectiles synchronized; world-event sounds forwarded
[*] See your teammate: real player models with equipped tools, build ghosts and grabber crosshairs, off-screen arrows
[*] Per-player memory: rejoin a world and you're back where you left off, with your inventory
[*] Steam achievements keep working; the panel warns in red on mod-version or game-build mismatch
[*] Trilingual UI: English / Polski / 简体中文 (Simplified Chinese by NanYu_sad., auto-detected from your system language)
[*] Windows + macOS + Linux (macOS port by DwoaC, LAN co-op verified on Apple Silicon; Steam invites got a fix in 0.9.41 — Mac feedback welcome! Note: the installer is named [b]install.command[/b] — it replaced the briefly-announced install-macos.command. Linux is NEW in 0.9.57 and experimental: [b]bash install-linux.sh[/b], testers welcome!)
[/list]

[h2]How to play (Steam)[/h2]
[olist]
[*] [b]Host:[/b] open the panel → [b]Host (Steam)[/b] → [b]Invite[/b] and pick your friend.
[*] [b]Joining player:[/b] accept the Steam invite (works whether your game is open or closed).
[*] Host: load/start a game, save it, then click [b]Send world[/b].
[*] Joining player: after "World imported!", open [b]Load Game[/b] and load the received world. You now share one live world.
[/olist]
Both players must run the same mod version (the panel warns in red if they differ).

[h2]Controls (the SandTogether panel)[/h2]
[list]
[*] [b]Hide / show panel:[/b] click the panel header, or press [b]Ctrl+Shift+H[/b]. (It no longer uses F9 — that's the game's quick-load key.)
[*] [b]Host (Steam) / Invite:[/b] start a Steam co-op session and invite a friend.
[*] [b]Host LAN / Join LAN:[/b] local network play (ip:port, default 27777).
[*] [b]Send world:[/b] send your latest save to everyone connected (do this once at the start).
[*] [b]Resync:[/b] force a full re-sync if the mirrored world ever looks out of date.
[*] [b]Stop:[/b] leave / end the session.
[/list]

[h2]Installation[/h2]
This mod patches the game files (the game has no built-in mod loader for Early Access yet). Subscribe, then run [b]install.bat[/b] from this item's folder — [b]once[/b]. From then on the mod auto-updates itself at every game launch, so both players always match. Full instructions in README.md (EN) / INSTRUKCJA.md (PL).

[h2]💛 Thank you — this mod is community-built[/h2]
Huge thanks to the code contributors: [b]dotNine[/b] (player models, world auto-transfer, collision sync), [b]Knight-HD[/b] (building placement, grabber rework, teammate ghosts — a whole pull request!) [b]DwoaC[/b] (the macOS port — installer, launcher and the Steam-callback fix, tested on two Macs) [b]Cr0ss0vr[/b] (precise client demolish selection + safe red-tile cleanup) [b]TCentraL[/b] (blob-expanding red-tile cleanup — after being our sharpest tester, he sent code) [b]AlyxiaFox[/b] (congestion control for the world sync — the mirror now measures how far behind the slowest player is and throttles itself, so big sessions stay in the present instead of replaying history) and [b]NanYu_sad.[/b] (the complete Simplified Chinese translation — after being one of our first testers).

And to the testers whose precise bug reports shaped almost every release: [b]TCentraL[/b], [b]Warlow[/b], [b]derErste67[/b], [b]NanYu_sad.[/b], [b]ЗаКеЛьМан[/b], [b]星灵[/b], [b]Lofar666[/b], [b]Bobulator333[/b], [b]thatsmaik[/b], [b]uolkx[/b], [b]MIXUIL[/b], [b]Justin[/b], [b]Hooye!![/b], [b]tony.s.jennette[/b], [b]Sprut[/b] — and everyone else who reported, tested and played. A short description + your log file (%APPDATA%\\Sandustry\\logs\\main.log) is the fastest route to a fix.

[h2]Open source / Contributing[/h2]
The full source code is on GitHub: [url=https://github.com/IronBamBam1990/sandtogether]github.com/IronBamBam1990/sandtogether[/url] — MIT license. Bug fixes, features and ports (e.g. a macOS installer — the mod code itself is cross-platform) are welcome as pull requests. The README covers the architecture and dev workflow.

[i]Polska wersja instrukcji w pliku INSTRUKCJA.md. Active development — feedback welcome![/i]`;

(async () => {
  const sw = require(GAME_SW);
  const client = sw.init(APP_ID);
  console.log('Steam user:', client.localplayer.getName());
  const ws = client.workshop;
  console.log('Visibility enum:', JSON.stringify(ws.UgcItemVisibility));

  let itemId = process.argv[2] ? BigInt(process.argv[2]) : null;
  if (!itemId) {
    const created = await ws.createItem();
    console.log('createItem ->', JSON.stringify(created, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
    itemId = BigInt(created.itemId);
    if (created.needsToAcceptAgreement) {
      console.log('!!! You must accept the Steam Workshop legal agreement:');
      console.log('!!! https://steamcommunity.com/sharedfiles/workshoplegalagreement');
    }
  }

  // visibility: publish | unlisted | private (default: public)
  const visArg = (process.argv[3] || 'public').toLowerCase();
  const vis = visArg === 'private' ? ws.UgcItemVisibility.Private : visArg === 'unlisted' ? ws.UgcItemVisibility.Unlisted : ws.UgcItemVisibility.Public;
  const details = {
    title: TITLE,
    description: DESCRIPTION,
    changeNote: 'v0.9.69-beta — 简体中文! Complete Simplified Chinese translation by NanYu_sad. (contributor #7 — PR #9), auto-detected from your system language. The UI is now trilingual: English / Polski / 简体中文. Auto-updates at next launch.',
    previewPath: PREVIEW,
    contentPath: CONTENT,
    visibility: vis,
    tags: ['Mods'],
  };
  let result;
  try {
    result = await ws.updateItem(itemId, details);
  } catch (e) {
    console.log('updateItem with tags failed (' + (e.message || e) + '), retrying without tags...');
    delete details.tags;
    result = await ws.updateItem(itemId, details);
  }
  console.log('updateItem ->', JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
  console.log('');
  console.log('DONE. Workshop item (private):');
  console.log('https://steamcommunity.com/sharedfiles/filedetails/?id=' + itemId);
  process.exit(0);
})().catch((e) => { console.error('PUBLISH FAILED:', e.message || e); process.exit(1); });
