# Changelog — SandTogether (Sandustry co-op mod)

*Translated from the original Polish development journal.*

## 2026-08-20 (v0.9.66) — deleting PIPES no longer deletes blocks too (report: TCentraL)

The post-demolish cleanup pass (which removes building tiles the game leaves stuck in a QUEUED state) armed itself on EVERY demolisher drag without knowing the tool mode. Deleting pipes intentionally leaves structures in the selection — the cleanup mistook them for stuck leftovers and removed them. In pipe mode the cleanup no longer arms; the game removes pipes correctly by itself.

## 2026-08-20 (v0.9.65) — Multiplayer button no longer floats over the Load/Options screens (report: Psychospark89)

Sub-screens replace the main-menu buttons in the DOM, which used to trigger the button's fallback position — it now hides whenever its menu anchor disappears (and recognizes the menu in five game languages: EN/PL/DE/FR/ES).

## 2026-08-20 (v0.9.64) — PR #8 by AlyxiaFox (contributor #6): congestion control for the world sync

The host used to push whatever the sim dirtied straight into Steam's send buffer; the reliable channel is ORDERED, so a client behind on bandwidth replayed history instead of seeing the present (measured up to 60 s behind). Now the client acks each applied batch (10 Hz, on the unordered channel so acks never queue behind world data), the host measures how far behind the slowest player is and throttles itself with an AIMD controller and a byte budget per batch — backlog waits on the host where chunks coalesce, so you get one current state instead of every intermediate frame. The PR also fixed a real long-standing bug: the mirror queue and row hashes were never reset between sessions, so hosting a second time could silently never send chunks the previous session considered delivered. Merged with review; ping/RTT also moved off the ordered channel.

## 2026-08-19 (v0.9.63) — instant-kick on join + interleaved world transfers (reports: Akriz, derErste67)

**Instant kick**: joining a host who was still in the MAIN MENU disconnected you within a second. The host was streaming its menu-scene buffers (an old both-in-menu "mirror test mode"), the joining client painted them and marked the mirror as started — which armed the "quit to title = leave session" logic from 0.9.53 and immediately stopped the session. Since the new lobby encourages hosting from the menu, this surfaced as "broken since the Multiplayer button". Fixed on all layers: a host in the menu no longer streams anything, the mirror never paints while you're in the menu (test mode removed), and auto-leave additionally requires that you actually WERE in a world this session. This also explains clients who "mine on their own world" while connected.

**Interleaved transfers**: two world transfers could interleave into one download — the second transfer's header was ignored but its packets still landed in the first one's file, and since the host autosaves between sends, the client assembled a save stitched from TWO versions of the world and loaded a corrupted map (half the world as yellow garbage; digging looked dead because the client's world no longer matched the host's). Every transfer now carries an id, foreign packets are dropped, and the host won't start a new transfer while one is still sending.

## 2026-08-19 (v0.9.62) — big-map progress + a panel you can actually hide (feedback: TCentraL)

The initial world sync now shows real progress — "host mirror: X KB/s, Y chunk/s — N chunks left" counts down to zero, and the long save-load phase says "Loading the host's world... (a big map can take a few minutes)" instead of looking frozen. Collapsing the panel (header click / Ctrl+Shift+H) now shrinks it to a tiny "ST ●" pill with a status-colored dot instead of leaving the full-width header.

## 2026-08-19 (v0.9.61) — community feedback batch: Linux CRLF guard, host-in-menu fix, player nick, save picker

(1) The Linux installer now heals itself when a download or editor converted it to Windows line endings — the exact crash PsychoSpark hit on CachyOS ("set: pipefail: invalid option name"); it also survives being run with `sh` instead of `bash`. (2) A Steam player joining BEFORE the host loaded a map no longer triggers a speculative world transfer that reloaded the client's map forever (report: TCentraL) — the host now answers "world-wait" until it actually enters a world, and the client shows "waiting for the host to enter a world". (3) You can finally set your NICK (LAN players were all "Player") — a field in the lobby, stored locally, announced over the existing hello protocol. (4) The host lobby gained "📂 Choose a save..." next to "▶ Load last save & PLAY". (5) The menu Multiplayer button is bigger and shows a green connection dot when you're hosting/connected.

## 2026-08-19 (v0.9.60) — session status you can actually SEE

The panel now always shows a colored role badge — "○ OFFLINE" (red) / "● HOSTING (Steam/LAN)" (green) / "● CONNECTED — you are a player" (blue) — plus a live player list (nick, host marker, mod-version match). Buttons are contextual: offline shows only the ways to connect, a host sees Invite/Send world/Stop, a client sees Resync/Stop — no more wall of nine buttons. Chat logs who joined/left. The host lobby shows the two steps that matter (1. invite, 2. hit PLAY) and hosting errors are surfaced instead of failing silently. The menu Multiplayer button is bigger.

## 2026-08-19 (v0.9.59) — MULTIPLAYER button in the main menu + a real lobby; reload-loop hotfix

**New UI**: the main menu now has a proper **Multiplayer** button (styled like the game's own menu, placed under Mods/Maps). It opens a full-screen lobby: Host (Steam) / Host (LAN) / Join LAN (ip+port) / Join by Lobby ID — each with a description; when hosting you get an invite button, a masked lobby id (click = copy), a live player list (nick + mod version) and a one-click **"Load last save & PLAY"** — the world then sends itself to joined players automatically. The corner panel stays for in-game status/chat.

**Hotfix for 0.9.58's reload loop** (live report: TCentraL): the new save re-request combined with auto-load could reload the same map over and over. Now a received world silences further requests for the session, auto-load is skipped when the mirror is already running, a world transfer arriving mid-receive is ignored (this caused the retry storm), requests are capped at 4 per session, and the client asks for a full resync right after auto-load (so the mirror starts even when there is nothing new to apply).

## 2026-08-19 (v0.9.58) — big-map join & freeze fixes (live report: TCentraL)

Joining a host on a BIG map could freeze the game and strand the client on "Waiting for host's world". Three structural fixes: (1) AUTO-RESYNC — the initial full-world stream used to be sent while the client was still in the menu (where the mirror must drop it), and the host's row-hashes considered it delivered, leaving stale holes until a manual Resync; the client now automatically requests a full resync the moment the mirror starts applying. (2) The world mirror no longer writes into the game's buffers WHILE the host's save is being loaded (a race with the engine's loader — the likely freeze). (3) Self-healing save transfer: a client that never receives the world save (e.g. after a reconnect, when the host's auto-send doesn't re-fire) now actively requests it every 10 s. Plus much better console diagnostics around the whole transfer path.

## 2026-08-19 (v0.9.52 – v0.9.57) — live-session fixes, QoL, augments, Linux installer

**0.9.52**: Shaking works for the joiner regardless of the host's own toggle (report: TCentraL) — the toggle lives in `mods.grabberSizeScroll`, which the host's 1 Hz mods stream was overwriting; per-player preferences are now preserved when applying the stream (all 8 shared-storage keys audited — the rest are legitimately team-shared).

**0.9.53**: quitting to the title screen as the joining player cleanly LEAVES the co-op session (suggested by tony.s.jennette) — the per-world profile (position + inventory) is saved first, so rejoining puts you right back; no more half-connected ghost state after ESC → Quit.

**0.9.54**: grabber place REFUND — when the host cannot place your element (target cell occupied), it returns to your tank instead of silently vanishing; the last known way to lose items with the grabber.

**0.9.55**: separate IP and PORT fields for Join LAN (QoL suggested by TCentraL) — pasting `ip:port` auto-splits, Enter connects from either field, port validated.

