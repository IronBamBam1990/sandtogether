# SandTogether — Co-op Multiplayer mod for Sandustry

**Author: Kamil Padula** · Contributors: **dotNine**, **Knight-HD**, **DwoaC**, **Cr0ss0vr**, **TCentraL** · [Steam Workshop page](https://steamcommunity.com/sharedfiles/filedetails/?id=3784750764)

Play [Sandustry](https://store.steampowered.com/app/2764460/Sandustry/) together over the internet — no server, no port forwarding. Steam friend invites (or LAN), up to 4 players, one shared live world: digging, fluids, building, tools, resources and story progression synchronized. Steam achievements keep working.

> ⚠️ Early Access game with no official mod loader — this mod patches the game files. Expect breakage after game updates; we re-anchor quickly (see `src/patches.json`).

## For players

Subscribe on the Workshop, then run `install.bat` (Windows) or `install.command` (macOS) from the mod folder **once** — since v0.9.39 the mod auto-updates itself from the Workshop folder at every game launch. Full instructions: [README (EN)](dist-package/README.md) / [INSTRUKCJA (PL)](dist-package/INSTRUKCJA.md). macOS support is community-contributed by **DwoaC** (LAN co-op verified on two Apple Silicon Macs; the Steam-invite callback fix from PR #3 awaits a live test).

## Architecture (for contributors)

The game is an Electron app; the simulation is non-deterministic (83× `Math.random` in physics, work-stealing scheduler), so lockstep is impossible. SandTogether is **host-authoritative**:

- **Host** runs the only real simulation and streams the world to clients: dirty 40×40 chunks of `mapData` (RGBA) + `wallData` + `shadowMap` + `authorization` + `sim.cellIds` (collision) + element types, 12 B/cell, **row-delta encoded** (per-row FNV hashes → only changed 40-cell rows are sent, protocol v5), deflate-compressed, prioritized around player positions (fast lane) with a starvation-free FIFO for the rest; fully fogged chunks are skipped until revealed.
- **Client** simulation is paused (manager opcode `SetPaused`); rendering stays alive and reads the mirrored buffers every frame. A re-pause heartbeat protects against the game's own unpause paths (ESC menu).
- **Client actions** (dig, build, demolish, move, vacuum, grabber, flamethrower, cryoblaster, spray, guns…) are captured via small string-patches in `bundle.js` (see `src/patches.json`, multi-version anchor variants) plus game event hooks, forwarded to the host, replayed there authoritatively, and confirmed back through the world stream.
- **Transports**: Steam P2P (lobbies, invites, `+connect_lobby`, lobby-ID clipboard join) and a dependency-free WebSocket (LAN), both with auto-reconnect. Networking lives in the Electron main process (`src/st-main.js`) because the renderer reloads between scenes.
- **Shared progression**: research/upgrade pool, tech tree, story steps, critter collection and factory-process counters are host-authoritative and synced at 1 Hz; client purchases forward the real cost (resource diff) for the host to deduct.
- **Auto-update**: at every game launch `st-main.js` compares the mod version in the Steam Workshop folder with the installed one; a newer Workshop copy is installed (files + bundle patches) and the game relaunches once. The author's newer local build is never downgraded.

### Repo layout

| Path | What |
|------|------|
| `src/sandtogether.js` | The mod (renderer side): HUD, world sync, action forwarding/replay, player models, i18n EN/PL |
| `src/st-main.js` | Electron main-process side: Steam P2P + WebSocket transports, invites, relays |
| `src/patches.json` | Anchor/patched string pairs applied to the game's `bundle.js` (+ per-game-version variants) |
| `src/st-preload-append.js` | Preload bridge (`sandtogetherNet`) |
| `src/patch.js` | Node-based patcher (dev convenience) |
| `dist-package/` | What players get: pure-PowerShell installer (no Node needed) + docs |
| `src/publish-workshop.js` | Steam Workshop publisher (uses the game's bundled steamworks.js) |
| `BUNDLE_MAP.md`, `WORKERS_MAP.md`, `COOP_PLAN.md`, `RECON.md`, `CHANGELOG.md` | Reverse-engineering notes, architecture plan & full changelog |

### Dev loop

1. Install the mod into your game once (`dist-package/install.bat`; macOS: `dist-package/install.command` — no Node needed, it runs on the game's own Electron via `ELECTRON_RUN_AS_NODE`).
2. Edit `src/sandtogether.js`, then copy it to `<game>/resources/app/dist/js/sandtogether.js` and restart the game (bundle patches only need re-applying when `patches.json` changes).
3. Two-instance local testing: launch a second copy with `--st-userdata=<dir>` (bypasses the single-instance lock; any `--st-*` arg does) and use `Host LAN` / `Join LAN` on `127.0.0.1`.
4. Logs: `%APPDATA%\Sandustry\logs\main.log` (macOS: `~/Library/Logs/Sandustry/main.log`) — everything the mod does is tagged `[SandTogether]`.

### Contributing

PRs welcome. Keep changes host-authoritative (clients must never mutate the shared world locally except through the confirmed-mirror pattern), keep `patches.json` anchors unique-in-bundle, and note game-build compatibility in your PR. Bug reports: attach both players' `main.log`.

## License

[MIT](LICENSE) © Kamil Padula
