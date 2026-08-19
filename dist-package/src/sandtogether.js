// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Author / Autor: KAMIL PADULA
// Contributor / Współtwórca: dotNine (cellIds collision sync, lobby-ID join,
//   auto world transfer, off-screen player arrows, ping, FH.patterns.excavate fix)
// Renderer-side module (loaded BEFORE bundle.js).
// Host streams the world (mapData/wallData/shadowMap/cellIds mirror); the client
// runs a paused simulation and forwards its actions (dig/place/vacuum) to the host.
// ============================================================================
(() => {
	const TAG = "[SandTogether]";
	const log = (...a) => {
		console.log(TAG, ...a);
		try {
			const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
			window.electron && window.electron.log && window.electron.log("info", "SandTogether:game", line);
		} catch (e) {}
	};
	const VER = "0.9.52-beta";
	const AUTHOR = "Kamil Padula";
	const CONTRIBUTORS = "dotNine, Knight-HD, DwoaC, Cr0ss0vr, TCentraL";
	const VACUUM_CAPS = [500, 1000, 1500, 2000, 2500, 3000]; // tabela pojemności z kodu gry (moduł 6420)
	const RJ_FIRE = 11, RJ_FREEZINGICE = 12; // wartości enuma RJ z obecnego builda (do createAt na hoście)
	const CHUNK = 40;

	// ------------------------------------------------------------------
	// i18n — English by default, Polish auto-detected
	// ------------------------------------------------------------------
	const LANG = (() => {
		try {
			const langs = window.electron && window.electron.getPreferredSystemLanguagesSync ? window.electron.getPreferredSystemLanguagesSync() : [];
			return (langs[0] || navigator.language || "en").toLowerCase().startsWith("pl") ? "pl" : "en";
		} catch (e) { return "en"; }
	})();
	const STRINGS = {
		en: {
			offline: "offline", btn_host: "Host (Steam)", btn_invite: "Invite", btn_host_lan: "Host LAN",
			btn_join_lan: "Join LAN", btn_connect: "Connect", btn_stop: "Stop", btn_send_world: "Send world", btn_resync: "Resync",
			host_paused: "Host paused (menu) — world frozen, will resume automatically", sync_stalled: "No world data from host for {0}s…",
			reconnecting: "Connection lost — reconnecting (attempt {0}/5)…",
			chat_ph: "chat message…", chat_me: "You",
			btn_join_id: "Join by ID (clipboard)", lobby_copied: "Copied!",
			clipboard_no_id: "Clipboard has no Lobby ID — first click the host's green Lobby ID line to copy it",
			hint: "click header to hide (Ctrl+Shift+H)", by: "by " + AUTHOR + " + " + CONTRIBUTORS,
			hosting_steam: "HOSTING (Steam) — invite your friend!", hosting_lan: (p) => "HOSTING (LAN :" + p + ")",
			joined: (tr) => "CONNECTED to host (" + tr + ")", players: (n) => "Players online: " + n,
			player_left: (n) => "Player left. Online: " + n, error: (m) => "Error: " + m,
			creating_lobby: "creating lobby...", connect_first: "Connect first!",
			no_saves: "No saves — save your game first", exporting: (n) => "Exporting world '" + n + "'...",
			export_err: (m) => "Export error: " + m, import_err: (m) => "Import error: " + m,
			decode_err: (m) => "World decode error: " + m,
			world_sent: (kb, ch) => "World sent (" + kb + " KB, " + ch + " parts)",
			world_imported: (n) => "World '" + n + "' imported! Load it: menu → Load Game",
			world_imported_loaded: (n) => "Joined host's world '" + n + "' — you're in!",
			waiting_host_world: "Connected — waiting for host to enter a world (it'll load automatically)...",
			receiving: (a, b) => "Receiving world: " + a + "/" + b,
			other_world: "⚠ NOT on host's world! Host: click 'Send world'. You: menu → Load Game → load the received save.",
			dims_differ: (a, b) => "⚠ Different world size (" + a + " vs host " + b + ") — load the host's save via Load Game.",
			sync_up: (kb, ch, q) => "upload: " + kb + " KB/s, " + ch + " chunk/s, queue " + q,
			sync_down: (kb, ch) => "host mirror: " + kb + " KB/s, " + ch + " chunk/s",
			join_prompt: "Host address (ip or ip:port):",
			ver_mismatch: "MOD VERSION MISMATCH — both players must update SandTogether!",
			waiting_world: "Connected. Waiting for host's world — HOST must click 'Send world', then you: menu → Load Game.",
			unsupported: "⚠ Unsupported game version — the game updated and broke the mod. Re-run install, or check the Workshop page for an update.",
		},
		pl: {
			offline: "offline", btn_host: "Host (Steam)", btn_invite: "Zaproś", btn_host_lan: "Host LAN",
			btn_join_lan: "Dołącz LAN", btn_connect: "Połącz", btn_stop: "Stop", btn_send_world: "Wyślij świat", btn_resync: "Resync",
			host_paused: "Host w pauzie (menu) — świat zamrożony, wznowi się sam", sync_stalled: "Brak danych świata od hosta od {0}s…",
			reconnecting: "Zerwane połączenie — łączę ponownie (próba {0}/5)…",
			chat_ph: "wiadomość czatu…", chat_me: "Ty",
			btn_join_id: "Dołącz po ID (schowek)", lobby_copied: "Skopiowano!",
			clipboard_no_id: "Schowek nie zawiera Lobby ID — najpierw kliknij zieloną linię Lobby ID u hosta, żeby je skopiować",
			hint: "kliknij nagłówek by ukryć (Ctrl+Shift+H)", by: "autor: " + AUTHOR + " + " + CONTRIBUTORS,
			hosting_steam: "HOST (Steam) — zaproś znajomego!", hosting_lan: (p) => "HOST (LAN :" + p + ")",
			joined: (tr) => "POŁĄCZONO z hostem (" + tr + ")", players: (n) => "Gracze online: " + n,
			player_left: (n) => "Gracz wyszedł. Online: " + n, error: (m) => "Błąd: " + m,
			creating_lobby: "tworzenie lobby...", connect_first: "Najpierw połącz się!",
			no_saves: "Brak save'ów — zapisz grę najpierw", exporting: (n) => "Eksport świata '" + n + "'...",
			export_err: (m) => "Błąd eksportu: " + m, import_err: (m) => "Błąd importu: " + m,
			decode_err: (m) => "Błąd dekodowania świata: " + m,
			world_sent: (kb, ch) => "Świat wysłany (" + kb + " KB, " + ch + " części)",
			world_imported: (n) => "Świat '" + n + "' zaimportowany! Wczytaj go: menu → Load Game",
			world_imported_loaded: (n) => "Dołączono do świata hosta '" + n + "' — jesteś w grze!",
			waiting_host_world: "Połączono — czekam aż host wejdzie do świata (wczyta się automatycznie)...",
			receiving: (a, b) => "Odbieranie świata: " + a + "/" + b,
			other_world: "⚠ NIE jesteś na świecie hosta! Host: kliknij 'Wyślij świat'. Ty: menu → Load Game → wczytaj otrzymany save.",
			dims_differ: (a, b) => "⚠ Inny rozmiar świata (" + a + " vs host " + b + ") — wczytaj save hosta przez Load Game.",
			sync_up: (kb, ch, q) => "wysyłka: " + kb + " KB/s, " + ch + " chunk/s, kolejka " + q,
			sync_down: (kb, ch) => "lustro hosta: " + kb + " KB/s, " + ch + " chunk/s",
			join_prompt: "Adres hosta (ip lub ip:port):",
			ver_mismatch: "RÓŻNE WERSJE MODA — obaj gracze muszą zaktualizować SandTogether!",
			waiting_world: "Połączono. Czekam na świat hosta — HOST musi kliknąć 'Wyślij świat', potem Ty: menu → Load Game.",
			unsupported: "⚠ Niewspierana wersja gry — gra się zaktualizowała i rozjechała moda. Uruchom install ponownie albo sprawdź update na Warsztacie.",
		},
	};
	const t = (key, ...args) => {
		const v = (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.en[key] || key;
		return typeof v === "function" ? v(...args) : v;
	};

	const ST = (window.SandTogether = {
		version: VER,
		state: null,
		FH: null,
		peers: new Map(),
		net: { role: "idle", transport: null },
		_lastPosSend: 0,
		_hud: null,
		_ghostCanvas: null,
		_debugDumped: false,
		// world sync
		wsx: {
			pending: new Set(),   // host: indeksy chunków do wysłania
			priority: new Set(),  // host: chunki grabber/vacuum — ZAWSZE wysyłane najpierw (omija limit 120 fast-lane)
			sweep: 0,             // host: rolling pełny sweep
			lastBatch: 0,
			busy: false,
			paused: false,        // client: czy sim zapauzowany
			applyCount: 0, applyBytes: 0, statT: 0, statTxt: "",
			mismatchWarned: false,
		},
		// struktury/zasoby/vacuum
		_applyingNet: false,      // tłumik pętli eventów przy aplikowaniu zmian z sieci
		_subscribedState: null,
		_lastSnap: 0,
		_lastRes: 0,
		_lastVac: 0,
		// v0.5: pełny sync
		_pd: 0,                   // flaga: kopanie gracza (patch I)
		_projCtx: 0,              // flaga: update pocisków (patch m)
		_sprayCtx: 0,             // flaga: spray (patch _)
		_lastEnt: 0,              // stream encji 10 Hz
		_lastMyProj: 0,
		remoteProjectiles: [],    // pociski zdalnych graczy (ghost render)
		peerPuppets: new Map(),   // id -> {puppet:PIXI.Container, parent} — prawdziwe sprite'y gracza (dotNine)
		_lastResDelta: 0, _resSnapshot: null, // resDelta (dotNine)
		_moveStash: [],           // structures:removed(byMove) czekające na parę z :moved
		_pickedPending: new Map(),// id itemu -> timestamp (podniesione lokalnie, czekają na potwierdzenie hosta)
		_structApplied: new Map(),// structKey -> timestamp (okres ochronny przed kasowaniem w reconcile)
		_grabbedCells: new Map(), // idx(x+y*W) -> ts: komórki wzięte grabberem lokalnie; blokada ponownego wzięcia zanim host potwierdzi usunięcie (lustro)
		_placedCells: new Map(),  // idx -> ts: komórki ODŁOŻONE grabberem lokalnie; sentinel blokuje ponowne celowanie w tę samą "pustą" komórkę przez kolejne sloty tanku (drugi element ginąłby: host createAt no-opuje na zajętej)
		_sndWarned: false,
	});
	ST._sprayFlag = () => { ST._sprayCtx = 1; queueMicrotask(() => { ST._sprayCtx = 0; }); };
	// HEARTBEAT HOSTA (fix G4): gdy host pauzuje (menu), frame:update NIE odpala → cały sync zamiera
	// bez słowa. setInterval to timer JS — działa mimo pauzy sima. Klient dostaje hb i wie, co się dzieje.
	setInterval(() => {
		try {
			if (ST.net.role === "host" && ST.peers.size && ST.state && net) {
				const p = !!(ST.state.session && ST.state.session.paused);
				net.send({ t: "hb", p });
			}
		} catch (e) {}
	}, 1000);

	log("Renderer mod załadowany", VER);

	// ------------------------------------------------------------------
	// Narzędzia
	// ------------------------------------------------------------------
	const b64enc = (bytes) => {
		let bin = "";
		for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
		return btoa(bin);
	};
	const b64dec = (s) => {
		const bin = atob(s);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	};
	async function deflate(u8) {
		const cs = new CompressionStream("deflate-raw");
		const w = cs.writable.getWriter();
		w.write(u8); w.close();
		return new Uint8Array(await new Response(cs.readable).arrayBuffer());
	}
	async function inflate(u8) {
		const ds = new DecompressionStream("deflate-raw");
		const w = ds.writable.getWriter();
		w.write(u8); w.close();
		return new Uint8Array(await new Response(ds.readable).arrayBuffer());
	}
	// dostęp do buforów świata (defensywnie: {data:...} albo goła tablica)
	const arr = (v) => (v && v.data && v.data.buffer ? v.data : v && v.buffer ? v : null);
	function worldBuffers(state) {
		const sh = state.shared || {};
		const map = arr(sh.mapData), wall = arr(sh.wallData), shadow = arr(sh.shadowMap), auth = arr(sh.authorization);
		// sim.cellIds (Uint32 na komórkę) = ODDZIELNA warstwa od mapData; to ją czyta kolizja gracza
		// (FH.player.isPositionClear -> isCellTerrain -> getCellId). Bez jej sync klient WIDZI wykopany
		// teren, ale fizycznie wciąż jest "solidny". Sync = klient może wejść w dziurę. (wkład dotNine)
		const sim = sh.sim && sh.sim.cellIds;
		// elementData.type: mapuje INDEKS elementu → typ. Grabber/vacuum czytają go przez getResolvedTypeFromCellId
		// (cellId→index→type). Lustro synchronizuje cellIds ale NIE elementData → klient nie rozpoznaje elementów
		// (grabber nie bierze). Sync tej warstwy (v4) naprawia grabbera. index = cellId - ELEMENTS_MIN.
		const etype = (sh.sim && sh.sim.elementData && sh.sim.elementData.type) || null;
		const W = (sh.mapData && sh.mapData.width) || (state.store.world && state.store.world.size && state.store.world.size.width) || 0;
		const H = (sh.mapData && sh.mapData.height) || (state.store.world && state.store.world.size && state.store.world.size.height) || (map && W ? map.length / 4 / W : 0);
		return { map, wall, shadow, auth, sim, etype, W, H };
	}
	const ELEMENTS_MIN = 1000001, ELEMENTS_MAX = 2000000; // zakres cellId dla elementów (Lk.ELEMENTS w buildzie 0.5.4)
	// Prawidłowy typ elementu do sieci: liczba całkowita > 0. Odsiewa null/undefined/0 (pusty slot tanku,
	// T[o+2] hors-bornes u zdesynchronizowanego klienta) — inaczej host robi createAt(...,undefined) i się wywala.
	const validElement = (v) => Number.isInteger(v) && v > 0;
	// PER-GRACZ PERSYSTENCJA (G7-lite): join resetował klienta do gracza z save'a HOSTA (pozycja,
	// ekwipunek). Profil klienta zapisujemy per świat-hosta (localStorage, klucz = zaufany wid)
	// i przywracamy po starcie lustra. Zasoby/upgrade'y są wspólne (drużynowe) — te nie wymagają profilu.
	function profileSave(state) {
		try {
			if (!isClientSync() || !ST.wsx.paused || !ST._trustedWid) return;
			const p = state.store.player;
			if (!p || typeof p.x !== "number") return;
			const prof = { x: p.x, y: p.y, t: Date.now() };
			try { if (Array.isArray(p.inventory)) prof.inv = JSON.parse(JSON.stringify(p.inventory)); } catch (e) {}
			localStorage.setItem("st_prof_" + ST._trustedWid, JSON.stringify(prof));
		} catch (e) {}
	}
	function profileRestore(state, wid) {
		try {
			const raw = localStorage.getItem("st_prof_" + wid);
			if (!raw) return;
			const prof = JSON.parse(raw);
			const p = state.store.player;
			if (!p) return;
			if (typeof prof.x === "number" && typeof prof.y === "number") {
				p.x = prof.x; p.y = prof.y;
				if (p.velocity) { p.velocity.x = 0; p.velocity.y = 0; }
				const pp = arr(state.shared.playerPos); if (pp && pp.length >= 2) { pp[0] = prof.x; pp[1] = prof.y; }
			}
			// ekwipunek: przywracamy tylko gdy struktura wygląda zdrowo (plain items z id)
			if (Array.isArray(prof.inv) && Array.isArray(p.inventory) && prof.inv.every((i) => i && typeof i === "object")) {
				try { p.inventory.length = 0; for (const it of prof.inv) p.inventory.push(it); } catch (e) {}
			}
			log("Profil klienta przywrócony dla świata", wid, "(pozycja " + Math.round(prof.x) + "," + Math.round(prof.y) + (prof.inv ? " + ekwipunek)" : ")"));
		} catch (e) {}
	}

	// Grabber (klient): wyzeruj cellId komórki lokalnie i zapamiętaj ją, żeby grabber nie wziął jej ponownie
	// zanim host potwierdzi usunięcie przez lustro. Wołane tylko po stronie klienta (renderujący lustro).
	function grabClearLocal(state, x, y) {
		try {
			const { sim, W, H } = worldBuffers(state);
			if (!sim || !W || x < 0 || y < 0 || x >= W || y >= H) return;
			const idx = x + y * W;
			const sim32 = new Uint32Array(sim.buffer, sim.byteOffset, W * H);
			const cid = sim32[idx]; // cellId zgrabowanego elementu — do rozróżnienia "ten sam" vs "nowy element wpadł"
			sim32[idx] = 0;
			ST._placedCells.delete(idx); // GRAB kasuje ewentualny sentinel PLACE tej samej komórki (inaczej mapy się biją → blokada re-grab)
			ST._grabbedCells.set(idx, { ts: performance.now(), cid });
			if ((ST._grabDiag = (ST._grabDiag || 0) + 1) <= 60) log("GRAB pick @", x, y, "(cellId->0, forward)");
		} catch (e) {}
	}
	// Grabber PLACE (klient): wpisz sentinel (niezerowy cellId) do komórki, w którą odłożyliśmy element —
	// pętla odkładania czyta LOKALNE cellIds i "wciąż pustą" komórkę (lag lustra) celowałaby ponownie
	// kolejnym slotem tanku; host createAt no-opuje na zajętej → drugi element by przepadł.
	// cellIds NIE sterują renderem (mapData) — sentinel wpływa tylko na logikę; lustro nadpisze go prawdziwym id.
	const GRAB_SENTINEL = 1;
	function grabSetLocal(state, x, y) {
		try {
			const { sim, W, H } = worldBuffers(state);
			if (!sim || !W || x < 0 || y < 0 || x >= W || y >= H) return;
			const idx = x + y * W;
			new Uint32Array(sim.buffer, sim.byteOffset, W * H)[idx] = GRAB_SENTINEL;
			ST._grabbedCells.delete(idx); // PLACE kasuje ewentualny znacznik GRAB tej samej komórki
			ST._placedCells.set(idx, performance.now());
			if ((ST._grabDiag = (ST._grabDiag || 0) + 1) <= 60) log("GRAB place @", x, y, "(sentinel, forward)");
		} catch (e) {}
	}
	// Adaptacyjny okres ochronny lustra: 3×RTT+300ms (min 1200, max 3000) — przy pingu 300ms+
	// stały 600ms był krótszy niż runda act→host→chunk i bug duplikatów wracał pod lagiem.
	function grabGraceMs() {
		let ping = 0;
		for (const p of ST.peers.values()) if (p.ping != null) { ping = p.ping; break; } // klient ma 1 peera (host)
		return Math.min(3000, Math.max(1200, 3 * ping + 300));
	}
	// preferredNs: niektóre nazwy istnieją w KILKU namespace'ach FH i NIE są tym samym.
	// Potwierdzone (dotNine): FH.world.excavate "wygląda dobrze, ale nic nie robi", a
	// FH.patterns.excavate (woła prawdziwe DN) faktycznie kopie. Dlatego preferredNs sprawdzamy PIERWSZY.
	function findApi(fnName, preferredNs) {
		const FH = ST.FH;
		if (!FH) return null;
		// preferredNs: string lub tablica (nazwy różnią się między buildami: 0.5.3=patterns, obecny=excavation)
		const prefs = Array.isArray(preferredNs) ? preferredNs : (preferredNs ? [preferredNs] : []);
		for (const ns of prefs) if (FH[ns] && typeof FH[ns][fnName] === "function") return FH[ns][fnName].bind(FH[ns]);
		for (const ns of Object.keys(FH)) {
			try {
				if (FH[ns] && typeof FH[ns][fnName] === "function") return FH[ns][fnName].bind(FH[ns]);
				// jeden poziom głębiej (np. FH.world.patterns.excavate)
				if (FH[ns] && typeof FH[ns] === "object") for (const sub of Object.keys(FH[ns])) {
					if (FH[ns][sub] && typeof FH[ns][sub][fnName] === "function") return FH[ns][sub][fnName].bind(FH[ns][sub]);
				}
			} catch (e) {}
		}
		return null;
	}
	function managerWorker(state) {
		try { return state.environment.multithreading.simulation.manager; } catch (e) { return null; }
	}

	// ------------------------------------------------------------------
	// Sieć
	// ------------------------------------------------------------------
	const net = window.sandtogetherNet;
	if (!net) log("UWAGA: brak window.sandtogetherNet — preload niezaktualizowany?");

	const setStatus = (text, color) => {
		if (ST._hud) { const el = ST._hud.querySelector("#st-status"); el.textContent = text; el.style.color = color || "#8f8"; }
	};
	const setSyncInfo = (text) => {
		if (ST._hud) ST._hud.querySelector("#st-sync").textContent = text;
	};
	// czat: dopisz linię (max 5 widocznych), tekst przez textContent (zero HTML injection)
	const addChat = (nick, text) => {
		try {
			if (!ST._hud) return;
			const lg = ST._hud.querySelector("#st-chat-log");
			if (!lg) return;
			const line = document.createElement("div");
			const b = document.createElement("b"); b.textContent = nick + ": "; b.style.color = "#7af";
			line.appendChild(b); line.appendChild(document.createTextNode(text));
			lg.appendChild(line);
			while (lg.children.length > 5) lg.removeChild(lg.firstChild);
		} catch (e) {}
	};

	const isClientSync = () => ST.net.role === "client" && ST.state;
	const isHostSync = () => ST.net.role === "host" && ST.state && ST.peers.size > 0;

	if (net) {
		net.onEvent((ev) => {
			log("net event:", ev.kind, JSON.stringify(ev).slice(0, 150));
			if (ev.kind === "hosting") {
				ST.net.role = "host"; ST.net.transport = ev.transport;
				setStatus(ev.transport === "steam" ? t("hosting_steam") : t("hosting_lan", ev.port));
				ST.net.lobbyId = ev.lobbyId || null; ST._autoSentWid = null; // reset auto-send; zapamiętaj lobbyId
					updateLobbyIdDisplay();
					if (ev.transport === "steam") showInviteButton(true);
			} else if (ev.kind === "joined") {
				ST.net.role = "client"; ST.net.transport = ev.transport;
				ST.wsx.everApplied = false; ST.wsx.mismatchLogged = false; // nowa sesja klienta
				ST._trustedWid = null; ST._pendingTrustUntil = 0;
				ST._gotHostWorld = false; // KRYTYCZNE: zaufanie do świata NIE przenosi się między sesjami (inny host = inny świat; bez resetu lustro nadpisałoby zły świat)
				ST._fireQ = []; ST._cryoQ = []; ST._grabbedCells.clear(); ST._placedCells.clear(); ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = []; // stan z poprzedniej sesji = inne współrzędne/świat
				setStatus(t("joined", ev.transport));
			} else if (ev.kind === "peer-hello" || ev.kind === "peer-connected") {
				if (!ST.peers.has(ev.id)) ST.peers.set(ev.id, { nick: ev.nick || "?", x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() });
				if (ev.nick) ST.peers.get(ev.id).nick = ev.nick;
				setStatus(t("players", ST.peers.size + 1));
				if (ST.net.role === "host") {
					enqueueFullWorld(); // nowy gracz -> pełny świat (mirror)
					// jeśli host jest już w świecie — wyślij save automatycznie (bez ręcznego "Wyślij świat")
					const hostInWorld = ST.state && ST.state.store && ST.state.store.scene && ST.state.store.scene.active !== 1;
					if (hostInWorld) sendWorld();
				}
			} else if (ev.kind === "peer-disconnected") {
				if (ST.state) profileSave(ST.state); // utrwal profil PRZED ewentualną zmianą stanu (G7-lite)
				ST.peers.delete(ev.id); removePeerPuppet(ev.id);
				setStatus(t("player_left", ST.peers.size + 1), "#fa5");
				// KLIENT ZOSTAJE ZAPAUZOWANY — ciche odpauzowanie tworzyło rozwidlony świat (gracz "grał dalej"
				// lokalnie nie wiedząc, że wszystko przepadnie przy ponownym joinie). Chcesz grać solo → Stop.
			} else if (ev.kind === "stopped") {
				if (ST.state) profileSave(ST.state); // przed resetem roli (isClientSync jeszcze true)
				ST.net.role = "idle"; ST.peers.clear(); removeAllPeerPuppets(); setStatus(t("offline"), "#aaa"); showInviteButton(false); ST.net.lobbyId = null; updateLobbyIdDisplay(); updatePingDisplay();
				ST._fireQ = []; ST._cryoQ = []; ST._grabbedCells.clear(); ST._placedCells.clear(); ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = [];
				ST._gotHostWorld = false;
				setClientPaused(false);
			} else if (ev.kind === "reconnecting") { setStatus(t("reconnecting", ev.attempt), "#fd5");
			} else if (ev.kind === "version-mismatch") setStatus(t("ver_mismatch"), "#f66");
			else if (ev.kind === "error") setStatus(t("error", ev.message), "#f66");
		});
		net.onMsg(({ from, msg }) => handleMsg(from, msg));
		net.status().then((s) => {
			ST.net.role = s.role; ST.net.transport = s.transport;
			ST._gameFp = s.gameFp || null; // odcisk buildu gry (guard różnych buildów między graczami)
			for (const p of s.peers) ST.peers.set(p.id, { nick: p.nick, x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() });
			if (s.role === "host") setStatus("HOST (" + s.transport + ") — gracze: " + (s.peers.length + 1));
			else if (s.role === "client") setStatus("POŁĄCZONO — gracze: " + (s.peers.length + 1));
		}).catch(() => {});
	}

	function handleMsg(from, msg) {
		if (msg.t === "relay") { handleMsg(msg.from, msg.msg); return; }
		if (msg.t === "ping") { try { net.send({ t: "pong", ts: msg.ts }, from); } catch (e) {} return; }
		if (msg.t === "pong") {
			const p = ST.peers.get(from);
			if (p && typeof msg.ts === "number") { const rtt = performance.now() - msg.ts; p.ping = p.ping != null ? Math.round(p.ping * 0.7 + rtt * 0.3) : Math.round(rtt); }
			return;
		}
		if (msg.t === "pos") {
			let p = ST.peers.get(from);
			const now0 = performance.now();
			if (!p) { p = { nick: "?", x: msg.x, y: msg.y, tx: msg.x, ty: msg.y, vx: 0, vy: 0, tUpdate: now0, lastSeen: 0 }; ST.peers.set(from, p); }
			if (!p._gotPos) { p._gotPos = true; log("pierwsza pozycja od", from, "->", msg.x, msg.y); }
			// prędkość z RZECZYWISTEGO dt (przy dużej przerwie zakładamy 0, żeby dead-reckoning nie "wystrzelił" gracza) (dotNine)
			const rawDt = now0 - (p.tUpdate || now0);
			if (rawDt < 1 || rawDt > 1500) { p.vx = 0; p.vy = 0; }
			else { p.vx = (msg.x - p.tx) / rawDt; p.vy = (msg.y - p.ty) / rawDt; const vm = Math.hypot(p.vx, p.vy); if (vm > 3) { const s = 3 / vm; p.vx *= s; p.vy *= s; } }
			p.tx = msg.x; p.ty = msg.y; p.tUpdate = now0; p.lastSeen = now0;
			p.tools = msg.tools || [];
			if (msg.facing === 1 || msg.facing === -1) p.syncedFacing = msg.facing;
			p.aim = typeof msg.aim === "number" ? msg.aim : 0;
			p.trailAlpha = typeof msg.trail === "number" ? msg.trail : 0;
			// preview akcji (fantom pozy / reticle grabbera) — kursor w świecie + intencja budowy
			p.mwx = typeof msg.mwx === "number" ? msg.mwx : null;
			p.mwy = typeof msg.mwy === "number" ? msg.mwy : null;
			p.bt = msg.bt != null ? msg.bt : null;
			p.boffs = Array.isArray(msg.boffs) ? msg.boffs : null;
			if (p.x === 0 && p.y === 0) { p.x = msg.x; p.y = msg.y; }
		} else if (msg.t === "hello") {
			const p = ST.peers.get(from) || { x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() };
			p.nick = msg.nick || "?";
			ST.peers.set(from, p);
			setStatus(t("players", ST.peers.size + 1));
			try { net.send({ t: "mver", v: VER, gf: ST._gameFp || null }, from); } catch (e) {} // wersja MODA + odcisk buildu GRY
			// stary mod (≤0.9.7) nie zna mver i nie odpowie — po 5s bez odpowiedzi ALARM (przypadek "ziomek na 0.9.0")
			setTimeout(() => {
				const pp = ST.peers.get(from);
				if (pp && !pp.modVer) {
					setStatus(t("ver_mismatch") + " [" + (pp.nick || from) + ": OLD mod (<= 0.9.7)! / you: " + VER + "]", "#f66");
					log("PEER NA STARYM MODZIE (brak odpowiedzi mver):", pp.nick || from, "— musi zrobić install.bat!");
				}
			}, 5000);
			if (ST.net.role === "host") enqueueFullWorld();
		} else if (msg.t === "mver") {
			const p = ST.peers.get(from); if (p) p.modVer = msg.v;
			if (msg.v !== VER) {
				setStatus(t("ver_mismatch") + " [" + ((p && p.nick) || from) + ": " + msg.v + " / you: " + VER + "]", "#f66");
				log("RÓŻNE WERSJE MODA:", from, "ma", msg.v, "— ja mam", VER);
			} else log("wersja moda OK u", (p && p.nick) || from, "->", msg.v);
			// odcisk buildu GRY (guard R3): różne buildy = różne enumy elementów/kotwice → ostrzeż zamiast cichej korupcji
			if (msg.gf && ST._gameFp && msg.gf !== ST._gameFp) {
				setStatus("⚠ DIFFERENT GAME BUILDS! [" + ((p && p.nick) || from) + "] — update the game on both sides", "#f66");
				log("RÓŻNE BUILDY GRY:", from, "ma", msg.gf, "— ja mam", ST._gameFp);
			}
		} else if (msg.t === "wi") {
			if (ST.net.role === "client" && ST.state && ST.wsx.paused) { ST._applyingNet = true; try { applyWorldItems(ST.state, msg.wi); } finally { ST._applyingNet = false; } }
		} else if (msg.t === "chat") {
			const nick = (ST.peers.get(from) && ST.peers.get(from).nick) || "?";
			addChat(nick, String(msg.m || "").slice(0, 200));
		} else if (msg.t === "hb") {
			// heartbeat hosta (fix G4): jedyny sygnał, który przechodzi gdy host pauzuje (frame stoi)
			if (ST.net.role === "client") {
				ST._lastHb = performance.now();
				if (msg.p && !ST._hostPausedShown) { ST._hostPausedShown = true; setStatus(t("host_paused"), "#fd5"); }
				else if (!msg.p && ST._hostPausedShown) { ST._hostPausedShown = false; setStatus(t("players", ST.peers.size + 1)); }
			}
		} else if (msg.t === "wc") {
			applyWorldBatch(msg).catch((e) => log("apply error:", e.message));
		} else if (msg.t === "act") {
			if (ST.net.role === "host") replayAction(msg, from);
		} else if (msg.t === "st") {
			if (ST.net.role === "client") applyNetStructs(msg);
		} else if (msg.t === "snap") {
			if (ST.net.role === "client") applySnapshot(msg).catch((e) => log("snap error:", e.message));
		} else if (msg.t === "res") {
			if (ST.net.role === "client") applyResources(msg);
		} else if (msg.t === "resDelta") {
			if (ST.net.role === "host") applyResourceDelta(msg);
		} else if (msg.t === "ent") {
			if (ST.net.role === "client") applyEntities(msg);
		} else if (msg.t === "myproj") {
			const p = ST.peers.get(from);
			if (p) p.projectiles = msg.list || [];
		} else if (msg.t === "snd") {
			playRemoteSound(msg);
		} else if (msg.t === "vacres") {
			if (ST.net.role === "client") clientFillTanks(msg.types || []);
		} else if (msg.t === "grabres") {
			if (ST.net.role === "client") clientFillGrabTank(msg.types || [], msg.offs || null);
		} else if (msg.t === "resync") {
			if (ST.net.role === "host") { enqueueFullWorld(); ST._lastSnap = 0; }
		} else if (msg.t === "world-begin") {
			ST._gotHostWorld = true; // otrzymaliśmy świat OD hosta → ufamy jego worldId gdy oboje w grze (patrz applyWorldBatch)
			ST._worldRx = { name: msg.name, total: msg.chunks, parts: new Array(msg.chunks), got: 0, from, done: false, ended: false };
			setStatus(t("receiving", 0, msg.chunks), "#ff5");
			scheduleRxCheck();
		} else if (msg.t === "world-chunk" && ST._worldRx) {
			if (ST._worldRx.parts[msg.i] === undefined) { ST._worldRx.parts[msg.i] = msg.data; ST._worldRx.got++; }
			if (ST._worldRx.got % 20 === 0 || ST._worldRx.got === ST._worldRx.total)
				setStatus(t("receiving", ST._worldRx.got, ST._worldRx.total), "#ff5");
			maybeFinishRx();
		} else if (msg.t === "world-end" && ST._worldRx) {
			ST._worldRx.ended = true;
			maybeFinishRx();
		} else if (msg.t === "world-need") {
			// host: klient prosi o brakujące kawałki -> ponów je (priorytetowo)
			if (ST._wtx && Array.isArray(msg.idx)) for (const i of msg.idx) if (ST._wtx.parts[i] !== undefined) ST._wtx.queue.push(i);
			pumpWtx();
		}
	}

	function missingRxIndices() {
		const rx = ST._worldRx; if (!rx) return [];
		const miss = [];
		for (let i = 0; i < rx.total; i++) if (rx.parts[i] === undefined) miss.push(i);
		return miss;
	}
	function maybeFinishRx() {
		const rx = ST._worldRx; if (!rx || rx.done) return;
		if (rx.got < rx.total) return;
		rx.done = true; ST._worldRx = null;
		if (ST._rxTimer) { clearTimeout(ST._rxTimer); ST._rxTimer = null; }
		try {
			const bytes = b64dec(rx.parts.join(""));
			window.electron.importSave(bytes).then(async (r) => {
				if (r && r.success === false) { setStatus(t("import_err", r.error), "#f66"); return; }
				log("World import OK:", rx.name, bytes.length, "bytes");
				// Auto-load: jeśli FH.game.load istnieje, wskocz prosto do gry (bez ręcznego Load Game). (wkład dotNine)
				const saveId = r && r.metaData && r.metaData.id;
				if (saveId && ST.FH && ST.FH.game && typeof ST.FH.game.load === "function" && ST.state) {
					try {
						const lr = await ST.FH.game.load(ST.state, saveId);
						if (lr && lr.success === false) throw new Error(lr.error || "load success:false");
						// silnik może nadać wczytanemu światu NOWY lokalny worldId mimo identycznej treści —
						// okno zaufania, żeby kolejne "wc" (mirror) nie były odrzucane jako "inny świat"
						ST._pendingTrustUntil = performance.now() + 15000;
						setStatus(t("world_imported_loaded", rx.name), "#5f5");
						return;
					} catch (e) { log("auto-load nie powiódł się, fallback na ręczne Load Game:", e.message); }
				}
				setStatus(t("world_imported", rx.name), "#5f5");
			}).catch((e) => setStatus(t("import_err", e.message), "#f66"));
		} catch (e) { setStatus(t("decode_err", e.message), "#f66"); }
	}
	// co 700 ms: jeśli brakuje kawałków, poproś hosta o nie ponownie (odzyskiwanie po Steam P2P)
	function scheduleRxCheck() {
		if (ST._rxTimer) clearTimeout(ST._rxTimer);
		ST._rxTimer = setTimeout(() => {
			const rx = ST._worldRx;
			if (!rx || rx.done) return;
			const miss = missingRxIndices();
			if (miss.length) {
				net.send({ t: "world-need", idx: miss.slice(0, 200) }, rx.from);
				setStatus(t("receiving", rx.got, rx.total) + " (recovering " + miss.length + ")", "#ff5");
			}
			scheduleRxCheck();
		}, 700);
	}

	// ------------------------------------------------------------------
	// WORLD SYNC — HOST: strumień lustrzany dirty chunków
	// ------------------------------------------------------------------
	function chunkDims(W, H) { return { cx: Math.ceil(W / CHUNK), cy: Math.ceil(H / CHUNK) }; }

	// HOST: oznacz chunk komórki (x,y) jako "brudny" do wysyłki lustrem. KLUCZOWE dla grabbera/vacuum:
	// FH.elements.createAt/removeAt z moda NIE zawsze ustawia chunkShouldUpdate → miroir pomija chunk →
	// klient nigdy nie dostaje odłożonego elementu (aż host znów ruszy tę strefę). Wymuszamy wysyłkę tu.
	function markCellDirty(state, x, y) {
		try {
			if (ST.net.role !== "host") return;
			const { W, H } = worldBuffers(state);
			if (!W || x < 0 || y < 0 || x >= W || y >= H) return;
			const d = chunkDims(W, H);
			const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { // + sąsiedzi (element może wpłynąć na krawędź)
				const nx = cx + dx, ny = cy + dy;
				if (nx >= 0 && ny >= 0 && nx < d.cx && ny < d.cy) { const ci = nx + ny * d.cx; ST.wsx.pending.add(ci); ST.wsx.priority.add(ci); } // priorytet: dostawa natychmiastowa (re-grab)
			}
		} catch (e) {}
	}

	function enqueueFullWorld() {
		if (!ST.state) return;
		const { W, H } = worldBuffers(ST.state);
		if (!W) return;
		const d = chunkDims(W, H);
		for (let i = 0; i < d.cx * d.cy; i++) ST.wsx.pending.add(i);
		if (ST.wsx.rowH) ST.wsx.rowH.clear(); // pełny re-send: row-delta nie może pomijać "niezmienionych" wierszy (nowy klient ich nie ma)
		log("Pełny świat zakolejkowany:", d.cx * d.cy, "chunków");
	}

	function scanDirty(state) {
		try {
			const flags = state.shared.sim && state.shared.sim.chunkShouldUpdate;
			if (!flags) return;
			for (let i = 0; i < flags.length; i++) if (flags[i]) ST.wsx.pending.add(i);
		} catch (e) {}
	}

	async function maybeSendBatch(state) {
		const w = ST.wsx;
		const now = performance.now();
		if (w.busy || now - w.lastBatch < 100) return;
		const { map, wall, shadow, auth, sim, etype, W, H } = worldBuffers(state);
		if (!map || !W) return;
		const cellIds32 = sim ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null; // do odczytu typu elementu per komórka (v4)
		const d = chunkDims(W, H);
		const total = d.cx * d.cy;
		// rolling sweep — samonaprawa przeoczonych chunków (4 na batch)
		for (let k = 0; k < 4; k++) { w.pending.add(w.sweep % total); w.sweep++; }
		if (!w.pending.size) return;
		w.busy = true; w.lastBatch = now;
		try {
			// DWA PASMA (fix "kolejka 8600, klient widzi świat sprzed 20s" — wielka mapa brudzi się szybciej
			// niż stary limit 40/batch, a sort po odległości GŁODZIŁ dalekie chunki w nieskończoność):
			// fast lane = WSZYSTKIE brudne w promieniu FAST_R od dowolnego gracza (to widzą gracze — zawsze świeże),
			// slow lane = stała porcja najstarszych z reszty (Set iteruje w kolejności wstawienia → FIFO, zero głodzenia).
			const anchors = [{ x: state.store.player.x / 4, y: state.store.player.y / 4 }];
			for (const p of ST.peers.values()) anchors.push({ x: p.tx / 4, y: p.ty / 4 });
			const FAST_R = 24 * CHUNK; // ~2 ekrany wokół gracza (Manhattan, w komórkach)
			const near = [], far = [];
			for (const a of w.pending) {
				const ax = (a % d.cx) * CHUNK, ay = Math.floor(a / d.cx) * CHUNK;
				let dm = 1e9;
				for (const an of anchors) { const dd = Math.abs(ax - an.x) + Math.abs(ay - an.y); if (dd < dm) dm = dd; }
				if (dm <= FAST_R) { if (near.length < 120) near.push(a); }
				else far.push(a);
			}
			const slowN = w.pending.size > 3000 ? 40 : 20;
			// PRIORYTET najpierw (grabber/vacuum) — ZAWSZE wysyłane, omijają limit near/far (fix "re-grab: miroir ne livre pas").
			const prio = w.priority.size ? [...w.priority] : [];
			w.priority.clear();
			const take = prio.concat(near.filter((i) => !prio.includes(i)), far.slice(0, slowN).filter((i) => !prio.includes(i)));
			for (const i of take) w.pending.delete(i);
			// serializacja v4: [u16 cx][u16 cy][u8 cw][u8 ch] + per-komórka: 4 map + 1 wall + 1 shadow + 1 auth + 4 cellIds + 1 elemType = 12 B
			const parts = [];
			let size = 0;
			let fogSkipped = 0;
			for (const idx of take) {
				const ccx = idx % d.cx, ccy = Math.floor(idx / d.cx);
				const x0 = ccx * CHUNK, y0 = ccy * CHUNK;
				const cw = Math.min(CHUNK, W - x0), ch = Math.min(CHUNK, H - y0);
				if (cw <= 0 || ch <= 0) continue;
				// FOG-SKIP (optymalizacja dołączania): chunk CAŁKOWICIE nieodkryty (shadow=255 wszędzie)
				// jest u klienta czarny — nie wysyłamy. Po odkryciu shadow się zmienia → chunk brudny → poleci.
				// (initial fill: z 9216 chunków realnie idzie tylko odkryta część mapy — dołączanie 2-4x szybciej)
				if (shadow) {
					let fogged = true;
					for (let r = 0; r < ch && fogged; r++) {
						const src = (y0 + r) * W + x0;
						for (let c = 0; c < cw; c++) if (shadow[src + c] !== 255) { fogged = false; break; }
					}
					if (fogged) { fogSkipped++; continue; }
				}
				// ROW-DELTA v5: hash per WIERSZ (12*cw bajtów przez 6 warstw); wysyłamy tylko zmienione wiersze.
				// Poziomy ruch (woda w kanale, taśmy) = 1-3 wiersze zamiast całych 40 → 2-10x mniej pasma.
				// Pamięć: 9216 chunków × 40 × 4B ≈ 1,5 MB. Pełny re-send = rowH.clear() w enqueueFullWorld.
				if (!w.rowH) w.rowH = new Map();
				let rh = w.rowH.get(idx);
				if (!rh || rh.length < ch) { rh = new Uint32Array(CHUNK); rh.fill(0); w.rowH.set(idx, rh); }
				const etRows = new Uint8Array(cw * ch); // warstwa typu elementu liczona raz (hash + zapis)
				if (cellIds32 && etype) {
					for (let r = 0; r < ch; r++) for (let cc = 0; cc < cw; cc++) {
						const cid = cellIds32[(y0 + r) * W + x0 + cc];
						etRows[r * cw + cc] = (cid >= ELEMENTS_MIN && cid <= ELEMENTS_MAX) ? (etype[cid - ELEMENTS_MIN] || 0) & 0xff : 0;
					}
				}
				const fnvRow = (r) => {
					let h = 0x811c9dc5;
					const m0 = ((y0 + r) * W + x0) * 4, s0 = (y0 + r) * W + x0;
					for (let i = 0; i < cw * 4; i++) { h ^= map[m0 + i]; h = (h * 0x01000193) >>> 0; }
					for (let i = 0; i < cw; i++) { h ^= wall[s0 + i]; h = (h * 0x01000193) >>> 0; }
					if (shadow) for (let i = 0; i < cw; i++) { h ^= shadow[s0 + i]; h = (h * 0x01000193) >>> 0; }
					if (auth) for (let i = 0; i < cw; i++) { h ^= auth[s0 + i]; h = (h * 0x01000193) >>> 0; }
					if (sim) { const sb = new Uint8Array(sim.buffer, sim.byteOffset + s0 * 4, cw * 4); for (let i = 0; i < cw * 4; i++) { h ^= sb[i]; h = (h * 0x01000193) >>> 0; } }
					for (let i = 0; i < cw; i++) { h ^= etRows[r * cw + i]; h = (h * 0x01000193) >>> 0; }
					return h === 0 ? 1 : h; // 0 zarezerwowane = "nigdy nie wysłany"
				};
				const mask = new Uint8Array(5); // 40 bitów
				const rows = [];
				for (let r = 0; r < ch; r++) {
					const h = fnvRow(r);
					if (rh[r] !== h) { rh[r] = h; mask[r >> 3] |= 1 << (r & 7); rows.push(r); }
				}
				if (!rows.length) continue; // nic się nie zmieniło w chunku
				const buf = new Uint8Array(11 + rows.length * cw * 12);
				const dv = new DataView(buf.buffer);
				dv.setUint16(0, ccx, true); dv.setUint16(2, ccy, true);
				buf[4] = cw; buf[5] = ch;
				buf.set(mask, 6);
				let o = 11;
				for (const r of rows) { const src = ((y0 + r) * W + x0) * 4; buf.set(map.subarray(src, src + cw * 4), o); o += cw * 4; }
				for (const r of rows) { const src = (y0 + r) * W + x0; buf.set(wall.subarray(src, src + cw), o); o += cw; }
				for (const r of rows) { const src = (y0 + r) * W + x0; if (shadow) buf.set(shadow.subarray(src, src + cw), o); o += cw; }
				for (const r of rows) { const src = (y0 + r) * W + x0; if (auth) buf.set(auth.subarray(src, src + cw), o); o += cw; }
				for (const r of rows) { const src = (y0 + r) * W + x0; if (sim) buf.set(new Uint8Array(sim.buffer, sim.byteOffset + src * 4, cw * 4), o); o += cw * 4; }
				for (const r of rows) { buf.set(etRows.subarray(r * cw, r * cw + cw), o); o += cw; }
				parts.push(buf); size += buf.length;
			}
			if (!parts.length) { w.busy = false; return; }
			const all = new Uint8Array(size);
			let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
			const packed = await deflate(all);
			net.send({ t: "wc", v: 5, wid: state.store.meta && state.store.meta.worldId, scene: state.store.scene && state.store.scene.active, W, H, n: parts.length, d: b64enc(packed) });
			// statystyki
			w.applyBytes += packed.length; w.applyCount += parts.length;
			w.fogSkipped = (w.fogSkipped || 0) + fogSkipped;
			if (now - w.statT > 2000) {
				const info = t("sync_up", Math.round(w.applyBytes / 2048), Math.round(w.applyCount / 2), w.pending.size);
				setSyncInfo(info);
				log("SYNC-HOST", info, w.fogSkipped ? "(fog-skip: " + w.fogSkipped + ")" : "");
				w.applyBytes = 0; w.applyCount = 0; w.statT = now; w.fogSkipped = 0;
			}
		} catch (e) { log("batch error:", e.message); }
		w.busy = false;
	}

	// ------------------------------------------------------------------
	// WORLD SYNC — KLIENT: aplikacja batchy + pauza symulacji
	// ------------------------------------------------------------------
	function setClientPaused(paused) {
		if (!ST.state || ST.wsx.paused === paused) return;
		const mgr = managerWorker(ST.state);
		if (!mgr) { log("BŁĄD: brak manager workera do pauzy"); return; }
		mgr.postMessage([54, paused]); // SetPaused — tylko manager; session.paused zostaje false => render działa
		ST.wsx.paused = paused;
		log("Symulacja klienta:", paused ? "ZAPAUZOWANA (lustro hosta)" : "wznowiona");
	}

	async function applyWorldBatch(msg) {
		if (ST.net.role !== "client" || !ST.state) return;
		const state = ST.state;
		const myWid = state.store.meta && state.store.meta.worldId;
		const myScene = state.store.scene && state.store.scene.active;
		// wyjątek: oba w menu (scene 1) = tryb testowy lustra, mimo różnych worldId
		const menuTest = msg.scene === 1 && myScene === 1;
		// KLIENT W MENU (fix tony: "menu główne zamienia się w czerwone bloki"): lustro hosta NIE MOŻE
		// malować po scenie menu — dane świata lądowały w buforach sceny menu jako czerwone kafle.
		if (myScene === 1 && !menuTest) return;
		if (msg.wid && myWid && msg.wid !== myWid && !menuTest) {
			// Zaufanie: silnik nadaje wczytanemu światu INNY lokalny worldId niż host używa w "wc", mimo że to
			// DOKŁADNIE ten sam save (fix "REJECT world" → miroir rejeté → reconcile kasował struktury klienta).
			// Ufamy gdy: (a) już zaufany, (b) okno po auto-load, LUB (c) dostaliśmy świat OD tego hosta (world-begin)
			// i OBOJE jesteśmy w grze (scene≠1) — czyli klient faktycznie wczytał save hosta (auto- lub ręcznie).
			const bothInWorld = msg.scene !== 1 && myScene !== 1;
			// ZAUFANIE SPAROWANE (fix tony: "wczytanie innego świata dodaje go jako czerwone bloki"):
			// zaufanie wiąże wid HOSTA z widem ŚWIATA KLIENTA w momencie zaufania (_trustedMyWid).
			// Klient wczytuje INNY świat → para nie pasuje → REJECT (lustro nie maluje po cudzym save'ie).
			// _gotHostWorld jest JEDNORAZOWE (konsumowane przy pierwszej akceptacji).
			const trusting = (ST._trustedWid === msg.wid && ST._trustedMyWid === myWid)
				|| (ST._pendingTrustUntil && performance.now() < ST._pendingTrustUntil)
				|| (ST._gotHostWorld && bothInWorld)
				|| (ST._lastGoodWid === msg.wid && ST._lastGoodMyWid === myWid && bothInWorld);
			if (!trusting) {
				setStatus(t("other_world"), "#f66");
				if (!ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = true; log("REJECT world: worldId host=" + msg.wid + " me=" + myWid + " scene h/c=" + msg.scene + "/" + myScene); }
				return;
			}
			if (ST._trustedWid !== msg.wid) log("worldId różni się po auto-load, ale ufam (świeżo odebrany od hosta):", msg.wid);
			ST._trustedWid = msg.wid; ST._trustedMyWid = myWid; ST._pendingTrustUntil = 0;
			ST._gotHostWorld = false; // jednorazowe — od teraz rządzi para (hostWid, myWid)
			ST._lastGoodWid = msg.wid; ST._lastGoodMyWid = myWid; // pamięć przez reconnect (celowo NIE czyszczona przy joined/stopped)
		}
		const { map, wall, shadow, W, H } = worldBuffers(state);
		if (!map || W !== msg.W || H !== msg.H) {
			setStatus(t("dims_differ", W + "x" + H, msg.W + "x" + msg.H), "#f66");
			if (!ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = true; log("REJECT world: dims host=" + msg.W + "x" + msg.H + " me=" + W + "x" + H + " map=" + (!!map)); }
			return;
		}
		if (msg.v !== 5) { setStatus(t("ver_mismatch"), "#f66"); return; } // v5 = row-delta (maska zmienionych wierszy per chunk)
		if (ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = false; log("World MATCH — lustro rusza"); }
		ST.wsx.mismatchWarned = false;
		setClientPaused(true);
		const { auth, sim, etype } = worldBuffers(state);
		const cellIds32 = sim ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null;
		const raw = await inflate(b64dec(msg.d));
		const dv = new DataView(raw.buffer);
		let o = 0, applied = 0;
		while (o + 6 <= raw.length) {
			const ccx = dv.getUint16(o, true), ccy = dv.getUint16(o + 2, true);
			const cw = raw[o + 4], ch = raw[o + 5];
			// v5 ROW-DELTA: 5-bajtowa maska wierszy; w streamie są TYLKO zaznaczone wiersze (reszta bez zmian)
			if (o + 11 > raw.length) break;
			const mask = raw.subarray(o + 6, o + 11);
			o += 11;
			const x0 = ccx * CHUNK, y0 = ccy * CHUNK;
			const rows = [];
			for (let r = 0; r < ch; r++) if (mask[r >> 3] & (1 << (r & 7))) rows.push(r);
			if (o + rows.length * cw * 12 > raw.length) break; // uszkodzony batch
			for (const r of rows) { const dst = ((y0 + r) * W + x0) * 4; map.set(raw.subarray(o, o + cw * 4), dst); o += cw * 4; }
			for (const r of rows) { const dst = (y0 + r) * W + x0; wall.set(raw.subarray(o, o + cw), dst); o += cw; }
			for (const r of rows) { const dst = (y0 + r) * W + x0; if (shadow) shadow.set(raw.subarray(o, o + cw), dst); o += cw; }
			for (const r of rows) { const dst = (y0 + r) * W + x0; if (auth) auth.set(raw.subarray(o, o + cw), dst); o += cw; }
			for (const r of rows) { const dst = (y0 + r) * W + x0; if (sim) new Uint8Array(sim.buffer, sim.byteOffset + dst * 4, cw * 4).set(raw.subarray(o, o + cw * 4)); o += cw * 4; }
			// warstwa typu elementu: wpisz do elementData.type[cellId-MIN] żeby getResolvedTypeFromCellId działało (grabber)
			for (const r of rows) { for (let cc = 0; cc < cw; cc++) { const ty = raw[o++]; if (etype && cellIds32) { const cid = cellIds32[(y0 + r) * W + x0 + cc]; if (cid >= ELEMENTS_MIN && cid <= ELEMENTS_MAX) etype[cid - ELEMENTS_MIN] = ty; } } }
			applied++;
		}
		// Ochrona grabbera: lustro mogło przynieść STARĄ zawartość komórki (host jeszcze nie przetworzył
		// naszego grabPick/grabPlace). PICK: trzymaj 0 aż host potwierdzi usunięcie. PLACE: trzymaj sentinel
		// aż host potwierdzi niezerową zawartość. Grace adaptacyjny do pingu (grabGraceMs).
		if (sim && (ST._grabbedCells.size || ST._placedCells.size)) {
			const tNow = performance.now(), grace = grabGraceMs();
			const sim32 = new Uint32Array(sim.buffer, sim.byteOffset, W * H);
			for (const [idx, o] of ST._grabbedCells) {
				if (tNow - o.ts > grace) { ST._grabbedCells.delete(idx); continue; } // host miał czas — oddaj kontrolę
				const v = sim32[idx];
				// FIX "2-3 puis stop": relâche dès qu'un NOUVEL élément (≠ celui grabbé) apparaît — c'est un élément
				// TOMBÉ d'au-dessus dans la cellule grabbée, il doit être grabbable. Avant: on forçait 0 aveuglément
				// (v!==0 → 0) pendant 1200ms → le tas qui s'effondre était masqué → impossible de grabber la suite.
				if (v !== 0 && v !== o.cid) ST._grabbedCells.delete(idx); // nowy element wpadł → oddaj (grabbable)
				else sim32[idx] = 0; // wciąż stary element (o.cid) albo pusto → trzymaj pusto (anty-duplikat)
			}
			for (const [idx, ts] of ST._placedCells) {
				if (tNow - ts > grace) { if ((ST._grabDiag2 = (ST._grabDiag2 || 0) + 1) <= 60) log("GRAB place TIMEOUT @idx", idx, "po", Math.round(tNow - ts), "ms — miroir n'a jamais confirmé l'élément (tombé/perdu?), cellId lustra=" + sim32[idx]); ST._placedCells.delete(idx); continue; }
				// FIX re-grab: relâcher SEULEMENT si un VRAI élément est arrivé (cellId∈[MIN,MAX]). Avant: sim32!==0
				// relâchait sur notre PROPRE sentinel (=1) → la cellule restait à 1 (pas grabbable) → re-grab impossible.
				if (sim32[idx] >= ELEMENTS_MIN && sim32[idx] <= ELEMENTS_MAX) { if ((ST._grabDiag2 = (ST._grabDiag2 || 0) + 1) <= 60) log("GRAB place CONFIRMÉ @idx", idx, "po", Math.round(tNow - ts), "ms, vrai cellId=" + sim32[idx], "→ re-grab OK"); ST._placedCells.delete(idx); }
				else sim32[idx] = GRAB_SENTINEL; // pas encore de vrai élément (0 ou sentinel) → garde "zajęte"
			}
		}
		const w = ST.wsx;
		if (applied > 0) ST._lastWcT = performance.now(); // do wskaźnika zatoru (sync_stalled)
		if (applied > 0 && !w.everApplied) {
			w.everApplied = true; log("Pierwsze paczki świata zastosowane — lustro działa"); setStatus(t("players", ST.peers.size + 1));
			profileRestore(state, msg.wid || ST._trustedWid); // wróć tam, gdzie skończyłeś w TYM świecie (G7-lite)
		}
		w.applyBytes += msg.d.length * 0.75; w.applyCount += applied;
		const now = performance.now();
		if (now - w.statT > 2000) {
			const info = t("sync_down", Math.round(w.applyBytes / 2048), Math.round(w.applyCount / 2));
			setSyncInfo(info);
			log("SYNC-CLIENT", info);
			w.applyBytes = 0; w.applyCount = 0; w.statT = now;
		}
	}

	// ------------------------------------------------------------------
	// STRUKTURY — replikacja event-driven + okresowe uzgadnianie (snapshot)
	// ------------------------------------------------------------------
	const slimStruct = (s) => ({ type: s.type, x: s.x, y: s.y, data: s.data });
	const structKey = (s) => s.type + "@" + s.x + "," + s.y;
	// KONFIG MASZYN przez klienta (G5b): edycje structure.data w UI maszyn nie mają eventu — wykrywamy
	// je diffem JSON w POBLIŻU gracza (tam się klika; pełny skan tysięcy struktur co klatkę = za drogo).
	const dataSeenSet = (k, d) => { if (!ST._dataSeen) ST._dataSeen = new Map(); try { ST._dataSeen.set(k, JSON.stringify(d == null ? null : d)); } catch (e) {} };
	function scanDataEditsIfDue(state) {
		const now = performance.now();
		if (now - (ST._dataScanT || 0) < 800) return;
		ST._dataScanT = now;
		try {
			if (!ST._dataSeen) return;
			if (!ST._dataEdited) ST._dataEdited = new Map();
			const px = state.store.player.x / 4, py = state.store.player.y / 4, R = 48; // ~ekran wokół gracza (komórki)
			for (const s of state.store.structures || []) {
				if (Math.abs(s.x - px) > R || Math.abs(s.y - py) > R) continue;
				const k = structKey(s);
				const prev = ST._dataSeen.get(k);
				if (prev === undefined) { dataSeenSet(k, s.data); continue; }
				let cur; try { cur = JSON.stringify(s.data == null ? null : s.data); } catch (e) { continue; }
				if (cur !== prev) {
					ST._dataSeen.set(k, cur);
					ST._dataEdited.set(k, now);
					try { net.send({ t: "act", k: "sdata", x: s.x, y: s.y, type: s.type, data: JSON.parse(cur) }); } catch (e) {}
					log("CLIENT config maszyny →", k);
				}
			}
			// higiena okna ochronnego
			for (const [k, ts] of ST._dataEdited) if (now - ts > 10000) ST._dataEdited.delete(k);
		} catch (e) {}
	}

	function subscribeGameEvents(state) {
		if (ST._subscribedState === state || !ST.FH || !ST.FH.events) return;
		ST._subscribedState = state;
		try {
			// KLIENT: stawianie przechwytujemy patchem bundle (_place) — od update'u gry 2026-08-17
			// "building:place" to formalny INTERCEPTOR (FH.hooks.intercept + ctrl.cancel() + {structureTypes}),
			// a nie anulowalny event (return true już NIE anuluje) → stary events.on tu nie działał
			// = klient nie mógł postawić NICZEGO. Patch _place bierze intencję u źródła (patrz ST._place).
			ST.FH.events.on(state, "structures:placed", (st, data) => {
				// tylko HOST rozgłasza własne postawienia; klient już nie (anuluje przed zapisem)
				if (ST._applyingNet || ST.net.role !== "host") return;
				const list = ((data && data.structures) || []).map(slimStruct);
				if (list.length) net.send({ t: "st", k: "add", list });
			});
			ST.FH.events.on(state, "structures:removed", (st, data) => {
				if (ST._applyingNet || ST.net.role === "idle") return;
				const list = ((data && data.removed) || []).map((s) => ({ type: s.type, x: s.x, y: s.y }));
				if (!list.length) return;
				if (data && data.byMove) { ST._moveStash = list; return; } // stare pozycje — czekają na structures:moved
				if (ST.net.role === "host") net.send({ t: "st", k: "rm", list });
				else net.send({ t: "act", k: "demolish", list });
			});
			ST.FH.events.on(state, "structures:moved", (st, data) => {
				if (ST._applyingNet || ST.net.role === "idle") return;
				const to = ((data && data.moved) || []).map(slimStruct);
				const from = ST._moveStash; ST._moveStash = [];
				if (!to.length || !from.length) return;
				if (ST.net.role === "host") net.send({ t: "st", k: "mv", from, to });
				else net.send({ t: "act", k: "move", from, to });
			});
			ST.FH.events.on(state, "worldItem:pickedUp", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.item) return;
				ST._pickedPending.set(data.item.id, performance.now());
				net.send({ t: "act", k: "pickup", id: data.item.id });
			});
			// Grabber/chwytak: klient forwarduje pobranie/odłożenie elementu → host wykonuje autorytatywnie
			// przez FH.elements.removeAt/createAt (bez patchowania bundle). Rozwiązuje "grabber nie bierze wet sand". (dotNine)
			ST.FH.events.on(state, "grabber:elementPickedUp", (st, data) => {
				// DIAG inconditionnel: le pick fire-t-il côté client, avec quel elementType ?
				if ((ST._pickDiag = (ST._pickDiag || 0) + 1) <= 80) log("GRAB pickEvent fired: role=" + ST.net.role, "et=" + (data && data.elementType), "@", data && data.x, data && data.y, "applyingNet=" + ST._applyingNet);
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data) return;
				if (!validElement(data.elementType)) { if ((ST._pickDiag3 = (ST._pickDiag3 || 0) + 1) <= 20) log("GRAB pick REJETÉ: elementType invalide =", data.elementType); return; }
				net.send({ t: "act", k: "grabPick", x: data.x, y: data.y, et: data.elementType });
				// KLUCZ: usuwamy komórkę lokalnie OD RAZU. Zapis grabbera do świata idzie przez odroczoną
				// kolejkę Lu, która u zapauzowanego klienta NIE wykonuje się → komórka "zostaje", więc grabber
				// bierze ją PONOWNIE co klatkę (tank pełny duplikatów) aż lustro hosta (~100ms) ją usunie.
				// Czyścimy cellId=0 (getCellId→0, isCellIdElement→false) → grabber widzi pusto, nie bierze znów.
				// Host usuwa autorytatywnie i potwierdza lustrem. _grabbedCells chroni przed przywróceniem.
				grabClearLocal(state, data.x, data.y);
			});
			ST.FH.events.on(state, "grabber:elementPlaced", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data) return;
				// Reszta ODŁOŻENIA z pustego/hors-bornes slotu tanku (T[o+2] undefined u zdesync. klienta):
				// elementType == null/0 → JSON gubi pole → host createAt(...,undefined) = crash "reading 'type'"
				// + "element utracony" (912×/sesję w logach). Forwardujemy TYLKO prawdziwe typy elementów.
				if (!validElement(data.elementType)) return;
				net.send({ t: "act", k: "grabPlace", x: data.x, y: data.y, et: data.elementType });
				grabSetLocal(state, data.x, data.y); // zablokuj ponowne celowanie w tę komórkę (patrz komentarz przy grabSetLocal)
			});
			// ULEPSZENIA I TECH TREE — model WSPÓLNEJ PULI (jedna fabryka = wspólne odblokowania).
			// Zakup klienta: gra mutuje jego lokalny store i odejmuje surowce TYLKO lokalnie (za 1s host
			// by to nadpisał = zakup darmowy i niewidoczny dla hosta — luka G2). Forward: koszt liczymy
			// z różnicy zasobów vs ostatni snapshot hosta (event odpala się TUŻ po odjęciu).
			const resCostDiff = () => {
				const cost = {};
				try {
					const cur = state.store.resources || {};
					const base = ST._resSnapshot || {};
					for (const k of Object.keys(base)) {
						const b = base[k], c = cur[k];
						if (typeof b === "number" && typeof c === "number" && c < b) cost[k] = b - c;
					}
					ST._resSnapshot = Object.assign({}, cur); // re-baza (kilka zakupów w <1s liczy się poprawnie)
				} catch (e) {}
				return cost;
			};
			ST.FH.events.on(state, "upgrade:purchased", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data) return;
				net.send({ t: "act", k: "upg", it: data.itemId, ug: data.upgradeId, lv: data.level, cost: resCostDiff() });
				log("CLIENT upgrade →", data.itemId + "." + data.upgradeId, "lvl", data.level);
			});
			ST.FH.events.on(state, "tech:unlocked", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data) return;
				net.send({ t: "act", k: "tech", id: data.techId, cost: resCostDiff() });
				log("CLIENT tech →", data.techId);
			});
			// FABUŁA (fix G6): krok wyzwolony pozycją/akcją KLIENTA mutuje tylko jego lokalny storage
			// (storyProgression.completedSteps) i po 1s host go nadpisywał. Forward → host dopisuje krok.
			ST.FH.events.on(state, "story:stepCompleted", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.stepId) return;
				net.send({ t: "act", k: "story", id: data.stepId });
				log("CLIENT story step →", data.stepId);
			});
			// KOLEKCJE critterów (fix G6): found/available/bilety żyją w store.creatures/conservatory,
			// nadpisywanych przez hosta — zbiór klienta cofał się w 100ms. Forward → host dolicza.
			ST.FH.events.on(state, "entity:collected", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.typeId) return;
				net.send({ t: "act", k: "collect", ty: data.typeId, eid: data.entityId });
				log("CLIENT collect →", data.typeId, "(id " + data.entityId + ")");
			});
			// SYGNAŁY (fix G5): link/unlink klienta mutuje storage "signals" nadpisywany przez hosta →
			// automatyka klienta znikała po 1s. Forward zmian → host wykonuje FH.signals.link/unlink.
			ST.FH.events.on(state, "signals:userChanged", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.changes) return;
				const ch = data.changes.map((c) => ({ a: c.action, f: c.from && { x: c.from.x, y: c.from.y }, t: c.to && { x: c.to.x, y: c.to.y } })).filter((c) => c.a && c.f && c.t);
				if (ch.length) { net.send({ t: "act", k: "sig", ch }); log("CLIENT signals →", ch.length, "zmian"); }
			});
			// przycisk sygnałowy: toggle stanu przez klienta
			ST.FH.events.on(state, "signalButton:pressed", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.structure) return;
				const s = data.structure;
				net.send({ t: "act", k: "sbtn", x: s.x, y: s.y, on: !!(s.data && s.data.on) });
			});
			// COPY-PASTE blueprintów (fix G5): wklejone struktury klienta były lokalne → reconcile je kasował
			ST.FH.events.on(state, "structures:pasted", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.structures) return;
				const list = data.structures.map(slimStruct);
				let links = null;
				try { if (data.signalLinks) links = JSON.parse(JSON.stringify(data.signalLinks)); } catch (e) {}
				if (list.length) { net.send({ t: "act", k: "paste", list, links }); log("CLIENT paste →", list.length, "struktur"); }
			});
			log("Subskrypcja eventów struktur/przedmiotów aktywna");
		} catch (e) { log("subscribe error:", e.message); }
	}

	// Update gry 2026-08-17 przemianował/przeniósł FH.structures (znikło z top-level FH).
	// Resolver: znajdź namespace z build+removeAt gdziekolwiek jest (top-level lub 1 poziom głębiej).
	function structNs() {
		if (ST._structNs && typeof ST._structNs.build === "function") return ST._structNs;
		const FH = ST.FH; if (!FH) return null;
		const isIt = (v) => v && typeof v === "object" && typeof v.build === "function" && typeof v.removeAt === "function" && typeof v.getAtCell === "function";
		if (isIt(FH.structures)) { ST._structNs = FH.structures; return ST._structNs; }
		for (const k of Object.keys(FH)) { try { if (isIt(FH[k])) { ST._structNs = FH[k]; log("structures API pod FH." + k); return ST._structNs; } } catch (e) {} }
		for (const k of Object.keys(FH)) {
			try {
				const v = FH[k]; if (!v || typeof v !== "object") continue;
				for (const k2 of Object.keys(v)) { if (isIt(v[k2])) { ST._structNs = v[k2]; log("structures API pod FH." + k + "." + k2); return ST._structNs; } }
			} catch (e) {}
		}
		if (!ST._structNsWarned) { ST._structNsWarned = true; log("BŁĄD: nie znalazłem API struktur (build/removeAt/getAtCell) w FH:", Object.keys(FH).join(",")); }
		return null;
	}
	// force=true (host stawiający intencję klienta / klient renderujący potwierdzenie): pomija kontrolę
	// kolizji podając JAWNIE clearance = Available (posad zbudowany, niebloowany). WAŻNE (0.5.4): dawny
	// hack clearance:-1 zapisywał NIEPRAWIDŁOWĄ wartość enuma J6 na strukturze → gra traktowała ją jak
	// uszkodzoną/zablokowaną i USUWAŁA ("pose supprimée directement"). J6.Available=1 (Blocked=2/3) → build
	// przechodzi checki (≠FullyBlocked/≠PartiallyBlocked) i struktura jest POPRAWNA → nie znika.
	const CLEARANCE_AVAILABLE = 1; // J6.Available w buildzie 0.5.4 (patrz enum: Available=1,FullyBlocked=2,PartiallyBlocked=3,CanBeReplaced=4)
	function buildOne(state, s, force) {
		try {
			const SA = structNs(); if (!SA) return null;
			const existing = SA.getAtCell(state, s.x, s.y);
			if (existing && existing.type === s.type) {
				if (s.data && JSON.stringify(existing.data) !== JSON.stringify(s.data)) {
					// KONFIG MASZYN (G5b): świeżo edytowane przez klienta data chronimy przed nadpisaniem
					// przez snapshot hosta (act sdata jest w drodze; host potwierdzi w następnym snapie)
					const k = structKey(s);
					const edited = ST._dataEdited && ST._dataEdited.get(k);
					if (!(ST.net.role === "client" && edited != null && performance.now() - edited < 6000)) {
						existing.data = s.data;
						if (SA.update) SA.update(state, existing, { propagateToWorkers: ST.net.role === "host" });
						if (ST.net.role === "client") dataSeenSet(k, s.data); // baza do wykrywania edycji klienta
					}
				} else if (ST.net.role === "client") dataSeenSet(structKey(s), existing.data);
				return existing;
			}
			const pos = force ? { x: s.x, y: s.y, clearance: CLEARANCE_AVAILABLE } : { x: s.x, y: s.y };
			const built = SA.build(state, pos, s.type, {});
			if (built) {
				if (s.data) built.data = s.data;
				// HOST: ZAWSZE propaguj strukturę do workerów symulacji (nie tylko gdy jest data!). Bez tego
				// struktura jest w store, ale działająca sim hosta jej "nie zna" → NIE renderuje się u hosta
				// (klient z sim w PAUZIE i tak ją rysuje ze store — stąd "klient widzi, host nie widzi").
				// (fix 0.5.4: pose du client invisible côté hôte)
				if (SA.update && (ST.net.role === "host" || s.data)) SA.update(state, built, { propagateToWorkers: ST.net.role === "host" });
			}
			return built;
		} catch (e) { log("buildOne error:", s.type, e.message); return null; }
	}
	function removeOne(state, s) {
		try { const SA = structNs(); if (SA) SA.removeAt(state, s.x, s.y, {}); } catch (e) { log("removeOne error:", e.message); }
	}

	function applyNetStructs(msg) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		ST._applyingNet = true;
		try {
			// klient renderuje potwierdzone struktury: force=true (bez kontroli kolizji, bez zapisu komórek)
			if (msg.k === "add") for (const s of msg.list) { buildOne(state, s, true); ST._structApplied.set(structKey(s), performance.now()); }
			else if (msg.k === "rm") for (const s of msg.list) removeOne(state, s);
			else if (msg.k === "mv") { for (const s of msg.from) removeOne(state, s); for (const s of msg.to) { buildOne(state, s, true); ST._structApplied.set(structKey(s), performance.now()); } }
		} finally { ST._applyingNet = false; }
	}

	async function sendSnapshotIfDue(state) {
		const now = performance.now();
		if (now - ST._lastSnap < 2500) return;
		ST._lastSnap = now;
		try {
			const payload = JSON.stringify({
				s: (state.store.structures || []).map(slimStruct),
				p: (state.store.pipes || []).map(slimStruct),
				wi: state.store.worldItems || [],
				dr: state.store.drones || [],
			});
			const packed = await deflate(new TextEncoder().encode(payload));
			net.send({ t: "snap", d: b64enc(packed) });
		} catch (e) { log("snapshot error:", e.message); }
	}

	async function applySnapshot(msg) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		const snap = JSON.parse(new TextDecoder().decode(await inflate(b64dec(msg.d))));
		ST._applyingNet = true;
		try {
			const nowS = performance.now();
			for (const [hostList, localList] of [[snap.s, state.store.structures || []], [snap.p, state.store.pipes || []]]) {
				const hostMap = new Map(hostList.map((s) => [structKey(s), s]));
				// RECONCILE ETAPOWY (Knight-HD: additive fix + nasza siatka bezpieczeństwa):
				// NIE kasujemy od razu na podstawie nieobecności w snapshotcie (to usuwało świeże budynki przy
				// drobnym rozjeździe klucza/chwilowym braku w JSON-ie hosta). ALE czysty additive zostawiał
				// WIECZNE duchy (struktury usunięte przez sim / w oknie rozłączenia — bez eventu "st rm").
				// Kompromis: kasuj dopiero gdy struktura jest nieobecna w >=3 KOLEJNYCH snapshotach (~7,5 s)
				// I nie była świeżo postawiona/potwierdzona (30 s ochrony _structApplied).
				if (!ST._absentCount) ST._absentCount = new Map();
				for (const s of localList) {
					const k = structKey(s);
					if (hostMap.has(k)) { ST._absentCount.delete(k); continue; }
					const cnt = (ST._absentCount.get(k) || 0) + 1;
					ST._absentCount.set(k, cnt);
					const appliedTs = ST._structApplied.get(k);
					const fresh = appliedTs != null && nowS - appliedTs < 30000;
					if (cnt >= 3 && !fresh) {
						log("RECONCILE: usuwam ducha (nieobecny w " + cnt + " snapshotach):", k);
						removeOne(state, s);
						ST._absentCount.delete(k); ST._structApplied.delete(k);
					}
				}
				// dobuduj/zaktualizuj brakujące (klient: force=true — render bez kontroli kolizji/zapisu komórek)
				for (const s of hostList) { buildOne(state, s, true); ST._structApplied.set(structKey(s), nowS); }
			}
			// worldItems: odfiltruj świeżo podniesione lokalnie (czekające na potwierdzenie hosta, TTL 10 s)
			applyWorldItems(state, snap.wi || []);
		} catch (e) { log("reconcile error:", e.message); }
		finally { ST._applyingNet = false; }
	}
	function applyWorldItems(state, list) {
		const now = performance.now();
		for (const [id, ts] of ST._pickedPending) if (now - ts > 10000) ST._pickedPending.delete(id);
		state.store.worldItems = (list || []).filter((i) => !ST._pickedPending.has(i.id));
	}
	// SZYBKIE DROPY (G12): nowy przedmiot na ziemi docierał dopiero ze snapshotem 2,5s.
	// Host: przy każdej ZMIANIE listy id wysyła ją od razu (sprawdzane 5 Hz, wysyłka tylko przy zmianie).
	function sendWorldItemsIfChanged(state) {
		const now = performance.now();
		if (now - (ST._wiT || 0) < 200) return;
		ST._wiT = now;
		try {
			const wi = state.store.worldItems || [];
			let key = wi.length + ":";
			for (let i = 0; i < wi.length; i++) key += wi[i].id + ",";
			if (key === ST._wiKey) return;
			ST._wiKey = key;
			net.send({ t: "wi", wi });
		} catch (e) {}
	}

	// ------------------------------------------------------------------
	// ZASOBY — host → klient (1 Hz)
	// ------------------------------------------------------------------
	function sendResourcesIfDue(state) {
		const now = performance.now();
		if (now - ST._lastRes < 1000) return;
		ST._lastRes = now;
		try {
			const sh = state.shared;
			const conv = arr(sh.conveyorBeltsAnimationIndex);
			net.send({
				t: "res",
				r: state.store.resources,
				pp: state.store.productionPoints,
				g: arr(sh.gold) ? arr(sh.gold)[0] : null,
				e: arr(sh.energy) ? arr(sh.energy)[0] : null,
				p: arr(sh.productionPoints) ? arr(sh.productionPoints)[0] : null,
				c: conv ? Array.from(conv) : null,
				st: state.store.mods || null,          // postęp fabuły (storyProgression)
				gl: state.store.gloom || null,          // stan gloomu
				fp: fpCounters(state),                  // liczniki procesów fabryki (ShakeWetSand itd.) — SAB nie-lustrzany
				up: state.store.upgrades || null,       // WSPÓLNA pula ulepszeń (fix G2)
				th: (state.store.player && state.store.player.tech) || null, // tech tree
				pg: state.store.progression || null,    // progression (upgradesUnlocked, dungeons)
			});
		} catch (e) {}
	}
	// Liczniki "factory.processing" (SAB per-instancja, NIE objęty lustrem świata!): postęp procesów
	// ShakeWetSand/PressBurntResidue/GrowFlowers/CondenseFlorin. Bez streamu klient widział 0 postępu
	// ("shaking wet sand aint working" — TCentraL: proces DZIAŁAŁ na hoście, ale UI klienta martwe).
	// Odejmij koszty zakupu klienta (wspólna pula). Sanity: tylko liczby 0..1e9, clamp do zera.
	// Gold żyje też w SAB (shared.gold) — odejmujemy w obu miejscach, żeby UI się zgadzało.
	function deductCosts(state, cost) {
		if (!cost) return;
		try {
			const r = state.store.resources || {};
			for (const k of Object.keys(cost)) {
				const v = cost[k];
				if (typeof v !== "number" || !(v > 0) || v > 1e9) continue;
				if (typeof r[k] === "number") r[k] = Math.max(0, r[k] - v);
				if (k === "gold") { const g = arr(state.shared.gold); if (g) g[0] = Math.max(0, g[0] - v); }
				if (k === "energy") { const g = arr(state.shared.energy); if (g) g[0] = Math.max(0, g[0] - v); }
			}
		} catch (e) {}
	}
	// PRAWDZIWE odblokowanie tech (fix ЗаКеЛьМан: "kolega zbadał mapę, ja jej nie mam").
	// Samo `tech[id]=true` NIE wystarcza: unlockTech gry rejestruje budynki w menu, tworzy
	// przedmioty do ekwipunku i emituje tech:mapUnlocked (minimapa!). _techMod = eksport
	// modułu 77135 przez patch "tech module export".
	function techUnlock(state, techId) {
		try {
			const tm = ST._techMod;
			if (tm && tm.unlockTech && tm.getTechDefinition) {
				const def = tm.getTechDefinition(techId);
				if (def) { tm.unlockTech(state, def, { suppressMusic: true }); return true; }
			}
		} catch (e) { log("techUnlock error:", techId, e.message); }
		return false;
	}
	function fpArr(state) { // surowa tablica SAB (do zapisu u klienta)
		try {
			const w = ST.FH.workers;
			const a = w && w.shared && w.shared.get && w.shared.get(state, "factory.processing");
			return a && a.length ? a : null;
		} catch (e) { return null; }
	}
	function fpCounters(state) { const a = fpArr(state); return a ? Array.from(a) : null; }
	function applyResources(msg) {
		const state = ST.state;
		if (!state) return;
		try {
			if (msg.r) Object.assign(state.store.resources, msg.r);
			if (msg.pp !== undefined) state.store.productionPoints = msg.pp;
			const sh = state.shared;
			if (msg.g !== null && arr(sh.gold)) arr(sh.gold)[0] = msg.g;
			if (msg.e !== null && arr(sh.energy)) arr(sh.energy)[0] = msg.e;
			if (msg.p !== null && arr(sh.productionPoints)) arr(sh.productionPoints)[0] = msg.p;
			if (msg.c && arr(sh.conveyorBeltsAnimationIndex)) { const c = arr(sh.conveyorBeltsAnimationIndex); for (let i = 0; i < Math.min(c.length, msg.c.length); i++) c[i] = msg.c[i]; }
			if (msg.st) {
				// store.mods = postęp fabuły/kolekcje (drużynowe) ALE też preferencje PER-GRACZ.
				// Fix TCentraL: "shake u klienta działa tylko gdy host ma Shaking włączone" — przełącznik
				// żyje w mods.grabberSizeScroll i był nadpisywany stanem HOSTA co 1s. Lokalne preferencje
				// zachowujemy przy nadpisie (lista rozszerzalna, gdyby gra trzymała tu więcej ustawień UI).
				const prevMods = state.store.mods || {};
				state.store.mods = msg.st;
				for (const k of ["grabberSizeScroll"]) if (prevMods[k] !== undefined) state.store.mods[k] = prevMods[k];
			}
			if (msg.gl) state.store.gloom = msg.gl;
			if (msg.fp) { const a = fpArr(state); if (a) { const src = msg.fp; for (let i = 0; i < Math.min(a.length, src.length); i++) { try { Atomics.store(a, i, src[i]); } catch (e) { a[i] = src[i]; } } } }
			// wspólna pula ulepszeń/tech (fix G2): merge poziomów (NIE podmiana obiektów — gra trzyma referencje)
			if (msg.up && state.store.upgrades) {
				for (const it of Object.keys(msg.up)) {
					const src = msg.up[it], dst = state.store.upgrades[it];
					if (!src || !dst) continue;
					for (const ug of Object.keys(src)) {
						const s = src[ug], d = dst[ug];
						// tylko W GÓRĘ: świeży zakup klienta nie może mrugnąć w dół zanim host przetworzy act (upgrade'y nie spadają)
						if (s && d && typeof s.level === "number" && s.level > (d.level || 0)) { d.level = s.level; d.availableLevel = Math.max(d.availableLevel || 0, s.availableLevel != null ? s.availableLevel : s.level); }
					}
				}
			}
			if (msg.th && state.store.player && state.store.player.tech) {
				for (const k of Object.keys(msg.th)) {
					if (!msg.th[k] || state.store.player.tech[k]) continue;
					// NOWY tech od hosta → PEŁNY unlock u klienta (menu budynków, itemy do ekwipunku, MAPA!)
					// — goła flaga zostawiała UI martwe ("kolega zbadał mapę, ja jej nie mam" — ЗаКеЛьМан)
					ST._applyingNet = true;
					let realU = false;
					try {
						realU = techUnlock(state, k);
						if (realU) state.store.player.tech[k] = true; // flaga node'a jawnie (fix podwójnego zakupu)
						if (!realU) { state.store.player.tech[k] = true; try { ST.FH.events.emit(state, "tech:unlocked", { techId: k, suppressMusic: true }); } catch (e) {} }
					} finally { ST._applyingNet = false; }
					log("SYNC: tech od drużyny odblokowany:", k, realU ? "(REAL)" : "(FALLBACK flaga — patch _techMod nie pasuje!)");
				}
			}
			if (msg.pg && state.store.progression) Object.assign(state.store.progression, msg.pg);
				ST._resSnapshot = Object.assign({}, state.store.resources); // re-baza dla przyrostów klienta (dotNine)
		} catch (e) {}
	}

	// ------------------------------------------------------------------
	// ENCJE (pociski/drony/stworki) — host → klient 10 Hz; pociski jako ghosty
	// ------------------------------------------------------------------
	// klient: co ~1s wysyła do hosta TYLKO przyrosty swoich zasobów (zdobyte) — host dolicza do
	// swoich trwałych liczników. Bez tego zarobek klienta ginie przy rozłączeniu. (dotNine)
	function sendResourceDeltaIfDue(state) {
		const now = performance.now();
		if (now - (ST._lastResDelta || 0) < 1000) return;
		ST._lastResDelta = now;
		if (ST._resSnapshot == null) return;
		try {
			const cur = state.store.resources || {};
			const prev = ST._resSnapshot;
			const delta = {}; let any = false;
			for (const k of Object.keys(cur)) { const d = (cur[k] || 0) - (prev[k] || 0); if (d > 0) { delta[k] = d; any = true; } }
			if (any) net.send({ t: "resDelta", r: delta });
			ST._resSnapshot = Object.assign({}, cur);
		} catch (e) {}
	}
	function applyResourceDelta(msg) {
		const state = ST.state;
		if (!state || !msg.r) return;
		try { const res = state.store.resources || (state.store.resources = {}); for (const k of Object.keys(msg.r)) res[k] = (res[k] || 0) + msg.r[k]; } catch (e) {}
	}

	const slimProj = (p) => ({ x: p.x, y: p.y, type: p.type });
	function sendEntitiesIfDue(state) {
		const now = performance.now();
		if (now - ST._lastEnt < 100) return;
		ST._lastEnt = now;
		try {
			net.send({
				t: "ent",
				pr: (state.store.projectiles || []).map(slimProj),
				dr: state.store.drones || [],
				cr: state.store.creatures || {},
			});
		} catch (e) {}
	}
	function applyEntities(msg) {
		const state = ST.state;
		if (!state) return;
		try {
			ST.remoteProjectiles = msg.pr || []; // ghost render — NIE do store (żadnej podwójnej symulacji)
			if (msg.dr) state.store.drones = msg.dr;
			if (msg.cr) state.store.creatures = msg.cr;
		} catch (e) {}
	}
	// klient wysyła własne pociski (host rysuje je jako ghosty)
	function sendMyProjectilesIfDue(state) {
		const now = performance.now();
		if (now - ST._lastMyProj < 100) return;
		ST._lastMyProj = now;
		const list = (state.store.projectiles || []).map(slimProj);
		if (list.length || ST._hadProj) { try { net.send({ t: "myproj", list }); } catch (e) {} }
		ST._hadProj = list.length > 0;
	}

	// ------------------------------------------------------------------
	// DŹWIĘKI ZDARZEŃ ŚWIATA — tap na wiadomości workerów hosta (PlaySound=41)
	// ------------------------------------------------------------------
	(function hookWorkers() {
		const NativeWorker = window.Worker;
		const desc = Object.getOwnPropertyDescriptor(NativeWorker.prototype, "onmessage");
		let sndBudget = 0, sndWindow = 0;
		const tap = (ev) => {
			try {
				const d = ev.data;
				if (!Array.isArray(d) || d[0] !== 41) return;
				if (ST.net.role !== "host" || !ST.peers.size) return;
				const now = performance.now();
				if (now - sndWindow > 1000) { sndWindow = now; sndBudget = 0; }
				if (sndBudget++ > 20) return; // limit 20 dźwięków/s
				net.send({ t: "snd", a: d.slice(1, 6) });
			} catch (e) {}
		};
		window.Worker = function (url, opts) {
			const w = new NativeWorker(url, opts);
			try {
				Object.defineProperty(w, "onmessage", {
					get() { return desc.get.call(w); },
					set(f) { desc.set.call(w, f ? (ev) => { tap(ev); return f(ev); } : f); },
				});
				w.addEventListener("message", tap);
			} catch (e) {}
			return w;
		};
		window.Worker.prototype = NativeWorker.prototype;
	})();
	function playRemoteSound(msg) {
		try {
			const state = ST.state;
			const snd = ST.FH && ST.FH.sound;
			if (!state || !snd || !msg.a) return;
			const [name, x, y] = msg.a;
			if (typeof name !== "string") return;
			if (typeof snd.playAt === "function") snd.playAt(state, name, x, y);
			else if (typeof snd.play === "function") snd.play(state, name, typeof x === "number" ? { position: { x, y } } : undefined);
			else if (!ST._sndWarned) { ST._sndWarned = true; log("FH.sound keys:", Object.keys(snd).join(",")); }
		} catch (e) {}
	}

	// ------------------------------------------------------------------
	// VACUUM — klient wysyła intencję, host zbiera elementy, typy wracają do zbiorników
	// ------------------------------------------------------------------
	ST._vac = (state, item, cell, vel) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/poza lustrem: normalnie
		const now = performance.now();
		if (now - ST._lastVac > 120) {
			ST._lastVac = now;
			const f = item && item.data && item.data.filter ? item.data.filter.elementType : null;
			try { net.send({ t: "act", k: "vac", x: cell.x, y: cell.y, f }); } catch (e) {}
		}
		return true; // pomiń lokalny tick (czyta nieaktualne cellIds)
	};

	// GRABBER host-side (model vacuum, v1): przy PICK (tank pusty) klient NIE zbiera lokalnie — forwarduje tylko
	// WIZ (mouse.cellPosition), host zbiera autorytatywnie (getInfoAtPos+isGrabbable+removeAt) i odsyła typy,
	// klient wypełnia tank. Omija cały wyścig sentineli/lustra pod obciążeniem (1024 komórki). PLACE (tank>0)
	// zostaje po staremu (return false → lokalne odkładanie działa, host createAt potwierdza).
	ST._grab = (state, tool) => {
		try {
			if (!isClientSync() || !ST.wsx.paused) return false; // host/offline lub klient poza światem hosta
			const B = tool && tool.data && tool.data.matrix;
			if (!B) return false;
			if (B[1] > 0) return false; // tank ma zawartość → tryb PLACE → nie przechwytuj (odkładanie działa)
			// KLUCZ: zbieraj TYLKO gdy gracz aktywnie grabuje (trzyma przycisk) → action.state[qy.Active=2].
			// Bez tego forwardowaliśmy w kółko i grabber "brał" bez klikania (element od razu spadał). (fix user)
			const ast = state.session && state.session.action && state.session.action.state;
			if (!ast || !ast[2]) return false; // brak akcji → pozwól z() zrobić hover (bez pobierania)
			const now = performance.now();
			if (now - (ST._lastGrabH || 0) > 100) {
				ST._lastGrabH = now;
				const m = state.session && state.session.input && state.session.input.mouse;
				const cp = m && m.cellPosition;
				if (cp && cp.x >= 0 && cp.y >= 0) {
					// policz WOLNE sloty tanku i wyślij hostowi — host zbierze najwyżej tyle
					// (bez tego host niszczył do 48 elementów, a nadmiar ponad pojemność tanku PRZEPADAŁ)
					let free = 0;
					for (let i = 2; i < B.length; i++) if (B[i] === 0) free++;
					if (free > 0) {
						ST._grabTool = tool; // zapamiętaj do wypełnienia tanku po odpowiedzi hosta
						try { net.send({ t: "act", k: "grabH", x: cp.x | 0, y: cp.y | 0, f: free, lt: B[0] || 0 }); } catch (e) {}
						if ((ST._grabHDiag = (ST._grabHDiag || 0) + 1) <= 40) log("CLIENT grabH forward @", cp.x | 0, cp.y | 0, "free=" + free, "lock=" + (B[0] || 0));
					}
				}
			}
			return true; // pomiń lokalne zbieranie (host zrobi to autorytatywnie)
		} catch (e) { return false; }
	};
	// HOST: zbierz grabbable elementy w promieniu wokół (x,y), usuń, odeślij typy klientowi (jak vacuum).
	function hostHarvestGrab(msg, fromId) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		// rate-limit per gracz (klient sam ogranicza do 100ms, ale host nie może ufać klientowi)
		if (!ST._grabHLast) ST._grabHLast = new Map();
		const tNow = performance.now();
		if (tNow - (ST._grabHLast.get(fromId) || 0) < 80) return;
		ST._grabHLast.set(fromId, tNow);
		const el = ST.FH.elements || {};
		const getInfo = el.getInfoAtPos;
		const removeAt = el.removeAt;
		if (!getInfo || !removeAt) { if (!ST._grabApiWarned) { ST._grabApiWarned = true; log("BŁĄD grabH: brak getInfoAtPos/removeAt — el:", Object.keys(el).join(",")); } return; }
		const types = [], offs = [];
		// cap = wolne sloty tanku klienta (msg.f); stary klient bez f → ostrożne 8. Nigdy >48.
		const cap = Math.max(1, Math.min(48, typeof msg.f === "number" ? msg.f : 8));
		// BRAMKA NAUKOWA (fix derErste67: klient zbierał wodę bez badania): vanilla grabber wymaga
		// upgrade'u grabber.waterGrab dla PŁYNÓW — host-side harvest musi to egzekwować tak samo.
		// matterType "Liquid" ustalamy dynamicznie z configu wody (RJ.Water=3) — bez hardcodu enuma.
		if (ST._mtLiquid === undefined) { try { const wc = el.getConfig && el.getConfig(3); ST._mtLiquid = wc && wc.matterType != null ? wc.matterType : null; } catch (e) { ST._mtLiquid = null; } }
		const wg = state.store.upgrades && state.store.upgrades.grabber && state.store.upgrades.grabber.waterGrab;
		const canLiquid = !!(wg && wg.level);
		let gateSkipped = 0;
		// JEDEN TYP NA TANK (fix derErste67 #2: "grabbing dirt also grabs stone and gold"): vanilla
		// blokuje tank na PIERWSZYM złapanym typie (T[0]; `if(L&&U!==L)continue`). Klient może przysłać
		// zablokowany typ tanku (msg.lt); przy pustym tanku pierwszy zebrany element definiuje blokadę.
		let lockType = (typeof msg.lt === "number" && msg.lt > 0) ? msg.lt : 0;
		const R = 4; let taken = 0;
		for (let dy = -R; dy <= R && taken < cap; dy++)
			for (let dx = -R; dx <= R && taken < cap; dx++) {
				const x = msg.x + dx, y = msg.y + dy;
				try {
					const info = getInfo(state, x, y);
					if (!info || !info.elementType) continue;
					if (info.isGrabbable === false) continue; // szanuj flagę gdy jest; gdy brak — bierz (klient celował)
					const cfg = el.getConfig ? el.getConfig(info.elementType) : null;
					if (cfg && cfg.isGrabbable === false) continue;
					if (ST._mtLiquid !== null && cfg && cfg.matterType === ST._mtLiquid && !canLiquid) { gateSkipped++; continue; } // płyn bez badania waterGrab
					if (lockType && info.elementType !== lockType) continue; // tank przyjmuje tylko JEDEN typ (jak vanilla)
					if (!lockType) lockType = info.elementType;
					removeAt(state, x, y);
					markCellDirty(state, x, y);
					types.push(info.elementType);
					offs.push(dx, dy); // pozycja wzgl. kursora → klient mapuje na właściwy slot siatki tanku
					taken++;
				} catch (e) {}
			}
		if (types.length) { net.send({ t: "grabres", types, offs }, fromId); if ((ST._grabHostDiag = (ST._grabHostDiag || 0) + 1) <= 40) log("HOST grabH @", msg.x, msg.y, "→ zebrano", types.length, "elementów" + (gateSkipped ? " (pominięto " + gateSkipped + " płynów — brak waterGrab)" : "")); }
		else if (gateSkipped && (ST._grabGateDiag = (ST._grabGateDiag || 0) + 1) <= 10) log("HOST grabH: 0 zebranych,", gateSkipped, "płynów zablokowanych (brak badania waterGrab)");
	}
	// KLIENT: wypełnij tank grabbera (matrix) typami zebranymi przez hosta. B[0]=locked type, B[1]=count, B[2..]=sloty.
	function clientFillGrabTank(types, offs) {
		const tool = ST._grabTool;
		const B = tool && tool.data && tool.data.matrix;
		if (!B || !types || !types.length) return;
		// SLOT WG POZYCJI (fix TCentraL: itemy lądowały w lewym-górnym rogu pickera): siatka tanku jest
		// przestrzenna — slot odpowiada pozycji komórki względem kursora (vanilla: A = w + t*v). Host
		// przysyła offsety (dx,dy); slot = (dx+mid) + (dy+mid)*v. Zajęty/poza siatką → pierwszy wolny.
		const v = Math.max(1, Math.round(Math.sqrt(B.length - 2)));
		const mid = v >> 1;
		let filledAny = false;
		for (let ti2 = 0; ti2 < types.length; ti2++) {
			const ty = types[ti2];
			let filled = false;
			if (offs && offs.length >= (ti2 + 1) * 2) {
				const col = offs[ti2 * 2] + mid, row = offs[ti2 * 2 + 1] + mid;
				if (col >= 0 && col < v && row >= 0 && row < v) {
					const idx = 2 + col + row * v;
					if (idx < B.length && B[idx] === 0) { B[idx] = ty; B[1] = (B[1] || 0) + 1; if (!B[0]) B[0] = ty; filled = true; filledAny = true; }
				}
			}
			if (!filled) for (let i = 2; i < B.length; i++) { if (B[i] === 0) { B[i] = ty; B[1] = (B[1] || 0) + 1; if (!B[0]) B[0] = ty; filled = true; filledAny = true; break; } }
			if (!filled) break; // tank pełny
		}
		if (filledAny && (ST._grabFillDiag = (ST._grabFillDiag || 0) + 1) <= 20) log("CLIENT tank grabbera wypełniony:", types.length, "typów, count=" + B[1]);
	}

	// Flamethrower/cryoblaster: kolejkujemy komórki (dużo/tick) i wysyłamy batchami co ~60ms — nie zalewamy sieci.
	// Klient pomija lokalne (i tak deferred → no-op przy pauzie); host odtwarza autorytatywnie.
	ST._fireQ = []; ST._cryoQ = [];
	// Warunek ST.wsx.paused: hook aktywny TYLKO gdy lustro działa (klient na świecie hosta).
	// Klient połączony, ale na własnym/innym świecie → broń działa normalnie lokalnie i NIC nie forwardujemy
	// (jego współrzędne nie mają sensu w świecie hosta).
	ST._fire = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return false; if (ST._fireQ.length < 2000) ST._fireQ.push(x, y); return true; };
	ST._cryo = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._cryoQ.length < 2000) ST._cryoQ.push(x, y); };
	// volcanizer (lawa) + caulkBlaster (spray/usuwanie caulku): ten sam wzorzec co cryo — sekwencja
	// przed Lu (lokalne Lu i tak dropowane u klienta), batch co 60ms, host odtwarza z guardami.
	ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = [];
	// manualny SHAKE grabbera (fix TCentraL: "gold powstaje, residue znika"): tank mutuje się lokalnie
	// (złoto w tanku ✓), ale residue leci DO ŚWIATA przez Lu (dropowane u klienta) + recordProcess
	// bije tylko lokalny licznik. Forward per przetworzony slot → host tworzy residue i liczy proces.
	ST._shakeRes = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._shakeQ.length < 2000) ST._shakeQ.push(x, y); };
	ST._volc = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._volcQ.length < 2000) ST._volcQ.push(x, y); };
	ST._caulk = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._caulkQ.length < 2000) ST._caulkQ.push(x, y); };
	ST._caulkRm = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._caulkRmQ.length < 2000) ST._caulkRmQ.push(x, y); };

	function hostHarvestVacuum(msg, fromId) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		const el = ST.FH.elements || {};
		const getInfo = el.getInfoAtPos;
		const removeAt = el.removeAtDeferred || el.removeAt;
		if (!getInfo || !removeAt) { log("BŁĄD vacuum: brak API elements.getInfoAtPos/removeAt — dostępne:", Object.keys(el).join(",")); return; }
		const types = [];
		const R = 4;
		let taken = 0;
		for (let dy = -R; dy <= R && taken < 10; dy++)
			for (let dx = -R; dx <= R && taken < 10; dx++) {
				if (dx * dx + dy * dy > R * R) continue;
				const x = msg.x + dx, y = msg.y + dy;
				try {
					const info = getInfo(state, x, y);
					if (!info || !info.elementType) continue;
					if (msg.f !== null && msg.f !== undefined && info.elementType !== msg.f) continue;
					removeAt(state, x, y);
					markCellDirty(state, x, y); // wymuś wysyłkę lustrem (zassany element znika u klienta)
					types.push(info.elementType);
					taken++;
				} catch (e) {}
			}
		if (types.length) net.send({ t: "vacres", types }, fromId);
	}

	function clientFillTanks(types) {
		const state = ST.state;
		if (!state || !types.length) return;
		try {
			const inv = state.store.player.inventory || [];
			const vac = inv.find((i) => i && i.data && Array.isArray(i.data.tanks));
			if (!vac) return;
			const tanks = vac.data.tanks;
			let lvl = 0;
			try { if (ST.FH && ST.FH.upgrades && ST.FH.upgrades.getLevel) lvl = ST.FH.upgrades.getLevel(state, "vacuum", "capacity") || 0; } catch (e) {}
			const CAP = VACUUM_CAPS[lvl] || VACUUM_CAPS[0]; // prawdziwa tabela pojemności z kodu gry
			for (const ty of types) {
				let tank = tanks.find((k) => k.elementType === ty && k.amount < CAP);
				if (!tank) tank = tanks.find((k) => 0 === k.elementType && 0 === k.amount);
				if (!tank) continue;
				tank.elementType = ty;
				tank.amount++;
			}
		} catch (e) { log("fillTanks error:", e.message); }
	}

	// ------------------------------------------------------------------
	// AKCJE — hooki z patchy bundle.js
	// ------------------------------------------------------------------
	// _dig: przekazujemy TYLKO kopanie gracza (flaga _pd z patcha I) i trafienia
	// WŁASNYCH pocisków klienta (flaga _projCtx; zdalne pociski nie trafiają do store).
	// DN wywoływane przez stworki/drony NIE jest forwardowane (host liczy je sam).
	ST._dig = (state, x, y, mask, vel, dmg, opts) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/poza lustrem: kop normalnie
		// Pociski są symulowane AUTORYTATYWNIE po stronie hosta (patrz ST._proj) → NIE forwardujemy kopań
		// z kontekstu pocisku (_projCtx), inaczej podwójne dziury (pocisk klienta + pocisk hosta).
		if (ST._projCtx) return true; // pomiń: eksplozję/dziurę zrobi pocisk hosta
		try { net.send({ t: "act", k: "dig", x, y, m: mask, v: vel, d: dmg }); } catch (e) {}
		return true; // pomiń lokalne wykonanie (i tak zapauzowane)
	};
	// _drone (patch bundle na E=deploy): klient wdraża drona LOKALNIE → sync hosta nadpisuje store.drones →
	// dron znika. Forwardujemy drona do hosta, host dodaje go autorytatywnie (jego sim go "ożywia").
	ST._drone = (state, drone) => {
		if (!isClientSync() || !ST.wsx.paused || ST._applyingNet) return;
		try { net.send({ t: "act", k: "drone", d: drone }); if ((ST._drDiag = (ST._drDiag || 0) + 1) <= 20) { let _dd = ""; try { _dd = JSON.stringify(drone && drone.data).slice(0, 300); } catch (e) {} log("CLIENT forward drone:", drone && drone.type, "@", drone && drone.x, drone && drone.y, "data=", _dd); } } catch (e) {}
	};
	// _proj (patch bundle na projectiles.push): klient odpala broń → pocisk lokalny (sim w pauzie = martwy,
	// eksplozja nie działa). Forwardujemy pocisk do hosta; host wrzuca go do store.projectiles → jego sim
	// symuluje lot+eksplozję+dmg autorytatywnie, wynik wraca lustrem/strumieniem encji. (rocket/fusil)
	ST._proj = (state, proj) => {
		if (!isClientSync() || !ST.wsx.paused || ST._applyingNet) return;
		try { net.send({ t: "act", k: "proj", p: proj }); if ((ST._prDiag = (ST._prDiag || 0) + 1) <= 20) log("CLIENT forward proj:", proj && proj.type, "@", proj && Math.round(proj.x), proj && Math.round(proj.y)); } catch (e) {}
	};
	// _setCell (patch B/Gz): KLIENT nigdy nie pisze komórek lokalnie (host-autorytatywnie).
	// - podczas aplikacji struktury z sieci (_applyingNet): pomiń zapis (teren pokaże lustro mapData hosta)
	// - spray gracza (_sprayCtx): wyślij intencję do hosta
	// - w każdym wypadku pomiń lokalny zapis
	ST._setCell = (state, x, y, cellId, opts) => {
		if (!isClientSync()) return false; // host/offline: normalnie
		if (!ST._applyingNet && ST._sprayCtx) { try { net.send({ t: "act", k: "set", x, y, c: cellId }); } catch (e) {} }
		return true; // klient NIGDY nie zapisuje komórek lokalnie
	};
	// _dropLu: przy pauzie klienta kolejka mutacji nigdy nie drenuje — nie pozwól jej rosnąć
	ST._dropLu = () => isClientSync() && ST.wsx.paused;
	// _place (patch bundle, u ŹRÓDŁA akcji stawiania — przed runInterceptorsSafe("building:place")):
	// KLIENT wysyła intencję do hosta i ANULUJE lokalne stawianie (return true → gra robi return null,
	// zero zapisu komórek). Host stawia autorytatywnie w replayAction("place") i odsyła "st add" (lustro).
	// Host/offline: return false → normalne stawianie lokalne. buildOne/SA.build NIE przechodzi przez ten
	// hook (to niżej-poziomowe API), więc aplikacja struktur z sieci i budowanie hosta się nie zapętlają.
	ST._place = (state, structureType, x, y, data) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/poza lustrem: stawiaj normalnie
		// KLUCZOWE: gdy MOD sam stawia strukturę z sieci (applyNetStructs/applySnapshot → buildOne → SA.build,
		// które PRZECHODZI przez building:place!), NIE przechwytuj — inaczej anulujemy własny render potwierdzonej
		// struktury i klient NIE WIDZI ŻADNEJ budowli (ani swojej, ani hosta). (regresja przy przejściu na patch bundle)
		if (ST._applyingNet) return false;
		if (structureType == null) return false; // brak typu → nie blokuj gry
		// KLUCZOWY FIX (0.5.4): forwardujemy KAŻDY typ (string I NUMERYCZNY = enum ev). Wcześniej blokada
		// typeof==="string" odrzucała numeryczne typy (większość budynków!) → NIC się nie forwardowało u hosta.
		// Garde anti-flood: przy WCZYTYWANIU świata gra odpala building:place dla wielu struktur naraz
		// (rekonstrukcja). Nie forwardujemy przez ~3s po zmianie sceny — inaczej host dostaje setki poz z save'a.
		if (ST._loadGuardUntil && performance.now() < ST._loadGuardUntil) return false; // load → pozwól lokalnej rekonstrukcji, nie forwarduj
		if ((ST._plDiag2 = (ST._plDiag2 || 0) + 1) <= 300) log("CLIENT forward place:", structureType, "@", x, y, "(typeof " + typeof structureType + ")", data ? "z data" : "bez data");
		// KLUCZOWE (fix "fundamentów nie da się usunąć"): forwardujemy też DATA struktury. Fundamenty
		// (box/skosy/kolor) niosą definicję w data — bez niej host budował ZDEGENEROWANĄ wersję, której
		// ścieżka usuwania fundamentów (drag) nie umiała dopasować → nieusuwalne nawet dla hosta.
		let d = null;
		try { if (data != null) d = JSON.parse(JSON.stringify(data)); } catch (e) {} // tylko serializowalne pola
		try { net.send({ t: "act", k: "place", type: structureType, x, y, data: d }); } catch (e) {}
		return true; // anuluj lokalne stawianie — klient nic nie pisze do świata
	};

	// Demolisher klienta (hook _demol z ticku narzędzia, gałąź End przeciągnięcia).
	// Problem: lokalna rozbiórka u klienta NIE wykonuje się do końca (część idzie przez odroczone
	// kolejki/workery zapauzowanego sima) → tylko czerwony mark, event structures:removed nie odpala,
	// nic nie forwardujemy ("recolors them red, and thats it" — TCentraL). Fix: przechwyć INTENCJĘ:
	// znajdź struktury w zaznaczonym recie po LUSTRZE (getAtCell na komórkach recta — dokładność jak
	// gra, uwzględnia shape) i wyślij istniejącym kanałem act demolish. Host usuwa, st rm potwierdza.
	ST._demol = (state, start, end) => {
		try {
			// HOST/SOLO: NIE przechwytujemy (gra rozbiera normalnie), ale zapamiętujemy rect — 250ms później
			// dobijamy NIEDOBITKI przez SA.removeAt. Powód: kafle budynków z replayu klienta potrafią
			// utknąć w stanie QUEUED (block-access), a rozbiórka gry takie kafle POMIJA → "czerwone
			// klocki, których nawet host nie może usunąć". SA.removeAt idzie inną ścieżką i je zdejmuje.
			// UWAGA: działa też SOLO/offline (zacięte klocki zostają w save'ie i trzeba je móc czyścić bez sesji).
			if (!isClientSync() || !ST.wsx.paused) {
				ST._hostDemolRect = { x0: Math.floor(Math.min(start.x, end.x)), y0: Math.floor(Math.min(start.y, end.y)), x1: Math.ceil(Math.max(start.x, end.x)), y1: Math.ceil(Math.max(start.y, end.y)), t: performance.now() };
				return false; // gra rozbiera normalnie; my tylko posprzątamy po niej
			}
			// rury (Pipe): osobna ścieżka w grze (Zn) — forwardujemy rect, host woła _pipeZn (eksport z patcha)
			try {
				const sel = ST.FH.action && ST.FH.action.getSelected && ST.FH.action.getSelected(state);
				if (sel && String(sel.id).toLowerCase().indexOf("pipe") >= 0) {
					net.send({ t: "act", k: "pipeRm", x0: Math.floor(Math.min(start.x, end.x)), y0: Math.floor(Math.min(start.y, end.y)), x1: Math.ceil(Math.max(start.x, end.x)), y1: Math.ceil(Math.max(start.y, end.y)) });
					log("CLIENT pipeRm rect");
					return true; // pomiń lokalne (host wykona, lustro + snap potwierdzą)
				}
			} catch (e) {}
			const SA = structNs(); if (!SA) { log("_demol: brak API struktur"); return false; }
			// UWAGA: H(e) zwraca rect JUŻ W KOMÓRKACH (dzieli przez cellSize w środku — snappedMinX/cellSize).
			// Bug 0.9.28: dzieliliśmy DRUGI raz przez 4 → skan 4x mniejszego obszaru przy originie → zawsze
			// pusto → cichy no-op bez logu ("just nothing happens, no log" — TCentraL).
			const x0 = Math.floor(Math.min(start.x, end.x)), x1 = Math.ceil(Math.max(start.x, end.x));
			const y0 = Math.floor(Math.min(start.y, end.y)), y1 = Math.ceil(Math.max(start.y, end.y));
			if ((x1 - x0 + 1) * (y1 - y0 + 1) > 40000) { log("_demol: rect za duży", x0, y0, x1, y1); return false; }
			const found = new Map(); // structKey -> slim
			for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
				try { const st = SA.getAtCell(state, x, y); if (st) found.set(structKey(st), slimStruct(st)); } catch (e) {}
			}
			if (!found.size) { log("_demol: pusty rect [" + x0 + "," + y0 + " → " + x1 + "," + y1 + "] — nic do rozbiórki"); return true; }
			const list = [...found.values()];
			try { net.send({ t: "act", k: "demolish", list, rect: { x0, y0, x1, y1 } }); } catch (e) {}
			log("CLIENT demolish rect →", list.length, "struktur");
			return true; // pomiń lokalną (nie-działającą) rozbiórkę — potwierdzenie przyjdzie przez st rm
		} catch (e) { return false; }
	};

	function replayAction(msg, fromId) {
		const state = ST.state;
		if (!state) return;
		try {
			if (msg.k === "dig") {
				const ex = findApi("excavate", ["excavation", "patterns"]); // nazwa ns różni się między buildami (obecny=excavation, 0.5.3=patterns)
				if (ex) { ex(state, msg.x, msg.y, msg.m, msg.v, msg.d); if (!ST._digLogged) { ST._digLogged = true; log("HOST: pierwsze kopanie klienta odtworzone @", msg.x, msg.y); } }
				else if (!ST._digErrLogged) { ST._digErrLogged = true; log("BŁĄD: brak API excavate — FH klucze:", Object.keys(ST.FH || {}).join(",")); }
			} else if (msg.k === "set") {
				const sc = findApi("setCellId");
				if (sc) sc(state, msg.x, msg.y, msg.c);
				else log("BŁĄD: brak API setCellId");
			} else if (msg.k === "place") {
				// klient poprosił o postawienie — host stawia AUTORYTATYWNIE. force=true: ufamy walidacji
				// klienta (kontrola kolizji przeszła u niego), więc pomijamy kontrolę hosta podając
				// clearance=Available (patrz CLEARANCE_AVAILABLE) — inaczej minimalna różnica stanu → build null → "auto-delete".
				if ((ST._plRxDiag = (ST._plRxDiag || 0) + 1) <= 300) log("HOST RX place:", msg.type, "@", msg.x, msg.y, "od", fromId);
				ST._applyingNet = true;
				let built = null;
				try { built = buildOne(state, { type: msg.type, x: msg.x, y: msg.y, data: msg.data || undefined }, true); } finally { ST._applyingNet = false; }
				if (built) {
					const inStore = (state.store.structures || []).indexOf(built) >= 0;
					const list = [slimStruct(built)]; net.send({ t: "st", k: "add", list });
					if ((ST._plDiagH = (ST._plDiagH || 0) + 1) <= 300) log("HOST: postawiono", msg.type, "@", built.x, built.y, "(prośba", msg.x, msg.y + ")", inStore ? "[w store]" : "[!! NIE w store.structures]", "-> broadcast");
				}
				else if ((ST._plDiagHE = (ST._plDiagHE || 0) + 1) <= 300) log("HOST: NIE postawiono", msg.type, "@", msg.x, msg.y, "(build zwrócił null — zła nazwa typu / kolizja u hosta?)");
			} else if (msg.k === "build") {
				ST._applyingNet = true;
				try { for (const s of msg.list) buildOne(state, s); } finally { ST._applyingNet = false; }
				net.send({ t: "st", k: "add", list: msg.list }); // potwierdź pozostałym klientom
			} else if (msg.k === "demolish") {
				ST._applyingNet = true;
				try { for (const s of msg.list) removeOne(state, s); } finally { ST._applyingNet = false; }
				net.send({ t: "st", k: "rm", list: msg.list });
				// fix (DwoaC): sweep osieroconych kafli uzbrajał się TYLKO na przeciągnięcia hosta —
				// rozbiórki klienta zostawiały czerwone kafle. Uzbrajamy go bounding-boxem listy (±2).
				if (msg.list && msg.list.length) {
					let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
					for (const s of msg.list) { if (s.x < x0) x0 = s.x; if (s.x > x1) x1 = s.x; if (s.y < y0) y0 = s.y; if (s.y > y1) y1 = s.y; }
					// Nowy klient przesyła DOKŁADNY rect zaznaczenia. Możemy w nim bezpiecznie posprzątać
					// osierocone kafle fundamentu; wcześniejszy kod zgadywał obszar z anchorów struktur (+2)
					// i przez to usuwał zdrowe, malowane fundamenty poza zaznaczeniem. Dla starego klienta
					// zachowujemy fallback z bboxem, ale bez czyszczenia kafli.
					const r = msg.rect;
					const exact = r && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) && r.x1 >= r.x0 && r.y1 >= r.y0 && (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) <= 40000;
					ST._hostDemolRect = exact
						? { x0: Math.floor(r.x0), y0: Math.floor(r.y0), x1: Math.ceil(r.x1), y1: Math.ceil(r.y1), t: performance.now(), cleanOrphans: true }
						: { x0: x0, y0: y0, x1: x1 + 2, y1: y1 + 2, t: performance.now(), src: "client" };
				}
			} else if (msg.k === "upg") {
				// zakup ulepszenia klienta (wspólna pula): ustaw poziom + odejmij koszt autorytatywnie
				ST._applyingNet = true;
				try {
					const u = state.store.upgrades && state.store.upgrades[msg.it] && state.store.upgrades[msg.it][msg.ug];
					if (u) {
						if (typeof msg.lv === "number" && msg.lv > (u.level || 0)) { u.availableLevel = msg.lv; u.level = msg.lv; }
						deductCosts(state, msg.cost);
						try { ST.FH.events.emit(state, "upgrade:purchased", { itemId: msg.it, upgradeId: msg.ug, level: msg.lv }); } catch (e) {}
						log("HOST: upgrade klienta", msg.it + "." + msg.ug, "→ lvl", msg.lv);
					} else log("HOST: upgrade klienta NIEZNANY:", msg.it, msg.ug);
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "tech") {
				ST._applyingNet = true;
				try {
					if (state.store.player && state.store.player.tech && !state.store.player.tech[msg.id]) {
						deductCosts(state, msg.cost);
						// PEŁNY unlock (budynki/itemy/mapa + własny emit tech:unlocked); fallback = goła flaga
						const real = techUnlock(state, msg.id);
						if (real) state.store.player.tech[msg.id] = true; // unlockTech nie stawia flagi node'a → tech tree pokazywał "niekupione" (Warlow: podwójny zakup)
						if (!real) {
							state.store.player.tech[msg.id] = true;
							try { ST.FH.events.emit(state, "tech:unlocked", { techId: msg.id, suppressMusic: true }); } catch (e) {}
						}
						// log MÓWI PRAWDĘ (raport TCentraL: "pełny unlock" drukował się też przy gołej fladze):
						log("HOST: tech klienta odblokowany:", msg.id, real ? "(REAL unlockTech)" : "(FALLBACK flaga — patch _techMod nie pasuje do tego builda gry!)");
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "story") {
				// krok fabuły klienta: dopisz do storyProgression.completedSteps (idempotentnie) + re-emit
				ST._applyingNet = true;
				try {
					const ens = (ST.FH.storage && ST.FH.storage.ensure) || findApi("ensure", ["storage"]);
					if (ens) {
						const sp = ens(state, "storyProgression");
						const arrS = sp.completedSteps || [];
						if (!arrS.includes(msg.id)) {
							arrS.push(msg.id); sp.completedSteps = arrS;
							try { ST.FH.events.emit(state, "story:stepCompleted", { stepId: msg.id }); } catch (e) {}
							log("HOST: krok fabuły klienta:", msg.id);
						}
					} else log("BŁĄD story: brak FH.storage.ensure");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "collect") {
				// zbiór crittera przez klienta: found/available + bilety za PIERWSZE złapanie (jak w grze)
				ST._applyingNet = true;
				try {
					state.store.creatures = state.store.creatures || {};
					const l = state.store.creatures;
					l[msg.ty] = l[msg.ty] || { available: 0, found: 0 };
					const c = l[msg.ty], first = c.found === 0;
					c.found++; c.available++;
					if (first) {
						state.store.conservatory = state.store.conservatory || { tickets: 0 };
						let types = 0; for (const k in l) if (l[k].found > 0) types++;
						state.store.conservatory.tickets += Math.pow(2, types);
					}
					try { ST.FH.events.emit(state, "entity:collected", { typeId: msg.ty }); } catch (e) {}
					// usuń encję z mapy hosta (brak oficjalnego remove — emulacja: splice z ŻYWEJ listy getAll
					// + schowaj sprite'a getSprite + zgaś światło). Bez tego critter wisiał do 2. zbioru.
					try {
						const EN = ST.FH.entities;
						if (msg.eid != null && EN && EN.getAll) {
							const listE = EN.getAll(state);
							const idxE = listE.findIndex((en) => en && en.id === msg.eid);
							if (idxE >= 0) {
								const en = listE[idxE];
								try { if (en.lightIndex !== undefined && ST.FH.effects && ST.FH.effects.removeLight) { ST.FH.effects.removeLight(state, en.lightIndex); en.lightIndex = undefined; } } catch (e) {}
								try { const spr = EN.getSprite && EN.getSprite(state, en.id); if (spr) { spr.renderable = false; spr.visible = false; } } catch (e) {}
								listE.splice(idxE, 1);
							}
						}
					} catch (e) {}
					log("HOST: critter klienta zebrany:", msg.ty, first ? "(PIERWSZY — bilety!)" : "");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "sig") {
				// zmiany sygnałów klienta: wykonaj przez FH.signals.link/unlink (autorytatywnie)
				ST._applyingNet = true;
				try {
					const SG = ST.FH.signals;
					if (SG && SG.link && SG.unlink) {
						for (const c of msg.ch || []) {
							try { if (c.a === "link") SG.link(state, c.f, c.t); else if (c.a === "unlink") SG.unlink(state, c.f, c.t); } catch (e) {}
						}
						try { ST.FH.events.emit(state, "signals:userChanged", { changes: (msg.ch || []).map((c) => ({ action: c.a, from: c.f, to: c.t })) }); } catch (e) {}
						log("HOST: sygnały klienta:", (msg.ch || []).length, "zmian");
					} else log("BŁĄD sig: brak FH.signals.link/unlink — klucze:", SG ? Object.keys(SG).join(",") : "brak ns");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "sbtn") {
				ST._applyingNet = true;
				try {
					const SA2 = structNs();
					const stc = SA2 && SA2.getAtCell(state, msg.x, msg.y);
					if (stc) {
						stc.data = Object.assign({}, stc.data || {}, { on: !!msg.on });
						try { if (ST.FH.signals && ST.FH.signals.setAll) ST.FH.signals.setAll(state, { x: msg.x, y: msg.y }, !!msg.on); } catch (e) {}
						try { ST.FH.events.emit(state, "signalButton:pressed", { structure: stc }); } catch (e) {}
						log("HOST: przycisk sygnałowy klienta @", msg.x, msg.y, "→", msg.on);
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "paste") {
				// wklejka blueprintu klienta: zbuduj wszystko autorytatywnie + odtwórz linki sygnałów
				ST._applyingNet = true;
				try {
					let ok = 0;
					for (const s of msg.list || []) if (buildOne(state, s, true)) ok++;
					if (msg.links && ST.FH.signals && ST.FH.signals.link) {
						for (const l of msg.links) { try { if (l && l.from && l.to) ST.FH.signals.link(state, l.from, l.to); } catch (e) {} }
					}
					net.send({ t: "st", k: "add", list: msg.list });
					log("HOST: paste klienta —", ok + "/" + (msg.list || []).length, "struktur");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "sdata") {
				// konfiguracja maszyny zmieniona przez klienta (filtry/priorytety/ustawienia UI)
				ST._applyingNet = true;
				try {
					const SA3 = structNs();
					const ex = SA3 && SA3.getAtCell(state, msg.x, msg.y);
					if (ex && ex.type === msg.type) {
						ex.data = msg.data;
						if (SA3.update) SA3.update(state, ex, { propagateToWorkers: true });
						log("HOST: config maszyny od klienta:", msg.type, "@", msg.x, msg.y);
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "pipeRm") {
				// rozbiórka rur klienta: wołamy PRAWDZIWĄ funkcję gry (Zn z modułu demolish, eksport z patcha)
				ST._applyingNet = true;
				try {
					if (typeof ST._pipeZn === "function") { ST._pipeZn(state, { x: msg.x0, y: msg.y0 }, { x: msg.x1, y: msg.y1 }); log("HOST: rury klienta rozebrane w recie"); }
					else log("BŁĄD pipeRm: brak _pipeZn (patch 'demolish module exports' nie nałożony?)");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "vac") {
				hostHarvestVacuum(msg, fromId);
			} else if (msg.k === "grabH") {
				hostHarvestGrab(msg, fromId);
			} else if (msg.k === "drone") {
				// klient wdrożył drona → dodaj autorytatywnie do store.drones hosta (jego sim go obsłuży)
				const d = msg.d;
				if (d && d.id != null) {
					const arr = state.store.drones || (state.store.drones = []);
					// kolizja id (klient i host mają WŁASNE liczniki nextId!) → nadaj wolne id zamiast cicho dropować
					if (arr.some((x) => x && x.id === d.id)) {
						let mx = 0; for (const x of arr) if (x && x.id > mx) mx = x.id;
						d.id = mx + 1;
					}
					arr.push(d);
					if ((ST._drHDiag = (ST._drHDiag || 0) + 1) <= 20) log("HOST: dron klienta dodany", d.type, "@", d.x, d.y, "id=" + d.id, "(drones=" + arr.length + ")");
				}
			} else if (msg.k === "proj") {
				// klient odpalił broń → dodaj pocisk do store.projectiles hosta → jego sim symuluje lot+eksplozję
				const p = msg.p;
				if (p) { const arr = state.store.projectiles || (state.store.projectiles = []); arr.push(p); if ((ST._prHDiag = (ST._prHDiag || 0) + 1) <= 20) log("HOST: pocisk klienta dodany", p.type, "@", Math.round(p.x), Math.round(p.y), "(proj=" + arr.length + ")"); }
			} else if (msg.k === "move") {
				ST._applyingNet = true;
				try { for (const s of msg.from) removeOne(state, s); for (const s of msg.to) buildOne(state, s); } finally { ST._applyingNet = false; }
				net.send({ t: "st", k: "mv", from: msg.from, to: msg.to });
			} else if (msg.k === "pickup") {
				const items = (ST.FH.world && ST.FH.world.items) || deepFindNs("items", "pickUp");
				const item = items && items.getById ? items.getById(state, msg.id) : (state.store.worldItems || []).find((i) => i.id === msg.id);
				if (item && items && items.pickUp) { ST._applyingNet = true; try { items.pickUp(state, item); } finally { ST._applyingNet = false; } }
				else if (item) state.store.worldItems = state.store.worldItems.filter((i) => i.id !== msg.id);
			} else if (msg.k === "grabPick") {
				const { sim: gsim, W: gW, H: gH } = worldBuffers(state);
				const gsim32 = gsim && gW ? new Uint32Array(gsim.buffer, gsim.byteOffset, gW * gH) : null;
				const gidx = gsim32 && msg.x >= 0 && msg.y >= 0 && msg.x < gW && msg.y < gH ? msg.x + msg.y * gW : -1;
				const gbefore = gidx >= 0 ? gsim32[gidx] : -1;
				ST._applyingNet = true;
				try { if (ST.FH.elements && ST.FH.elements.removeAt) ST.FH.elements.removeAt(state, msg.x, msg.y); } finally { ST._applyingNet = false; } markCellDirty(state, msg.x, msg.y);
				const gafter = gidx >= 0 ? gsim32[gidx] : -1;
				if ((ST._grabPickHostDiag = (ST._grabPickHostDiag || 0) + 1) <= 60)
					log("HOST grabPick @", msg.x, msg.y, "before=" + gbefore, "after=" + gafter, gbefore >= ELEMENTS_MIN && gafter === 0 ? "[OK retiré]" : gafter === gbefore ? "[!! removeAt N'A RIEN retiré]" : "[after=" + gafter + "]");
			} else if (msg.k === "grabPlace") {
				if (!validElement(msg.et)) return; // ochrona przed starym klientem (≤0.9.8) słącym et=null → createAt crash
				ST._applyingNet = true;
				try {
					const { sim, W, H } = worldBuffers(state);
					const sim32 = sim && W ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null;
					const inb = sim32 && msg.x >= 0 && msg.y >= 0 && msg.x < W && msg.y < H;
					const before = inb ? sim32[msg.x + msg.y * W] : -1;
					if (ST.FH.elements && ST.FH.elements.createAt) ST.FH.elements.createAt(state, msg.x, msg.y, msg.et);
					markCellDirty(state, msg.x, msg.y); // wymuś wysyłkę chunku lustrem → klient dostaje odłożony element (re-grab)
					const after = inb ? sim32[msg.x + msg.y * W] : -1;
					// DIAG: createAt a-t-il vraiment placé un élément (after∈[MIN,MAX]) ? sinon on saura pourquoi le re-grab échoue
					if ((ST._grabPlaceHostDiag = (ST._grabPlaceHostDiag || 0) + 1) <= 60)
						log("HOST grabPlace @", msg.x, msg.y, "et=" + msg.et, "before=" + before, "after=" + after, (after >= ELEMENTS_MIN && after <= ELEMENTS_MAX) ? "[OK placé]" : "[!! rien après createAt — perdu/occupé]");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "fireB") {
				// MITYGACJA (Knight-HD: "flamethrower klienta robi dziury w fundamentach/piramidzie"):
				// stary replay palił KAŻDĄ komórkę (burnElementAt+createAt) bez waniliowych guardów,
				// niszcząc TEREN. Teraz: teren (cellId 1..1000) = NIETYKALNY; pusto (0) = tylko płomień;
				// element = tylko burnElementAt (zapala palne). Knight pracuje nad pełnym fixem — welcome.
				const el = ST.FH.elements, fi = ST.FH.fire, c = msg.c || [];
				const shF = state.shared, simF = shF && shF.sim && shF.sim.cellIds;
				const simF32 = simF ? new Uint32Array(simF.buffer, simF.byteOffset, simF.length) : null;
				const WF = (shF && shF.mapData && shF.mapData.width) || 0;
				ST._applyingNet = true;
				try {
					for (let i = 0; i + 1 < c.length; i += 2) {
						const x = c[i], y = c[i + 1];
						const cid = simF32 && WF ? simF32[x + y * WF] : 0;
						if (cid > 0 && cid < ELEMENTS_MIN) continue; // TEREN (fundamenty, skały, piramida) — nie dotykamy
						if (cid === 0) { try { if (el && el.createAt) el.createAt(state, x, y, RJ_FIRE); } catch (e) {} } // puste powietrze → płomień
						else { try { if (fi && fi.burnElementAt) fi.burnElementAt(state, x, y); } catch (e) {} } // element → zapal (palne zapłoną, reszta zostaje)
					}
				} finally { ST._applyingNet = false; }
				if (!ST._fireLogged) { ST._fireLogged = true; log("HOST: ogień klienta odtworzony (z ochroną terenu),", c.length / 2, "komórek"); }
			} else if (msg.k === "shakeB") {
				// shake klienta: residue do świata (tylko puste komórki) + licznik procesu ShakeWetSand
				const elS = ST.FH.elements, cS = msg.c || [];
				ST._applyingNet = true;
				try {
					for (let i = 0; i + 1 < cS.length; i += 2) {
						try { if (ST.FH.factory && ST.FH.factory.recordProcess) ST.FH.factory.recordProcess(state, 0 /* ShakeWetSand */); } catch (e) {}
						try { if (ST.FH.world && ST.FH.world.isCellEmpty && ST.FH.world.isCellEmpty(state, cS[i], cS[i + 1]) && elS && elS.createAt) elS.createAt(state, cS[i], cS[i + 1], 6 /* RJ.Residue */); } catch (e) {}
					}
				} finally { ST._applyingNet = false; }
				if (!ST._shakeLogged) { ST._shakeLogged = true; log("HOST: shake klienta odtworzony (residue+proces),", cS.length / 2, "slotów"); }
			} else if (msg.k === "volcB") {
				// lawa volcanizera klienta: TYLKO w puste komórki (jak vanilla isCellEmpty) — teren nietykalny
				const elV = ST.FH.elements, cV = msg.c || [];
				ST._applyingNet = true;
				try { for (let i = 0; i + 1 < cV.length; i += 2) { try { if (ST.FH.world && ST.FH.world.isCellEmpty && ST.FH.world.isCellEmpty(state, cV[i], cV[i + 1]) && elV && elV.createAt) elV.createAt(state, cV[i], cV[i + 1], 19 /* RJ.Lava */); } catch (e) {} } } finally { ST._applyingNet = false; }
				if (!ST._volcLogged) { ST._volcLogged = true; log("HOST: lawa klienta odtworzona,", cV.length / 2, "komórek"); }
			} else if (msg.k === "caulkB") {
				// spray caulku: typ elementu rozwiązywany dynamicznie (mod-element, runtime id); tylko puste komórki
				const elC = ST.FH.elements, cC = msg.c || [];
				let caulkTy = null;
				try { caulkTy = elC && elC.getElementTypeFromId && elC.getElementTypeFromId(state, "caulk"); } catch (e) {}
				ST._applyingNet = true;
				try { if (caulkTy != null) for (let i = 0; i + 1 < cC.length; i += 2) { try { if (ST.FH.world && ST.FH.world.isCellEmpty && ST.FH.world.isCellEmpty(state, cC[i], cC[i + 1]) && elC.createAt) elC.createAt(state, cC[i], cC[i + 1], caulkTy); } catch (e) {} } } finally { ST._applyingNet = false; }
				if (!ST._caulkLogged) { ST._caulkLogged = true; log("HOST: caulk klienta odtworzony,", cC.length / 2, "komórek (typ=" + caulkTy + ")"); }
			} else if (msg.k === "caulkRmB") {
				// usuwanie caulku: 1:1 z logiką gry — element caulk → elements.removeAt; teren TYLKO gdy
				// isPosTerrainId 'solidite' → terrains.removeAt. Żaden inny teren nie jest dotykany.
				const elR = ST.FH.elements, trR = ST.FH.terrains, cR = msg.c || [];
				let caulkTy2 = null;
				try { caulkTy2 = elR && elR.getElementTypeFromId && elR.getElementTypeFromId(state, "caulk"); } catch (e) {}
				ST._applyingNet = true;
				try {
					for (let i = 0; i + 1 < cR.length; i += 2) {
						const x = cR[i], y = cR[i + 1];
						try {
							const ty = elR && elR.getResolvedTypeAtPos && elR.getResolvedTypeAtPos(state, x, y);
							if (caulkTy2 != null && ty === caulkTy2) { if (elR.removeAt) elR.removeAt(state, x, y); }
							else if (trR && trR.isPosTerrainId && trR.isPosTerrainId(state, x, y, "solidite") && trR.removeAt) trR.removeAt(state, x, y);
						} catch (e) {}
					}
				} finally { ST._applyingNet = false; }
				if (!ST._caulkRmLogged) { ST._caulkRmLogged = true; log("HOST: usuwanie caulku klienta odtworzone,", cR.length / 2, "komórek"); }
			} else if (msg.k === "cryoB") {
				const el = ST.FH.elements, c = msg.c || [];
				ST._applyingNet = true;
				try { for (let i = 0; i + 1 < c.length; i += 2) { try { if (el && el.createAt) el.createAt(state, c[i], c[i + 1], RJ_FREEZINGICE); } catch (e) {} } } finally { ST._applyingNet = false; }
				if (!ST._cryoLogged) { ST._cryoLogged = true; log("HOST: lód klienta odtworzony,", c.length / 2, "komórek"); }
			}
		} catch (e) { log("replay error:", msg.k, e.message); }
	}

	// szuka zagnieżdżonego namespace w FH (np. world.items) po nazwie funkcji
	function deepFindNs(nsName, fnName) {
		const FH = ST.FH;
		if (!FH) return null;
		for (const k of Object.keys(FH)) {
			try {
				const ns = FH[k] && FH[k][nsName];
				if (ns && typeof ns[fnName] === "function") return ns;
			} catch (e) {}
		}
		return null;
	}

	// ------------------------------------------------------------------
	// HUD
	// ------------------------------------------------------------------
	const showInviteButton = (show) => {
		if (ST._hud) ST._hud.querySelector("#st-invite").style.display = show ? "inline-block" : "none";
	};
	function updateLobbyIdDisplay() {
		if (!ST._hud) return;
		const el = ST._hud.querySelector("#st-lobbyid");
		if (!el) return;
		// STREAMER-SAFE (MFeltmann): ID zamaskowane na ekranie — klik kopiuje PEŁNE id do schowka
		// bez pokazywania go (widzowie streamu nie wejdą do lobby z podglądu).
		if (ST.net.lobbyId) { el.textContent = "Lobby ID: ●●●●●●…" + String(ST.net.lobbyId).slice(-3) + " 📋 (click = copy)"; el.style.display = "block"; }
		else el.style.display = "none";
	}
	function updatePingDisplay() {
		if (!ST._hud) return;
		const el = ST._hud.querySelector("#st-ping");
		if (!el) return;
		if (!ST.peers.size) { el.textContent = ""; return; }
		const parts = [];
		for (const p of ST.peers.values()) parts.push((p.nick || "Player") + ": " + (p.ping != null ? p.ping + "ms" : "…"));
		el.textContent = "Ping — " + parts.join("  |  ");
	}

	function buildHud() {
		if (ST._hud) return;
		const hud = document.createElement("div");
		hud.id = "st-hud";
		hud.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;background:rgba(10,10,14,.85);color:#ddd;font:12px monospace;padding:8px 10px;border:1px solid #444;border-radius:6px;user-select:none;min-width:210px";
		hud.innerHTML =
			'<div id="st-head" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
			'<span style="font-weight:bold;color:#ffb454">SandTogether <span style="color:#666">' + VER + '</span> <span style="color:#555;font-size:9px">' + t("by") + "</span></span>" +
			'<span id="st-collapse" style="color:#888;font-size:14px;line-height:1">▾</span>' +
			"</div>" +
			'<div id="st-body">' +
			'<div id="st-status" style="margin:4px 0;color:#aaa">' + t("offline") + "</div>" +
			'<div id="st-sync" style="margin:2px 0;color:#7af;font-size:10px"></div>' +
			'<div id="st-ping" style="margin:2px 0;color:#fc7;font-size:10px"></div>' +
			'<div id="st-lobbyid" style="margin:2px 0;color:#9f9;font-size:10px;display:none"></div>' +
			'<div id="st-buttons">' +
			'<button id="st-host">' + t("btn_host") + "</button> " +
			'<button id="st-invite" style="display:none">' + t("btn_invite") + "</button><br>" +
			'<button id="st-host-lan">' + t("btn_host_lan") + "</button> " +
			'<button id="st-join-lan">' + t("btn_join_lan") + "</button> " +
			'<button id="st-stop">' + t("btn_stop") + "</button><br>" +
			'<button id="st-send-world">' + t("btn_send_world") + "</button> " +
			'<button id="st-resync">' + t("btn_resync") + "</button><br>" +
			'<button id="st-join-id">' + t("btn_join_id") + "</button>" +
			// Wiersz z polem IP dla Join LAN — Electron/Chromium NIE obsługuje window.prompt(),
			// więc adres wpisuje się tu, w panelu (nie przez dialog przeglądarki).
			'<div id="st-lan-row" style="display:none;margin-top:4px">' +
			'<input id="st-lan-addr" placeholder="ip or ip:port" value="127.0.0.1:27777" spellcheck="false" ' +
			'style="width:150px;background:#111;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;padding:2px 4px"> ' +
			'<button id="st-lan-go">' + t("btn_connect") + "</button>" +
			"</div>" +
			// czat drużynowy (host relayuje między klientami)
			'<div id="st-chat-log" style="margin-top:4px;max-height:72px;overflow:hidden;font-size:10px;color:#cde;line-height:1.35"></div>' +
			'<div id="st-chat-row" style="margin-top:2px">' +
			'<input id="st-chat-in" placeholder="' + t("chat_ph") + '" maxlength="200" spellcheck="false" ' +
			'style="width:150px;background:#111;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;padding:2px 4px"> ' +
			'<button id="st-chat-send">➤</button>' +
			"</div>" +
			"</div>" +
			'<div id="st-hint" style="margin-top:4px;color:#666;font-size:10px">' + t("hint") + "</div>" +
			"</div>";
		document.body.appendChild(hud);
		for (const b of hud.querySelectorAll("button")) b.style.cssText = "background:#222;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;cursor:pointer;margin:1px;padding:2px 6px";
		hud.querySelector("#st-host").onclick = async () => { setStatus(t("creating_lobby")); const r = await net.hostSteam(); if (!r.ok) setStatus(t("error", r.error), "#f66"); };
		hud.querySelector("#st-invite").onclick = () => net.invite();
		hud.querySelector("#st-host-lan").onclick = async () => { const r = await net.hostWs(27777); if (!r.ok) setStatus(t("error", r.error), "#f66"); };
		// Join LAN: pokaż wbudowane pole na adres (window.prompt nie działa w Electronie) i połącz
		const lanRow = hud.querySelector("#st-lan-row");
		const lanInput = hud.querySelector("#st-lan-addr");
		async function doJoinLan() {
			const addr = (lanInput.value || "").trim();
			if (!addr) { lanInput.focus(); return; }
			const [h, p] = addr.split(":");
			if (!h) { setStatus(t("error", t("join_prompt")), "#f66"); lanInput.focus(); return; }
			setStatus(t("creating_lobby"));
			const r = await net.joinWs(h, parseInt(p || "27777", 10));
			if (!r.ok) setStatus(t("error", r.error), "#f66");
			else { lanRow.style.display = "none"; lanInput.blur(); } // oddaj klawiaturę grze (input z fokusem połyka WASD)
		}
		// Klawisze wpisywane w pole IP nie mogą docierać do gry (keyup w grze NIE filtruje INPUT-ów;
		// bąbelkują do window — stopPropagation na inpucie ucina całą klasę problemu)
		lanInput.addEventListener("keydown", (e) => e.stopPropagation());
		lanInput.addEventListener("keyup", (e) => e.stopPropagation());
		hud.querySelector("#st-join-lan").onclick = () => {
			const showing = lanRow.style.display !== "none";
			if (!showing) { lanRow.style.display = "block"; lanInput.focus(); lanInput.select(); }
			else doJoinLan(); // drugie kliknięcie = połącz z wpisanym adresem
		};
		hud.querySelector("#st-lan-go").onclick = doJoinLan;
		lanInput.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); doJoinLan(); } };
		// CZAT: wysyłka Enterem/przyciskiem; klawisze nie przeciekają do gry (jak pole LAN)
		const chatIn = hud.querySelector("#st-chat-in");
		const chatSend = () => {
			const m = (chatIn.value || "").trim();
			if (!m || ST.net.role === "idle") return;
			chatIn.value = "";
			try { net.send({ t: "chat", m }); } catch (e) {}
			addChat(t("chat_me"), m);
		};
		hud.querySelector("#st-chat-send").onclick = chatSend;
		chatIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); chatSend(); } });
		chatIn.addEventListener("keyup", (e) => e.stopPropagation());
		hud.querySelector("#st-stop").onclick = () => { setClientPaused(false); net.stop(); };
		hud.querySelector("#st-send-world").onclick = sendWorld;
		hud.querySelector("#st-resync").onclick = () => net.send({ t: "resync" });
		// Dołączanie po Lobby ID ze schowka (omija zaproszenia Steam — wkład dotNine)
		hud.querySelector("#st-join-id").onclick = async () => {
			let id;
			try { id = (await navigator.clipboard.readText()).trim(); } catch (e) { setStatus(t("error", "clipboard: " + e.message), "#f66"); return; }
			if (!id || !/^\d{5,}$/.test(id)) { setStatus(t("clipboard_no_id"), "#f66"); return; }
			setStatus(t("creating_lobby"));
			const r = await net.joinSteam(id);
			if (!r.ok) setStatus(t("error", r.error), "#f66");
		};
		const lobbyEl = hud.querySelector("#st-lobbyid");
		lobbyEl.style.cursor = "pointer"; lobbyEl.title = "Click to copy";
		lobbyEl.onclick = async () => {
			if (!ST.net.lobbyId) return;
			try { await navigator.clipboard.writeText(ST.net.lobbyId); lobbyEl.textContent = t("lobby_copied"); setTimeout(updateLobbyIdDisplay, 900); }
			catch (e) { log("clipboard copy error:", e.message); }
		};
		// Zwijanie/rozwijanie klikiem w nagłówek — BEZ klawiszy gry (F9 kolidował z quick-load!)
		let collapsed = false;
		const body = hud.querySelector("#st-body");
		const arrow = hud.querySelector("#st-collapse");
		const setCollapsed = (c) => { collapsed = c; body.style.display = c ? "none" : "block"; arrow.textContent = c ? "▸" : "▾"; };
		hud.querySelector("#st-head").onclick = () => setCollapsed(!collapsed);
		// Bezpieczny skrót Ctrl+Shift+H, przechwycony (capture) i zablokowany, żeby NIE trafił do gry
		window.addEventListener("keydown", (e) => {
			if (e.ctrlKey && e.shiftKey && e.code === "KeyH") { e.preventDefault(); e.stopImmediatePropagation(); setCollapsed(!collapsed); }
		}, true);
		ST._hud = hud;
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildHud);
	else buildHud();

	// Backstop: jeśli po 12 s stan gry wciąż nie został przechwycony,
	// znaczy że krytyczny hak (frame:update) nie zadziałał → niewspierana wersja gry.
	setTimeout(() => {
		if (!ST.state) {
			log("BACKSTOP: brak stanu gry po 12s — frame hook nie działa (niewspierana wersja?)");
			if (ST._hud) { setStatus(t("unsupported"), "#f66"); }
		}
	}, 12000);

	// ------------------------------------------------------------------
	// Transfer save'a (wspólna mapa startowa)
	// ------------------------------------------------------------------
	async function sendWorld() {
		try {
			if (ST.net.role === "idle") { setStatus(t("connect_first"), "#f66"); return; }
			const saves = await window.electron.getSaveFiles();
			if (!saves || !saves.length) { setStatus(t("no_saves"), "#f66"); return; }
			const ts = (s) => s.timestamp || s.updatedAt || s.savedAt || s.time || s.date || 0;
			saves.sort((a, b) => (ts(a) > ts(b) ? 1 : -1));
			const save = saves[saves.length - 1];
			setStatus(t("exporting", save.name || save.id), "#ff5");
			const res = await window.electron.exportSave(save.id);
			if (!res || !res.success) { setStatus(t("export_err", res && res.error), "#f66"); return; }
			const bytes = new Uint8Array(res.data.data || res.data);
			const b64 = b64enc(bytes);
			const CH = 49152; // 48 KB/paczkę — bezpiecznie pod limitami Steam P2P
			const total = Math.ceil(b64.length / CH);
			const parts = new Array(total);
			for (let i = 0; i < total; i++) parts[i] = b64.substr(i * CH, CH);
			// kolejka do wysyłki z rozłożeniem w czasie (nie blast) + zapamiętane do ponowienia
			ST._wtx = { name: save.name || save.id, parts, total, queue: [], sent: 0, sizeKB: Math.round(bytes.length / 1024) };
			for (let i = 0; i < total; i++) ST._wtx.queue.push(i);
			net.send({ t: "world-begin", name: ST._wtx.name, size: bytes.length, chunks: total });
			setStatus(t("world_sent", ST._wtx.sizeKB, total), "#5f5");
			pumpWtx();
		} catch (e) { setStatus(t("export_err", e.message), "#f66"); log("sendWorld error:", e); }
	}

	// wysyła kawałki paczkami po kilka, z przerwami — Steam P2P nie gubi paczek gdy bufor nie jest zapchany
	function pumpWtx() {
		const w = ST._wtx;
		if (!w) return;
		if (ST._wtxTimer) return; // już pompuje
		const step = () => {
			if (!ST._wtx) { ST._wtxTimer = null; return; }
			const w = ST._wtx;
			let n = 0;
			while (w.queue.length && n < 4) { // 4 paczki na tick
				const i = w.queue.shift();
				net.send({ t: "world-chunk", i, data: w.parts[i] });
				w.sent++; n++;
			}
			if (w.queue.length) { ST._wtxTimer = setTimeout(step, 25); } // ~160 paczek/s = ~7.5 MB/s
			else { net.send({ t: "world-end" }); ST._wtxTimer = null; }
		};
		ST._wtxTimer = setTimeout(step, 0);
	}

	// ------------------------------------------------------------------
	// Duszki
	// ------------------------------------------------------------------
	function ensureGhostCanvas() {
		const game = document.getElementById("canvas");
		if (!game) return null;
		let gc = ST._ghostCanvas;
		if (!gc) {
			gc = document.createElement("canvas");
			gc.id = "st-ghosts";
			gc.style.cssText = "position:absolute;pointer-events:none;z-index:5000";
			game.parentElement.appendChild(gc);
			ST._ghostCanvas = gc;
		}
		const r = game.getBoundingClientRect();
		if (gc.width !== game.width || gc.height !== game.height) { gc.width = game.width; gc.height = game.height; }
		gc.style.left = r.left + "px"; gc.style.top = r.top + "px";
		gc.style.width = r.width + "px"; gc.style.height = r.height + "px";
		return gc;
	}

	// --- kolory per-gracz + strzałka do gracza poza ekranem (wkład dotNine) ---
	const PEER_PALETTE = [
		{ body: "#4fc3f7", dark: "#01579b" },
		{ body: "#ff8a65", dark: "#bf360c" },
		{ body: "#ba68c8", dark: "#4a148c" },
		{ body: "#aed581", dark: "#33691e" },
		{ body: "#ffd54f", dark: "#e65100" },
	];
	function peerColor(id) {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
		return PEER_PALETTE[h % PEER_PALETTE.length];
	}
	const EDGE_INDICATOR_MARGIN = 40;
	function drawOffscreenIndicator(ctx, gc, screen, color, label) {
		const cx = gc.width / 2, cy = gc.height / 2;
		const dx = screen.x - cx, dy = screen.y - cy;
		if (!dx && !dy) return;
		const halfW = gc.width / 2 - EDGE_INDICATOR_MARGIN, halfH = gc.height / 2 - EDGE_INDICATOR_MARGIN;
		const scale = Math.min(Math.abs(halfW / (dx || 1e-6)), Math.abs(halfH / (dy || 1e-6)));
		const ex = Math.max(26, Math.min(gc.width - 26, cx + dx * scale));
		const ey = Math.max(26, Math.min(gc.height - 26, cy + dy * scale));
		const angle = Math.atan2(dy, dx);
		ctx.save();
		ctx.translate(ex, ey); ctx.rotate(angle);
		ctx.fillStyle = color.body; ctx.strokeStyle = color.dark; ctx.lineWidth = 2.5;
		ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-13, -14); ctx.lineTo(-13, 14); ctx.closePath();
		ctx.fill(); ctx.stroke();
		ctx.restore();
		ctx.font = "bold 11px monospace"; ctx.textAlign = "center";
		ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.9)"; ctx.lineWidth = 3.5;
		const ly = ey + (dy < 0 ? -24 : 30);
		ctx.strokeText(label, ex, ly); ctx.fillText(label, ex, ly);
	}

	// --- Modele graczy: prawdziwe sprite'y sklonowane z silnika gry (wkład dotNine) ---
	const NAMETAG_OFFSET_PX = 46;
	const PUPPET_ANCHOR_DX = 6, PUPPET_ANCHOR_DY = 13; // korekta zakotwiczenia względem store.player.x/y (do strojenia)
	const PUPPET_PART_ORDER = ["body", "weapon", "builder", "buildTool", "cryoblaster", "vacuum", "forearm", "shovel", "flamethrower", "rocketLauncher", "offhandShovel"];
	const PUPPET_ALWAYS_PARTS = new Set(["body", "forearm"]);
	const PUPPET_TOOL_PARTS = PUPPET_PART_ORDER.filter((n) => !PUPPET_ALWAYS_PARTS.has(n));
	const MUZZLE_FLASH_MS = 90;
	const AIM_PART_NAMES = new Set(PUPPET_TOOL_PARTS);
	function cloneSpriteObj(src) {
		try {
			if (!src || !src.texture) return null;
			const clone = new src.constructor(src.texture);
			clone.anchor.copyFrom(src.anchor); clone.scale.copyFrom(src.scale);
			clone.x = src.x; clone.y = src.y; clone.rotation = src.rotation; clone.alpha = src.alpha;
			return clone;
		} catch (e) { return null; }
	}
	const clonePlayerPart = (P, name) => cloneSpriteObj(P && P[name]);
	function cloneContainerPart(P, name) {
		try {
			const src = P && P[name];
			if (!src || typeof src.addChild !== "function") return null;
			const wrapper = new src.constructor();
			wrapper.x = src.x; wrapper.y = src.y; wrapper.rotation = src.rotation || 0;
			if (src.scale) wrapper.scale.copyFrom(src.scale);
			for (const child of src.children || []) { const c = cloneSpriteObj(child); if (c) wrapper.addChild(c); }
			return wrapper;
		} catch (e) { return null; }
	}
	function rebuildPuppetParts(state, puppet, toolsSet) {
		try {
			const P = state.session.rendering.pixi.sprites.player;
			puppet.removeChildren(); puppet.__aimParts = [];
			for (const name of PUPPET_PART_ORDER) {
				if (!PUPPET_ALWAYS_PARTS.has(name) && !toolsSet.has(name)) continue;
				const clone = clonePlayerPart(P, name);
				if (!clone) continue;
				puppet.addChild(clone);
				if (AIM_PART_NAMES.has(name)) puppet.__aimParts.push(clone);
			}
			if (puppet.__trail) puppet.addChild(puppet.__trail);
			if (puppet.__muzzleFlash) puppet.addChild(puppet.__muzzleFlash);
		} catch (e) { log("rebuildPuppetParts error:", e.message); }
	}
	function getVisibleTools(state) {
		try { const P = state.session.rendering.pixi.sprites.player; const out = []; for (const n of PUPPET_TOOL_PARTS) if (P[n] && P[n].visible) out.push(n); return out; } catch (e) { return []; }
	}
	function getFacing(state) {
		try { return state.session.rendering.pixi.sprites.player.container.scale.x < 0 ? -1 : 1; } catch (e) { return null; }
	}
	function getAimAngle(state) {
		try {
			const mouse = state.session.input && state.session.input.mouse, pl = state.store.player;
			if (!mouse || !mouse.worldPosition || !pl) return 0;
			return Math.atan2(mouse.worldPosition.y - pl.y, mouse.worldPosition.x - pl.x);
		} catch (e) { return 0; }
	}
	// Pozycja kursora w świecie (ta sama przestrzeń co player.x/y → działa z worldToScreen).
	function getMouseWorld(state) {
		try { const m = state.session.input && state.session.input.mouse; const w = m && m.worldPosition; return w && typeof w.x === "number" ? { x: Math.round(w.x), y: Math.round(w.y) } : null; } catch (e) { return null; }
	}
	// Intencja BUDOWANIA: co gracz zaraz postawi (fantom pozy). Źródło (0.5.4): przy normalnej pozie z hotbara
	// gra trzyma aktywny typ w session.building.activeStructureType (customData.selectedStructures jest TYLKO
	// dla kopiuj-wklej blueprintów → dlatego wcześniej fantom NIGDY się nie pokazywał). Fallback: player.action.id
	// (action Building niesie id=structureId). Blueprint copy: dokładamy offsety z selectedStructures.
	function getBuildIntent(state) {
		try {
			const ss = state.session || {};
			const pl = state.store && state.store.player;
			let bt = ss.building && ss.building.activeStructureType;
			// GŁÓWNE ŹRÓDŁO (potwierdzone GHOST-DIAG): activeStructureType jest null przy HOVER; typ wybranego
			// budynku bierzemy z aktywnego slotu hotbara: hotbar.bars[hotbarIndex][activeSlotIndex].
			if (bt == null && pl && pl.hotbar && pl.hotbar.activeSlotIndex != null) {
				const bar = pl.hotbar.bars && pl.hotbar.bars[pl.hotbar.hotbarIndex];
				const item = bar && bar[pl.hotbar.activeSlotIndex];
				if (item != null) bt = (typeof item === "object") ? (item.structureType != null ? item.structureType : item.type != null ? item.type : item.id) : item;
			}
			if (bt == null) {
				const a = pl && pl.action;
				if (a && a.id != null) bt = a.id; // {type:Building, id:structureId}
			}
			// DIAG (jednorazowo): slot hotbara aktywny, ale nie znaleźliśmy typu → zrzuć KSZTAŁT itemu hotbara + stan
			if (bt == null && pl && pl.hotbar && pl.hotbar.activeSlotIndex != null && !ST._biDumped) {
				ST._biDumped = true;
				try {
					const hb = pl.hotbar, bar = hb.bars && hb.bars[hb.hotbarIndex], item = bar && bar[hb.activeSlotIndex];
					log("GHOST-DIAG: activeSlot=" + hb.activeSlotIndex + " hotbarIndex=" + hb.hotbarIndex,
						"ITEM=" + JSON.stringify(item) + " (typeof " + typeof item + (item && typeof item === "object" ? " keys=" + Object.keys(item).join(",") : "") + ")",
						"hotbar keys=" + Object.keys(hb).join(","),
						"session.building=" + JSON.stringify(ss.building));
				} catch (e2) { log("GHOST-DIAG err:", e2.message); }
			}
			if (bt == null) return null;
			if (!ST._biOk) { ST._biOk = true; log("GHOST OK: intencja pozy wykryta, bt=" + JSON.stringify(bt)); }
			// blueprint (kopiuj-wklej): kilka struktur z offsetami; single-struct → [[0,0]] pod kursorem
			const cd = ss.action && ss.action.customData;
			const sel = cd && Array.isArray(cd.selectedStructures) ? cd.selectedStructures : null;
			let offs = [[0, 0]];
			if (sel && sel.length > 1) { offs = []; for (let i = 0; i < sel.length && i < 24; i++) offs.push([(sel[i].x | 0), (sel[i].y | 0)]); }
			return { bt, offs };
		} catch (e) { return null; }
	}
	function getTrailAlpha(state) {
		try {
			const tc = state.session.rendering.pixi.sprites.player.trailContainer;
			if (!tc) return 0;
			if (tc.alpha > 0) return Math.round(tc.alpha * 100) / 100;
			const child = tc.children && tc.children[0];
			return child ? Math.round(child.alpha * 100) / 100 : 0;
		} catch (e) { return 0; }
	}
	function getPuppetParent(state) { try { return state.session.rendering.pixi.sprites.player.container.parent || null; } catch (e) { return null; } }
	function ensurePeerPuppet(state, id) {
		const parent = getPuppetParent(state);
		if (!parent) return null;
		let pp = ST.peerPuppets.get(id);
		if (pp) { if (pp.parent === parent && !pp.puppet._destroyed) return pp; try { pp.parent.removeChild(pp.puppet); } catch (e) {} ST.peerPuppets.delete(id); pp = null; }
		try {
			const P = state.session.rendering.pixi.sprites.player;
			if (!P || !P.container) return null;
			const puppet = new P.container.constructor();
			const muzzleFlash = clonePlayerPart(P, "muzzleFlash");
			if (muzzleFlash) { muzzleFlash.visible = false; puppet.__muzzleFlash = muzzleFlash; }
			const trail = cloneContainerPart(P, "trailContainer");
			if (trail) { trail.alpha = 0; puppet.__trail = trail; }
			rebuildPuppetParts(state, puppet, new Set());
			parent.addChild(puppet);
			pp = { puppet, parent, toolsKey: "", muzzleFlash, flashUntil: 0 };
			ST.peerPuppets.set(id, pp);
			return pp;
		} catch (e) { log("ensurePeerPuppet error:", e.message); return null; }
	}
	function removePeerPuppet(id) { const pp = ST.peerPuppets.get(id); if (!pp) return; try { pp.parent.removeChild(pp.puppet); } catch (e) {} ST.peerPuppets.delete(id); }
	function removeAllPeerPuppets() { for (const id of [...ST.peerPuppets.keys()]) removePeerPuppet(id); }
	function worldToScreen(state, wx, wy) {
		try { const pos = ST.FH && ST.FH.rendering && ST.FH.rendering.getDrawPos && ST.FH.rendering.getDrawPos(state, wx, wy); if (pos && typeof pos.x === "number") return pos; } catch (e) {}
		const cam = state.session && state.session.camera;
		return cam ? { x: wx - cam.x, y: wy - cam.y } : { x: wx, y: wy };
	}
	function peerProjectileCount(id, p) { return ST.net.role === "client" ? (ST.remoteProjectiles || []).length : (p.projectiles || []).length; }

	function drawGhosts(state) {
		if (!ST.peers.size) { if (ST.peerPuppets.size) removeAllPeerPuppets(); return; }
		const gc = ensureGhostCanvas();
		const ctx = gc && gc.getContext("2d");
		if (ctx) ctx.clearRect(0, 0, gc.width, gc.height);
		const now = performance.now();
		for (const [id, p] of ST.peers) {
			const dtSince = Math.min(now - (p.tUpdate || now), 250);
			const predX = p.tx + (p.vx || 0) * dtSince, predY = p.ty + (p.vy || 0) * dtSince;
			p.x += (predX - p.x) * 0.35; p.y += (predY - p.y) * 0.35;
			const stale = now - p.lastSeen > 3000;
			const speed = Math.hypot(p.vx || 0, p.vy || 0);
			if (speed > 0.02 && p.syncedFacing == null) p.facing = (p.vx || 0) < 0 ? -1 : 1;
			const facing = (p.syncedFacing === 1 || p.syncedFacing === -1) ? p.syncedFacing : (p.facing || 1);
			const screen = worldToScreen(state, p.x + PUPPET_ANCHOR_DX, p.y + PUPPET_ANCHOR_DY);
			const pp = ensurePeerPuppet(state, id);
			if (pp) {
				pp.puppet.x = screen.x; pp.puppet.y = screen.y;
				pp.puppet.scale.x = facing; pp.puppet.alpha = stale ? 0.35 : 1; pp.puppet.visible = true;
				const toolsKey = (p.tools || []).join(",");
				if (pp.toolsKey !== toolsKey) { rebuildPuppetParts(state, pp.puppet, new Set(p.tools || [])); pp.toolsKey = toolsKey; }
				const localAim = facing === -1 ? Math.PI - (p.aim || 0) : (p.aim || 0);
				if (pp.puppet.__aimParts) for (const part of pp.puppet.__aimParts) part.rotation = localAim;
				if (pp.puppet.__trail) pp.puppet.__trail.alpha = p.trailAlpha || 0;
				const projCount = peerProjectileCount(id, p);
				if (projCount > (p._lastProjCount || 0)) pp.flashUntil = now + MUZZLE_FLASH_MS;
				p._lastProjCount = projCount;
				if (pp.muzzleFlash) pp.muzzleFlash.visible = now < pp.flashUntil;
			}
			const onScreen = gc && screen.x > -20 && screen.y > -20 && screen.x < gc.width + 20 && screen.y < gc.height + 20;
			if (ctx && gc && onScreen) {
				ctx.globalAlpha = stale ? 0.4 : 1;
				ctx.font = "10px monospace"; ctx.textAlign = "center";
				ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3;
				ctx.strokeText(p.nick, screen.x, screen.y - NAMETAG_OFFSET_PX);
				ctx.fillText(p.nick, screen.x, screen.y - NAMETAG_OFFSET_PX);
				ctx.globalAlpha = 1;
			} else if (ctx && gc && !stale) {
				if (!p.color) p.color = peerColor(id);
				ctx.globalAlpha = 0.85; drawOffscreenIndicator(ctx, gc, screen, p.color, p.nick); ctx.globalAlpha = 1;
			}
		}
		if (ctx && gc) {
			ctx.fillStyle = "#ffd54f";
			const drawProj = (list) => {
				if (!list) return;
				for (const pr of list) { const s = worldToScreen(state, pr.x, pr.y); if (s.x < -20 || s.y < -20 || s.x > gc.width + 20 || s.y > gc.height + 20) continue; ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
			};
			drawProj(ST.remoteProjectiles);
			for (const p of ST.peers.values()) drawProj(p.projectiles);
		}
		// --- Preview akcji w czasie rzeczywistym (temps réel): fantom pozy + reticle grabbera/vacuum ---
		// Pokazuje GDZIE inny gracz zaraz postawi budynek / gdzie zbiera zasoby — żeby nie robić tego w tym
		// samym miejscu. Rysowane w kolorze gracza. Kursor w świecie (mwx/mwy) + intencja budowy (bt/boffs).
		if (ctx && gc) {
			for (const [id, p] of ST.peers) {
				if (p.mwx == null || p.mwy == null || now - p.lastSeen > 3000) continue;
				if (!p.color) p.color = peerColor(id);
				const cur = worldToScreen(state, p.mwx, p.mwy);
				if (cur.x < -80 || cur.y < -80 || cur.x > gc.width + 80 || cur.y > gc.height + 80) continue;
				const s1 = worldToScreen(state, p.mwx + 4, p.mwy); // +1 komórka (=4 world) → piksele/komórkę (skala zoomu)
				let ppc = Math.abs(s1.x - cur.x); if (!(ppc > 0.5)) ppc = 6;
				if (p.bt != null && Array.isArray(p.boffs) && p.boffs.length) {
					// FANTOM POZY — prostokąty tam, gdzie gracz zaraz postawi (pierwszy offset = pod kursorem)
					const base = p.boffs[0];
					ctx.save();
					ctx.strokeStyle = p.color.body; ctx.fillStyle = p.color.body; ctx.lineWidth = 2;
					const sz = Math.max(8, ppc);
					for (const off of p.boffs) {
						const wx = p.mwx + (((off && off[0]) | 0) - (base[0] | 0)) * 4, wy = p.mwy + (((off && off[1]) | 0) - (base[1] | 0)) * 4;
						const s = worldToScreen(state, wx, wy);
						ctx.globalAlpha = 0.22; ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
						ctx.globalAlpha = 0.9; ctx.strokeRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
					}
					ctx.restore();
				} else if ((p.tools || []).indexOf("vacuum") >= 0) {
					// RETICLE grabbera/vacuum — okrąg zasięgu tam, gdzie gracz zbiera (żeby nie brać tych samych zasobów)
					const r = Math.max(10, ppc * 4); // ~R=4 komórki (zasięg vacuum z hostHarvestVacuum)
					ctx.save();
					ctx.strokeStyle = p.color.body; ctx.fillStyle = p.color.body; ctx.lineWidth = 2;
					ctx.globalAlpha = 0.9; ctx.setLineDash([5, 4]);
					ctx.beginPath(); ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2); ctx.stroke();
					ctx.setLineDash([]);
					ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cur.x, cur.y, 2.5, 0, Math.PI * 2); ctx.fill();
					ctx.restore();
				}
			}
			ctx.globalAlpha = 1;
		}
	}

	// ------------------------------------------------------------------
	// Hook per-frame (patch w bundle.js)
	// ------------------------------------------------------------------
	ST._frame = (state, FH) => {
		if (!ST.state) {
			ST.state = state;
			if (FH) ST.FH = FH;
			log("Stan gry przechwycony! scene:", state.store && state.store.scene && state.store.scene.active,
				"worldId:", state.store && state.store.meta && state.store.meta.worldId,
				"FH:", FH ? Object.keys(FH).slice(0, 25).join(",") : "BRAK");
		}
		if (FH && !ST.FH) ST.FH = FH;
		// wykrycie zmiany sceny/świata (przeładowanie stanu)
		if (ST.state !== state) { ST.state = state; ST.wsx.paused = false; log("Nowy obiekt stanu (zmiana sceny?)"); }
		// Garde anti-flood pozy: przy wejściu do świata (zmiana scene.active) gra rekonstruuje struktury
		// odpalając building:place → nie forwarduj ich przez 3s (patrz ST._place).
		{ const sc = state.store && state.store.scene && state.store.scene.active; if (sc !== ST._lastScene) { ST._lastScene = sc; ST._loadGuardUntil = performance.now() + 3000; } }
		if (!ST._debugDumped && state.session && state.session.camera) {
			ST._debugDumped = true;
			try {
				const sh = state.shared || {};
				const dump = {};
				for (const k of Object.keys(sh)) {
					const v = sh[k];
					if (v && v.buffer && v.length !== undefined) dump[k] = v.constructor.name + "[" + v.length + "]";
					else if (v && typeof v === "object") dump[k] = "{" + Object.keys(v).slice(0, 30).join(",") + "}";
					else dump[k] = typeof v;
				}
				log("SHARED:", JSON.stringify(dump));
				if (sh.sim) {
					const sd = {};
					for (const k of Object.keys(sh.sim)) {
						const v = sh.sim[k];
						if (v && v.buffer && v.length !== undefined) sd[k] = v.constructor.name + "[" + v.length + "]";
						else if (v && typeof v === "object" && v !== null) sd[k] = "{" + Object.keys(v).slice(0, 40).join(",") + "}";
						else sd[k] = String(v);
					}
					log("SHARED.sim:", JSON.stringify(sd));
				}
				log("WORLD size:", JSON.stringify(state.store.world && state.store.world.size),
					"env keys:", Object.keys(state.environment || {}).join(","),
					"manager:", managerWorker(state) ? "OK" : "BRAK");
			} catch (e) { log("dump error:", e.message); }
		}
		const now = performance.now();
		if (net && ST.net.role !== "idle" && state.store && state.store.player && now - ST._lastPosSend > 33) {
			ST._lastPosSend = now;
			const pl = state.store.player;
			const bi = getBuildIntent(state);
			const mw = getMouseWorld(state);
			if (bi && !ST._biLogged) { ST._biLogged = true; log("Intencja pozy wykryta (fantom powinien się pokazać u drugiego gracza): bt=" + bi.bt); }
			net.send({ t: "pos", x: Math.round(pl.x * 10) / 10, y: Math.round(pl.y * 10) / 10, tools: getVisibleTools(state), facing: getFacing(state), aim: getAimAngle(state), trail: getTrailAlpha(state),
				mwx: mw ? mw.x : null, mwy: mw ? mw.y : null,           // kursor w świecie (preview akcji)
				bt: bi ? bi.bt : null, boffs: bi ? bi.offs : null });   // intencja pozy: typ + offsety (fantom u innych graczy)
		}
		// ping/pong (RTT) — wysyłka co 1s, odświeżanie HUD co 0.5s (wkład dotNine)
		if (net && ST.net.role !== "idle" && ST.peers.size && now - (ST._lastPingSent || 0) > 1000) {
			ST._lastPingSent = now;
			for (const id of ST.peers.keys()) { try { net.send({ t: "ping", ts: now }, id); } catch (e) {} }
		}
		if (now - (ST._lastPingUi || 0) > 500) { ST._lastPingUi = now; updatePingDisplay(); }
		// world sync + struktury + zasoby + encje
		subscribeGameEvents(state);
		// host: auto-wyślij save gdy jest w świecie z graczami i jeszcze nie wysłał TEGO świata (klucz: worldId).
		// Sprawdzamy stan CIĄGLE (nie edge menu->świat, który przy próbkowaniu łatwo przegapić). (wkład dotNine)
		if (ST.net.role === "host" && ST.peers.size && state.store && state.store.scene && state.store.scene.active !== 1) {
			const wid = (state.store.meta && state.store.meta.worldId) || "unknown";
			if (ST._autoSentWid !== wid) { ST._autoSentWid = wid; sendWorld(); }
		}
		if (isHostSync()) {
			scanDirty(state);
			maybeSendBatch(state);
			sendSnapshotIfDue(state);
			sendResourcesIfDue(state);
			sendEntitiesIfDue(state);
			sendWorldItemsIfChanged(state); // szybkie dropy (G12)
		}
		// Dobijanie po rozbiórce (patrz _demol): 250ms po przeciągnięciu sprawdź, czy w recie zostały
		// struktury pominięte przez grę (kafle utkwione w QUEUED) i zdejmij je przez SA.removeAt.
		// Działa dla HOSTA I SOLO (zacięte klocki siedzą w save'ie — muszą być czyszczalne bez sesji).
		{
			const hd = ST._hostDemolRect;
			if (hd && performance.now() - hd.t > 400) {
				ST._hostDemolRect = null;
				try {
					const SA = structNs();
					if (SA && (hd.x1 - hd.x0 + 1) * (hd.y1 - hd.y0 + 1) <= 40000) {
						const leftovers = new Map();
						for (let y = hd.y0; y <= hd.y1; y++) for (let x = hd.x0; x <= hd.x1; x++) {
							try { const st = SA.getAtCell(state, x, y); if (st) leftovers.set(structKey(st), st); } catch (e) {}
						}
						if (leftovers.size) {
							log("demolish-dobicie: gra pominęła", leftovers.size, "struktur (kafle QUEUED?) — usuwam przez removeAt");
							for (const st of leftovers.values()) { try { SA.removeAt(state, st.x, st.y, {}); } catch (e) {} }
							if (ST.net.role === "host" && ST.peers.size) try { net.send({ t: "st", k: "rm", list: [...leftovers.values()].map(slimStruct) }); } catch (e) {}
							// removeAt może tylko zakolejkować usunięcie. W tym samym przebiegu getAtCell nadal
							// widzi strukturę, więc poniższy sweep terenu słusznie nie ruszy jej czerwonych kafli.
							// Wróć po kolejnych 250 ms, gdy rejestr struktur zdąży się opróżnić. Limit chroni
							// przed nieskończoną pętlą przy faktycznie nieusuwalnej strukturze.
							if ((hd.retry || 0) < 6) ST._hostDemolRect = { ...hd, t: performance.now(), retry: (hd.retry || 0) + 1 };
						}
						// OSIEROCONE KAFLE ("czerwone klocki"): struktura już NIE istnieje (getAtCell=null — log
						// "czysto" przy widocznych klockach!), ale komórki-fundament (terrain Block=15/Sliding 16-18)
						// zostały w świecie — rozbiórka gry czyści komórki tylko przy usuwaniu ŻYWEJ struktury.
						// Rozpoznanie: sim.cellIds → id terenu (1..1000) → sim.terrainType[id]. Usuwamy przez
						// FH.terrains.removeAt WYŁĄCZNIE komórki bez żywej struktury (kafel Block bez struktury = śmieć).
						// Dla klienta czyścimy kafle tylko wtedy, gdy wiadomość zawierała jego dokładny rect
						// zaznaczenia; stare klienty z bboxem anchorów nadal omijają ten krok.
						if (hd.src !== "client" || hd.cleanOrphans) try {
							const sh = state.shared || {};
							const simc = sh.sim && sh.sim.cellIds;
							const tt = sh.sim && sh.sim.terrainType;
							const TR = ST.FH.terrains;
							const { W } = worldBuffers(state);

							if (simc && tt && TR && TR.removeAt && W) {
								const sim = new Uint32Array(simc.buffer, simc.byteOffset, simc.length);
								const H = Math.floor(sim.length / W);
								// BLOB-EXPAND (pomysł TCentraL, PR #6): od osieroconego kafla rozszerzamy się na całą
								// przyległą plamę (czerwone klocki częściowo POZA zaznaczeniem też schodzą).
								// Poprawki po review: (1) typy 15..18 (skosy/schody wróciły — to one były najgorsze),
								// (2) getAtCell per KAŻDĄ komórkę plamy (plama dotykająca ZDROWEGO malowanego
								// fundamentu nie może go zjeść), (3) bez mutowania y w środku pętli (gubiło blob-y),
								// (4) limit ekspansji 64 komórki od seeda (bez maratonu po całej mapie).
								const isOrphanTile = (xx, yy) => {
									const n = sim[xx + yy * W];
									if (n <= 0 || n > 1000) return false;
									const ty2 = tt[n];
									if (ty2 < 15 || ty2 > 18) return false;
									try { if (SA.getAtCell(state, xx, yy)) return false; } catch (e) { return false; }
									return true;
								};
								let cleaned = 0;
								const LIM = 64;
								for (let y = hd.y0; y <= hd.y1; y++) {
									for (let x = hd.x0; x <= hd.x1; x++) {
										if (!isOrphanTile(x, y)) continue;
										let r = x;
										while (r + 1 < W && r - x < LIM && isOrphanTile(r + 1, y)) r++;
										let b = y;
										while (b + 1 < H && b - y < LIM && isOrphanTile(x, b + 1)) b++;
										for (let yy = y; yy <= b; yy++) for (let xx = x; xx <= r; xx++) {
											if (!isOrphanTile(xx, yy)) continue;
											try { TR.removeAt(state, xx, yy); cleaned++; } catch (e) {}
										}
										x = r; // wiersz przeskanowany do r; y zostaje (kolejne wiersze skanuje pętla zewn.)
									}
								}
								if (cleaned) log("demolish-dobicie: usunięto", cleaned, "OSIEROCONYCH kafli (blob-expand)");
							}
						} catch (e) {
							log("ORPHAN CLEANUP ERROR:", e.message);
						}
					}
				} catch (e) { log("demolish-dobicie error:", e.message); }
			}
		}
		if (isClientSync()) {
			// Heartbeat re-pauzy (fix G1): ESC-menu gry śle własne SetPaused(false) przy zamknięciu i cicho
			// wznawiało symulację klienta (nasza flaga wciąż true → setClientPaused nie re-pauzowało) →
			// podwójna symulacja walczyła z lustrem = masywny desync. Wysyłamy [54,true] co 2s — idempotentne.
			if (ST.wsx.paused && now - (ST._rePauseT || 0) > 2000) {
				ST._rePauseT = now;
				const mgr = managerWorker(state);
				if (mgr) try { mgr.postMessage([54, true]); } catch (e) {}
			}
			sendMyProjectilesIfDue(state);
			sendResourceDeltaIfDue(state); // wyślij hostowi przyrosty zasobów klienta (dotNine)
			// flush batchy ognia/lodu co ~60 ms
			if (ST._fireQ.length && now - (ST._lastFireB || 0) > 60) { ST._lastFireB = now; try { net.send({ t: "act", k: "fireB", c: ST._fireQ }); } catch (e) {} ST._fireQ = []; }
			if (ST._cryoQ.length && now - (ST._lastCryoB || 0) > 60) { ST._lastCryoB = now; try { net.send({ t: "act", k: "cryoB", c: ST._cryoQ }); } catch (e) {} ST._cryoQ = []; }
			if (ST._volcQ.length && now - (ST._lastVolcB || 0) > 60) { ST._lastVolcB = now; try { net.send({ t: "act", k: "volcB", c: ST._volcQ }); } catch (e) {} ST._volcQ = []; }
			if (ST._caulkQ.length && now - (ST._lastCaulkB || 0) > 60) { ST._lastCaulkB = now; try { net.send({ t: "act", k: "caulkB", c: ST._caulkQ }); } catch (e) {} ST._caulkQ = []; }
			if (ST._caulkRmQ.length && now - (ST._lastCaulkRmB || 0) > 60) { ST._lastCaulkRmB = now; try { net.send({ t: "act", k: "caulkRmB", c: ST._caulkRmQ }); } catch (e) {} ST._caulkRmQ = []; }
			if (ST._shakeQ.length && now - (ST._lastShakeB || 0) > 60) { ST._lastShakeB = now; try { net.send({ t: "act", k: "shakeB", c: ST._shakeQ }); } catch (e) {} ST._shakeQ = []; }
			// Podpowiedź: połączony, ale host nie wysłał jeszcze świata (brak paczek do odrzucenia = gracz widzi "nic")
			if (!ST.wsx.everApplied && !ST.wsx.mismatchLogged && ST.peers.size > 0 && now - (ST._waitHintT || 0) > 3000) {
				ST._waitHintT = now;
				setStatus(t("waiting_world"), "#fd5");
			}
			// ZMIANA ŚWIATA u klienta (menu/inny save) → wyczyść stan narzędzi związany z poprzednim światem
			// (fix tony: "infinite items" — stary _grabTool/tank z poprzedniego świata + ruchy myszy = spam grabPlace)
			const curWid = state.store.meta && state.store.meta.worldId;
			if (ST._curWid !== curWid) {
				ST._curWid = curWid;
				ST._grabTool = null;
				ST._grabbedCells.clear(); ST._placedCells.clear();
				ST._fireQ = []; ST._cryoQ = []; ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = [];
				if (ST._dataSeen) ST._dataSeen.clear();
				if (ST._dataEdited) ST._dataEdited.clear();
			}
			// profil klienta (G7-lite): zapis co 10s (pozycja+ekwipunek per świat hosta)
			if (now - (ST._profT || 0) > 10000) { ST._profT = now; profileSave(state); }
			scanDataEditsIfDue(state); // konfig maszyn edytowany przez klienta → forward (G5b)
			// zator lustra (fix G4): działało, a od >4s nic nie przychodzi i host NIE zgłasza pauzy → pokaż ile czekamy
			if (ST.wsx.everApplied && !ST._hostPausedShown && ST._lastWcT && now - ST._lastWcT > 4000 && now - (ST._stallHintT || 0) > 2000) {
				ST._stallHintT = now;
				setStatus(t("sync_stalled", Math.round((now - ST._lastWcT) / 1000)), "#fd5");
			}
		}
		drawGhosts(state);
	};
})();
