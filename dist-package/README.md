# SandTogether — co-op multiplayer mod for Sandustry (v0.9.39-beta)

**Author: Kamil Padula** · Contributors: **dotNine**, **Knight-HD**, **DwoaC**

SandTogether adds full co-op multiplayer to Sandustry — one shared live world over
Steam friend invites (or LAN), up to 4 players. Steam achievements keep working.

Polska instrukcja: zobacz `INSTRUKCJA.md`.

## Installation — ONCE, ever

### Windows

1. Have Sandustry installed from Steam (launch it once normally).
2. Right-click `install.bat` → **Run** (or `install.ps1` → Run with PowerShell;
   if Windows blocks it: `powershell -ExecutionPolicy Bypass -File install.ps1`).
3. Launch the game — the **SandTogether** panel appears in the top-right corner.

### macOS (community-contributed by DwoaC, tested on Apple Silicon)

1. Have Sandustry installed from Steam (launch it once normally).
2. Double-click `install.command` (or run it in Terminal; pass the path to
   `Sandustry.app` as an argument if your Steam library is somewhere unusual).
   No Node.js needed — it runs on the game's own Electron runtime.
3. Launch the game with `SandTogether-Launch.command` — it re-installs the mod
   automatically if a Steam update reverted it, then starts the game through
   Steam.

> **macOS note:** LAN co-op is fully verified (`ip:27777`; same network or a
> VPN like Tailscale). Steam friend invites got a fix in v0.9.41 (the macOS
> Steam library reports callback fields differently) — please report whether
> they work for you now.

**That's it — forever.** Since v0.9.39 the mod **auto-updates itself** at every game
launch from your Workshop subscription (the game restarts once when it does).
You never run the installer again, and both players always match versions.

## How to play (over the internet, via Steam — no network setup)

**Host:**
1. Panel → **Host (Steam)** → **Invite** (pick your friend).
2. Load/start a game — the world is sent to the joiner automatically.

**Joining player:**
1. Accept the Steam invite (works with the game open or closed).
2. After "World imported!": **Load Game** → load the received world.
3. You now share one live world (the panel shows "host mirror").

**LAN:** Host LAN / Join LAN (type `ip` or `ip:port`, default 27777).
**Chat:** type in the panel's message box, press Enter.
**Hide/show panel:** click its header or Ctrl+Shift+H. **Resync** forces a full world refresh.

## What works (v0.9.39 — full co-op)

- One authoritative live world: sand, fluids, digging, terrain, unlocked zones
  (row-delta streaming + fog-of-war skipping = low bandwidth, fast joins)
- Every tool for every player: shovel, spray, firearms & rockets, vacuum, grabber,
  flamethrower, cryoblaster, demolisher
- One shared factory: build, demolish, move, copy-paste blueprints, pipes,
  signal wiring & buttons, machine settings — on both sides
- Shared team progression: research/upgrade pool, tech tree, story steps,
  objectives, critter collection, factory processes
- Item pickups with full effects; creatures, drones, projectiles, world sounds
- Real player models with equipped tools, build ghosts, grabber crosshairs,
  off-screen arrows; team chat
- Per-player memory: rejoin a world and you're back where you left off, with
  your inventory
- Auto-reconnect on both transports; clear warnings for host-pause, version
  mismatch and different game builds

## Important note for the joining player

Don't rely on saving the game while connected as a client — your save captures
the world from the moment you joined. The host's save is the authoritative one.

After a **Steam game update** the mod may be reverted — just launch the game:
the auto-updater re-installs it (macOS: or launch via `SandTogether-Launch.command`).

## Uninstall

Steam → Sandustry → Properties → Installed Files → Verify integrity of game files,
then delete the `resources\app` folder
(macOS: `Sandustry.app/Contents/Resources/app`).

---
SandTogether by **Kamil Padula** · source: https://github.com/IronBamBam1990/sandtogether (MIT)