**0.9.56**: the augment/lab screen no longer LOCKS the joining client until the host picks (report: TCentraL) — the choice stays team-shared, but now EITHER player can make it: the client's pick is forwarded to the host (500 ms diff of `mods.augments`), the host applies it authoritatively and the stream closes the overlay for everyone; a 5 s protection window keeps the in-flight pick from flickering.

**0.9.57**: LINUX installer (experimental) — `install-linux.sh` + a cross-platform `install.js` (one payload now serves macOS and Linux): finds Steam in classic/XDG/Flatpak locations and extra libraries, runs on the game's own native Linux Electron binary via `ELECTRON_RUN_AS_NODE` (no Node.js needed), kills only OTHER game processes (the installer itself runs under the game binary). Requested by Psychospark; untested by the author — Linux testers welcome.

## 2026-08-19 (v0.9.49 – v0.9.51) — night-report batch, PR #6, tool-audit closure

**0.9.49**: red-block contamination fixed (the mirror refuses to paint when the client is in the menu; world trust is PAIRED — host wid + the client wid it was granted for — so loading a different world cleanly rejects); infinite phantom items fixed (all client→host forwards gated on an active mirror; tool state resets on local world change); tech nodes researched by a teammate no longer show unpurchased (unlockTech does not set the node flag — we do, both sides); demolish leftover sweep retries 3→6 at 400 ms; streamer-safe lobby id (masked, click copies).

**0.9.50 — PR #6 by TCentraL/tno1 (contributor #5)**: orphan red-tile cleanup blob-expands to the whole contiguous patch, even outside the drag. Review hardening: sloped/stair tile types restored, per-cell live-structure check (healthy painted foundations safe), scan-loop fix, 64-cell expansion cap.

**0.9.51**: manual wet-sand shaking works for the joiner — the tank mutates locally (gold OK) but the residue was spawned into the world via the deferred queue the paused client drops, and the factory process only counted locally; a new bundle hook batches refined slots to the host, which spawns Residue into empty cells only and records the ShakeWetSand process. Picked-up items land in the correct picker slots (host sends per-element cursor-relative offsets; the tank grid is spatial like vanilla). Sweeper confirmed covered by the PR #4 drone sync. Last unidentified tool: placeholderGun/wall tool (safely inert on the client).

## 2026-08-18/19 (v0.9.40 – v0.9.48) — macOS, community PRs, the Workshop freeze, weapons complete

**0.9.40-0.9.41**: macOS support — DwoaC's tested installer/launcher (PR #2) replaced the blind-built scripts; his PR #3 fixed Steam invites on macOS (the osx steamworks binary reports callback fields in snake_case). Fixes for his reports: the WS server now sends its hello (no more false OLD-mod warning on LAN) and the orphan sweep arms on replayed client demolishes. Auto-updater path made platform-agnostic (walks up to steamapps). DwoaC = contributor #3.

**Workshop freeze incident (18-19.08)**: 25+ publishes in 48 h tripped Steam's rate limit — the Workshop silently served 0.9.36 files while newer publishes reported success. Recovery: GitHub Releases as fallback distribution, one consolidated publish after the limit cleared, hard server-side verification (time_updated + fresh subscription download) now standard after every publish. Iron rule: max 1-3 Workshop publishes per day.

**0.9.42-0.9.44**: research FULLY shared — the game's real unlockTech runs on both sides, so buildings, items and the map materialize for the whole team (report: ЗаКеЛьМан); the grabber respects research gates (liquids need the team's waterGrab upgrade) and locks its tank to ONE element type like vanilla (reports: derErste67).

**0.9.45-0.9.46**: client-demolish sweep no longer eats neighboring painted-foundation tiles; honest REAL/FALLBACK tech-unlock logs; Cr0ss0vr's PR #5 (contributor #4) — the client sends its exact demolisher selection rectangle, so red-tile cleanup is precise, with a bounded retry for queued removals.

