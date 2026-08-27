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

Play Sandustry together in ONE living world — the same sand, the same factory, the same fluids, streamed live between players. Up to 4 players, over the internet or on a LAN.

[h2]⚠ AFTER SUBSCRIBING — READ THIS (ONE-TIME setup)[/h2]
[b]Installed a build from before v0.9.72 and never see updates?[/b] Run the installer ONE more time - those builds shipped a broken auto-updater. Since then updates are automatic.

Sandustry has no mod loader yet, so after subscribing you run the installer [b]once[/b]:
[olist]
[*] Let Steam finish downloading the mod.
[*] Open the mod folder: right-click Sandustry → Manage → Browse local files, go up one level, then open steamapps\\workshop\\content\\2764460\\3784750764\\ (or search your PC for "SandTogether").
[*] [b]Windows:[/b] right-click [b]install.bat[/b] → Run.  [b]macOS:[/b] double-click [b]install.command[/b], then launch via SandTogether-Launch.command or Steam.  [b]Linux:[/b] open a terminal [i]in the mod folder[/i] (right-click → Open in terminal) and run [b]bash install-linux.sh[/b] — running it from another folder gives "file not found"; Flatpak Steam or a second library: [b]bash install-linux.sh /path/to/steamapps/common/Sandustry[/b].
[*] Launch the game. A [b]Multiplayer[/b] button appears in the main menu, and a SandTogether panel in the top-right corner.
[/olist]
From then on the mod updates itself at every launch, so both players always match.

[b]Po polsku:[/b] Po zasubskrybowaniu wejdź do folderu moda (Steam → prawy na Sandustry → Zarządzaj → Przeglądaj pliki lokalne → folder wyżej → steamapps\\workshop\\content\\2764460\\3784750764\\) i kliknij prawym [b]install.bat[/b] → Uruchom — tylko RAZ. Potem mod aktualizuje się sam. W menu głównym pojawi się przycisk [b]Multiplayer[/b]. Pełna instrukcja: INSTRUKCJA.md.

[h2]How to play[/h2]
Main menu → [b]Multiplayer[/b] → pick how you want to connect:
[list]
[*] [b]Host (Internet — direct)[/b] — recommended. The mod opens the port on your router by itself (UPnP) and shows your address [b]masked[/b], with show/hide and a copy button that never puts it on screen — safe to stream. Your friend pastes that address into [b]Join by address[/b] (the same button also covers LAN and VPN). This is the fastest route: it does NOT go through Steam relay servers, which throttle bandwidth and add latency.
[*] [b]Host (Steam)[/b] + [b]Invite[/b] — zero setup, invite straight from your Steam friend list.
[*] [b]Host LAN[/b] / [b]Join by address[/b] — same network, or a VPN mesh like Tailscale. One warning: from inside your own network you cannot reach your own public address — most routers refuse it — so when you are both on the same network, use the local 192.168.x.x address.
[*] [b]Join by Lobby ID[/b] — paste an ID from the clipboard.
[/list]
Then press [b]Load last save & PLAY[/b] (or pick a save) — your world is sent to everyone who joins, automatically. Set your nick in the lobby so your friends see who is who.

[h2]Features[/h2]
[list]
[*] One shared live world: sand, fluids, digging, unlocked zones — a single authoritative simulation streamed in real time, with row-delta updates, fog-of-war skipping and rate control that adapts to your connection
[*] Direct internet hosting with automatic router port opening (UPnP), or Steam invites, or LAN — with auto-reconnect on every transport
[*] Every tool works for everyone: shovel, spray, firearms and rockets, vacuum, grabber, flamethrower, cryoblaster, demolisher
[*] One shared factory: build, demolish, move, copy-paste blueprints, pipes, signal wiring and buttons — from both sides
[*] Shared team progression: research and upgrades pool, tech tree, story steps, objectives, critter collection, factory processes — with automatic repair of research broken by older versions
[*] See your teammates: real player models with equipped tools, build ghosts, grabber crosshairs, off-screen arrows, team chat
[*] Rejoin a world and you are back where you left off. Progression — tools, research, upgrades and unlocked buildings — belongs to the host world, so everyone in the session shares it
[*] Steam achievements keep working; the panel warns in red if mod versions or game builds differ
[*] Trilingual UI: English / Polski / 简体中文 (Simplified Chinese by NanYu_sad.), picked from your system language
[*] Windows, macOS and Linux
[/list]

[h2]Performance[/h2]
Only changed rows travel, compressed; incoming data is applied in slices so a big packet never freezes the picture (worst client frame: 237 ms before, ~16 ms now, past 20 MB/s). The host adapts its send rate to the link and the slowest client.

[h2]The SandTogether panel (top-right)[/h2]
[list]
[*] Shows at a glance whether you are OFFLINE, HOSTING or CONNECTED, who is in the session, their ping and mod version
[*] Team chat, world sync stats, [b]Resync[/b] if the mirrored world ever looks out of date, [b]Stop[/b] to leave
[*] Click the panel header (or Ctrl+Shift+H) to shrink it to a tiny dot — handy while streaming or taking screenshots
[/list]

[h2]Trouble?[/h2]
Both players must run the same mod version AND the same game version — the panel says so in red when they differ. If something misbehaves, send me a short description plus your log file: Windows %APPDATA%\\Sandustry\\logs\\main.log, macOS ~/Library/Logs/Sandustry/main.log, Linux ~/.config/Sandustry/logs/main.log. Reports with a log are usually fixed the same day.

[b]Port forwarded and still nothing?[/b] The mod listens on [b]TCP 27777[/b] (TCP, not UDP), and the host Windows Firewall must let [b]Sandustry.exe[/b] through on public networks.

[h2]💛 Thank you — this mod is community-built[/h2]
Code contributors: [b]dotNine[/b] (player models, world auto-transfer, collision sync), [b]Knight-HD[/b] (building placement, grabber rework, teammate ghosts), [b]DwoaC[/b] (the macOS port — installer, launcher and the Steam-callback fix), [b]Cr0ss0vr[/b] (precise client demolish selection, foundation cleanup after demolition, and the report and first patch for progression not reaching the client — the trail that led to the 0.9.132 root cause), [b]TCentraL[/b] (blob-expanding red-tile cleanup — our sharpest tester who then sent code), [b]AlyxiaFox[/b] (congestion control for the world sync) and [b]NanYu_sad.[/b] (the complete Simplified Chinese translation).

And to everyone whose precise reports shaped almost every release: [b]TCentraL[/b], [b]Warlow[/b], [b]derErste67[/b], [b]Akriz[/b], [b]tony.s.jennette[/b], [b]ZeroHazard[/b], [b]Tobi1Kenobi[/b], [b]Drewby[/b], [b]Spiddy[/b], [b]J.Slayer[/b], [b]Psychospark[/b] (our first Linux player), [b]MFeltmann[/b], [b]Dr. Ethulwulf Sauce[/b], [b]NanYu_sad.[/b], [b]ЗаКеЛьМан[/b], [b]星灵[/b], [b]Lofar666[/b], [b]Bobulator333[/b], [b]thatsmaik[/b], [b]uolkx[/b], [b]MIXUIL[/b], [b]Justin[/b], [b]Hooye!![/b], [b]Sprut[/b], [b]Maelle[/b], [b]Moonbugy[/b], [b]Knif Boiiiiiii[/b], [b]Sessional[/b], [b]friberg[/b], [b]Shadow City Empire[/b], [b]Clavius[/b], [b]Golden Pan please[/b], [b]hunters01[/b], [b]Lecker Bierchen[/b], [b]Lurkily[/b] — and everyone else who reported, tested and played.

[h2]Open source / Contributing[/h2]
Full source on GitHub: [url=https://github.com/IronBamBam1990/sandtogether]github.com/IronBamBam1990/sandtogether[/url] — MIT license. Bug fixes and features are welcome as pull requests; the README covers the architecture and dev workflow.

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
    changeNote: 'Description update - welcoming the testers whose reports shaped this week: Maelle, Moonbugy, Knif Boiiiiiii, Sessional, friberg, Shadow City Empire, Clavius, Golden Pan please, hunters01, Lecker Bierchen and Lurkily. No code changes; current version stays 0.9.150-beta.',
    previewPath: PREVIEW,
    contentPath: CONTENT,
    visibility: vis,
    tags: ['Mods'],
  };
  // Steam liczy limity w BAJTACH UTF-8, nie w znakach: opis 8000 B, nota o zmianach 8000 B. Przekroczenie
  // wraca z updateItem jako bezuzyteczne "a parameter is invalid" (stracone 30 min, 24.08.2026) — stad wlasny check.
  for (const [name, text] of [['description', details.description], ['changeNote', details.changeNote]]) {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > 8000) {
      console.error('PUBLISH ABORTED: ' + name + ' = ' + bytes + ' bytes (limit 8000). Skroc o ' + (bytes - 8000) + ' B.');
      process.exit(1);
    }
    console.log(name + ': ' + bytes + ' bytes / 8000');
  }
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