**0.9.47-0.9.48**: Knight-HD's PR #4 — client rockets & guns simulated authoritatively in the host's sim (real explosions), client-deployed drones survive, no double craters; on top: the flamethrower can no longer delete terrain/foundations/scenery (terrain cells untouchable in the replay), drone id collisions re-assigned. Full weapon audit: volcanizer and caulk blaster forwarded with vanilla guards baked in (lava/caulk only into empty cells; caulk removal exactly by the game's rule).

## 2026-08-18 (v0.9.39-beta) — AUTO-UPDATE from the Workshop (install.bat needed only ONCE, ever)

At every game launch `st-main.js` compares the mod version in `steamapps/workshop/content/2764460/<item>/src` (kept fresh by Steam) with the installed one (numeric compare — the author's newer local build is never downgraded). Newer → copies `sandtogether.js`/`st-main.js`, appends the preload bridge if missing, applies `patches.json` to `bundle.js` (a port of install.ps1's idempotent variant logic) and relaunches the game once. No relaunch loop (after the update local == workshop). Version drift between players — the #1 cause of "nothing works" reports — now solves itself.

## 2026-08-18 (v0.9.37 + v0.9.38) — the whole nice-to-have list delivered

**0.9.37**: per-player profile (localStorage keyed by trusted host worldId: position + inventory, saved every 10 s and on disconnect/stop, restored when the mirror starts); machine-config sync (no game event exists, so a 0.8 s JSON-diff scan within 48 cells of the player detects `structure.data` edits → `act:sdata` → host applies + propagates; 6 s protection window against the snapshot reverting the fresh edit); team chat (panel input with keystroke isolation, textContent-only rendering, host relays between clients); host now relays `chat`/`myproj`/`snd` for 3-4 player sessions; instant item drops (host pushes the worldItems list whenever its id set changes, checked at 5 Hz).

**0.9.38**: ROW-DELTA world protocol v5 — per-row FNV hashes (~1.5 MB host RAM) select only changed 40-cell rows; a chunk is header + 5-byte row mask + selected rows × 6 layers (12 B/cell); typically 2-10× less bandwidth (horizontal flow = 1-3 rows instead of 40). Replaces the whole-chunk hash-skip; `enqueueFullWorld` clears the row hashes so new joiners get everything. Critters collected by the client are now removed from the host's map too (splice from the live `FH.entities.getAll` array + hide sprite + remove light — no official remove API). Steam auto-rejoin: 2 P2P connect-fails within 10 s → rejoin the last lobby every 3 s, max 5 tries. Game-build fingerprint (bundle size + sha1 of the first 256 KB) exchanged in `mver` — mismatched game builds now warn in red instead of silently corrupting element enums.

## 2026-08-18 (v0.9.36-beta) — optimization: fog-skip + LAN auto-reconnect

World stream skips chunks whose shadowMap is fully 255 (undiscovered — the client sees black there anyway; 255 = undiscovered confirmed in the bundle). Revealing changes the shadow → chunk dirties → streams normally. Initial fill on a big map (9216 chunks, ~20-30% discovered) = joining 2-4× faster. WS auto-reconnect: retry every 3 s, max 5 attempts; the counter rides the `joinWs(_retry)` parameter so it survives socket instances; a successful handshake resets the budget.

## 2026-08-18 (v0.9.34 + v0.9.35) — SHARED research pool + closing the "partial/one-way" list

**0.9.34 (G2)**: upgrades/tech = SHARED TEAM POOL. Client hooks `upgrade:purchased`/`tech:unlocked`; the real cost is computed as the resource diff vs the last host snapshot (re-based per purchase). Host sets the levels, deducts costs authoritatively (store.resources + gold/energy SABs, clamped) and re-emits. The res packet carries upgrades/tech/progression; the client merges levels only upward (no flicker while an act is in flight).

**0.9.35 (items 1-5)**: pipe demolition by the client (a bundle patch exports the game's own pipe-demolish fn on window; client forwards the rect, host calls it); story steps triggered by the client (host appends to `storyProgression.completedSteps`, idempotent); critter collection by the client (store.creatures counters + first-catch conservatory tickets, 1:1 with the game's logic); signals (link/unlink → `FH.signals`), signal buttons and blueprint copy-paste executed by the host; host-pause heartbeat (a 1 s setInterval survives the paused sim → the joiner sees "Host paused — world frozen" plus a stall indicator); fast rejoin (`_lastGoodWid` survives sessions — reconnecting to the same host world is trusted immediately, no save re-transfer).

## 2026-08-18 (v0.9.29 – v0.9.33) — live-debug session: client demolish + the red undeletable blocks

0.9.29: hotfix — the demolisher rect from `H(e)` is already in cell coordinates; 0.9.28 divided by cellSize again, scanning a wrong 4× smaller area and silently doing nothing ("nothing happens, no log" — TCentraL). Every `_demol` code path now logs. 0.9.30-0.9.33: the red undeletable blocks turned out to be **orphaned foundation tiles** — the structure object was long gone but its tiles (terrain Block=15..SlidingBlockRight=18) stayed written in the world, and the game only clears tiles when demolishing a live structure. The post-demolish sweep now detects building tiles with NO live structure at that cell and removes them via `FH.terrains.removeAt` (healthy foundations are never touched). Confirmed live: 112 tiles cleaned across 3 stuck blocks. Works solo, host and co-op.

## 2026-08-18 (v0.9.28) — client demolish, foundation data, factory-process sync (TCentraL's reports)

(1) Demolishing as the joining player only recolored structures red: the actual removal ran inside the paused local simulation and never executed. New `_demol` bundle hook intercepts the demolisher drag (unique anchor in the tool tick's End branch), resolves affected structures from the mirrored store via getAtCell over the selection rect and sends them through the existing act:demolish channel. (2) Foundations (incl. sloped) placed by the joiner could not be deleted even by the host: `ST._place` dropped the structure's `data` (shape/box/color), so the host built a degenerate copy. Data is now JSON-cloned and forwarded. (3) "Shake Wet Sand" is a factory process whose counters live in the `factory.processing` SAB — never covered by the mirror, so the joiner always saw zero progress. The host now streams the counters in the 1 Hz res packet.

## 2026-08-17/18 (v0.9.26 – v0.9.27) — Knight-HD's pull request merged + review hardening

Merged PR #1 by **Knight-HD** (dkdknight): `_place` bundle hook (the game turned building placement into a non-cancelable interceptor; numeric structure types were silently dropped — this was "can delete but not build"), host-side grabber rework, mirror protocol v4 (+1 B/cell element type), teammate build ghosts & grabber crosshairs, dirty-cell priority lane, additive reconcile, "0.5.4" anchors. Review hardening on top (0.9.27): a `_grab` anchor variant for our Steam build (Steam serves different builds to different people — his anchors matched 0× here), world-trust reset between sessions, staged ghost cleanup (delete only after 3 consecutive absent snapshots + 30 s grace) instead of never deleting, capacity-aware grab harvesting and a per-peer host rate limit.

## 2026-08-17/18 (v0.9.8 – v0.9.9) — mod-version exchange

The version-mismatch warning only reacted to protocol changes, so a player on an old mod triggered no alarm (the exact "nothing works" case — one tester was on 0.9.0 without knowing). Players now exchange exact MOD versions on connect (`mver`); a mismatch shows red with both versions, and a peer that doesn't answer within 5 s is flagged as "OLD mod (≤0.9.7)". Also open-sourced the repo (github.com/IronBamBam1990/sandtogether, MIT).

## 2026-08-17 evening (v0.9.7-beta) — LIVE DEBUG of user's session ("nothing works, my buddy is a spectator")

Diagnosis from the host's live logs (%APPDATA%\Sandustry\logs\main.log) + client/host logs from other players (Downloads/drive-download-20260817T185810Z):

1. **The game updated TODAY** (app.asar.bak 18:53, re-extract 19:30; package.json STILL says "0.5.2" — the devs don't bump it!). The new build renamed the API: `structures` disappeared from the top-level FH (along with launchers/misc/grid), and `reactions/excavation/processing/signals` were added. The mod called `FH.structures.build/removeAt/getAtCell/update` → undefined → **the client couldn't build**. FIX: `structNs()` — dynamic resolver (searches for a namespace with build+removeAt+getAtCell at top level and 1 level deep, cached in ST._structNs). The structures:placed/removed/moved + grabber:elementPickedUp/Placed events DO EXIST in the new build (verified via grep), the Fire=11/FreezingIce=12 enum is unchanged.
2. **The stream couldn't keep up**: chunk queue 3962→8631 and not dropping (SYNC-HOST log), 400 chunk/s cap, distance-based sorting STARVED far chunks indefinitely → the client saw a world 20+ s stale → 348× "grabPlace CONFLICT", building/tools acting on "the past". FIX: two lanes — fast lane = ALL dirty chunks within a 24-chunk radius of every player (cap 120/batch), slow lane = the 20-40 oldest FIFO (Set = insertion order, zero starvation) + **hash-skip** (FNV-1a per chunk; identical content → don't send; hashes.clear() in enqueueFullWorld so a resync/new player gets everything!).
3. **G1 confirmed live** (log from the other players: "Client simulation: resumed"): the game's ESC menu sends SetPaused(false) → silent double simulation. FIX: re-pause heartbeat [54,true] every 2 s in the client's _frame (idempotent).
4. **G8**: peer-disconnected NO LONGER unpauses the client (silent world fork) — the world stays frozen, solo = the Stop button.

node --check OK, published (public). BOTH players must: install.bat + restart. VER 0.9.7-beta.

## 2026-08-17 (v0.9.6-beta) — fixes from full code review of 0.9.3–0.9.5

A reviewer agent verified the 0.9.3–0.9.5 changes (report in history). The 0.9.4 grabber fix confirmed correct (Uint32 alignment OK: sim = Uint32Array(buffer,0,W*H); zeroing only cellIds is DELIBERATELY right — the grabber decides solely by cellIds, mapData=render=host mirror). Fixed findings:

- **B1 (BUG)**: after connecting via Join LAN the IP field kept keyboard focus → the game ignored WASD (the game's global keydown skips INPUTs) until a click on the canvas. Fix: after a successful connection `lanRow.hide()+blur()`; additionally stopPropagation on the input's keydown/keyup (the game's keyup does NOT filter INPUTs — R6).
- **R1**: `_fireQ/_cryoQ` cleared on "joined"/"stopped" — stale coordinates won't leak into another world/session.
- **R2**: the `_fire/_cryo` hooks now require `ST.wsx.paused` (mirror active) — a client that is connected but on its OWN world has weapons working normally locally and forwards nothing (the coordinates would be meaningless in the host's world).
- **R4**: adaptive grabber grace: `grabGraceMs() = min(3000, max(1200, 3*ping+300))` — the fixed 600ms was shorter than a round trip at 300ms+ ping (Switzerland↔Poland!) and duplicates were coming back under lag.
- **R5**: symmetric PLACE protection: `_placedCells` + a sentinel (cellId=1) in the placed cell — the placement loop reads local cellIds and would target an "empty" (mirror lag) cell again with the next slot → host createAt no-op on an occupied cell → the element was lost. The host additionally logs the grabPlace conflict (cell occupied = client's element lost — a rare divergence, refund TODO requires access to the tank matrix).
- **N1**: `_grabbedCells/_placedCells` cleared on joined/stopped. **N4**: try/catch on the flush sends (an exception would propagate out of _frame into the game's emit).

DEFERRED (documented): R3 — RJ_FIRE=11/RJ_FREEZINGICE=12 are build-specific with no runtime guard (a peer on a different game build with a reshuffled enum would create the wrong element; only a real issue when GAME versions diverge between players — the mod already requires the same mod version anyway). N3 — fireB/cryoB are approximations (default burn time instead of distance-scaled; static ice instead of particles with velocity) — acceptable.

node --check OK, published (3784750764, public). VER 0.9.6-beta.

## 2026-08-17 — GAP AUDIT toward "100% playable" (agent report in history)

GAME-BREAKING: **G1** the client's ESC silently unpauses the sim (the pause menu sends its own SetPaused(false), ST.wsx.paused stays true → never re-pauses → double simulation on the mirror). **G2** upgrades/tech/augments not synced at all (a client purchase = free, fluxite comes back after 1s via res; the host doesn't know the client's levels). **G3** a host sitting in the main menu poisons the client (res/snap/ent have NO worldId/scene guard — only wc does; menu = a small world → overwrites resources, DELETES the client's structures after the 6s grace).
MAJOR: **G4** host pause freezes sync with no notification (frame:update doesn't fire). **G5** signals/automation, machine config (structure.data), client blueprint copy-paste get reverted — endgame is host-only. **G6** story/objectives/stratacores/boss/viability/discoveries/critters one-way or not at all (client triggers → reverts after 1s). **G7** no per-client persistence (join = reset to the host's save) — hard. **G8** disconnect = silent fork (an unpaused client keeps playing, loses everything on rejoin; no WS auto-reconnect). **G9** client drones possibly overwritten by the 10Hz ent stream (UNVERIFIED whether the client deploys directly at all).
MINOR: G10 no chat; G11 relay only for pos/hello (3+ players: myproj/snd not relayed); G12 drops only via the 2.5s snap; G13 tutorial/hints/options divergence; G16 anchor fragility to game updates (the biggest operational risk).
CONFIRMED NON-ISSUES: no player death/health in the game (store.player has no health, 0 hits for "respawn" in the bundle).
ROUND PLAN: 1) G1+G3 (small, protect against corruption) 2) G2 (economy; USER DECISION: shared upgrades vs per-player) 3) G6+G5 (full campaign) 4) G4+G8+chat.

## 2026-08-17 (v0.9.5-beta) — JOIN LAN: IP input field (bug reported by 星灵)

Bug: "Join LAN" used `window.prompt(t("join_prompt"),...)` to enter the address — and **Electron/Chromium does NOT support `window.prompt()`** (renderer: no-op, the dialog never shows). Result: no interface to enter the IP. (Join by Lobby ID was fine — it uses the clipboard, not prompt.)

Fix: a built-in input field in the panel (`#st-lan-row`/`#st-lan-addr`, placeholder "ip or ip:port", default 127.0.0.1:27777). Clicking "Join LAN" shows the row and focuses the input; a second click / Enter / the "Connect" button connects via `net.joinWs(h,port)`. i18n `btn_connect` (EN "Connect"/PL "Połącz"). No protocol changes. node --check OK. Published (3784750764, public). VER 0.9.5-beta.

## 2026-08-17 (v0.9.4-beta) — GRABBER FIX (re-grabbing / duplicates in the tank)

Root cause found: the client grabs a cell → the tank fills synchronously (tool data), BUT the cell's removal from the world goes through the deferred Lu queue, which does NOT drain on a paused client → the cell "stays" in cellIds → the grabber grabs it AGAIN every frame (tank full of duplicates) until the host mirror (~100ms) removes the cell. That was the "grabber doesn't work right".

Fix (surgical, host-authoritative, world/tank split):
- **`grabClearLocal(state,x,y)`**: on `grabber:elementPickedUp` the client zeroes the cellId locally IMMEDIATELY (`new Uint32Array(sim.buffer,sim.byteOffset,W*H)[idx]=0`) → getCellId→0, isCellIdElement→false → the grabber sees empty, doesn't grab again. Records idx→ts in `_grabbedCells`.
- **Protection against restoration by the mirror**: in `applyWorldBatch`, after applying chunks I iterate `_grabbedCells` (600ms grace): if the host already shows 0 → confirmed, remove from the list; if still non-zero (host hasn't processed grabPick yet) → zero it again. Self-terminates once the host confirms.
- The split is correct: **world = host-authoritative** (the host does `FH.elements.removeAt`/`createAt` from forwarded grabPick/grabPlace), **tank = the client's local inventory** (fills/empties instantly). Zero double-count (the host does NOT touch the client's tank).
- A small visual lag remains (mapData catches up via the mirror in ~100ms) — an inherent round trip, but grabbing now behaves correctly (one cell = one tank entry).

No changes to patches.json/protocol (grabPick/grabPlace same format). VER 0.9.4-beta. node --check OK. Published to Workshop (3784750764, public). Both accounts must update.

## 2026-08-17 (v0.9.3-beta) — flamethrower + cryoblaster for the client

An agent mapped the 3 tools (report in history). Root cause: they all write through the deferred Lu queue, which doesn't drain while the client is paused → no-op (flame/cryo) or divergence (the grabber writes its matrix synchronously).

Done (weapons):
- **Flamethrower**: patch `flamethrower fire hook (A)` — anchor `s=0)=>{if(t<0||n<0||...` (1× in the current build). `_fire(e,x,y)` on the client: queue the cell + return true (skip). Host: `FH.fire.burnElementAt` + `FH.elements.createAt(RJ_FIRE=11)`.
- **Cryoblaster**: patch `cryoblaster freeze hook` — anchor `x={x:Math.cos(b)*U...};(0,h.Lu)(e,i,l,...` (1×). Inserted as a sequence (not an early-out) `_cryo(e,i,l),` before Lu — Lu no-ops on the client (dropLu while paused). Host: `FH.elements.createAt(RJ_FREEZINGICE=12)`.
- **Batching**: fire/cryo queued (ST._fireQ/_cryoQ, cap 2000) and sent every 60ms as {act,fireB/cryoB,c:[x,y,...]} — doesn't flood the network (cryo ~540 cells/s).
- RJ_FIRE=11, RJ_FREEZINGICE=12 (from the current build's enum, `Fire=11]="Fire",FreezingIce=12`). Build-specific.

NOT done: **grabber** — it's a Tool with a tank (matrix) in the tool data; it writes the matrix SYNCHRONOUSLY + the world through Lu (deferred). The delay = an inherent host-authoritative round trip. A clean fix (early-out tick + host driving the tank) is complex and risky (the tank is the player's inventory) — I'm keeping the current event forwarding (grabber:elementPickedUp/Placed), which has the right shape, just with latency. 2-instance test: no errors. VER 0.9.3-beta.

## 2026-08-17 (v0.9.2-beta) — FIX client building + digging ns fix

Fixing "auto-delete" of client structures (without waiting for logs — from code analysis):
1. **Host force-place**: replayAction "place" → buildOne(...,true). Cause: building:place fires on the client AFTER its own collision check (clear on their side), but the host runs a 2nd check on its own state (minimal divergence) → build null → nothing comes back. Fix: the host trusts the client's validation (clearance:-1).
2. **Grace period in reconcile** (6s): don't delete structures placed in the last 6s (the host may not have included them in the snapshot yet / key divergence due to the structure offset). Map `_structApplied` (key→ts) set in applyNetStructs + reconcile.
3. **findApi multi-ns**: the current build has the FH namespace **`excavation`** (not `patterns` like 0.5.3!). Dig replay: `findApi("excavate",["excavation","patterns"])`. Detected from the FH keys log. This could have been breaking dig replay on the current build.
- Building diagnostics (CLIENT forward place / HOST placed/NOT placed) stay.

NOT fixed (need further work): grabber delay (inherent host-authoritative round trip), flamethrower/cryoblaster (Fire/Ice via createAt — a different path, no simple unique anchor, not patching blindly). 2-instance test: no errors. VER 0.9.2-beta.

## 2026-08-17 (v0.9.1-beta) — TCentraL feedback: building diagnostics

Feedback (0.9.0-beta): models+movement OK ("really great"). 3 client bugs:
1. **Client building "auto-deleted"** — structures don't get confirmed. Our path: building:place cancel+forward → host buildOne → {st,add}. Suspicions: (a) host build returns null (wrong type name structureId vs what build expects / collision on the host), (b) the building:place cancel doesn't work on this build → the client places locally → snapshot reconcile deletes it because the host doesn't have it. Added DIAGNOSTICS: CLIENT forward place (structureId,x,y) + HOST placed/NOT placed. Need TCentraL's logs.
2. **Grabber delay** — inherent host-authoritative lag (round trip); the client forwards the grab, the host executes, the mirror comes back. Without local prediction (rejected by user decision) it won't go away. To consider: light prediction for the grabber only.
3. **Flamethrower/cryoblaster** — don't work for the client: they use a DIFFERENT world-mutation path (fire/frost) than DN/setCell, so they aren't hooked. Need to find their hooks (future).

VER 0.9.1-beta.

## 2026-08-17 (v0.9.0-beta hotfix) — DEMYSTIFYING "0.5.4" + installer fix

**BREAKTHROUGH: there is no unsupported 0.5.4.** The user updated the game to the latest on Steam → app.asar still package **0.5.2**, buildid 24719878 (same as before). Steam does NOT have a newer build. The "0.5.4" players see = the DISPLAYED version (in-game/store), different from package.json. Test: all 9 anchors match the CURRENT bundle.js (frame v0, the rest v1). **The mod fully supports the current build.**

ЗаКеЛьМан's real problem = the mod wasn't loading, because Steam kept restoring app.asar (the game loads the asar instead of the app folder). install.ps1 fix:
- When `app.asar` is PRESENT (Steam put it back: fresh install OR auto-update) → **delete the old app folder, extract FRESH from the current app.asar**, delete the old .bak, rename app.asar→.bak. Guarantees the app folder = current build and the asar is out of the way.
- When app.asar is absent but the app folder exists (normal modded state) → skip (re-patch only).
- Tested in ЗаКеЛьМан's state (asar restored + old folder): fresh re-extract of 0.5.2 → 9/9 patches [+] → boot OK, mod active.
- Installer DONE: removed the outdated "F9" mention, added a tip about disabling Steam auto-update.

Takeaway for players with "can't connect after 0.5.4": just **run install.bat again** (it now handles the Steam swap itself). The game version is NOT the problem.

## 2026-08-17 (v0.9.0-beta) — MERGE of dotNine batch 2

After reading dotNine's code (models/grabber/resDelta sections), merged onto our base:
- **Player models** (the hardest, Tier 2): puppets = real sprites cloned from `state.session.rendering.pixi.sprites.player.*`, added to the game's rendering parent. Synced in pos: tools (visible parts), facing (scale.x), aim (atan2 to cursor, world-space), trail (alpha). Position via `FH.rendering.getDrawPos` (world→screen). Dead reckoning (vx/vy/tUpdate, cap 3px/ms, stall→v=0). Parts rebuilt only when the set changes. muzzleFlash when the projectile count rises. Nickname still on the 2D canvas. Puppet cleanup on disconnect/stop. ANCHOR_DX/DY/aim-mirror constants = for visual tuning (dotNine marked them as unverified himself). Pos rate 50→33ms.
- **Grabber**: grabber:elementPickedUp/Placed events → {act,grabPick/grabPlace,x,y,et} → host FH.elements.removeAt/createAt. Fixes NanYu's bug 2 (wet sand).
- **resDelta** (bidirectional resources): the client sends INCREMENTS of store.resources every 1s (vs _resSnapshot rebased after each res from the host); the host adds them to its own. The client's earnings no longer vanish on disconnect.
- **NOT taken** (user decision): dotNine's local spray prediction (we stay host-authoritative), dig gating (we forward everything).

2-instance test: no JS errors, sync/pause OK. Player models: the code loads cleanly, but real puppet rendering requires a test in a world with 2 accounts (the autotest is in the menu) → BETA. VER 0.9.0-beta, PROTO_VER 5.

## 2026-08-17 (v0.8.0-beta) — MERGE of dotNine's contribution (co-author)

dotNine (a community member) sent an extended version (based on our older one). An agent did the review; merged onto OUR current base (multi-version/host-authoritative/reliable transfer stay ours). Batch 1:

- **cellIds sync (client collision) — wc protocol v2→v3.** worldBuffers returns `sim` (sh.sim.cellIds); serialization 7→11 B/cell (+4 sim); the client writes the layer into sim.cellIds. Effect: a dug hole IS real for the client (they can walk into it). Consistent with host-authority (the client doesn't author, it just receives the grid). PROTO_VER 4→5.
- **Fix for dig replay on the host**: `findApi("excavate","patterns")` — FH.world.excavate "looks right but does nothing", the real one is FH.patterns.excavate (dotNine's discovery). findApi got preferredNs + .bind.
- **Auto world transfer**: host auto-sends on player join + a continuous `_autoSentWid` poll in _frame (send each world once); the client auto-loads via `FH.game.load` after import + a trust window `_pendingTrustUntil`/`_trustedWid` (the engine assigns a new worldId after load → without trust, subsequent wc would be rejected). Eliminates the manual "Send world→Load Game" (Warlow's problem).
- **Join by Lobby ID (clipboard)**: clickable #st-lobbyid (copy) + a Join-by-ID button (paste, regex \d{5,}, net.joinSteam). Bypasses Steam invites.
- **Off-screen player arrows** + per-player colors (PEER_PALETTE, peerColor hash, drawOffscreenIndicator).
- **Ping/RTT** (ping/pong, EMA, #st-ping).
- Credit: dotNine as Contributor (code header, HUD by-line, Workshop description, changeNote).

2-instance test: no JS errors, v3 sync works, ~40-75 KB/s (+57% due to cellIds — OK, only dirty chunks in real play). VER 0.8.0-beta.

DEFERRED to batch 2 (Tier 2/extras): player models with equipment (fragile, deep PIXI coupling — needs tuning), grabber tool (grabber:elementPickedUp/Placed), bidirectional resDelta (client resources). User decision: spray stays host-authoritative (we do NOT take dotNine's local prediction), dig gating — ours (forward everything).

## 2026-08-17 (v0.7.0-beta) — REBUILD: host-authoritative client (NanYu's bugs 2+3)

An agent mapped placement (report in memory): `building:place` (Q:1969) cancellable = a CLEAN no-op; foundations write cells DIRECTLY (te→Gz/B→setCellId+mapData, not the Lu queue) → a paused client writes them → phantoms. `l.Tn`(A:44735) adds store+cache without writing cells; renderer O:62058 draws from store.structures+cache.

Changes (the client NEVER writes to the world locally):
- **building:place hook** (new, game event): client (not applyingNet) → forward `{act,place,type,x,y}` + return true (cancel local placement, zero writes). Covers ALL placement (pipes/foundations/machines go through this point).
- **structures:placed**: now only the HOST broadcasts its own (the client cancels before the write).
- **_setCell** (B/Gz): the client NEVER writes cells — return true always; player spray → forward; during applyingNet → silent skip (terrain from the mapData mirror).
- **replayAction {act,place}**: the host places authoritatively (buildOne without force, real collision check) → broadcast {st,add}.
- **buildOne(state,s,force)**: force=true (client rendering confirmed structures) → `{x,y,clearance:-1}` bypasses the Q collision check (−1 ≠ any Blocked enum); cells are skipped by _setCell anyway → sprite only. applyNetStructs/applySnapshot → force=true; host → without force.
- Diagnostics: log a failed placement on the host.

2-instance test: no JS errors, sync/pause OK. **Placement needs player testing** (the autotest doesn't click). VER 0.7.0-beta, PROTO_VER 4.

Limitations for testers to check: conveyor orientation (building:place doesn't carry the angle), pipes sync via the 2.5s snapshot (not instant), hauler-line data (origin/target/lineId) may need extra sync.

## 2026-08-17 (v0.6.4) — NanYu feedback: 3 client bugs

1. **Client can't dig terrain (dirt)** — FIXED: removed the `_pd/_projCtx` block in `_dig`. The client's sim is paused → no AI digs → every DN = a player action → we always forward. + findApi searches 2 levels deep (more reliable excavate discovery) + HOST diagnostics (log first dig / missing API).
2. **Grabber doesn't move wet sand** — TO INVESTIGATE. Likely root cause: the client's cellIds are frozen from the moment of join (we sync the world's APPEARANCE mapData/wall/shadow/auth, but NOT the cellIds/elementData grid — sim-only). The grabber/element operations on the client read stale cellIds.
3. **Foundation → red indestructible blocks** — TO INVESTIGATE. Same cause: the client places the structure locally (writes cellIds based on the FROZEN state from join) → divergence from the host → phantom blocks. The proper fix: make client structure placement host-authoritative (no local cellIds writes) — requires care + a real test. Player workaround: the HOST places foundations.

Key architectural knowledge: **cellIds/elementData are NOT synchronized** (too large, sim-only) — we sync only mapData(RGBA+material)/wallData/shadowMap/authorization. Client collision works (mapData.alpha=material), but any LOCAL client operation that writes cellIds diverges. This is the source of bugs 2 and 3.

## 2026-08-17 (v0.6.3) — fix: F9 clashed with the game's quick-load (reported by Lofar666)

Bug: the panel was hidden with F9, but the game has F9 = quick-load a save → hiding the panel loaded the game. Fix:
- Panel collapse via **clicking the header** (st-head → toggle st-body, arrow ▾/▸) — zero game keys
- Safe shortcut Ctrl+Shift+H with `capture:true` + `preventDefault` + `stopImmediatePropagation` (doesn't reach the game)
- README/INSTRUKCJA/i18n updated (F9 removed)
- VER 0.6.3, boot test clean, Workshop updated

## 2026-08-17 (v0.6.2) — audit of the host/invites/transfer path + hardening

Full review of the connection code at the user's request. **Steam callback field names verified STRAIGHT FROM THE NATIVE BINARY** (steamworksjs.win32-x64-msvc.node, extracted strings):
- P2PSessionRequest: field `remote` ✅ (code correct)
- GameLobbyJoinRequested: `lobby_steam_id` → napi camelCase `lobbySteamId` ✅ (code correct)
- SteamId: `steamId64/steamId32/accountId` ✅; methods sendP2PPacket/acceptP2PSession/getOwner/getMembers/openInviteDialog/setJoinable ✅
- Conclusion: the callbacks were NOT the bug; the real bug = missing invite handling with the game closed (fixed in 0.6.1)

0.6.2 hardening:
- `S.lobby.setJoinable(true)` after lobby creation
- clear the `connect` rich presence on stopNetworking (so "Join Game" doesn't go stale)
- `start argv:` log at startup (diagnostics — shows whether Steam passed +connect_lobby to the joiner)
- Boot test clean, PROTO_VER 4, VER 0.6.2, Workshop updated

## 2026-08-17 (v0.6.1) — CRITICAL invite fix (version-independent)

Many people: "nothing happens after clicking the invite", regardless of game version. Cause: the code handled ONLY `GameLobbyJoinRequested` (overlay with the game running). Steam has 3 join paths:
1. game running + accept in the overlay → `GameLobbyJoinRequested` (was handled)
2. game CLOSED + accept → Steam launches the game with `+connect_lobby <id>` in argv (we weren't reading it!) ← the most common case
3. game running + accept from the friends list → Steam launches a 2nd instance → single-instance kills it → `second-instance` event with argv (we weren't handling it)

Fix (st-main.js):
- `tryJoinFromArgv(argv)` parses `+connect_lobby <id>` and `steam://joinlobby/<appid>/<lobbyid>/...` (regex); unit test with 4 cases OK
- Called at startup (after Steam init, cold launch) + `app.on('second-instance')` (coexists with the game's handler)
- `setRichPresence('connect', '+connect_lobby '+lobbyId)` when hosting → "Join Game" appears in the friends list + the correct launch param
- `S._pendingJoin` in case argv arrives before Steam init
- Boot test clean, PROTO_VER unchanged (4), VER 0.6.1
- Workshop + SandTogether-0.6.1.zip updated

## 2026-08-17 (v0.6.0) — MULTI-VERSION SUPPORT (Justin/MIXUIL: "nothing after the invite")

Problem: the game ships a new version every 1-2 days (0.5.2/0.5.3/0.5.4 in circulation). Steam serves **0.5.2** by DEFAULT, while the mod targeted 0.5.3 → for most subscribers the anchors didn't match → the panel shows, but the mechanics (frame hook + actions) weren't wired in → "invites work, the panel doesn't respond". Confirmed by 2 people (Justin, MIXUIL).

Solution:
- **patches.json rebuilt with variants**: each patch has a list of {anchor,patched} for different versions (0.5.3 + 0.5.2); the installer/patcher tries them in order and applies the matching one. An agent found and verified 9 anchors for 0.5.2 (all unique).
- **install.ps1 (pure PowerShell, no Node)** + the patch.js installer: iterate over variants; if a CRITICAL hook (frame:update) is missing → hard error "unsupported game version" (instead of silently passing). Non-critical misses → warning, coop still works.
- **Runtime backstop in the mod**: if the game state isn't captured within 12 s (the game updated after install) → red "Unsupported game version" panel.
- Idempotency fix: the achievements patch got a `/*STA*/` marker (its target text was a substring of the original → false "already applied").
- Validation: 9/9 apply on 0.5.2 (v1) and 0.5.3 (v0); a 2nd pass = 0 duplicates (idempotency OK).
- VER 0.6.0, PROTO_VER unchanged (4, same network protocol). The user's game refreshed with a clean 0.5.3 + re-patched.

NOTE: MANUAL.zip (pre-patched 0.5.3) works ONLY for 0.5.3 — everyone else should use **install.bat** (it detects the version itself and patches their files). 0.5.4 still unsupported (no files) — the installer will report it clearly.

## 2026-08-17 (v0.5.1) — reliable world transfer over Steam P2P

Bug reported by a tester: after "Send world" the client doesn't see the host's save. Cause: `sendWorld` blasted all pieces (192 KB each) synchronously in a loop → Steam P2P buffer overflow → dropped packets → incomplete/corrupted transfer. The local test passed because it went over WebSocket/LAN (TCP stream, no packet limits).

Fix:
- Packet size reduced 192 KB → **48 KB** (safely under the Steam P2P limit)
- Sending **spread over time**: queue `ST._wtx`, 4 packets/tick every 25 ms (~7.5 MB/s) instead of a blast
- **Lost packet recovery**: the receiver tracks received indexes, every 700 ms sends `world-need` with the missing ones → the host resends; import only when got===total (world-end may get lost — it doesn't block)
- Simulation at 30% loss: 29/68 lost, recovered in 5 rounds, file bit-identical ✓
- PROTO_VER 3→4 (version mismatch detection between players)
- Workshop + SandTogether-0.5.1.zip + MANUAL.zip updated; changeNote describes the fix

## 2026-08-16 (v0.5.0b) — achievements-with-mods

- New bundle patch "achievements with mods": the `integrity.modsUsed` condition removed from the achievement gate (A_ at pretty:128344); **`cheatsUsed` stays** (the devs' intent regarding the cheats menu — we don't bypass it)
- Rationale: today modsUsed is dead (never set), the patch = insurance against future game versions; the "achievement enabler" standard known from other games
- Patcher FIX: the per-patch idempotency test changed from "patched present" to "anchor gone" — the previous test falsely skipped patches whose target text is a substring of the original (exactly this case)
- Workshop + SandTogether-0.5.0.zip updated

## 2026-08-16 (v0.5.0) — FULL MULTIPLAYER (user request: 100%)

New bundle patches (1× anchors): player-dig flag (I), projectile-update flag (m), spray flag (_) — context flags that distinguish PLAYER actions from critter/drone actions (the latter counted only by the host).

- **Client firearms/rockets**: client projectiles simulated locally, hits forwarded to the host (DN in _projCtx context); host projectiles → client and client → host drawn as tracers on the ghost layer (zero double simulation/damage)
- **Critters + drones**: {t:"ent"} stream at 10 Hz host→client (wholesale; local AI between packets = smoothing); critter DN/Gz NOT forwarded (flag gating)
- **Item pickup**: `worldItem:pickedUp` event (bus) → the client forwards the id → the host executes **FH.world.items.pickUp** (full effects: artifacts++, orb→tech, sounds); a `_pickedPending` filter (TTL 10 s) in snapshot reconcile protects against a respawn on the client
- **Building moves for both sides**: structures:removed(byMove) → stash old positions → pair with structures:moved → {k:"move"}/{t:"st",k:"mv"}
- **World event sounds**: tap on the host workers' onmessage (PlaySound=41, limit 20/s) → {t:"snd"} → the client plays via FH.sound (best-effort, introspection)
- **Story/gloom**: store.mods (storyProgression) + store.gloom in the res message (1 Hz)
- **Vacuum**: the real capacity table [500,1000,1500,2000,2500,3000] from the game code (module 6420) × upgrade level (FH.upgrades.getLevel)
- PROTO_VER=3; E2E 2-instance test clean; Workshop updated (description without the limitations section, an asterisk: tracers/10 Hz/rare race on simultaneous pickup)

## 2026-08-16 (v0.4.2) — gap audit + fixes

Fixed oversights (from the "what did I forget" audit):
- **Version handshake** (PROTO_VER=2 in hello) — on mismatch a red "DIFFERENT MOD VERSIONS" message on both sides; the world batch has a v:2 field and the client rejects other versions
- **Host drones visible for the client** — added to the snapshot (store.drones wholesale)
- **Authorization grid streamed** — chunk format v2: map(4)+wall(1)+shadow(1)+auth(1)=7 B/cell; without this the client couldn't dig in zones the host unlocked after joining
- **3-4 player support** — the host relays pos/hello between clients ({t:"relay",from,msg}); the world is broadcast anyway
- **Workshop title without the surname** (user decision after my privacy recommendation): "SandTogether — Co-op Multiplayer"; authorship stays in the description/README/code/HUD
- README: a warning that the client shouldn't rely on their own saves during a session
- Workshop update pushed (item 3784750764, Public, cover = the user's artwork SandustryPic.png)

Known gaps → v0.5: client firearms, client building moves, item pickup, critters, world event sounds on the client, objectives/story sync in long sessions, chat, ping, real vacuum tank capacities

## 2026-08-16 (v0.4.1) — AUTHORSHIP + EN + STEAM WORKSHOP

- **Author: KAMIL PADULA** — headers in all source files (sandtogether.js, st-main.js, patch.js, st-preload-append.js, install.ps1, modinfo.json), HUD credit ("by Kamil Padula"), README/INSTRUKCJA
- **i18n**: the mod's UI is bilingual — EN by default, PL auto-detected (getPreferredSystemLanguagesSync); STRINGS table in sandtogether.js; installer and logs in English
- **README.md (EN)** + INSTRUKCJA.md (PL) in the package; package SandTogether-0.4.1.zip
- **Steam Workshop**: published via steamworks.js (workshop.createItem/updateItem, account Iron):
  - Item ID: **3784750764** — https://steamcommunity.com/sharedfiles/filedetails/?id=3784750764
  - Visibility: **Private** (for the author to review; change to Public on the item page or via script)
  - Contents: install.ps1 + README + INSTRUKCJA + src/ ; preview.png generated (src/make-preview.js — placeholder, replace with a screenshot)
  - Republish/update: `node src/publish-workshop.js 3784750764`
- Workshop NOTE/risks: the mod installs via install.ps1 (it patches game files) — subscribing alone doesn't install; possible moderation/dev reaction (the game has no official loader for EA yet); contacting the devs/Sandustry Discord recommended

## 2026-08-16 (late night) — v0.4.0: SHARED FACTORY (M4)

### New mechanisms
- **Structures (buildings/machines/belts/pipes)**:
  - Event-driven: subscribe to `structures:placed/removed` via FH.events.on (bus on state.sandkit.events) on both sides; the `_applyingNet` flag suppresses feedback loops
  - Client builds/demolishes → `{t:"act",k:"build"/"demolish"}` → the host replays via **FH.structures.build/removeAt/update** (the API handles store+cache+blockGrid for us!) → broadcast `{t:"st"}` to clients
  - Snapshot-reconcile every 2.5 s (deflate JSON store.structures+pipes+worldItems): add/remove/data update via the API, worldItems wholesale
- **Resources** (1 Hz): store.resources + productionPoints + SAB gold/energy/productionPoints + conveyorBeltsAnimationIndex (belt animation on the client)
- **Client vacuum**: bundle patch `vacuum hook (j)` — anchor `j=(e,t,n,a)=>{var s,l,U;const f=y(e);x(t,f);...` (1×); the client sends intent (120 ms throttle), the host collects elements (FH.elements.getInfoAtPos + removeAtDeferred, radius 4, max 10/tick) → `{t:"vacres",types}` → the client fills the tanks (soft limit 250 — the exact capacity table is internal)

### Findings from analysis
- FH.structures has a full instance API: build (=k1=Q, emits building:place[cancellable only for string types]/building:placed), removeAt/Between/AtPositions, update (V6+propagation to workers), setData, getAtCell, beginBatchWrite
- Weapon-tick (53442): only Dig/Shoot/Spray — vacuum is a separate tool (module ~12120-12400, mask C, tank fill M, cap=U.i[upgradeLevel] — internal table)
- structures:placed events (1952), :removed (26742), :moved (53137-53143; client move = a limitation, reverted via reconcile)

### E2E test (menu-world, 2 instances)
- Subscriptions active on both sides, mirror 29-46 KB/s / 187-361 chunk/s, zero errors
- Structures untested in-game (the menu has no buildings) — requires a user test

### Known 0.4 limitations (queued for 0.5)
- Client firearms/rockets have no effect on the world; a client building move reverts; worldItems pickup on the client unreliable (local dupe until the snapshot); critters/drones host-only (possible jitter on the client)
- Building cost: NOT AN ISSUE — placing buildings in the game is free (gold goes into the tech tree; the client's tech = from the imported host save)

### Package: SandTogether-0.4.zip

## 2026-08-16 (night) — v0.3.0: M3 SHARED WORLD — E2E test passed

### Engine analysis discoveries (agents)
- **The renderer unconditionally reads only 3 buffers every frame: mapData (RGBA, 4B/cell; alpha=materialId also used for COLLISION on the main thread), wallData (u8 palette), shadowMap (u8)** → mirror = a stream of these 3 buffers; zero remapping of cellIds/elementData!
- cellIds/elementData are sim-only; chunkShouldUpdate = simulation scheduling only (a perfect change detector)
- **Player actions in this build do NOT go through worker messages** — the Dig/Blast opcodes are dead; everything goes through the Lu mutation queue (bundle:52636+) and direct Gz/setCellId writes on the main thread
- Client pause: [54,true] ONLY to the manager worker (leave session.paused false → rendering works); while paused the Lu queue never drains (leak) → the _dropLu hook
- Digging: DN(state,cellX,cellY,mask2D,vel,dmg) — the mask = a plain 0/1 array 11×11/13×13 (shovel upgrade); replayed on the host via FH.*.excavate
- FH (ie.FH) captured in the frame:update v2 patch — namespaces: utils,action,elements,world,terrains,wall,shadows,...

### New bundle.js patches (patch.js, anchors verified 1×)
- frame hook v2: also passes ie.FH
- dig hook (DN=j): window.SandTogether._dig — the client sends intent, skips local execution
- setCell hook (Gz=B): _setCell — the client sends + executes locally (prediction)
- mutation-queue drop (Lu=h/m): _dropLu — no leak while paused

### World sync protocol
- Host: chunkShouldUpdate scan every frame → pending; batch ≤40 chunks/100 ms, priority by distance to players, rolling sweep 4/batch (self-healing); format [u16 cx][u16 cy][u8 cw][u8 ch][mapRGBA][wall][shadow] → deflate-raw (CompressionStream) → base64 → {t:"wc",wid,scene,W,H,d}
- Client: worldId gate (exception: both sides in the menu, scene 1 = test mode), sim pause on the first batch, write into the SAB → the renderer picks it up next frame
- Actions: {t:"act",k:"dig"|"set"} → host replays via FH excavate/setCellId
- Full world on peer-hello + a Resync button

### E2E test result (2 instances, menu-world 720×720, 324 chunks)
- Full world: ~2 s; steady-state: 8–27 KB/s, 74–269 chunk/s, queue 0
- Client: "Client simulation: PAUSED (host mirror)", batch application OK, zero errors

### Package
- SandTogether-0.3.zip (for the second player)

### TODO v0.4
- Structure/building sync (store.structures + session.cache.structures d.set / zoom<1 linear scan) + blockGrid SAB
- Resource sync (gold/energy/productionPoints SAB u32) and inventory
- Vacuum/grabber on the client (currently a no-op)
- Verify chunkShouldUpdate orientation on a non-square in-game world
- In-game test (scene ≠ 1) and a real CH↔PL test over Steam P2P

## 2026-08-16 (evening) — v0.2: M1+M2 PASSED, networking works end-to-end

### Built (src/)
- `st-main.js` — networking in the main process: Steam P2P (FriendsOnly lobby, overlay invite, P2PSessionRequest/GameLobbyJoinRequested/LobbyChatUpdate callbacks, 15 ms packet poll) + our own minimal WebSocket RFC6455 (server and client on `net`, zero dependencies). IPC: st:host-steam/join-steam/invite/host-ws/join-ws/stop/send/status + push st:msg/st:event.
- `sandtogether.js` — renderer: HUD (Host Steam/Invite/Host LAN/Join LAN/Send world buttons, F9 hides), position sync at 20 Hz, ghost sprites on our own canvas (transform screen = world − camera, interpolation 0.25), world transfer (save export/import via window.electron, base64 chunks of 192 KB).
- `st-preload-append.js` — contextBridge bridge `window.sandtogetherNet`.
- `patch.js` — idempotent patcher (6 patches: mod files, index.html, bundle.js frame hook, preload, replaceable main.js init block, single-instance bypass for `--st-*`).

### Test results (2 instances locally, --st-autotest)
- Host: WS server up, peer-connected, hello (nick Iron), **received the client's position (1914,1856)**
- Client: joined, **received the host's position** — full bidirectional exchange works
- Notes: the second local instance falls back to software rendering (GPU cache conflict) — won't happen on two PCs
- Steam P2P NOT tested yet (requires 2 accounts — test with a friend)

### Package for the second player
- `SandTogether-0.2.zip` (install.ps1 + INSTRUKCJA.md + src) — automatic installation on the friend's PC

### Known technical details
- steamworks.js 0.3.1: networking={sendP2PPacket,isP2PPacketAvailable,readP2PPacket,acceptP2PSession}, matchmaking={createLobby,joinLobby,Lobby(openInviteDialog,getMembers,getOwner)}, callback.SteamCallback (P2PSessionRequest=6, GameLobbyJoinRequested=8)
- A Buffer arriving in the renderer via IPC comes as {type:'Buffer',data:[...]} — handled in sendWorld
- getSaveFiles → an array of metadata from the first line of the .save; exportSave → {success,data}; importSave validates metaData.id


## 2026-08-16 — M0 PASSED: injection works (without Fluxloader)

### Decision: dropping Fluxloader
- Fluxloader (github.com/fluxloader-team/fluxloader) was built for the **demo** — last release 2.5.5 from 2026-04-12, last commit 2026-04-21, i.e. before the EA launch (Aug 13).
- On the Steam Workshop for EA there is **no** fluxloader item (search: 0 results), even though the game's main.js has integration for it — apparently not published for EA yet.
- Instead: **our own injection via an extracted `resources\app`**.

### What was done in the game files (F:\SteamLibrary\steamapps\common\Sandustry\resources\)
1. `app\` — an extracted copy of app.asar (the whole game, 135 MB)
2. `app.asar` → **renamed to `app.asar.bak`** (Electron in this build prefers the asar over the folder — without the rename the folder was ignored)
3. `app\main.js` — a logging marker added after the `DEV_BYPASS_MSSTORE_INIT_GATE` line
4. `app\dist\index.html` — `<script src="js/sandtogether.js"></script>` added BEFORE bundle.js
5. `app\dist\js\sandtogether.js` — our mod (M0: hook on `new Worker(...)`, log probe)

### Test result (Sandustry.exe --enable-logging)
- Marker in the main process: PRESENT
- `[SandTogether] Injection OK` in the renderer: PRESENT
- The Worker hook intercepted worker creation: **1× manager + 1× utility + 17× simulation** (user's CPU → clamp(HC-2,2,18))
- The game starts and runs normally with our code

### How to revert (back to a clean game)
1. Delete the `resources\app` folder
2. Rename `resources\app.asar.bak` back to `app.asar`
(or simply Steam → verify integrity of game files)

### Operational NOTE
- A Steam game update installs a new app.asar → our extracted folder becomes an OLD version of the game. After every update: re-extract the asar and reapply our 3 changes (eventually a `deploy.ps1` script).
- Steam integrity verification restores app.asar (our app folder remains, but will it then be ignored again? — no: the asar comes back, and Electron prefers the asar ⇒ the mod stops loading; the rename must be redone).

### Next steps
- M1: networking layer — WebSocket server in the main process (we have full access to main.js!), client, handshake
- M2: player ghosts (position sync via a hook on the SAB playerPos / player:moved)
