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
	const VER = "0.9.146-beta";
	const AUTHOR = "Kamil Padula";
	const CONTRIBUTORS = "dotNine, Knight-HD, DwoaC, Cr0ss0vr, TCentraL, AlyxiaFox, NanYu_sad.";
	const VACUUM_CAPS = [500, 1000, 1500, 2000, 2500, 3000]; // tabela pojemności z kodu gry (moduł 6420)
	const RJ_FIRE = 11, RJ_FREEZINGICE = 12; // wartości enuma RJ z obecnego builda (do createAt na hoście)
	const CHUNK = 40;

	// ------------------------------------------------------------------
	// i18n — English by default, Polish auto-detected
	// ------------------------------------------------------------------
	const LANG = (() => {
		try {
			const langs = window.electron && window.electron.getPreferredSystemLanguagesSync ? window.electron.getPreferredSystemLanguagesSync() : [];
			const l = (langs[0] || navigator.language || "en").toLowerCase();
			if (l.startsWith("zh")) return "zh";
			if (l.startsWith("pl")) return "pl";
			return "en";
		} catch (e) { return "en"; }
	})();
	const STRINGS = {
		en: {
			offline: "offline", btn_host: "Host (Steam)", btn_invite: "Invite", btn_host_lan: "Host LAN",
			btn_join_lan: "Join by address", btn_connect: "Connect", btn_stop: "Stop", btn_send_world: "Send world", btn_resync: "Resync",
			host_paused: "Host paused (menu) — world frozen, will resume automatically", sync_stalled: "No world data from host for {0}s…",
			reconnecting: "Connection lost — reconnecting (attempt {0}/5)…",
			left_to_menu: "Left the co-op session (returned to title screen)",
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
			tech_rejected: (id) => "Research '" + id + "' rejected by the host (requirements/cost) — try again",
			tech_repaired: (n) => "Repaired " + n + " broken research unlock(s) — buildings/items restored",
			hairpin_hint: "Connection refused. If the host is on the SAME network as you, use their local address (192.168.x.x) — routers usually refuse connections to your own public IP.",
			waiting_host_world: "Connected — waiting for host to enter a world (it'll load automatically)...",
			receiving: (a, b) => "Receiving world: " + a + "/" + b,
			other_world: "⚠ NOT on host's world! Host: click 'Send world'. You: menu → Load Game → load the received save.",
			dims_differ: (a, b) => "⚠ Different world size (" + a + " vs host " + b + ") — load the host's save via Load Game.",
			sync_up: (kb, ch, q) => "upload: " + kb + " KB/s, " + ch + " chunk/s, queue " + q,
			sync_down: (kb, ch, q) => "host mirror: " + kb + " KB/s, " + ch + " chunk/s" + (q > 0 ? " — " + q + " chunks left" : ""),
			relay_slow: (sec) => "Steam relay is throttling this session (round trip " + sec + " s). Ask the host to restart as Host (Internet — direct) and join by address — the relay cannot carry a live world.",
			loading_world: "Loading the host's world... (a big map can take a few minutes — the game may look frozen)",
			join_prompt: "Host address (ip or ip:port):",
			ver_mismatch: "MOD VERSION MISMATCH — both players must update SandTogether!",
			waiting_world: "Connected. Waiting for host's world — HOST must click 'Send world', then you: menu → Load Game.",
			unsupported: "⚠ Unsupported game version — the game updated and broke the mod. Re-run install, or check the Workshop page for an update.",
			mp_btn: "Multiplayer",
			lb_title: "MULTIPLAYER", lb_sub: "SandTogether co-op — up to 4 players",
			lb_host_steam_d: "Play over the internet — invite friends from your Steam friend list",
			lb_host_lan_d: "Local network or VPN (Tailscale, Radmin...)",
			lb_join_lan_d: "Paste the address your friend gave you — works for an internet host, a LAN or a VPN",
			lb_join_id_d: "Join with a Lobby ID copied to the clipboard",
			lb_close: "✕", lb_disconnect: "Disconnect", lb_players: "Players", lb_you: "you",
			lb_id: "Lobby ID", lb_copy: "copy", lb_copied: "copied!", lb_invite: "Invite a friend",
			lb_play_last: "▶ Load last save & PLAY",
			lb_play_note: "Your world is sent to joined players automatically. You can also just use Continue / Load Game.",
			lb_wait_host: "Waiting for the host's world — it downloads and loads automatically.",
			lb_hint: "Tip: a Steam invite can be accepted at ANY time — everything else happens automatically.",
			btn_host_direct: "Host (Internet — direct)",
			lb_host_direct_d: "Full speed, no Steam relay. Opens the port on your router automatically (UPnP).",
			direct_ready: "DIRECT hosting — give your friend the address below",
			direct_no_upnp: "Port not opened automatically — forward TCP {0} on your router, then share the address",
			bridge_old: "Mod bridge outdated — restart the game (auto-update) or re-run the installer / patch.js",
			direct_addr: "Your address", direct_show: "show", direct_hide: "hide", direct_copied: "Address copied!",
			direct_hidden_hint: "hidden on purpose — safe to stream",
			lb_steps: "1) Invite friends   2) Hit PLAY — they will join your map automatically",
			badge_offline: "○ OFFLINE — not connected",
			badge_host: (tr) => "● HOSTING (" + tr + ")",
			badge_client: (tr) => "● CONNECTED (" + tr + ") — you are a player",
			chat_joined: (n) => n + " joined",
			chat_left: (n) => n + " left",
			lb_nick: "Your nick",
			lb_pick_save: "📂 Choose a save...", lb_pick_save_d: "load a specific world instead of the last one",
			lb_new_note: "New map? Close this window and click New Game — hosting stays active, the world is sent to players when you enter it.",
			host_enter_world_first: "Enter your world first (Continue / Load Game) — it will be sent to players automatically.",
		},
		pl: {
			offline: "offline", btn_host: "Host (Steam)", btn_invite: "Zaproś", btn_host_lan: "Host LAN",
			btn_join_lan: "Dołącz po adresie", btn_connect: "Połącz", btn_stop: "Stop", btn_send_world: "Wyślij świat", btn_resync: "Resync",
			host_paused: "Host w pauzie (menu) — świat zamrożony, wznowi się sam", sync_stalled: "Brak danych świata od hosta od {0}s…",
			reconnecting: "Zerwane połączenie — łączę ponownie (próba {0}/5)…",
			left_to_menu: "Opuszczono sesję co-op (powrót do menu głównego)",
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
			tech_rejected: (id) => "Badanie '" + id + "' odrzucone przez hosta (wymagania/koszt) — spróbuj ponownie",
			tech_repaired: (n) => "Naprawiono " + n + " uszkodzonych badań — budynki/przedmioty przywrócone",
			hairpin_hint: "Połączenie odrzucone. Jeśli host jest w TEJ SAMEJ sieci co Ty, użyj jego adresu lokalnego (192.168.x.x) — routery zwykle nie pozwalają łączyć się z własnym publicznym IP.",
			waiting_host_world: "Połączono — czekam aż host wejdzie do świata (wczyta się automatycznie)...",
			receiving: (a, b) => "Odbieranie świata: " + a + "/" + b,
			other_world: "⚠ NIE jesteś na świecie hosta! Host: kliknij 'Wyślij świat'. Ty: menu → Load Game → wczytaj otrzymany save.",
			dims_differ: (a, b) => "⚠ Inny rozmiar świata (" + a + " vs host " + b + ") — wczytaj save hosta przez Load Game.",
			sync_up: (kb, ch, q) => "wysyłka: " + kb + " KB/s, " + ch + " chunk/s, kolejka " + q,
			sync_down: (kb, ch, q) => "lustro hosta: " + kb + " KB/s, " + ch + " chunk/s" + (q > 0 ? " — zostało " + q + " paczek" : ""),
			relay_slow: (sec) => "Relay Steama dławi to połączenie (obieg " + sec + " s). Poproś hosta, żeby uruchomił Host (internet — bezpośrednio), i dołącz po adresie — relay nie udźwignie żywego świata.",
			loading_world: "Wczytywanie świata hosta... (duża mapa może potrwać kilka minut — gra może wyglądać na zawieszoną)",
			join_prompt: "Adres hosta (ip lub ip:port):",
			ver_mismatch: "RÓŻNE WERSJE MODA — obaj gracze muszą zaktualizować SandTogether!",
			waiting_world: "Połączono. Czekam na świat hosta — HOST musi kliknąć 'Wyślij świat', potem Ty: menu → Load Game.",
			unsupported: "⚠ Niewspierana wersja gry — gra się zaktualizowała i rozjechała moda. Uruchom install ponownie albo sprawdź update na Warsztacie.",
			mp_btn: "Multiplayer",
			lb_title: "MULTIPLAYER", lb_sub: "SandTogether co-op — do 4 graczy",
			lb_host_steam_d: "Graj przez internet — zaproś znajomych z listy Steam",
			lb_host_lan_d: "Sieć lokalna albo VPN (Tailscale, Radmin...)",
			lb_join_lan_d: "Wklej adres, który dostałeś od kolegi — działa dla hosta z internetu, LAN i VPN",
			lb_join_id_d: "Dołącz po Lobby ID skopiowanym do schowka",
			lb_close: "✕", lb_disconnect: "Rozłącz", lb_players: "Gracze", lb_you: "ty",
			lb_id: "Lobby ID", lb_copy: "kopiuj", lb_copied: "skopiowane!", lb_invite: "Zaproś znajomego",
			lb_play_last: "▶ Wczytaj ostatni save i GRAJ",
			lb_play_note: "Twój świat wyśle się dołączonym graczom automatycznie. Możesz też po prostu użyć Kontynuuj / Wczytaj.",
			lb_wait_host: "Czekam na świat hosta — pobierze się i wczyta automatycznie.",
			lb_hint: "Tip: zaproszenie Steam możesz przyjąć w KAŻDEJ chwili — reszta dzieje się sama.",
			btn_host_direct: "Host (internet — bezpośrednio)",
			lb_host_direct_d: "Pełna prędkość, bez relaya Steama. Sam otwiera port na routerze (UPnP).",
			direct_ready: "Hostujesz BEZPOŚREDNIO — podaj koledze adres poniżej",
			direct_no_upnp: "Port nie otworzył się sam — przekieruj TCP {0} na routerze, potem podaj adres",
			bridge_old: "Mostek moda nieaktualny — zrestartuj grę (auto-update) albo uruchom ponownie instalator / patch.js",
			direct_addr: "Twój adres", direct_show: "pokaż", direct_hide: "ukryj", direct_copied: "Adres skopiowany!",
			direct_hidden_hint: "celowo ukryty — bezpieczne na streamie",
			lb_steps: "1) Zaproś znajomych   2) Wciśnij GRAJ — dołączą na Twoją mapę automatycznie",
			badge_offline: "○ OFFLINE — nie połączono",
			badge_host: (tr) => "● HOSTUJESZ (" + tr + ")",
			badge_client: (tr) => "● POŁĄCZONY (" + tr + ") — jesteś graczem",
			chat_joined: (n) => n + " dołączył",
			chat_left: (n) => n + " wyszedł",
			lb_nick: "Twój nick",
			lb_pick_save: "📂 Wybierz save...", lb_pick_save_d: "wczytaj konkretny świat zamiast ostatniego",
			lb_new_note: "Nowa mapa? Zamknij to okno i kliknij Nowa — hosting zostaje aktywny, świat wyśle się graczom gdy do niego wejdziesz.",
			host_enter_world_first: "Najpierw wejdź do świata (Kontynuuj / Wczytaj) — graczom wyśle się automatycznie.",
		},
		zh: {
			offline: "离线", btn_host: "创建房间 (Steam)", btn_invite: "邀请", btn_host_lan: "局域网主机",
			btn_join_lan: "按地址加入", btn_connect: "连接", btn_stop: "停止", btn_send_world: "发送世界", btn_resync: "重新同步",
			host_paused: "房主已暂停(菜单中)——世界已冻结,将自动恢复", sync_stalled: "已 {0} 秒未收到房主的世界数据…",
			reconnecting: "连接已断开——正在重新连接(第 {0}/5 次尝试)…",
			left_to_menu: "已离开合作会话(已返回主菜单)",
			chat_ph: "聊天消息…", chat_me: "你",
			btn_join_id: "通过ID加入(剪贴板)", lobby_copied: "已复制!",
			clipboard_no_id: "剪贴板中没有房间ID——请先点击房主的绿色房间ID行进行复制",
			hint: "点击标题栏隐藏 (Ctrl+Shift+H)", by: "作者:" + AUTHOR + " + " + CONTRIBUTORS,
			hosting_steam: "正在创建房间(Steam)——邀请你的朋友吧!", hosting_lan: (p) => "正在创建房间(局域网 :" + p + ")",
			joined: (tr) => "已连接到房主(" + tr + ")", players: (n) => "在线玩家:" + n,
			player_left: (n) => "玩家已离开。在线人数:" + n, error: (m) => "错误:" + m,
			creating_lobby: "正在创建房间...", connect_first: "请先连接!",
			no_saves: "没有存档——请先保存游戏", exporting: (n) => "正在导出世界 '" + n + "'...",
			export_err: (m) => "导出错误:" + m, import_err: (m) => "导入错误:" + m,
			decode_err: (m) => "世界解码错误:" + m,
			world_sent: (kb, ch) => "世界已发送(" + kb + " KB," + ch + " 部分)",
			world_imported: (n) => "世界 '" + n + "' 已导入!请加载它:菜单 → 加载游戏",
			world_imported_loaded: (n) => "已加入房主的世界 '" + n + "'——你已进入游戏!",
			tech_rejected: (id) => "研究 '" + id + "' 被主机拒绝(条件/费用不足)— 请重试",
			tech_repaired: (n) => "已修复 " + n + " 个损坏的研究解锁 — 建筑/物品已恢复",
			waiting_host_world: "已连接——正在等待房主进入世界(将自动加载)...",
			receiving: (a, b) => "正在接收世界:" + a + "/" + b,
			other_world: "⚠ 你不在房主的世界中!房主:点击'发送世界'。你:菜单 → 加载游戏 → 加载收到的存档。",
			dims_differ: (a, b) => "⚠ 世界大小不同(" + a + " 对比房主的 " + b + ")——请通过加载游戏来加载房主的存档。",
			sync_up: (kb, ch, q) => "上传:" + kb + " KB/s," + ch + " 区块/s,队列 " + q,
			sync_down: (kb, ch, q) => "房主镜像:" + kb + " KB/s," + ch + " 区块/s" + (q > 0 ? " ——还剩 " + q + " 个区块" : ""),
			relay_slow: (sec) => "Steam 中继正在限速(往返 " + sec + " 秒)。请房主改用“主机(互联网 — 直连)”,并按地址加入 — 中继无法承载实时世界。",
			loading_world: "正在加载房主的世界...(大地图可能需要几分钟——游戏可能看起来像卡住了)",
			join_prompt: "房主地址(ip 或 ip:port):",
			ver_mismatch: "模组版本不匹配——双方玩家都必须更新 SandTogether!",
			waiting_world: "已连接。正在等待房主的世界——房主需要点击'发送世界',然后你:菜单 → 加载游戏。",
			unsupported: "⚠ 不支持的游戏版本——游戏已更新并导致模组失效。请重新运行安装程序,或前往创意工坊页面查看更新。",
			mp_btn: "多人游戏",
			lb_title: "多人游戏", lb_sub: "SandTogether 合作模式——最多4名玩家",
			lb_host_steam_d: "通过互联网游玩——从Steam好友列表邀请朋友",
			lb_host_lan_d: "局域网或VPN(Tailscale、Radmin等)",
			lb_join_lan_d: "粘贴好友给你的地址 — 互联网房主、局域网和 VPN 均可",
			lb_join_id_d: "使用复制到剪贴板的房间ID加入",
			lb_close: "✕", lb_disconnect: "断开连接", lb_players: "玩家", lb_you: "你",
			lb_id: "房间ID", lb_copy: "复制", lb_copied: "已复制!", lb_invite: "邀请朋友",
			lb_play_last: "▶ 加载最新存档并开始游戏",
			lb_play_note: "你的世界会自动发送给已加入的玩家。你也可以直接使用继续/加载游戏。",
			lb_wait_host: "正在等待房主的世界——它会自动下载并加载。",
			lb_hint: "提示:Steam邀请可以在任何时候接受——其余的都会自动完成。",
			btn_host_direct: "创建房间(互联网 — 直连)",
			lb_host_direct_d: "全速直连,不经过Steam中继。自动在路由器上开放端口(UPnP)。",
			direct_ready: "直连主机模式 — 把下面的地址发给朋友",
			direct_no_upnp: "端口未自动开放 — 请在路由器上转发 TCP {0},然后分享地址",
			bridge_old: "模组桥接已过期 — 请重启游戏(自动更新)或重新运行安装程序 / patch.js",
			direct_addr: "你的地址", direct_show: "显示", direct_hide: "隐藏", direct_copied: "地址已复制!",
			direct_hidden_hint: "已刻意隐藏 — 直播安全",
			lb_steps: "1) 邀请朋友   2) 点击开始游戏——他们会自动加入你的地图",
			badge_offline: "○ 离线——未连接",
			badge_host: (tr) => "● 正在创建房间(" + tr + ")",
			badge_client: (tr) => "● 已连接(" + tr + ")——你是一名玩家",
			chat_joined: (n) => n + " 加入了",
			chat_left: (n) => n + " 离开了",
			lb_nick: "你的昵称",
			lb_pick_save: "📂 选择存档...", lb_pick_save_d: "加载指定的世界而不是最新的存档",
			lb_new_note: "新地图?关闭此窗口并点击新游戏——创建房间状态保持激活,当你进入世界后会自动发送给玩家。",
			host_enter_world_first: "请先进入你的世界(继续/加载游戏)——将自动发送给玩家。",
		},
	};
	const t = (key, ...args) => {
		const v = (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.en[key] || key;
		if (typeof v === "function") return v(...args);
		// FIX 0.9.74: teksty z placeholderami {0} byly zwracane DOSLOWNIE — gracz widzial
		// "Brak danych swiata od hosta od {0}s..." albo "reconnecting (attempt {0}/5)".
		return args.length ? String(v).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? String(args[i]) : m)) : v;
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
			bpc: 0,               // host: EMA of compressed bytes per chunk, sizes each batch to a byte budget
			lastNear: 0,          // host: fast lane usage last batch, splits the budget between the two lanes
			// Congestion control. Without it the host pushes whatever the sim dirties (measured 349 KB/s)
			// into Steam's send buffer, which then grows without bound. Reliable is ORDERED, so the client
			// replays history instead of seeing the present (measured ~60 s behind).
			// Backlog kept HERE coalesces: rowH compares against the last SENT state, so a chunk touched
			// 50 times while queued sends once, current. Backlog in the network buffer does not coalesce.
			// So we measure how far behind the client is and throttle ourselves. Choppier updates beat
			// time travel.
			seq: 0,               // host: sequence number of the next wc batch, echoed back by clients
			ackSeen: false,       // host: has any client ever acked, so older clients never throttle anyone
			lag: 0,               // host: seq minus the slowest ack, in batches (1 batch is ~100 ms)
			rate: 1,              // host: byte budget multiplier driven by AIMD below
		},
		// struktury/zasoby/vacuum
		_greeted: new Set(),      // komu juz przedstawilismy sie nickiem (anty-petla hello, 0.9.85)
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
			// 0.9.131: ekwipunku NIE zapisujemy — nalezy do swiata hosta, nie do lokalnego profilu
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
			// 0.9.131: ekwipunku NIE przywracamy. Postep (narzedzia, ulepszenia, budynki) jest wlasnoscia
			// swiata hosta — klient dostaje go z zapisu. Podmiana na lokalna kopie dawala narzedzia
			// z poprzedniej gry i cooldowny z obcego zegara (blokada narzedzi na zawsze).
			if (prof.inv) { delete prof.inv; try { localStorage.setItem("st_prof_" + wid, JSON.stringify(prof)); } catch (e) {} log("Profil: usuwam zapisany ekwipunek — postep bierzemy ze swiata hosta"); }
			log("Profil klienta przywrócony dla świata", wid, "(pozycja " + Math.round(prof.x) + "," + Math.round(prof.y) + ")");
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
				setStatus(ev.transport === "steam" ? t("hosting_steam") : (ST._directMode ? t("direct_ready") : t("hosting_lan", ev.port)));
				ST.net.lobbyId = ev.lobbyId || null; ST._autoSentWid = null; // reset auto-send; zapamiętaj lobbyId
				resetWorldQueue(); // new host session starts clean, peer-connected re-queues the full world
					updateLobbyIdDisplay();
					if (ev.transport === "steam") showInviteButton(true);
			} else if (ev.kind === "joined") {
				ST.net.role = "client"; ST.net.transport = ev.transport;
				ST.wsx.everApplied = false; ST.wsx.mismatchLogged = false; ST.wsx.wasInWorld = false; // nowa sesja klienta
				ST._lastAppliedSq = null; ST._lastAckT = 0; // new host numbers its batches from zero, a stale ack would be wrong
				ST._mirrorKickN = 0; ST._mirrorKickT = 0; if (ST._structSig) ST._structSig.clear(); if (ST._snapRest) ST._snapRest.length = 0; try { sessionStorage.removeItem("st_rescue_n"); } catch (e) {} if (ST._applyQ) ST._applyQ.length = 0; ST._greeted.clear(); ST._worldRxDone = false; ST._worldReqN = 0; ST._worldReqT = performance.now(); ST._autoResynced = false; ST._autoLoadedOnce = false; // świeży cykl; 1. world-req najwcześniej 15 s po join (auto-send hosta ma fory)
				ST._trustedWid = null; ST._pendingTrustUntil = 0;
				// Etykieta transportu u klienta: publiczny adres = "Internet", prywatny/VPN = "LAN". Wczesniej zawsze
				// wychodzil "LAN" i gracze mysleli, ze mod ich gdzies przepina (Shadow City Empire, 24.08.2026).
				ST._directMode = ev.transport === "ws" && !isLocalAddr(ev.host);
				ST._directAddr = null; autoLoadClear(); // nowa sesja klienta = świeży guard auto-loadu (0.9.72)
				ST._gotHostWorld = false; // KRYTYCZNE: zaufanie do świata NIE przenosi się między sesjami (inny host = inny świat; bez resetu lustro nadpisałoby zły świat)
				ST._fireQ = []; ST._cryoQ = []; ST._grabbedCells.clear(); ST._placedCells.clear(); ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = []; if (ST._projSent) ST._projSent.clear(); // stan z poprzedniej sesji = inne współrzędne/świat
				// własny nick (localStorage) rozgłaszany istniejącym protokołem hello — bez zmian w mostku IPC
				if (ST._nickCustom) { try { net.send({ t: "hello", nick: ST._nickCustom }); } catch (e) {} }
				setStatus(t("joined", ev.transport));
			} else if (ev.kind === "peer-hello" || ev.kind === "peer-connected") {
				const isNew = !ST.peers.has(ev.id);
				if (isNew) ST.peers.set(ev.id, { nick: ev.nick || "?", x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() });
				if (ev.nick) ST.peers.get(ev.id).nick = ev.nick;
				if (ev.kind === "peer-hello") addChat("★", t("chat_joined", ev.nick || "?")); // widoczna informacja KTO dołączył
				// 0.9.85: DOKLADNIE RAZ na peera — odsylanie hello na kazde peer-hello tworzylo petle
					if (ST._nickCustom && !ST._greeted.has(ev.id)) {
						ST._greeted.add(ev.id);
						try { net.send({ t: "hello", nick: ST._nickCustom, greet: 1 }, ev.id); } catch (e) {}
					}
				setStatus(t("players", ST.peers.size + 1));
				if (ST.net.role === "host") {
					const hostInWorld = ST.state && ST.state.store && ST.state.store.scene && ST.state.store.scene.active !== 1;
					// nowy gracz -> pełny świat (mirror); TYLKO gdy host w świecie — w menu wymiary/bufory
					// należą do sceny menu (i tak nie streamujemy, patrz gate w frame hooku).
					// Cooldown 20 s na AUTO-wysyłkę save'a: cykl peer-hello (reconnecty przy przeciążonym P2P)
					// spamował transferami = pętla przeładowań u klienta (ZeroHazard). Ręczny "Wyślij świat"
					// i world-req klienta działają bez cooldownu (mają własne guardy).
					if (hostInWorld) {
						resetAckBaseline(null, "powitanie/pelny swiat"); enqueueFullWorld();
						if (performance.now() - (ST._autoSendT || 0) > 20000) { ST._autoSendT = performance.now(); sendWorld(); }
						else log("auto-send save POMINIĘTY (cooldown 20 s po poprzednim)");
					}
				}
			} else if (ev.kind === "peer-disconnected") {
				if (ST.state) profileSave(ST.state); // utrwal profil PRZED ewentualną zmianą stanu (G7-lite)
				const gone = ST.peers.get(ev.id);
				if (gone) addChat("★", t("chat_left", gone.nick || "?"));
				ST._greeted.delete(ev.id); ST.peers.delete(ev.id); removePeerPuppet(ev.id);
				setStatus(t("player_left", ST.peers.size + 1), "#fa5");
				// KLIENT ZOSTAJE ZAPAUZOWANY — ciche odpauzowanie tworzyło rozwidlony świat (gracz "grał dalej"
				// lokalnie nie wiedząc, że wszystko przepadnie przy ponownym joinie). Chcesz grać solo → Stop.
			} else if (ev.kind === "stopped") {
				if (ST.state) profileSave(ST.state); // przed resetem roli (isClientSync jeszcze true)
				autoLoadClear();
				ST._greeted.clear(); ST.net.role = "idle"; ST.peers.clear(); removeAllPeerPuppets(); setStatus(t("offline"), "#aaa"); showInviteButton(false); ST.net.lobbyId = null; updateLobbyIdDisplay(); updatePingDisplay();
				ST._fireQ = []; ST._cryoQ = []; ST._grabbedCells.clear(); ST._placedCells.clear(); ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = [];
				ST._gotHostWorld = false;
				ST._lastAppliedSq = null; // drop the ack so it cannot throttle the next session
				resetWorldQueue();        // queue, row hashes and congestion state are all per session
				setClientPaused(false);
			} else if (ev.kind === "reconnecting") { setStatus(t("reconnecting", ev.attempt), "#fd5");
			} else if (ev.kind === "version-mismatch") setStatus(t("ver_mismatch"), "#f66");
			else if (ev.kind === "error" && /ECONNREFUSED/i.test(String(ev.message || "")) && /(d{1,3}).(d{1,3}).(d{1,3}).(d{1,3})/.test(String(ev.message || ""))) {
				// 0.9.133: publiczny adres + odmowa = najczesciej proba polaczenia z wlasnym IP z tej samej sieci
				const ip = String(ev.message).match(/(d{1,3}).(d{1,3}).(d{1,3}).(d{1,3})/);
				const A = ip ? +ip[1] : 0, B = ip ? +ip[2] : 0;
				const priv = A === 127 || A === 10 || (A === 192 && B === 168) || (A === 172 && B >= 16 && B <= 31);
				if (!priv) { setStatus(t("hairpin_hint"), "#fd5"); log("PODPOWIEDZ: odmowa polaczenia z publicznym IP — z tej samej sieci uzyj adresu lokalnego hosta (router nie robi petli zwrotnej)"); }
			}
			if (ev.kind === "error") setStatus(t("error", ev.message), "#f66");
			updatePanel(); // badge/przyciski/lista graczy odzwierciedlają KAŻDĄ zmianę stanu sieci
			if (ST._lobbyOpen) renderLobby(false);
		});
				// 0.9.111: przy ramce binarnej dane swiata przychodza obok naglowka, juz jako bajty
		net.onMsg(({ from, msg, bin }) => {
			if (bin && msg) msg.__bytes = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
			handleMsg(from, msg);
		});
		net.status().then((s) => {
			ST.net.role = s.role; ST.net.transport = s.transport;
			try { ST._nickCustom = localStorage.getItem("st_nick") || null; } catch (e) { ST._nickCustom = null; }
			ST._myNick = ST._nickCustom || s.myNick || null; // własny nick > nick Steam > default (feedback TCentraL: LAN = "Player" na stałe)
			ST._gameFp = s.gameFp || null; // odcisk buildu gry (guard różnych buildów między graczami)
			for (const p of s.peers) { const old = ST.peers.get(p.id); ST.peers.set(p.id, Object.assign({ x: 0, y: 0, tx: 0, ty: 0 }, old || {}, { nick: p.nick, lastSeen: performance.now() })); } // 0.9.82: zachowaj modVer/ping znanego peera
			// 0.9.76 HANDSHAKE: renderer wstal (start gry ALBO przeladowanie po wczytaniu swiata).
			// Polaczenie zyje w procesie main, wiec host NIE wie, ze stracilismy caly stan sesji —
			// mowimy mu to wprost i podajemy, na jakim swiecie jestesmy (decyduje: stream czy save).
			if (s.role === "client") {
				// czekamy az frame hook przechwyci stan gry — inaczej wyslemy wid=null i host
				// niepotrzebnie przysle CALY SAVE (bug 0.9.76). Max ~20 s, potem i tak sie zglaszamy.
				let tries = 0;
				const announce = () => {
					const st = ST.state;
					if (!st && ++tries < 40) return void setTimeout(announce, 500);
					try {
						const wid = st && st.store.meta && st.store.meta.worldId, sc = st && st.store.scene && st.store.scene.active;
						net.send({ t: "hello", nick: ST._myNick || "Player", wid: wid || null, scene: sc || null, ready: 1 });
						log("HANDSHAKE: renderer gotowy — zglaszam sie hostowi (wid=" + wid + " scene=" + sc + ")");
					} catch (e) {}
				};
				setTimeout(announce, 800);
			}
			if (s.role === "host") setStatus("HOST (" + s.transport + ") — gracze: " + (s.peers.length + 1));
			else if (s.role === "client") setStatus("POŁĄCZONO — gracze: " + (s.peers.length + 1));
		}).catch(() => {});
	}

	// Guard auto-loadu odporny na reload strony (patrz komentarz przy auto-load). Klucz per save hosta,
	// TTL 30 min (po tym czasie świadomy ponowny join/load ma działać normalnie).
	function autoLoadDoneBefore(saveId) {
		try { const v = Number(sessionStorage.getItem("st_autoload_" + saveId) || 0); return v > 0 && Date.now() - v < 30 * 60 * 1000; } catch (e) { return false; }
	}
	function autoLoadMark(saveId) {
		try { sessionStorage.setItem("st_autoload_" + saveId, String(Date.now())); } catch (e) {}
	}
	function autoLoadClear() {
		try { const del = []; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k && k.indexOf("st_autoload_") === 0) del.push(k); } del.forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
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
			p.btT = msg.bt != null ? performance.now() : 0; // 0.9.138: znacznik swiezosci — fantom gasnie po 2 s
			p.boffs = Array.isArray(msg.boffs) ? msg.boffs : null;
			if (p.x === 0 && p.y === 0) { p.x = msg.x; p.y = msg.y; }
		} else if (msg.t === "hello") {
			const p = ST.peers.get(from) || { x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() };
			p.nick = msg.nick || "?";
			ST.peers.set(from, p);
			setStatus(t("players", ST.peers.size + 1));
			try { net.send({ t: "mver", v: VER, gf: ST._gameFp || null }, from); } catch (e) {} // wersja MODA + odcisk buildu GRY
			// stary mod (≤0.9.7) nie zna mver i nie odpowie — po 5s bez odpowiedzi ALARM (przypadek "ziomek na 0.9.0")
			// Kontrola "stary mod" z PONOWIENIAMI (0.9.88): brak odpowiedzi w 5 s nie znaczy stary mod —
			// peer bywa w trakcie wczytywania świata albo jego renderer właśnie wstaje po przeładowaniu.
			if (!msg.ready) {
				const askVer = (attempt) => {
					const pp = ST.peers.get(from);
					if (!pp || pp.modVer) return;                       // już wiemy — koniec
					if (attempt < 3) {
						try { net.send({ t: "mver", v: VER, gf: ST._gameFp || null }, from); } catch (e) {}
						setTimeout(() => askVer(attempt + 1), attempt === 1 ? 7000 : 13000);
						return;
					}
					setStatus(t("ver_mismatch") + " [" + (pp.nick || from) + ": OLD mod (<= 0.9.7)! / you: " + VER + "]", "#f66");
					log("PEER NA STARYM MODZIE (brak odpowiedzi mver po 25 s):", pp.nick || from, "— musi zrobić install.bat!");
				};
				setTimeout(() => askVer(1), 5000);
			}
			if (ST.net.role === "host") {
				ST._snapForce = true; resetAckBaseline(null, "powitanie/pelny swiat"); enqueueFullWorld(); // 0.9.76: KAZDY hello (takze po przeladowaniu renderera klienta) = pelny swiat od nowa
				const hst = ST.state, myWid = hst && hst.store.meta && hst.store.meta.worldId;
				const hostInWorld = hst && hst.store.scene && hst.store.scene.active !== 1;
				// SAVE tylko gdy klient NIE stoi na naszym swiecie. Klient po przeladowaniu ma juz nasz swiat
				// wczytany (ten sam worldId) → wysylka save = kolejny auto-load = przeladowanie = PETLA.
				const clientInMenu = msg.scene === 1 || msg.scene == null;
				const clientElsewhere = msg.wid != null && msg.wid !== myWid;
				if (hostInWorld && (clientElsewhere || (clientInMenu && msg.ready))) { ST._autoSendT = 0; log("hello: klient bez mojego swiata (wid=" + msg.wid + " scene=" + msg.scene + ") — wysylam save"); sendWorld(); }
				else if (hostInWorld && !msg.ready) { ST._autoSendT = 0; log("hello: nowy gracz — wysylam save"); sendWorld(); }
				else if (hostInWorld) log("hello: klient JUZ na moim swiecie — tylko stream, bez save");
			}
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
			applyWorldBatch(msg).catch((e) => { if ((ST._applyErrN = (ST._applyErrN || 0) + 1) <= 3) log("apply error:", e.message, String(e.stack || "").split(String.fromCharCode(10)).slice(0, 4).join(" | "), "bin=" + (msg.__bytes ? msg.__bytes.length : "BRAK") + " d=" + (msg.d ? msg.d.length : "BRAK") + " z=" + msg.z); });
		} else if (msg.t === "wcack") {
			// Client acks the last APPLIED batch. This is the only signal we have for how far behind it is:
			// Steam's send buffer is invisible to us and sendP2PPacket never reports that it is full.
			if (ST.net.role === "host" && typeof msg.sq === "number") {
				const p = ST.peers.get(from);
				if (p) { if (p.ackSq !== msg.sq) ST.wsx.ackAdvanceT = performance.now(); p.ackSq = msg.sq; p.qd = msg.qd | 0; ST.wsx.ackSeen = true; } // per peer, so the slowest one governs
				// 0.9.78: paczki potwierdzone przez NAJWOLNIEJSZEGO klienta mozna zapomniec
				const w0 = ST.wsx;
				if (w0.unacked && w0.unacked.size) {
					let minAck = null;
					for (const pp of ST.peers.values()) if (typeof pp.ackSq === "number" && (minAck === null || pp.ackSq < minAck)) minAck = pp.ackSq;
					if (minAck !== null) for (const sq of [...w0.unacked.keys()]) if (sq <= minAck) w0.unacked.delete(sq);
				}
			}
		} else if (msg.t === "act") {
			if (ST.net.role === "host") replayAction(msg, from);
		} else if (msg.t === "st") {
			if (ST.net.role === "client") applyNetStructs(msg);
		} else if (msg.t === "snap") {
			if (ST.net.role === "client") applySnapshot(msg).catch((e) => log("snap error:", e.message));
		} else if (msg.t === "res") {
			ST._lastResT = performance.now(); // dowod, ze host ZYJE (osobno od strumienia swiata)
			if (ST.net.role === "client") applyResources(msg);
		} else if (msg.t === "tech-nak") {
			// host (gra hosta) odmówił naszego badania — lokalny optymistyczny unlock cofamy na poziomie
			// flagi (gra nie ma "lockTech"; budynki w menu zostaną do restartu, ale budowa bez tech hosta i tak
			// nie przejdzie przez lustro). Surowce wrócą ze streamem hosta w ≤1 s.
			if (ST.net.role === "client" && ST.state && ST.state.store.player && ST.state.store.player.tech && msg.id) {
				ST.state.store.player.tech[msg.id] = false;
				setStatus(t("tech_rejected", msg.id), "#fa5");
				log("tech-nak od hosta:", msg.id, "— cofam lokalną flagę");
			}
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
			if (ST.net.role === "client") { ST._grabInFlight = false; clientFillGrabTank(msg.types || [], msg.offs || null, msg.sl || null, msg.bx, msg.by); }
		} else if (msg.t === "grabRef") {
			// REFUND odkładania (R5): host nie zdołał położyć elementu (komórka zajęta) → oddaj do tanku
			if (ST.net.role === "client" && typeof msg.et === "number" && msg.et > 0) clientFillGrabTank([msg.et], null);
		} else if (msg.t === "redirty") {
			// Klient przez chwile liczyl wlasna symulacje (zapis gry wznowil mu watek) — te chunki moga
			// sie roznic od naszych. Kasujemy dla nich hasze wierszy, zeby poleci ponownie w calosci.
			if (ST.net.role !== "client" && msg.m) {
				try {
					const m = b64dec(msg.m), total = msg.n | 0;
					let n = 0;
					for (let i = 0; i < total; i++) if (m[i >> 3] & (1 << (i & 7))) { if (ST.wsx.rowH) ST.wsx.rowH.delete(i); ST.wsx.pending.add(i); n++; }
					if (n) log("redirty od", from, "-> odswiezam", n, "chunkow (klient symulowal po zapisie gry)");
				} catch (e) { log("redirty blad:", e.message); }
			}
		} else if (msg.t === "resync") {
			if (ST.net.role !== "client") resetAckBaseline(from, "resync od gracza");
			if (ST.net.role === "host") { log("resync od", from, "-> pełny świat do kolejki"); resetAckBaseline(null, "powitanie/pelny swiat"); enqueueFullWorld(); ST._lastSnap = 0; ST._snapForce = true; }
		} else if (msg.t === "world-req") {
			// klient prosi o SAVE (self-healing: reconnect / auto-send nie zadziałał) — rate-limit 15 s
			if (ST.net.role === "host" && performance.now() - (ST._lastWorldReqT || 0) > 15000) {
				ST._lastWorldReqT = performance.now();
				log("world-req od", from, "-> wysyłam save");
				sendWorld();
			}
		} else if (msg.t === "world-wait") {
			// host jeszcze nie wszedł do świata — czekamy spokojnie, próba world-req nie przepada
			if (ST.net.role === "client") {
				ST._worldReqN = Math.max(0, (ST._worldReqN || 0) - 1);
				setStatus(t("waiting_host_world"), "#fd5");
			}
		} else if ((msg.t === "world-begin" || msg.t === "world-chunk" || msg.t === "world-end" || msg.t === "world-wait") && ST.net.role === "host") {
			// host nigdy nie odbiera świata (0.9.72): pakiet świata u hosta = echo/self-loop albo obcy klient → ignoruj
			if (!ST._hostWorldPktLogged) { ST._hostWorldPktLogged = true; log("HOST: zignorowany pakiet świata", msg.t, "od", from); }
		} else if (msg.t === "world-begin") {
			// NOWY transfer w trakcie odbioru = restart z przemieszanymi indeksami paczek → burza world-need
			// (fix TCentraL "went crazy with the retrys"): ignorujemy, dopóki bieżący odbiór się nie skończy.
			// 0.9.75: guard tylko dla ŻYWEGO odbioru. Zakleszczony (host już wysłał world-end, a nam
			// brakuje paczek, albo trwa >30 s) MUSI ustąpić — inaczej klient nigdy nie dostanie pełnego świata.
			// 0.9.87: NOWSZY transfer wygrywa (paczki i tak są filtrowane po tid, więc przeplot jest niemożliwy).
			if (ST._worldRx && !ST._worldRx.done && msg.tid !== undefined && ST._worldRx.tid !== undefined && msg.tid < ST._worldRx.tid) {
				log("world-begin STARSZY (tid " + msg.tid + " < " + ST._worldRx.tid + ") — ignoruję"); return;
			}
			if (ST._worldRx && !ST._worldRx.done) log("przełączam odbiór: tid " + ST._worldRx.tid + " (" + ST._worldRx.got + "/" + ST._worldRx.total + ") → tid " + msg.tid);
			
			ST._gotHostWorld = true; // otrzymaliśmy świat OD hosta → ufamy jego worldId gdy oboje w grze (patrz applyWorldBatch)
			ST._worldRx = { tid: msg.tid, name: msg.name, total: msg.chunks, parts: new Array(msg.chunks), got: 0, from, done: false, ended: false, t0: performance.now() };
			log("world-begin: tid", msg.tid, "-", msg.name, "-", msg.chunks, "paczek,", Math.round((msg.size || 0) / 1024), "KB");
			setStatus(t("receiving", 0, msg.chunks), "#ff5");
			scheduleRxCheck();
		} else if (msg.t === "world-chunk" && ST._worldRx) {
			// paczka z INNEGO transferu niż bieżący = przeplot (host autosave'ował między wysyłkami) —
			// wpuszczenie jej skleja save z dwóch wersji świata → ZEPSUTY świat (raport derErste67)
			if (ST._worldRx.tid !== undefined && msg.tid !== undefined && msg.tid !== ST._worldRx.tid) {
				if (!ST._tidDropLogged) { ST._tidDropLogged = true; log("world-chunk z obcego transferu ODRZUCONY (tid " + msg.tid + " ≠ " + ST._worldRx.tid + ")"); }
				return;
			}
			if (ST._worldRx.parts[msg.i] === undefined) { ST._worldRx.parts[msg.i] = msg.data; ST._worldRx.got++; }
			if (ST._worldRx.got % 20 === 0 || ST._worldRx.got === ST._worldRx.total)
				setStatus(t("receiving", ST._worldRx.got, ST._worldRx.total), "#ff5");
			maybeFinishRx();
		} else if (msg.t === "world-end" && ST._worldRx) {
			if (ST._worldRx.tid !== undefined && msg.tid !== undefined && msg.tid !== ST._worldRx.tid) return;
			ST._worldRx.ended = true;
			maybeFinishRx();
		} else if (msg.t === "world-need") {
			// host: klient prosi o brakujące kawałki -> ponów je (priorytetowo)
			// 0.9.75: paczki trzymamy tylko dla BIEŻĄCEGO transferu. Prośba o starszy tid (klient utknął
			// na poprzednim) = odesłanie mu paczek z nowego transferu, które i tak odrzuci → wieczne "recovering".
			// Zamiast tego startujemy świeży, kompletny transfer.
			if (ST._wtx && msg.tid !== undefined && ST._wtx.tid !== undefined && msg.tid !== ST._wtx.tid) {
				if (performance.now() - (ST._wtxRestartT || 0) < 3000) { return; } // 0.9.87: nie restartuj częściej niż co 3 s
				ST._wtxRestartT = performance.now();
				log("world-need dla starego transferu tid " + msg.tid + " (mamy " + ST._wtx.tid + ") — wysyłam świat od nowa");
				ST._autoSendT = 0; ST._wtx = null; sendWorld(); return;
			}
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
				ST._worldRxDone = true; // mamy świat w tej sesji → world-req się wyłącza
				log("World import OK:", rx.name, bytes.length, "bytes");
				// Auto-load: jeśli FH.game.load istnieje, wskocz prosto do gry (bez ręcznego Load Game). (wkład dotNine)
				const saveId = r && r.metaData && r.metaData.id;
				// PĘTLA PRZEŁADOWAŃ — PRZYCZYNA ŹRÓDŁOWA (0.9.72, odtworzona e2e): auto-load = FH.game.load =
				// PRZEŁADOWANIE STRONY, które kasuje pamięć renderera (_autoLoadedOnce, _worldRxDone z 0.9.68).
				// Po reloadzie klient "nie pamięta", że już wczytał ten save → kolejny transfer (world-req po 15 s
				// gdy lustro nie wystartowało, re-send hosta) → znów auto-load → reload → ... Guard musi przeżyć
				// reload: sessionStorage (per okno, kasowany przy nowym join/stop). Ten sam save hosta w tej
				// sesji = tylko import, bez auto-loadu.
								// 0.9.116: WYJATEK — jestem w swiecie, ale w INNYM niz host i lustro nigdy nie ruszylo.
				// Bez tego klient po restarcie renderera zostaje z zamrozonym obrazem az do recznego Load Game.
				// 0.9.132: samo lustro nie wystarcza — gracz musi BYC w swiecie hosta, inaczej jego postep
				// (ekwipunek, badania, budynki) zostaje z poprzedniej gry.
				// 0.9.134: wczytanie przeslanego zapisu nadaje NOWY worldId, wiec nie gonimy zgodnosci ID
				// (0.9.132 robil z tego petle przeladowan). Ratunkowe wczytanie tylko gdy lustro nigdy nie ruszylo.
				let rescueN = 0;
				try { rescueN = Number(sessionStorage.getItem("st_rescue_n") || 0); } catch (e) {}
				const inWrongWorld = rescueN < 1 && !ST.wsx.everApplied && ST._hostWidSeen &&
					ST.state && ST.state.store.meta && ST.state.store.meta.worldId !== ST._hostWidSeen &&
					Date.now() - (ST._rescueLoadT || 0) > 30000;
				if (inWrongWorld) { ST._rescueLoadT = Date.now(); try { sessionStorage.setItem("st_rescue_n", String(rescueN + 1)); } catch (e) {} log("WCZYTUJE SWIAT HOSTA: jestem w", ST.state.store.meta.worldId, "host gra w", ST._hostWidSeen, "— bez tego moj postep zostalby z poprzedniej gry"); }
				if (!inWrongWorld && saveId && autoLoadDoneBefore(saveId)) { log("auto-load POMINIĘTY (ten save hosta był już auto-wczytany w tej sesji — guard po reloadzie) — save tylko zaimportowany"); setStatus(t("world_imported", rx.name), "#5f5"); return; }
				// PĘTLA PRZEŁADOWAŃ (fix TCentraL "reloading the same map over and over"): kolejny transfer
				// tego samego świata NIE wyrywa gracza z gry — gdy lustro już działa albo load w toku, nie ładujemy.
				// auto-load TYLKO RAZ na sesję (fix ZeroHazard "reload every 10 s"): powtórzony transfer
				// (np. cykl peer-hello przy przeciążonym P2P) nie może w kółko wyrywać gracza do loadu —
				// kolejne save'y tylko importujemy; gracz może je wczytać ręcznie przez Load Game.
				if (!inWrongWorld && (ST.wsx.everApplied || ST._loadingWorld || ST._autoLoadedOnce)) { log("auto-load POMINIĘTY (lustro działa / load w toku / już auto-wczytano w tej sesji) — save tylko zaimportowany"); setStatus(t("world_imported", rx.name), "#5f5"); return; }
				ST._autoLoadedOnce = true;
				if (saveId) autoLoadMark(saveId);
				if (saveId && ST.FH && ST.FH.game && typeof ST.FH.game.load === "function" && ST.state) {
					try {
						ST._loadingWorld = true; // lustro NIE pisze po buforach w trakcie load (fix freeze na dużej mapie)
						setStatus(t("loading_world"), "#ff5"); // duża mapa = minuty; bez tego wygląda jak zwiecha
						const t0 = performance.now();
						const lr = await ST.FH.game.load(ST.state, saveId);
						log("auto-load save'a hosta zakończony w", Math.round(performance.now() - t0), "ms");
						if (lr && lr.success === false) throw new Error(lr.error || "load success:false");
						// silnik może nadać wczytanemu światu NOWY lokalny worldId mimo identycznej treści —
						// okno zaufania, żeby kolejne "wc" (mirror) nie były odrzucane jako "inny świat"
						ST._pendingTrustUntil = performance.now() + 15000;
						setStatus(t("world_imported_loaded", rx.name), "#5f5");
						// pełny świat OD RAZU po wejściu (nie czekamy na everApplied — przy w pełni zgodnym
						// save może nie być nic do zastosowania i AUTO-RESYNC przy starcie lustra by nie strzelił)
						if (!ST._autoResynced) { ST._autoResynced = true; try { net.send({ t: "resync" }); log("AUTO-RESYNC po auto-load"); } catch (e2) {} }
						return;
					} catch (e) { log("auto-load nie powiódł się, fallback na ręczne Load Game:", e.message); }
					finally { ST._loadingWorld = false; }
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
				net.send({ t: "world-need", tid: rx.tid, idx: miss.slice(0, 200) }, rx.from);
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

	// po zmianie komórek "z ręki" (poza silnikiem) trzeba zabrudzić chunki, żeby lustro je odświeżyło
	// 0.9.103: efekt akcji gracza ma wrócić do niego JAK NAJSZYBCIEJ — chunki wokół punktu akcji
	// trafiają na początek najbliższej paczki (priorytet), z wyczyszczonym hashem, żeby na pewno poleciały.
	function markUrgent(state, x, y, r) {
		try {
			const { W, H } = worldBuffers(state); if (!W) return;
			const d = chunkDims(W, H), rad = r == null ? 1 : r;
			const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
			for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
				const nx = cx + dx, ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= d.cx || ny >= d.cy) continue;
				const i = nx + ny * d.cx;
				ST.wsx.pending.add(i); ST.wsx.priority.add(i);
				if (ST.wsx.rowH) ST.wsx.rowH.delete(i);
			}
		} catch (e) {}
	}
	function enqueueAround(state, spots) {
		try {
			const { W, H } = worldBuffers(state); if (!W) return;
			const d = chunkDims(W, H);
			for (const sp of spots) {
				const cx = Math.floor((sp.x | 0) / CHUNK), cy = Math.floor((sp.y | 0) / CHUNK);
				for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
					const nx = cx + dx, ny = cy + dy;
					if (nx >= 0 && ny >= 0 && nx < d.cx && ny < d.cy) { const i = nx + ny * d.cx; ST.wsx.pending.add(i); if (ST.wsx.rowH) ST.wsx.rowH.delete(i); }
				}
			}
		} catch (e) {}
	}
	// 0.9.117: gracz zaczyna sluchac od nowa (powitanie / resync / restart jego okna) — jego licznik
	// potwierdzen wystartowal od zera, wiec nasz punkt odniesienia tez musi. Inaczej liczymy zaleglosc
	// wzgledem numerow, ktorych on nigdy nie zobaczy, i wstrzymujemy wysylke na zawsze.
	function resetAckBaseline(peerId, why) {
		const w = ST.wsx;
		if (!w) return;
		const p = peerId ? ST.peers.get(peerId) : null;
		if (p) { p.ackSq = w.seq; p.qd = 0; }
		else for (const pp of ST.peers.values()) { pp.ackSq = w.seq; pp.qd = 0; }
		w.lag = 0;
		w.rate = Math.max(w.rate || 0.03, 0.5);   // oddajemy pasmo od razu, nie po minucie wspinaczki
		w.ackAdvanceT = performance.now();
		if (w.unacked) w.unacked.clear();
		log("RESET potwierdzen dla", peerId || "wszystkich", "(" + why + ") — wznawiam pelna wysylke");
	}
	function enqueueFullWorld() {
		if (!ST.state) return;
		// 0.9.81: handshake, peer-hello i resync potrafia trafic w te sama chwile — bez tej blokady
		// przechodzimy 9216 chunkow kilka razy z rzedu bez zadnego zysku (kolejka to zbior).
		const nowE = performance.now();
		if (nowE - (ST._fullWorldT || 0) < 3000) { log("Pelny swiat: pomijam (zakolejkowany " + Math.round(nowE - ST._fullWorldT) + " ms temu)"); return; }
		ST._fullWorldT = nowE;
		const { W, H } = worldBuffers(ST.state);
		if (!W) return;
		const d = chunkDims(W, H);
		for (let i = 0; i < d.cx * d.cy; i++) ST.wsx.pending.add(i);
		if (ST.wsx.rowH) ST.wsx.rowH.clear(); // pełny re-send: row-delta nie może pomijać "niezmienionych" wierszy (nowy klient ich nie ma)
		log("Pełny świat zakolejkowany:", d.cx * d.cy, "chunków");
	}

	// Mirror queue and congestion state are SESSION state, like _grabbedCells and _fireQ. They were the
	// only part never reset. A host that stopped and hosted again started with the previous session's
	// backlog, and worse, with row hashes from the previous world, so chunks counted as "unchanged" and
	// were never sent at all.
	function resetWorldQueue() {
		ST.wsx.pending.clear();
		ST.wsx.priority.clear();
		if (ST.wsx.rowH) ST.wsx.rowH.clear();   // stale hashes would suppress sends in the new world
		ST.wsx.sweep = 0;
		ST.wsx.bpc = 0; ST.wsx.lastNear = 0;    // re-measure chunk cost, the new world compresses differently
		ST.wsx.seq = 0; ST.wsx.ackSeen = false; ST.wsx.lag = 0; ST.wsx.rate = 0.25; ST.wsx.boost = 1; ST.wsx.buildMs = 0; // 0.9.78: start ostrozny, regulator sam podniesie if (ST.wsx.unacked) ST.wsx.unacked.clear(); // start un-throttled
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
		// 0.9.103: pilne zmiany (efekt akcji gracza) nie czekają pełnych 100 ms
		// 0.9.104: 30 paczek/s zamiast 10 — swiat u klienta rusza sie plynnie, a efekt narzedzia
		// wraca srednio 3x szybciej. Nakladanie kosztuje 2 ms, wiec stac nas na to.
				// 0.9.105: CYKL ADAPTACYJNY z podloga 8 ms (125 Hz). Celujemy w maksimum, jakie maszyna i klient
		// wytrzymaja: schodzimy w dol tylko gdy budowanie paczki zaczyna zjadac klatke albo klient nie nadaza.
				if (w.gap == null) w.gap = 33;
		const msB = w.serMs || 0;                 // tylko czas BLOKUJACY klatke
		const behind = w.pending.size > 400;      // duza kolejka = najpierw nadrobic, potem plynnosc
		if (msB > 12 || w.lag > 5) w.gap = Math.min(100, w.gap * 1.25);
		else if (!behind && msB < 4 && w.lag <= 2) w.gap = Math.max(16, w.gap * 0.85); // do ~60 Hz
		else if (behind) w.gap = Math.max(25, Math.min(40, w.gap));                    // nadrabianie: ~30 Hz
		const minGap = w.priority && w.priority.size ? Math.min(w.gap, 12) : w.gap;
		if (w.busy || now - w.lastBatch < minGap) return;
		const { map, wall, shadow, auth, sim, etype, W, H } = worldBuffers(state);
		if (!map || !W) return;
		const cellIds32 = sim ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null; // do odczytu typu elementu per komórka (v4)
		const d = chunkDims(W, H);
		const total = d.cx * d.cy;
		// rolling sweep — samonaprawa przeoczonych chunków (4 na batch)
		for (let k = 0; k < 4; k++) { w.pending.add(w.sweep % total); w.sweep++; }
		if (!w.pending.size) return;
		// --- Congestion control: how far behind is the SLOWEST client? ---
		// Clients ack the last APPLIED batch, so lag catches a saturated link and a client that cannot
		// keep up applying. A client that never acks (older mod version) throttles nobody, fail open.
		{
			let minAck = null;
			for (const p of ST.peers.values()) if (typeof p.ackSq === "number" && (minAck === null || p.ackSq < minAck)) minAck = p.ackSq;
			if (w.ackSeen && minAck !== null) {
				w.lag = Math.max(0, w.seq - minAck);  // in batches, so lag 600 literally reads as 60 s behind
				// AIMD with a 4..8 dead zone. The measurement carries ~1 batch of ack age plus RTT, so a
				// healthy link sits around 2-3. Thresholds have to clear that noise, otherwise we would
				// throttle a connection with nothing wrong with it.
				// 0.9.78: PING jako drugi sygnal przeciazenia. Zaleglosc paczek reaguje z opoznieniem,
				// a rosnacy RTT widac od razu — przy 3000 ms lacze jest juz zapchane i paczki gina.
				let pingMs = 0;
				for (const pp of ST.peers.values()) if (pp.ping != null && pp.ping > pingMs) pingMs = pp.ping;
				if (pingMs > 1000) w.rate = Math.max(0.02, w.rate * 0.7);            // lacze zapchane: ostro w dol
				else if (pingMs > 400) w.rate = Math.max(0.03, w.rate * 0.9);
				if (w.lag > 8) w.rate = Math.max(0.03, w.rate * 0.85);        // over 0.8 s behind, cut hard
				else if (w.lag <= 4 && pingMs < 250) w.rate = Math.min(1, w.rate * 1.05); // oddajemy pasmo tylko przy zdrowym RTT
				// Hard stop. The buffer is so full that shrinking batches cannot drain it in time. Send
				// nothing at all: pending grows here instead, where chunks coalesce, so the client gets
				// one current state rather than replaying every intermediate frame in order.
				if (w.lag > 25) {
										// 0.9.117: jesli mimo wstrzymania potwierdzenia nie ruszaja przez 8 s, to nie jest zator
					// lacza tylko rozjechany licznik (np. klient przeladowal okno) — resetujemy i wznawiamy.
					if (now - (w.ackAdvanceT || 0) > 8000) { resetAckBaseline(null, "brak postepu potwierdzen przez 8 s"); }
					else if (now - (w.stallLogT || 0) > 2000) { w.stallLogT = now; log("CONGESTION: client", w.lag, "batches behind (~" + Math.round(w.lag / 10) + " s), pausing sends, queue", w.pending.size); }
					w.lastBatch = now; // hold the 100 ms cadence while stalled, else the sweep runs every frame
					return;
				}
			} else w.lag = 0;
		}
		// 0.9.78: paczki bez potwierdzenia po 10 s traktujemy jako ZGUBIONE (typowe dla Steam P2P).
		// Bez tego ich wiersze zostaja u klienta puste NA ZAWSZE (host ma je za dostarczone) — to jest
		// przyczyna "dziurawego swiata" przez internet przy dzialajacym LAN.
		// 0.9.90: nie w trakcie pierwszej synchronizacji (wielka kolejka) — tam brak ACK znaczy "nie nadąża", nie "zgubione"
		if (w.ackSeen && w.unacked && w.unacked.size && w.pending.size < 200) {
			let lost = 0;
			for (const [sq, rec] of [...w.unacked]) {
				if (now - rec.t < 20000) continue;
				if (w.ackAdvanceT && now - w.ackAdvanceT < 20000) continue; // ACK sie posuwa => klient tylko nie nadaza
				w.unacked.delete(sq);
				for (const idx of rec.idx) { if (w.rowH) w.rowH.delete(idx); w.pending.add(idx); lost++; }
			}
			if (lost && now - (w.lostLogT || 0) > 3000) { w.lostLogT = now; log("STRATA: " + lost + " chunkow bez potwierdzenia — wysylam je od nowa (kolejka " + w.pending.size + ")"); }
		}
		w.busy = true; w.lastBatch = now;
		try {
			// DWA PASMA (fix "kolejka 8600, klient widzi świat sprzed 20s" — wielka mapa brudzi się szybciej
			// niż stary limit 40/batch, a sort po odległości GŁODZIŁ dalekie chunki w nieskończoność):
			// fast lane = WSZYSTKIE brudne w promieniu FAST_R od dowolnego gracza (to widzą gracze — zawsze świeże),
			// slow lane = porcja najstarszych z reszty (Set iteruje w kolejności wstawienia → FIFO, zero głodzenia).
			//
			// Adaptive budget. slowN used to be FIXED (20 or 40), so far lane drain never grew with the
			// backlog. A far chunk's delay is |far| / slowN, which rose linearly with base size and time
			// played. Now the portion grows with the queue but is capped by a BYTE budget (bpc is the
			// measured average compressed chunk size) scaled by w.rate from the controller above.
			const anchors = [{ x: state.store.player.x / 4, y: state.store.player.y / 4 }];
			for (const p of ST.peers.values()) anchors.push({ x: p.tx / 4, y: p.ty / 4 });
			const FAST_R = 24 * CHUNK; // ~2 ekrany wokół gracza (Manhattan, w komórkach)
			// 0.9.91: LAN/localhost to NIE Steam relay — tam sufit 24 KB/paczkę był naszym własnym hamulcem.
			// Przy szybkim łączu (niski RTT, zero zaległości) pozwalamy na więcej; przy wolnym zostaje ostrożnie.
			let linkPing = 0;
			for (const pp of ST.peers.values()) if (pp.ping != null && pp.ping > linkPing) linkPing = pp.ping;
			// 0.9.92: BEZ SZTYWNEGO SUFITU — mnożnik rośnie, dopóki klient nadąża, łącze wyrabia
			// i budowanie paczki nie zjada klatki (buildMs mierzony niżej). Inaczej: ostro w dół.
			// BUDŻET CZASU KLATKI (0.9.94) — to on, a nie łącze, jest realnym ogranicznikiem.
			// Budowanie paczki dzieje się w pętli renderowania hosta; nakładanie u klienta tak samo.
			// Cel: paczka poniżej 8 ms. Powyżej 15 ms gra zaczyna szarpać — wtedy ostro w dół.
			const pingOk = linkPing === 0 || linkPing < 60;
			const ms = w.buildMs || 0;
			if (pingOk && w.lag <= 2 && ms < 8) w.boost = Math.min(64, (w.boost || 1) * 1.15);      // wzrost spokojny
			else if (ms > 15 || w.lag > 4) w.boost = Math.max(1, (w.boost || 1) * 0.6);              // szarpie — zwijamy
			else { /* strefa komfortu: trzymamy poziom */ }
			const fast = w.boost || 1;
			// 0.9.93: SUFIT 150 Mbit/s = 18,75 MB/s; paczki lecą ~10x/s, więc 1,875 MB na paczkę.
			const HARD_CAP = Math.floor((150 * 1000 * 1000) / 8 / 10);
			// budzet PROPORCJONALNY do cyklu: przy 8 ms paczki sa male, przy 100 ms duze — pasmo/s stale
						// ile paczek czeka u najwolniejszego klienta na NALOZENIE — jesli rosnie, wysylamy mniej,
			// bo dosypywanie danych szybciej niz klient je nakłada tylko puchnie mu kolejke (0.9.111: 548 MB).
			let worstQd = 0;
			for (const pp of ST.peers.values()) if ((pp.qd | 0) > worstQd) worstQd = pp.qd | 0;
			const applyBrake = worstQd >= 12 ? 0.25 : worstQd >= 6 ? 0.5 : worstQd >= 3 ? 0.8 : 1;
			w.qd = worstQd;
			const budget = Math.min(HARD_CAP, Math.floor(4000 * (w.gap || 33) * w.rate * fast * applyBrake)); // 4 KB/ms = ~4 MB/s bazowo // 8 KB x 30/s = to samo co 24 KB x 10/s  // 0.9.78: 24 KB/paczke = sufit ~240 KB/s (~1,9 Mbit/s) zamiast ~960 KB/s.
			// LAN tego nie odczuje (i tak rzadko mamy tyle zmian), a internet przestaje sie dlawic wlasnym strumieniem.
			const bpc = w.bpc || 512;                       // measured compressed bytes per chunk, updated after deflate
			// Floor of 2, not 8. At the measured bpc of ~2 KB a floor of 8 still held ~310 KB/s, which is
			// nearly the 349 KB/s that caused the jam: the controller had nowhere to go and degenerated
			// into pure on/off stalling.
			// 0.9.90: maxN to już tylko GÓRNY limit kandydatów — o rozmiarze paczki decyduje budżet bajtowy niżej.
			const ratio = w.ratio || 0.12;                  // zmierzony stosunek: po kompresji / przed
			// 0.9.97: czy TA paczka poleci surowo? (te same warunki co przy wysyłce — musimy je znać WCZEŚNIEJ,
			// bo od tego zależy budżet: bez kompresji bajtów na wyjściu jest tyle, ile zserializujemy).
			let willSendRaw = ST._rawStream !== false && ST.peers.size > 0 && ST.net.transport === "ws"; // 0.9.98: domyslnie WYLACZONE (SandTogether._rawStream=true wlacza recznie)
			for (const pp of ST.peers.values()) if (pp.modVer !== VER) willSendRaw = false;
			if (willSendRaw) for (const pid of ST.peers.keys()) {
				const ip = (String(pid).match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/) || [])[0];
				if (!ip) { if (String(pid) !== "host") willSendRaw = false; continue; }
				const [A, B] = ip.split(".").map(Number);
				if (!(A === 127 || A === 10 || (A === 192 && B === 168) || (A === 172 && B >= 16 && B <= 31) || (A === 169 && B === 254))) willSendRaw = false;
			}
			// bez kompresji bajty wyjściowe = bajty zserializowane, więc NIE dzielimy przez współczynnik
			const rawBudget = willSendRaw ? Math.max(256 * 1024, budget) : Math.max(256 * 1024, Math.floor(budget / Math.max(0.02, ratio)));
			const maxN = Math.max(2, Math.min(6000, Math.floor(budget / bpc) * 8));
			const nearN = Math.min(3000, maxN);              // what players can actually see gets the budget first
			// Fast lane usage from the PREVIOUS batch, which is stable frame to frame. Without it we
			// reserved all 120 slots even when nothing near the players was dirty, so the far lane got
			// scraps on a link that was doing nothing.
			const nearEst = Math.min(nearN, w.lastNear || 0);
			// The floor min(20, maxN) must not exceed maxN, otherwise throttling would never take effect
			const slowN = Math.max(Math.min(20, maxN), Math.min(maxN - nearEst, Math.ceil(w.pending.size / 20)));
			const near = [], far = [];
			for (const a of w.pending) {
				// Early break. The Set is FIFO, so the first nearN and slowN hits are EXACTLY the chunks a
				// full scan would pick. Without it every batch walked the WHOLE queue (O(|pending|)) and
				// allocated a far array of that size 10x per second, on the renderer thread inside the
				// frame hook. Bigger backlog gave longer frames, fewer batches per second, and a bigger
				// backlog again, which is why lag grew the longer a session ran.
				if (near.length >= nearN && far.length >= slowN) break;
				const ax = (a % d.cx) * CHUNK, ay = Math.floor(a / d.cx) * CHUNK;
				let dm = 1e9;
				for (const an of anchors) { const dd = Math.abs(ax - an.x) + Math.abs(ay - an.y); if (dd < dm) dm = dd; }
				if (dm <= FAST_R) { if (near.length < nearN) near.push(a); }  // cap is budget driven now, was a fixed 120
				else if (far.length < slowN) far.push(a);                     // stop at slowN, was collecting every far chunk
			}
			w.lastNear = near.length; // feeds nearEst on the next batch
			// PRIORYTET najpierw (grabber/vacuum) — ZAWSZE wysyłane, omijają limit near/far (fix "re-grab: miroir ne livre pas").
			const prio = w.priority.size ? [...w.priority] : [];
			w.priority.clear();
			// far is already capped to slowN by the loop above, so the old far.slice(0, slowN) is redundant
			const take = prio.concat(near.filter((i) => !prio.includes(i)), far.filter((i) => !prio.includes(i)));
			for (const i of take) w.pending.delete(i);
			// serializacja v4: [u16 cx][u16 cy][u8 cw][u8 ch] + per-komórka: 4 map + 1 wall + 1 shadow + 1 auth + 4 cellIds + 1 elemType = 12 B
			const parts = [];
			let size = 0;
			let fogSkipped = 0;
			// bezpiecznik natychmiastowy: po naprawdę drogiej paczce tniemy budżet surowy o połowę
			const rawBudgetEff = (w.buildMs || 0) > 30 ? Math.floor(rawBudget / 2) : rawBudget;
			const buildT0 = performance.now(); // 0.9.92: mierzymy koszt budowania paczki
			let stoppedAt = -1;
			for (let ti = 0; ti < take.length; ti++) {
				if (size >= rawBudgetEff) { stoppedAt = ti; break; } // budżet wyczerpany — reszta wróci do kolejki
				const idx = take[ti];
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
			if (stoppedAt >= 0) for (let ti = stoppedAt; ti < take.length; ti++) w.pending.add(take[ti]); // 0.9.90: nie gubimy reszty
			if (!parts.length) { w.busy = false; return; }
			const all = new Uint8Array(size);
			let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
			// 0.9.95: szybkie łącze + ta sama wersja u wszystkich => wysyłamy SUROWO (oszczędzamy procesor
			// po obu stronach: brak pakowania u hosta, brak rozpakowania u klienta).
			let sameVerAll = ST.peers.size > 0;
			for (const pp of ST.peers.values()) if (pp.modVer !== VER) sameVerAll = false;
						// Peer na adresie lokalnym/prywatnym => pasmo darmowe => nie pakujemy (oszczędzamy procesor
			// po obu stronach). Identyfikatory peerów mają postać "ws:::ffff:127.0.0.1:5xxxx" albo "ws:192.168...".
			let allLocal = ST.peers.size > 0 && ST.net.transport === "ws";
			for (const pid of ST.peers.keys()) {
				const ip = (String(pid).match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/) || [])[0];
				if (!ip) { if (String(pid) !== "host") allLocal = false; continue; }   // "host" = my jesteśmy klientem
				const [A, B] = ip.split(".").map(Number);
				const priv = A === 127 || A === 10 || (A === 192 && B === 168) || (A === 172 && B >= 16 && B <= 31) || (A === 169 && B === 254);
				if (!priv) allLocal = false;
			}
			const rawOk = willSendRaw && sameVerAll && allLocal && all.length < 8 * 1024 * 1024;
			const __ser = performance.now() - buildT0; // czas BLOKUJACY klatke (bez czekania na kompresje)
			w.serMs = w.serMs ? w.serMs * 0.7 + __ser * 0.3 : __ser;
			const packed = rawOk ? all : await deflate(all);
			w.rawMode = rawOk;
			w.seq++; // batch number the client echoes back in wcack
			// 0.9.78: zapamietaj chunki tej paczki — hashe wierszy sa "warunkowe" do czasu ACK klienta.
			if (!w.unacked) w.unacked = new Map();
			w.unacked.set(w.seq, { idx: take.slice(0), t: now });
			// q = rozmiar kolejki hosta (odliczanie postępu u klienta, 0.9.62) + sq = numer paczki (wcack, PR #8)
			sendWorldPacket({ t: "wc", v: 5, z: w.rawMode ? 0 : 1, sq: w.seq, wid: state.store.meta && state.store.meta.worldId, scene: state.store.scene && state.store.scene.active, W, H, n: parts.length, q: w.pending.size }, packed, sameVerAll && ST.net.transport === "ws"); // binarnie tylko gdy peer ma ten sam mod i siedzimy na WS
			// EMA of what a chunk really costs on the wire, drives the batch budget above. Cheap chunks
			// (few changed rows) earn a bigger portion, expensive ones a smaller one, so the byte ceiling
			// holds regardless of what the sim is doing.
			const bpcNow = packed.length / parts.length;
			w.bpc = w.bpc ? w.bpc * 0.8 + bpcNow * 0.2 : bpcNow;
			const ratioNow = packed.length / Math.max(1, all.length);
			w.ratio = w.ratio ? w.ratio * 0.8 + ratioNow * 0.2 : ratioNow;
			const buildMsNow = performance.now() - buildT0;
			w.buildMs = w.buildMs ? w.buildMs * 0.7 + buildMsNow * 0.3 : buildMsNow; // hamulec: nie zjadamy klatki hosta // 0.9.90: ile realnie zostaje po kompresji
			// statystyki
			w.applyBytes += packed.length; w.applyCount += parts.length;
			w.fogSkipped = (w.fogSkipped || 0) + fogSkipped;
			if (now - w.statT > 2000) {
				// lag and rate appended raw, no i18n: this is a diagnostic readout, not player facing text.
				// Blank when no client acks, so an un-throttled session does not show a misleading zero.
				const cc = (w.ackSeen ? "  lag " + w.lag + " (" + Math.round(w.rate * 100) + "%)" + (w.qd ? " qd" + w.qd : "") : "") + "  x" + (Math.round((w.boost || 1) * 10) / 10) + "  ser " + Math.round(w.serMs || 0) + "/" + Math.round(w.buildMs || 0) + "ms" + "  " + Math.round(1000/(w.gap||33)) + "Hz" + (w.rawMode ? "  surowo" : "");
				const info = t("sync_up", Math.round(w.applyBytes / 2048), Math.round(w.applyCount / 2), w.pending.size) + cc;
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
		// 0.9.129: hamujemy PREDKOSCIA (68), nie flaga pauzy (54) — flaga psuje renderowanie u klienta
		// i jest ruszana przez gre przy zapisie. Flage czyscimy przy wznawianiu, gdyby zostala po starszej wersji.
		mgr.postMessage([68, paused ? 0 : 1]);
		if (!paused) mgr.postMessage([54, false]);
		ST.wsx.paused = paused;
		log("Symulacja klienta:", paused ? "ZAPAUZOWANA (lustro hosta)" : "wznowiona");
	}

	// 0.9.110: NAKLADANIE LUSTRA W PORCJACH.
	// Duza paczka niesie duzo chunkow (to dobrze: przepustowosc), ale nalozenie jej w jednej klatce
	// zatrzymywalo obraz na ~240 ms. Paczki ida wiec do kolejki FIFO (kolejnosc jest obowiazkowa —
	// protokol row-delta wysyla TYLKO zmienione wiersze, wiec pominiecie paczki zostawia dziure),
	// a kazda klatka dostaje ograniczony budzet czasu na nakladanie.
	function drainApplyQ(state, budgetMs) {
		const q = ST._applyQ;
		if (!q || !q.length || !state) return 0;
		const { map, wall, shadow, auth, sim, etype, W, H } = worldBuffers(state);
		if (!map) { q.length = 0; return 0; }
		const cellIds32 = sim ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null;
		const tSlice = performance.now();
		let applied = 0;
		while (q.length) {
			const it = q[0];
			const raw = it.raw;
			const dv = it.dv || (it.dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength));
			let o = it.o, done = true;
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
				// co 8 chunkow sprawdzamy zegar — reszta paczki poczeka na nastepna klatke
				if ((applied & 7) === 0 && performance.now() - tSlice > budgetMs) { done = false; break; }
			}
			it.o = o;
			// ACK dopiero po NALOZENIU calosci — inaczej host mierzy tempo lacza zamiast tempa klienta
			// i rozpedza sie w nieskonczonosc (kolejka rosla do setek MB).
			if (done) q.shift(); else break;
		}
		if (q.length) scheduleApplyDrain();
		if (applied > 0 && ST.wsx) { ST.wsx.applyCount += applied; ST._lastWcT = performance.now(); }
		return applied;
	}
	function scheduleApplyDrain() {
		if (ST._applyRaf) return;
		ST._applyRaf = requestAnimationFrame(() => {
			ST._applyRaf = 0;
			try {
				const q = ST._applyQ;
				if (!q || !q.length) return;
				// im wiekszy zator, tym wiecej czasu na klatke (ale nigdy tyle, zeby zgubic plynnosc)
				const n = drainApplyQ(ST.state, q.length > 4 ? 10 : 6);
				if (n > 0) ST._lastWcT = performance.now();
			} catch (e) { if (!ST._drainErr) { ST._drainErr = 1; log("drainApplyQ blad:", e.message); } }
		});
	}
	// 0.9.111: wysylka paczki swiata. Gdy peer ma ten sam mod i siedzimy na WS — leci ramka binarna
	// (bez base64: -25% bajtow, zero kodowania po obu stronach). Inaczej stara droga: base64 w JSON-ie.
	function sendWorldPacket(hdr, bytes, useBin) {
		if (useBin) {
			try {
				const h = new TextEncoder().encode(JSON.stringify(hdr));
				const out = new Uint8Array(2 + h.length + bytes.length);
				out[0] = (h.length >> 8) & 255; out[1] = h.length & 255;
				out.set(h, 2); out.set(bytes, 2 + h.length);
				net.send(out);
				return;
			} catch (e) { if (!ST._binErr) { ST._binErr = 1; log("wysylka binarna zawiodla, wracam do base64:", e.message); } }
		}
		hdr.d = b64enc(bytes);
		net.send(hdr);
	}
	async function applyWorldBatch(msg) {
		if (ST.net.role !== "client" || !ST.state) return;
		const state = ST.state;
		const myWid = state.store.meta && state.store.meta.worldId;
		const myScene = state.store.scene && state.store.scene.active;
		// Dawny "tryb testowy" (oba w menu → maluj mimo menu) USUNIĘTY (fix instant-kick, Akriz+derErste67):
		// malował menu-bufory hosta po menu klienta i ustawiał everApplied w menu → auto-wyjście
		// natychmiast rozłączało świeżo dołączonego gracza. Lustro w menu NIE MALUJE NIGDY.
		const menuTest = false;
		// KLIENT W MENU (fix tony: "menu główne zamienia się w czerwone bloki"): lustro hosta NIE MOŻE
		// malować po scenie menu — dane świata lądowały w buforach sceny menu jako czerwone kafle.
		if (myScene === 1) return;
		// ŁADOWANIE ŚWIATA W TOKU (fix TCentraL "big map freeze"): pisanie po buforach świata
		// w TRAKCIE FH.game.load = wyścig z silnikiem wczytującym save (zwiecha/korupcja).
		// Dropujemy — AUTO-RESYNC po starcie lustra i tak dośle pełny świat.
		if (ST._loadingWorld) return;
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
				ST._hostWidSeen = msg.wid; // 0.9.116: swiat hosta, nawet gdy paczke odrzucamy — sluzy do wykrycia "siedze w zlym swiecie"
			if (!ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = true; log("REJECT world: worldId host=" + msg.wid + " me=" + myWid + " scene h/c=" + msg.scene + "/" + myScene); }
				return;
			}
			ST._hostWidSeen = msg.wid; // 0.9.132: swiat hosta znamy takze wtedy, gdy paczke przyjmujemy
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
		const __t0 = performance.now(); // 0.9.101: ile kosztuje nakladanie lustra
		const __rb = msg.__bytes || b64dec(msg.d); // 0.9.111: ramka binarna omija base64
		const raw = msg.z === 0 ? __rb : await inflate(__rb); // 0.9.95: z=0 => paczka surowa (szybkie łącze)
		if (!ST._applyQ) ST._applyQ = [];
				// twardy limit: jesli klient nie nadaza tak bardzo, ze kolejka rosnie w megabajty, nie ma sensu
		// jej trzymac — dane sa juz nieaktualne. Kasujemy i prosimy o pelny swiat od nowa.
		let __qb = 0; for (const it of ST._applyQ) __qb += it.raw.length;
		if (__qb > 32 * 1024 * 1024) {
			ST._applyQ.length = 0;
			log("ZATOR: kolejka nakladania przekroczyla 32 MB — czyszcze i prosze o resync");
			try { net.send({ t: "resync" }); } catch (e) {}
			return;
		}
		ST._applyQ.push({ raw: raw, o: 0, sq: typeof msg.sq === "number" ? msg.sq : null });
		const applied = drainApplyQ(state, ST._applyQ.length > 4 ? 10 : 6);

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
		if (applied > 0) ST._lastWcT = performance.now();
		if (applied > 0 && ST._stallShown) { ST._stallShown = false; setStatus(t("players", ST.peers.size + 1)); } // dane wrocily => zdejmij komunikat o zatorze // do wskaźnika zatoru (sync_stalled)
		// Record the batch AFTER applying it, not on receipt, so the host's lag also catches a client that
		// is CPU bound, not only a saturated link.
		if (typeof msg.sq === "number") ST._lastAppliedSq = msg.sq;
		if (applied > 0 && !w.everApplied) {
			w.everApplied = true; log("Pierwsze paczki świata zastosowane — lustro działa"); setStatus(t("players", ST.peers.size + 1));
			techRepair(state, "client"); // zbrickowane flagi w save od hosta (0.9.71)
			fixFutureCooldowns(state, "start lustra");
			profileRestore(state, msg.wid || ST._trustedWid); // wróć tam, gdzie skończyłeś w TYM świecie (G7-lite)
			// AUTO-RESYNC (fix TCentraL "big map"): initial flood (enqueueFullWorld po peer-hello) leciał
			// gdy klient był jeszcze w MENU/loadzie i był DROPOWANY, a rowH hosta uważa go za dostarczony
			// → bez tego stale dziury w świecie aż do ręcznego Resync. Raz na sesję (flaga _autoResynced).
			if (!ST._autoResynced) { ST._autoResynced = true; try { net.send({ t: "resync" }); log("AUTO-RESYNC: proszę hosta o pełny świat (paczki sprzed wejścia do świata były dropowane)"); } catch (e) {} }
		}
		const __ms = performance.now() - __t0;
		w.applyMs = w.applyMs ? w.applyMs * 0.7 + __ms * 0.3 : __ms;
		if (__ms > (w.applyWorst || 0)) w.applyWorst = __ms;
		w.applyBytes += msg.__bytes ? msg.__bytes.length : (msg.d ? msg.d.length * 0.75 : 0); // binarnie: dokladny rozmiar, base64: ~3/4 dlugosci tekstu // (chunki doliczane w drainApplyQ, takze te nalozone miedzy klatkami)
		const now = performance.now();
		if (now - w.statT > 2000) {
			// q = ile paczek zostało w kolejce hosta — realny wskaźnik postępu wstępnej synchronizacji
			// dużej mapy (feedback TCentraL: "no real progress to when it loads")
			const info = t("sync_down", Math.round(w.applyBytes / 2048), Math.round(w.applyCount / 2), typeof msg.q === "number" ? msg.q : 0);
			const extra = "  lustro " + Math.round(w.applyMs || 0) + "/" + Math.round(w.applyWorst || 0) + "ms  snap " + Math.round(w.snapMs || 0) + "/" + Math.round(w.snapWorst || 0) + "ms";
			setSyncInfo(info + extra);
			log("SYNC-CLIENT", info + extra);
			w.applyBytes = 0; w.applyCount = 0; w.statT = now;
		}
	}

	// ------------------------------------------------------------------
	// STRUKTURY — replikacja event-driven + okresowe uzgadnianie (snapshot)
	// ------------------------------------------------------------------
	// 0.9.142: structure.filter (filtry, shakery, growery, filter wall) tez jedzie po sieci — wczesniej tylko data,
	// wiec filtr ustawiony przez klienta nigdy nie docieral do hosta (i odwrotnie): "filters only work when host configures them".
	// 0.9.143: queued (struktura "w kolejce" — postawiona NAD terenem, bloki zostaja, np. przenosnik Mk2 nad kamieniem) i frame
	// (rama fundamentu) tez jada po sieci — bez nich klient budowal wszystko jako PELNE (kasuje teren / inna kolizja).
	const slimStruct = (s) => { const o = { type: s.type, x: s.x, y: s.y, data: s.data }; if (s.filter != null) o.f = s.filter; if (s.queued) o.q = 1; if (s.frame) o.fr = 1; return o; };
	const structSig = (s) => { try { return JSON.stringify([s.data == null ? null : s.data, s.filter == null ? null : s.filter, s.queued ? 1 : 0, s.frame ? 1 : 0]); } catch (e) { return ""; } };
	// sygnatura struktury Z PAKIETU (slim: data/f/q/fr) — JEDNA dla petli snapshotu i dla dokanczania odlozonych
	// (0.9.143: rozne wzory w obu miejscach = wieczne przebudowy odlozonej reszty przy 90 tys. struktur)
	const snapSig = (s) => (s.data != null ? JSON.stringify(s.data) : "") + "|" + (s.f != null ? JSON.stringify(s.f) : "") + "|" + (s.q ? 1 : 0) + (s.fr ? 1 : 0);
	const structKey = (s) => s.type + "@" + s.x + "," + s.y;
	// KONFIG MASZYN przez klienta (G5b): edycje structure.data w UI maszyn nie mają eventu — wykrywamy
	// je diffem JSON w POBLIŻU gracza (tam się klika; pełny skan tysięcy struktur co klatkę = za drogo).
	const dataSeenSet = (k, s) => { if (!ST._dataSeen) ST._dataSeen = new Map(); ST._dataSeen.set(k, structSig(s)); };
	function scanDataEditsIfDue(state) {
		const now = performance.now();
		if (now - (ST._dataScanT || 0) < 800) return;
		ST._dataScanT = now;
		try {
			const role = ST.net.role;
			if (role === "client" && !ST._dataSeen) return; // baza bierze sie ze snapshotu hosta
			if (role === "host" && !ST.peers.size) return;
			if (!ST._dataSeen) ST._dataSeen = new Map();
			if (!ST._dataEdited) ST._dataEdited = new Map();
			const px = state.store.player.x / 4, py = state.store.player.y / 4, R = 48; // ~ekran wokół gracza (komórki)
			for (const s of state.store.structures || []) {
				if (Math.abs(s.x - px) > R || Math.abs(s.y - py) > R) continue;
				const k = structKey(s);
				const prev = ST._dataSeen.get(k);
				if (prev === undefined) { dataSeenSet(k, s); continue; }
				const cur = structSig(s);
				if (cur === prev) continue;
				ST._dataSeen.set(k, cur);
				if (role === "host") {
					// 0.9.142: HOST rozsyla tylko zmiany FILTRA (data maszyn hosta zmienia sie co chwila — to idzie snapshotem);
					// bez tego klient widzial stary filtr po edycji u hosta
					let pv = null, cv = null; try { pv = JSON.parse(prev); cv = JSON.parse(cur); } catch (e) {}
					if (!pv || !cv || JSON.stringify(pv.slice(1)) === JSON.stringify(cv.slice(1))) continue; // [1..] = filtr, queued, frame (0.9.143)
					try { net.send({ t: "st", k: "add", list: [slimStruct(s)] }); } catch (e) {}
					log("HOST filtr/queued zmieniony →", k);
					continue;
				}
				ST._dataEdited.set(k, now);
				try { const m = { t: "act", k: "sdata", x: s.x, y: s.y, type: s.type, data: s.data }; if (s.filter != null) m.f = s.filter; net.send(m); } catch (e) {}
				log("CLIENT config maszyny →", k, s.filter != null ? "(+filtr)" : "");
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
				// KONFIG MASZYN (G5b): świeżo edytowane przez klienta data/filtr chronimy przed nadpisaniem
				// przez snapshot hosta (act sdata jest w drodze; host potwierdzi w następnym snapie)
				const k = structKey(s);
				const edited = ST._dataEdited && ST._dataEdited.get(k);
				const chroniony = ST.net.role === "client" && edited != null && performance.now() - edited < 6000;
				const dataDiff = !!s.data && JSON.stringify(existing.data) !== JSON.stringify(s.data);
				// 0.9.142: filtr (structure.filter) tez synchronizujemy — patrz slimStruct
				const filtDiff = s.f !== undefined && JSON.stringify(existing.filter == null ? null : existing.filter) !== JSON.stringify(s.f);
				// 0.9.143: queued/frame od hosta (snapshot/st add niosa q/fr tylko gdy ustawione → brak = zbudowana)
				const qDiff = ST.net.role === "client" && (!!existing.queued !== !!s.q || !!existing.frame !== !!s.fr);
				if ((dataDiff || filtDiff || qDiff) && !chroniony) {
					if (dataDiff) existing.data = s.data;
					if (filtDiff) existing.filter = s.f;
					if (qDiff) { existing.queued = s.q ? true : undefined; existing.frame = s.fr ? true : undefined; }
					// 0.9.143: SA.update robi store.structures.findIndex (liniowo po 90 tys.) — u klienta wolamy je TYLKO gdy
					// zmienil sie tryb kafla (queued/frame); data i filtr czyta renderer prosto z obiektu. Bez tego snapshot = 2 s zwiechy.
					if (SA.update && (ST.net.role === "host" || qDiff)) SA.update(state, existing, { propagateToWorkers: ST.net.role === "host" });
				}
				if (ST.net.role === "client" && !chroniony) dataSeenSet(k, existing); // baza do wykrywania edycji klienta
				return existing;
			}
			// 0.9.143: clearance klienta (3=PartiallyBlocked, 4=CanBeReplaced) albo queued hosta (→3) — gra sama ustawi queued
			// i NIE wpisze ksztaltu w teren. Wczesniej zawsze Available → host budowal PELNY przenosnik i kasowal bloki/kamien.
			const cl = (s.cl === 3 || s.cl === 4) ? s.cl : (s.q ? 3 : CLEARANCE_AVAILABLE);
			const pos = force ? { x: s.x, y: s.y, clearance: cl } : { x: s.x, y: s.y };
			const built = SA.build(state, pos, s.type, {});
			if (built) {
				if (s.data) built.data = s.data;
				if (s.f !== undefined) built.filter = s.f;
				if (ST.net.role === "client") {
					// 0.9.143: u klienta SA.update (O(n) po store) tylko gdy tryb kafla (queued/frame) rozni sie od tego, co gra ustawila
					if (!!built.queued !== !!s.q || !!built.frame !== !!s.fr) { built.queued = s.q ? true : undefined; built.frame = s.fr ? true : undefined; if (SA.update) SA.update(state, built, { propagateToWorkers: false }); }
					return built;
				}
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
	// Resolve the footprint while the structure is still alive. Foundation data has changed shape
	// between game builds, whereas getAtCell is the game's authoritative shape lookup. Walk only
	// cells belonging to this exact structure, then retain their bounding box for orphan cleanup.
	function structureBounds(state, SA, st, seedX, seedY) {
		if (!SA || !st) return null;
		const key = structKey(st), q = [[seedX, seedY]], seen = new Set();
		let x0 = seedX, y0 = seedY, x1 = seedX, y1 = seedY, cells = 0;
		while (q.length && cells < 4096) {
			const [x, y] = q.pop(), ck = x + "," + y;
			if (seen.has(ck)) continue;
			seen.add(ck);
			let at = null; try { at = SA.getAtCell(state, x, y); } catch (e) {}
			if (!at || (at !== st && structKey(at) !== key)) continue;
			cells++;
			if (x < x0) x0 = x; if (x > x1) x1 = x;
			if (y < y0) y0 = y; if (y > y1) y1 = y;
			q.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
		}
		return cells ? { x0, y0, x1, y1 } : null;
	}
	function armDemolCleanup(bounds) {
		if (!bounds || !bounds.length) return;
		ST._hostDemolRect = { bounds, t: performance.now(), cleanOrphans: true };
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

	// 0.9.102: podpis zbioru struktur — jeśli nic się nie zmieniło, snapshot jest zbędny
	// (host oszczędza serializację 90 tys. obiektów, klient nie dostaje pracy do wykonania).
	function structuresSignature(state) {
		try {
			const a = state.store.structures || [], b = state.store.pipes || [];
			let h = 2166136261 >>> 0;
			h = (h ^ a.length) >>> 0; h = (h * 16777619) >>> 0;
			h = (h ^ b.length) >>> 0; h = (h * 16777619) >>> 0;
			const step = Math.max(1, Math.floor(a.length / 512)); // próbkujemy, pełny hash 90 tys. byłby drogi
			for (let i = 0; i < a.length; i += step) {
				const s = a[i]; if (!s) continue;
				h = (h ^ ((s.x | 0) * 73856093) ^ ((s.y | 0) * 19349663) ^ (typeof s.type === "number" ? s.type : 0) ^ (s.queued ? 0x1000000 : 0) ^ (s.frame ? 0x2000000 : 0)) >>> 0; // 0.9.143: queued→zbudowana tez zmienia snapshot
				h = (h * 16777619) >>> 0;
			}
			return h + ":" + a.length + ":" + b.length;
		} catch (e) { return null; }
	}
	async function sendSnapshotIfDue(state) {
		const now = performance.now();
		if (now - ST._lastSnap < 2500) return;
		// 0.9.102: jesli zbior struktur sie nie zmienil, snapshot jest zbedny — oszczedzamy serializacje
		// 90 tys. obiektow u hosta i cala prace u klienta (to on powodowal zacinki 157-445 ms).
		const sig = structuresSignature(state);
		if (sig && sig === ST._snapSig && !ST._snapForce) { ST._lastSnap = performance.now(); return; }
		ST._snapSig = sig; ST._snapForce = false;
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
		const __s0 = performance.now();
		try { return await __applySnapshotInner(msg); } finally { const d = performance.now() - __s0; ST.wsx.snapMs = ST.wsx.snapMs ? ST.wsx.snapMs * 0.7 + d * 0.3 : d; if (d > (ST.wsx.snapWorst || 0)) ST.wsx.snapWorst = d; }
	}
	async function __applySnapshotInner(msg) {
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
						ST._absentCount.delete(k); ST._structApplied.delete(k); if (ST._structSig) ST._structSig.delete(k);
					}
				}
				// dobuduj/zaktualizuj brakujące (klient: force=true — render bez kontroli kolizji/zapisu komórek)
				// 0.9.102: odbudowujemy TYLKO to, co nowe albo zmienione. Przy 90 tys. struktur pełny przebieg
				// kosztował 157 ms (szczyt 445 ms) w jednej klatce — a fabryka zwykle stoi w miejscu.
				if (!ST._structSig) ST._structSig = new Map();
				const tSlice = performance.now();
				let built = 0, skipped = 0, deferred = 0;
				for (const s of hostList) {
					const k = structKey(s);
					// 0.9.142: sygnatura z data+filtr (wczesniej z nieistniejacych pol → stala → zmiany konfigu hosta nie docieraly)
					const sig = snapSig(s);
					if (ST._structSig.get(k) === sig) { skipped++; ST._structApplied.set(k, nowS); continue; }
					if (built > 50 && performance.now() - tSlice > 8) {
						// 0.9.137: NIE porzucamy reszty — host moze nigdy nie przyslac kolejnego snapshotu
						// (pomija wysylke, gdy zbior struktur bez zmian), a wtedy te struktury nie powstana.
						if (!ST._snapRest) ST._snapRest = [];
						ST._snapRest.push(s);
						deferred++; continue;
					}
					buildOne(state, s, true);
					ST._structSig.set(k, sig);
					ST._structApplied.set(k, nowS);
					built++;
				}
				if ((built || deferred) && (ST._snapDiag = (ST._snapDiag || 0) + 1) <= 30) log("SNAP: odbudowano " + built + ", pominieto bez zmian " + skipped + (deferred ? ", odlozono " + deferred : ""));
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
				th: techFlagsForNet(state), // tech tree (bez śmieciowego klucza "undefined")
				pg: state.store.progression || null,    // progression (upgradesUnlocked, dungeons)
				bl: (state.store.player && state.store.player.buildings) || null, // odblokowane budynki (pomysl: Cr0ss0vr, PR #13)
				iv: invForNet(state),                   // odblokowane przedmioty — tylko gdy lista sie zmienila
				tz: tzForNet(state),                     // strefy teleportacji (klient chodzi po terenie hosta)
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
	//
	// FIX 0.9.71 (Akriz / Cr0ss0vr: "research bricked"): unlockTech gry ZWRACA true/false i przy
	// false NIC nie robi (tech zablokowany, tutorial, niespełnione wymagania, ZA MAŁO SUROWCÓW,
	// "cantDeductEvenly" złota). Ignorowaliśmy wynik i stawialiśmy flagę → w drzewku "Researched",
	// ale budynki/itemy niezarejestrowane i NIE DA SIĘ zbadać ponownie. Do tego host odejmował koszt
	// klienta ręcznie PRZED unlockTech, która sama sprawdza i odejmuje koszt → drugie sprawdzenie
	// padało na braku złota (albo płaciliśmy podwójnie).
	// mode: "pay"  = host przetwarza zakup klienta: skipCostCheck (klient już sprawdził koszt vs wspólna
	//                pula), a grę zostawiamy AUTORYTATYWNE odjęcie kosztu (równo z kolektorów itd.);
	//       "free" = odblokowanie OD DRUŻYNY (zapłacił ktoś inny): session.cheat.bypassCosts na czas
	//                wywołania = bez sprawdzania i BEZ odejmowania (klient nie kasuje lustrzanego złota).
	// Definicja tech Z POLEM id (fix 0.9.72, e2e): getTechDefinition(id) zwraca goły obiekt {cost,unlocks,...}
	// BEZ id — UI gry kupuje przez węzły z getTechNodes() (mają id, typ numeryczny dla enumów). Podanie
	// defa bez id do unlockTech => gra zapisywała tech["undefined"]=true (śmieć w save), a switch(t.id)
	// (efekty uboczne: krok tutoriala, odkrycia elementów) nie trafiał. Klucze z sieci przychodzą jako
	// stringi ("2") — dopasowanie luźne (==) do id węzła (2).
	function techNode(techId) {
		const tm = ST._techMod;
		try {
			const nodes = (tm.getTechNodes && tm.getTechNodes()) || [];
			for (const n of nodes) if (n && n.id == techId) return n; // eslint-disable-line eqeqeq
		} catch (e) {}
		try {
			const d = tm.getTechDefinition(techId);
			if (!d) return null;
			if (d.id !== undefined) return d;
			const num = Number(techId);
			return Object.assign({ id: String(num) === String(techId) && !isNaN(num) ? num : techId }, d);
		} catch (e) { return null; }
	}
	// Zwraca: true = pełny unlock; false = gra ODMÓWIŁA (flagi NIE stawiać!); null = brak _techMod.
	function techUnlock(state, techId, mode, defOverride) {
		const tm = ST._techMod;
		if (!(tm && tm.unlockTech && tm.getTechDefinition)) return null;
		let def = defOverride || techNode(techId);
		if (!def) { log("techUnlock: nieznany tech", techId); return false; }
		const sess = state.session || (state.session = {});
		const prevCheat = sess.cheat;
		try {
			if (mode === "free") sess.cheat = Object.assign({}, prevCheat || {}, { bypassCosts: true });
			const r = tm.unlockTech(state, def, { suppressMusic: true, playSound: false, skipCostCheck: true });
			return r !== false;
		} catch (e) { log("techUnlock error:", techId, e.message); return false; }
		finally { sess.cheat = prevCheat; }
	}
	// Gra odmówiła odblokowania tech od drużyny (u klienta) — nie spamuj co 1 s: ponów co 10 s.
	function techRefusedRecently(id) {
		const m = ST._techRefused || (ST._techRefused = new Map());
		const now = performance.now(), last = m.get(id) || 0;
		if (now - last < 3000) return true; // 3 s (było 10 s): odmowa bywa chwilowa (kolejność kluczy/wymagania)
		m.set(id, now);
		return false;
	}
	// NAPRAWA "ZBRICKOWANYCH" SAVE'ÓW (0.9.71): stary błąd zostawiał tech z flagą true, ale bez
	// zarejestrowanych budynków (player.buildings) / itemów (inventory) — w drzewku "Researched", budować
	// nie można, zbadać ponownie też nie. Dla każdego takiego tech wołamy unlockTech gry w trybie "free"
	// z defem OKROJONYM do brakujących unlocks (bez duplikatów itemów; `ae` budynków i tak jest idempotentne).
	// unlockTech nie sprawdza flagi "już zbadane" (tylko lockedTechs/tutorial/wymagania), więc można.
	// Idempotentne. Host/solo: raz na wejście w świat; klient: po starcie lustra + throttle w streamie th.
	// Znacznik cooldownu z PRZYSZLOSCI blokuje narzedzie na zawsze (patrz 0.9.130). Prostujemy wszystkie:
	// zdolnosci przedmiotow, cooldowny gracza i reload amunicji.
	function fixFutureCooldowns(state, why) {
		try {
			const now = state.store.meta && state.store.meta.time;
			if (typeof now !== "number") return 0;
			let n = 0;
			const prostuj = (cd) => { if (cd && typeof cd.last === "number" && cd.last > now) { cd.last = 0; n++; } };
			for (const it of state.store.player.inventory || []) {
				for (const ab of it.abilities || []) { prostuj(ab.cooldown); if (ab.ammo) prostuj(ab.ammo.reload); }
				if (it.data && it.data.cooldown) prostuj(it.data.cooldown);
			}
			const pc = state.store.player.cooldowns;
			if (pc) for (const k of Object.keys(pc)) prostuj(pc[k]);
			if (n) log("NAPRAWA: wyprostowano", n, "cooldownow ustawionych w przyszlosci (" + why + ") — narzedzia byly zablokowane");
			return n;
		} catch (e) { return 0; }
	}
	function techRepair(state, who) {
		let fixed = 0;
		try {
			const tm = ST._techMod;
			if (!(tm && tm.unlockTech && tm.getTechDefinition)) return 0;
			const pl = state.store && state.store.player;
			if (!pl || !pl.tech) return 0;
			const blds = pl.buildings || [], inv = pl.inventory || [];
			for (const id of Object.keys(pl.tech)) {
				if (pl.tech[id] !== true) continue;
				if (id === "undefined") { delete pl.tech[id]; log("REPAIR(" + who + "): usunięty śmieciowy klucz tech[\"undefined\"] (po starym błędzie defa bez id)"); continue; }
				const def = techNode(id);
				if (!def || !def.unlocks) continue;
				const ms = (def.unlocks.structures || []).filter((b) => !blds.includes(b));
				const mi = (def.unlocks.items || []).filter((it) => !inv.some((x) => x && x.id === it));
				if (!ms.length && !mi.length) continue;
				const partial = Object.assign({}, def, { unlocks: Object.assign({}, def.unlocks, { structures: ms, items: mi }) });
				ST._applyingNet = true;
				let r = false;
				try { r = techUnlock(state, id, "free", partial); } finally { ST._applyingNet = false; }
				log("REPAIR(" + who + "): tech", id, "miał flagę bez unlocks — brak budynków:", ms.join(",") || "-", "itemów:", mi.join(",") || "-", "→", r === true ? "NAPRAWIONY" : "gra odmówiła (" + r + ")");
				if (r === true) fixed++;
			}
			if (fixed) setStatus(t("tech_repaired", fixed), "#5f5");
		} catch (e) { log("techRepair error:", e.message); }
		return fixed;
	}
	ST.repairTech = () => (ST.state ? techRepair(ST.state, "manual") : 0); // ręcznie z konsoli: SandTogether.repairTech()
	// Lista przedmiotow gracza jedzie tylko wtedy, gdy sie ZMIENILA (inaczej kilka KB co 2 s bez powodu).
	// Strefy teleportacji jada tylko wtedy, gdy zbior sie zmienil (identyfikatory + liczba).
	function tzForNet(state) {
		try {
			const tz = state.store.world && state.store.world.teleportZones;
			if (!Array.isArray(tz)) return null;
			const sig = tz.length + ":" + tz.map((z) => z && z.id).join(",");
			if (sig === ST._lastTzSig) return null;
			ST._lastTzSig = sig;
			return JSON.parse(JSON.stringify(tz));
		} catch (e) { return null; }
	}
	function invForNet(state) {
		try {
			const inv = state.store.player && state.store.player.inventory;
			if (!Array.isArray(inv)) return null;
			const sig = inv.map((i) => i && i.id).join(",");
			if (sig === ST._lastInvSig) return null;
			ST._lastInvSig = sig;
			return JSON.parse(JSON.stringify(inv));
		} catch (e) { return null; }
	}
	function techFlagsForNet(state) {
		const t = state.store.player && state.store.player.tech;
		if (!t) return null;
		if (!Object.prototype.hasOwnProperty.call(t, "undefined")) return t;
		const out = Object.assign({}, t); delete out.undefined; return out;
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
				// AUGMENTY (fix TCentraL: klient uwięziony w ekranie wyboru): świeży lokalny WYBÓR klienta
				// (act:aug w drodze) nie może być nadpisany streamem — okno ochronne 5s; poza nim host rządzi.
				if (ST._augEditT && performance.now() - ST._augEditT < 5000 && prevMods.augments !== undefined) state.store.mods.augments = prevMods.augments;
				try { ST._augLast = JSON.stringify(state.store.mods.augments || null); } catch (e) {}
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
			// progresja PRZED tech: bramka wiersza drzewka w unlockTech (factory tier) czyta progression —
			// przy odwrotnej kolejności pierwsza próba odblokowania bywała odrzucana (fix 0.9.72, e2e)
			if (msg.pg && state.store.progression) Object.assign(state.store.progression, msg.pg);
			// tech od hosta TYLKO gdy klient jest w swiecie z dzialajacym lustrem (0.9.72): w menu/loadzie
			// unlockTech gry odmawia (tutorial/scena), a po reloadzie i tak wszystko przepada -> burza odmow w logu
			// STREFY TELEPORTACJI (0.9.140): klient renderuje swiat hosta, wiec i przejscia musza byc hosta.
			if (msg.tz && ST.net.role === "client" && ST.wsx.everApplied && !ST._loadingWorld && state.store.world) {
				try {
					const przed = (state.store.world.teleportZones || []).length;
					state.store.world.teleportZones = msg.tz;
					const cache = state.session && state.session.teleportZoneCache;
					if (cache) {
						try { if (typeof cache.clear === "function") cache.clear(); } catch (e) {}
						if (typeof cache.set === "function") for (const z of msg.tz) {
							if (!z || !Number.isFinite(z.entryX)) continue;
							for (let x = z.entryX; x < z.entryX + (z.entryWidth | 0); x++)
								for (let y = z.entryY; y < z.entryY + (z.entryHeight | 0); y++) { try { cache.set(x, y, z); } catch (e) {} }
						}
					}
					if (przed !== msg.tz.length) log("STREFY: mialem", przed, "-> od hosta", msg.tz.length, "(przejscia zgodne z jego swiatem)");
				} catch (e) { log("sync stref teleportacji blad:", e.message); }
			}
			// POSTEP OD HOSTA (0.9.134): odblokowane budynki i przedmioty naleza do sesji, nie do lokalnego
			// zapisu klienta. Scalanie listy budynkow — pomysl Cr0ss0vr (PR #13).
			if ((msg.bl || msg.iv) && ST.wsx.everApplied && !ST._loadingWorld && state.store.scene && state.store.scene.active !== 1 && state.store.player) {
				try {
					const pl = state.store.player;
					if (msg.bl && Array.isArray(pl.buildings)) {
						let dodane = 0;
						for (const b of msg.bl) if (!pl.buildings.includes(b)) { pl.buildings.push(b); dodane++; }
						if (dodane) log("POSTEP: doszlo", dodane, "odblokowanych budynkow od hosta");
					}
					if (msg.iv && Array.isArray(pl.inventory)) {
						const mam = new Set(pl.inventory.map((i) => i && i.id));
						const uHosta = new Set(msg.iv.map((i) => i && i.id));
						let dodane = 0, usuniete = 0;
						for (const it of msg.iv) {
							if (mam.has(it && it.id)) continue;   // mamy — NIE nadpisujemy (tank chwytaka, amunicja sa lokalne)
							const kopia = JSON.parse(JSON.stringify(it));
							for (const ab of kopia.abilities || []) { if (ab.cooldown) ab.cooldown.last = 0; if (ab.ammo && ab.ammo.reload) ab.ammo.reload.last = 0; }
							if (kopia.data && kopia.data.cooldown) kopia.data.cooldown.last = 0;
							pl.inventory.push(kopia); dodane++;
						}
						for (let i = pl.inventory.length - 1; i >= 0; i--) {
							const it = pl.inventory[i];
							if (it && !uHosta.has(it.id)) { pl.inventory.splice(i, 1); usuniete++; }
						}
						if (dodane || usuniete) log("POSTEP: przedmioty wyrownane do hosta — dodane", dodane, "usuniete", usuniete);
					}
				} catch (e) { log("sync postepu blad:", e.message); }
			}
			if (msg.th && ST.wsx.everApplied && !ST._loadingWorld && state.store.scene && state.store.scene.active !== 1 && state.store.player && state.store.player.tech) {
				// KOLEJNOŚĆ ZALEŻNOŚCI (0.9.89): drzewko ma wymagania wstępne, a klucze obiektu przychodzą
				// w dowolnej kolejności — próba "dziecka" przed "rodzicem" jest odrzucana przez grę.
				// Powtarzamy przebieg, dopóki cokolwiek się odblokowuje (punkt stały, max 6 rund).
				let todo = Object.keys(msg.th).filter((k) => k !== "undefined" && msg.th[k] && !state.store.player.tech[k]);
				for (let round = 0; round < 6 && todo.length; round++) {
					const stillTodo = [];
					let progress = false;
					for (const k of todo) {
						if (state.store.player.tech[k]) continue;
						if (round === 0 && techRefusedRecently(k)) { stillTodo.push(k); continue; }
						ST._applyingNet = true;
						try {
							const realU = techUnlock(state, k, "free");
							if (realU === true) { state.store.player.tech[k] = true; progress = true; log("SYNC: tech od drużyny odblokowany:", k, "(REAL)"); }
							else if (realU === null) { state.store.player.tech[k] = true; progress = true; try { ST.FH.events.emit(state, "tech:unlocked", { techId: k, suppressMusic: true }); } catch (e) {} log("SYNC: tech od drużyny:", k, "(FALLBACK flaga — patch _techMod nie pasuje do tego builda gry!)"); }
							else stillTodo.push(k);
						} finally { ST._applyingNet = false; }
					}
					todo = stillTodo;
					if (!progress) break; // nic nie ruszyło — dalsze rundy nic nie dadzą, spróbujemy za 3 s
				}
				if (todo.length && !ST._techPendLogged) { ST._techPendLogged = true; log("SYNC: " + todo.length + " tech od drużyny czeka na wymagania (" + todo.join(",") + ") — ponowię"); }
			}
			// auto-naprawa (0.9.71) tylko gdy klient JEST w swiecie z dzialajacym lustrem (nie w menu / nie w trakcie loadu)
			if (ST.wsx.everApplied && !ST._loadingWorld && performance.now() - (ST._techRepairT || 0) > 20000) { ST._techRepairT = performance.now(); techRepair(state, "client"); }
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
			// POTRZĄSANIE (0.9.128): w grze stoi PRZED zbieraniem i ma pierwszeństwo — to nim zamienia się
			// mokry piasek w złoto (w tanku, lokalnie) i wyrzuca odpad do świata (forward przez _shakeRes).
			// Przechwytywanie go przez nas oznaczało, że u klienta potrząsanie nic nie dawało.
			try {
				const mouse = state.session && state.session.input && state.session.input.mouse;
				if (mouse && mouse.shaken) {
					let on = true;
					try { const st = ST.FH && ST.FH.storage && ST.FH.storage.ensure ? ST.FH.storage.ensure(state, "grabberSizeScroll") : null; if (st && st.shakingEnabled === false) on = false; } catch (e) {}
					if (on) return false; // oddaj sterowanie grze — ona zrobi to poprawnie
				}
			} catch (e) {}
			if (!B) return false;
			// 0.9.121: zawartość tanku NIE kończy zbierania. W grze liczy się TYLKO trzymanie przycisku
			// (action.state[Active]) — dosypujemy do wolnych slotów aż do pełna. Wcześniejszy skrót
			// "tank niepusty = tryb odkładania" zatrzymywał klienta po pierwszym złapanym elemencie.
			const size = tankSize(tool, B);              // ILE slotow jest aktywnych (ustawienie gracza)
			const tankCount = syncTankHeader(B, size);   // naglowek zgodny z gra (jak z() + kontrola w H())
			const tankFull = tankCount >= size;
			if (tankFull) return false; // pełny tank → nic nie zbierzemy, oddaj sterowanie grze (odkładanie)
			// KLUCZ: zbieraj TYLKO gdy gracz aktywnie grabuje (trzyma przycisk) → action.state[qy.Active=2].
			// Bez tego forwardowaliśmy w kółko i grabber "brał" bez klikania (element od razu spadał). (fix user)
			const ast = state.session && state.session.action && state.session.action.state;
			if (!ast || !ast[2]) return false; // brak akcji → pozwól z() zrobić hover (bez pobierania)
			const now = performance.now();
			// jedna prosba naraz: dopoki host nie odpowie, nasza mapa wolnych slotow jest nieaktualna,
			// a host zbieralby w sloty, ktore juz sa zajete — i material by przepadal.
			if (ST._grabInFlight && now - (ST._grabInFlightT || 0) < 500) return true;
			if (now - (ST._lastGrabH || 0) > 33) { // gra zbiera co klatke — 10 impulsow/s bylo za wolno przy przeciaganiu
				ST._lastGrabH = now;
				const m = state.session && state.session.input && state.session.input.mouse;
				const cp = m && m.cellPosition;
				if (cp && cp.x >= 0 && cp.y >= 0) {
					// policz WOLNE sloty tanku i wyślij hostowi — host zbierze najwyżej tyle
					// (bez tego host niszczył do 48 elementów, a nadmiar ponad pojemność tanku PRZEPADAŁ)
					let free = 0;
					const slots = size; // tylko aktywne sloty — reszta tablicy to alokacja, gra jej nie widzi
					const mask = new Uint8Array((slots + 7) >> 3);
					for (let i = 0; i < slots; i++) if (B[i + 2] === 0) { free++; mask[i >> 3] |= 1 << (i & 7); }
					if (free > 0) {
						ST._grabTool = tool; // zapamiętaj do wypełnienia tanku po odpowiedzi hosta
						try { net.send({ t: "act", k: "grabH", x: cp.x | 0, y: cp.y | 0, f: free, lt: B[0] || 0, n: Math.round(Math.sqrt(slots)), fm: b64enc(mask) }); ST._grabInFlight = true; ST._grabInFlightT = now; if (ST._grabStat) ST._grabStat.prosby++; else ST._grabStat = { przyslane: 0, wTanku: 0, oddane: 0, przepadle: 0, prosby: 1 }; } catch (e) {} // n = bok siatki tanku, fm = mapa wolnych slotow
						if ((ST._grabHDiag = (ST._grabHDiag || 0) + 1) <= 40) log("CLIENT grabH forward @", cp.x | 0, cp.y | 0, "free=" + free, "lock=" + (B[0] || 0));
					}
				}
			}
			return true; // pomiń lokalne zbieranie (host zrobi to autorytatywnie)
		} catch (e) { return false; }
	};
	// HOST: zbierz grabbable elementy w promieniu wokół (x,y), usuń, odeślij typy klientowi (jak vacuum).
	// Czastka scalona: elementType mowi tylko "to czastka", material jest pod linkedElementIndex.
	// Bez tego tank klienta dostawal typ techniczny zamiast np. zlota (user: "nie merguje sie poprawnie").
	function resolveGrabType(state, info) {
		let ty = info && info.elementType ? info.elementType | 0 : 0;
		try {
			if (info && info.isParticle && typeof info.elementIndex === "number") {
				const ed = state.shared.sim.elementData;
				const li = ed && ed.linkedElementIndex ? ed.linkedElementIndex[info.elementIndex] : -1;
				if (li >= 0 && ed && ed.type) { const rt = ed.type[li] | 0; if (rt > 0) ty = rt; }
			}
		} catch (e) {}
		return ty;
	}
	function hostHarvestGrab(msg, fromId) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		// rate-limit per gracz (klient sam ogranicza do 100ms, ale host nie może ufać klientowi)
		if (!ST._grabHLast) ST._grabHLast = new Map();
		const tNow = performance.now();
		if (tNow - (ST._grabHLast.get(fromId) || 0) < 25) return; // jak w grze: co klatke, nie co 80 ms
		ST._grabHLast.set(fromId, tNow);
		const el = ST.FH.elements || {};
		const getInfo = el.getInfoAtPos;
		const removeAt = el.removeAt;
		if (!getInfo || !removeAt) { if (!ST._grabApiWarned) { ST._grabApiWarned = true; log("BŁĄD grabH: brak getInfoAtPos/removeAt — el:", Object.keys(el).join(",")); } return; }
		const types = [], offs = [], sl = [];
		// Siatka tanku klienta: bok n, srodek mid. Element z pozycji (kol,wier) moze trafic WYLACZNIE
		// do slotu o tym samym numerze — dokladnie jak w grze. Bez mapy wolnych slotow (stary klient)
		// zostaje dawne zachowanie: promien 4 i ostrozny limit.
		const gridN = typeof msg.n === "number" && msg.n > 0 ? msg.n | 0 : 0;
		let freeMask = null;
		if (gridN && msg.fm) { try { freeMask = b64dec(msg.fm); } catch (e) { freeMask = null; } }
		const cap = Math.max(1, Math.min(gridN ? gridN * gridN : 48, typeof msg.f === "number" ? msg.f : 8));
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
		let taken = 0;
		if (freeMask) {
			// kolejnosc od kursora na zewnatrz — gdy tank zapelni sie w trakcie, zostaje to, co najblizej
			const mid = gridN >> 1;
			if (!ST._grabOrder || ST._grabOrderN !== gridN) {
				const ord = [];
				for (let row = 0; row < gridN; row++) for (let col = 0; col < gridN; col++) {
					const dx = col - mid, dy = row - mid;
					ord.push([dx * dx + dy * dy, col, row]);
				}
				ord.sort((p, q) => p[0] - q[0]);
				ST._grabOrder = ord; ST._grabOrderN = gridN;
			}
			for (const it of ST._grabOrder) {
				if (taken >= cap) break;
				const col = it[1], row = it[2], idx = col + row * gridN;
				if (!(freeMask[idx >> 3] & (1 << (idx & 7)))) continue; // slot zajety — gra tez by tu nie wziela
				const x = msg.x + col - mid, y = msg.y + row - mid;
				try {
					const info = getInfo(state, x, y);
					if (!info || !info.elementType) continue;
					if (info.isGrabbable === false) continue;
					const ety = resolveGrabType(state, info); // czastka scalona -> prawdziwy material
					if (!ety) continue;
					const cfg = el.getConfig ? el.getConfig(ety) : null;
					if (cfg && cfg.isGrabbable === false) continue;
					if (ST._mtLiquid !== null && cfg && cfg.matterType === ST._mtLiquid && !canLiquid) { gateSkipped++; continue; }
					if (lockType && ety !== lockType) continue; // tank przyjmuje jeden typ — porownujemy typ ROZWIAZANY
					if (!lockType) lockType = ety;
					removeAt(state, x, y);
					markCellDirty(state, x, y);
					types.push(ety);
					offs.push(col - mid, row - mid);
					sl.push(idx);
					taken++;
				} catch (e) {}
			}
		} else {
		const R = 4;
		for (let dy = -R; dy <= R && taken < cap; dy++)
			for (let dx = -R; dx <= R && taken < cap; dx++) {
				const x = msg.x + dx, y = msg.y + dy;
				try {
					const info = getInfo(state, x, y);
					if (!info || !info.elementType) continue;
					if (info.isGrabbable === false) continue; // szanuj flagę gdy jest; gdy brak — bierz (klient celował)
					const ety = resolveGrabType(state, info); // czastka scalona -> prawdziwy material
					if (!ety) continue;
					const cfg = el.getConfig ? el.getConfig(ety) : null;
					if (cfg && cfg.isGrabbable === false) continue;
					if (ST._mtLiquid !== null && cfg && cfg.matterType === ST._mtLiquid && !canLiquid) { gateSkipped++; continue; } // płyn bez badania waterGrab
					if (lockType && ety !== lockType) continue; // tank przyjmuje tylko JEDEN typ (jak vanilla)
					if (!lockType) lockType = ety;
					removeAt(state, x, y);
					markCellDirty(state, x, y);
					types.push(ety);
					offs.push(dx, dy); // pozycja wzgl. kursora → klient mapuje na właściwy slot siatki tanku
					taken++;
				} catch (e) {}
			}
		}
		if (types.length) { net.send({ t: "grabres", types, offs, sl, bx: msg.x, by: msg.y }, fromId); if ((ST._grabHostDiag = (ST._grabHostDiag || 0) + 1) <= 40) log("HOST grabH @", msg.x, msg.y, "→ zebrano", types.length, "elementów" + (gateSkipped ? " (pominięto " + gateSkipped + " płynów — brak waterGrab)" : "")); }
		else if (gateSkipped && (ST._grabGateDiag = (ST._grabGateDiag || 0) + 1) <= 10) log("HOST grabH: 0 zebranych,", gateSkipped, "płynów zablokowanych (brak badania waterGrab)");
	}
	// KLIENT: wypełnij tank grabbera (matrix) typami zebranymi przez hosta. B[0]=locked type, B[1]=count, B[2..]=sloty.
	// Niezmiennik tanku wg gry: T[1] = liczba pelnych slotow, T[0] = typ blokady (0 gdy pusto).
	// Przeliczamy zamiast zliczac przyrostowo — przyrostowy licznik rozjezdzal sie z gra i chwytak
	// wygladal na pusty mimo pelnych slotow.
	// AKTYWNE sloty tanku = tool.data.size (macierz bywa wieksza — alokacja na maksymalne ulepszenie).
	function tankSize(tool, B) {
		const d = tool && tool.data;
		const n = d && typeof d.size === "number" && d.size > 0 ? d.size | 0 : 0;
		return n && n <= B.length - 2 ? n : B.length - 2;
	}
	// Typy terenu, ktore powstaja WYLACZNIE pod strukturami — tylko takie wolno sprzatac.
	const TEREN_STRUKTUR = new Set([15, 16, 17, 18, 19, 20, 21, 22, 24, 26]);
	function syncTankHeader(B, size) {
		const act = size && size > 0 ? size : B.length - 2;
		let n = 0, first = 0;
		for (let i = 2; i < act + 2; i++) if (B[i] !== 0) { n++; if (!first) first = B[i]; }
		// poza aktywnym oknem gra niczego nie widzi — nie zostawiamy tam zawartosci (inaczej "wraca"
		// po powiekszeniu siatki albo wisi jako niewidzialny material).
		for (let i = act + 2; i < B.length; i++) if (B[i] !== 0) { B[i] = 0; ST._tankTrim = (ST._tankTrim || 0) + 1; }
		B[1] = n;
		if (n === 0) B[0] = 0;
		else if (!B[0]) B[0] = first;
		return n;
	}
	function clientFillGrabTank(types, offs, slotIdx, bx, by) {
		const tool = ST._grabTool;
		const B = tool && tool.data && tool.data.matrix;
		if (!ST._grabStat) ST._grabStat = { przyslane: 0, wTanku: 0, oddane: 0, przepadle: 0, prosby: 0 };
		const size = B ? tankSize(tool, B) : 0;
		ST._grabStat.przyslane += types ? types.length : 0;
		if (!B || !types || !types.length) return;
		// SLOT WG POZYCJI (fix TCentraL: itemy lądowały w lewym-górnym rogu pickera): siatka tanku jest
		// przestrzenna — slot odpowiada pozycji komórki względem kursora (vanilla: A = w + t*v). Host
		// przysyła offsety (dx,dy); slot = (dx+mid) + (dy+mid)*v. Zajęty/poza siatką → pierwszy wolny.
		const v = Math.max(1, Math.round(Math.sqrt(size)));
		const mid = v >> 1;
		let filledAny = false;
		for (let ti2 = 0; ti2 < types.length; ti2++) {
			const ty = types[ti2];
			let filled = false;
			// host przyslal numer slotu wyliczony na tej samej siatce — kladziemy dokladnie tam
			if (slotIdx && slotIdx.length > ti2) {
				const idx = 2 + (slotIdx[ti2] | 0);
				if (idx >= 2 && idx < size + 2 && B[idx] === 0) { B[idx] = ty; filled = true; filledAny = true; }
			}
			if (!filled && offs && offs.length >= (ti2 + 1) * 2) {
				const col = offs[ti2 * 2] + mid, row = offs[ti2 * 2 + 1] + mid;
				if (col >= 0 && col < v && row >= 0 && row < v) {
					const idx = 2 + col + row * v;
					if (idx < B.length && B[idx] === 0) { B[idx] = ty; filled = true; filledAny = true; ST._grabStat.wTanku++; }
				}
			}
			if (!filled) for (let i = 2; i < size + 2; i++) { if (B[i] === 0) { B[i] = ty; filled = true; filledAny = true; ST._grabStat.wTanku++; break; } }
			if (!filled) {
				// tank pelny albo slot zajety — element JUZ zostal usuniety u hosta, wiec musi wrocic na mape,
				// inaczej material po prostu znika (zgloszenie usera).
				let back = false;
				if (typeof bx === "number" && typeof by === "number" && offs && offs.length >= (ti2 + 1) * 2) {
					try { net.send({ t: "act", k: "grabPlace", x: bx + offs[ti2 * 2], y: by + offs[ti2 * 2 + 1], et: ty }); back = true; ST._grabStat.oddane++; } catch (e) {}
				}
				if (!back) ST._grabStat.przepadle++;
				if ((ST._grabBackDiag = (ST._grabBackDiag || 0) + 1) <= 20) log("GRAB: brak miejsca w tanku dla typu", ty, back ? "— oddaje na mape" : "— BRAK pozycji, sztuka przepadla");
			}
		}
		const tankN = syncTankHeader(B, size); // naglowek zgodny z gra: licznik = faktyczna zawartosc
		if (filledAny) ST._grabStat.wTanku = (ST._grabStat.wTanku || 0) + 0; // (statystyka nizej, po przeliczeniu)
		if (filledAny && (ST._grabFillDiag = (ST._grabFillDiag || 0) + 1) <= 20) log("CLIENT tank grabbera:", types.length, "przyslanych, w tanku teraz " + tankN + " / " + size + " slotow (siatka " + v + "x" + v + ")");
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
					types.push(ety);
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
	// 0.9.142: profil wykopu (fromDrill/fromRocketExplosion/...) decyduje o TIERZE materialu — bez niego host odtwarzal
	// kazde kopanie klienta jak LOPATE, wiec laser/wiertlo/void gun klienta nie ruszaly twardych materialow.
	const DIG_OPT_KEYS = ["fromGun", "fromRocketExplosion", "fromDrill", "useLiteralOutVelocity", "destroyNonDestructible", "forceRemoveAll", "drillTierDamage"];
	function digOptsForNet(opts) {
		if (!opts || typeof opts !== "object") return null;
		let o = null;
		for (const k of DIG_OPT_KEYS) { const v = opts[k]; if (v === true || (k === "drillTierDamage" && typeof v === "number")) { if (!o) o = {}; o[k] = v; } }
		return o;
	}
	ST._dig = (state, x, y, mask, vel, dmg, opts) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/poza lustrem: kop normalnie
		// Pociski są symulowane AUTORYTATYWNIE po stronie hosta (patrz ST._proj) → NIE forwardujemy kopań
		// z kontekstu pocisku (_projCtx), inaczej podwójne dziury (pocisk klienta + pocisk hosta).
		if (ST._projCtx) return true; // pomiń: eksplozję/dziurę zrobi pocisk hosta
		try {
			const m = { t: "act", k: "dig", x, y, m: mask, v: vel, d: dmg };
			const o = digOptsForNet(opts); if (o) m.o = o;
			if (ST._pendEn > 0) { m.en = ST._pendEn; ST._pendEn = 0; } // energia zuzyta przez narzedzie w tej klatce (laser/wiertlo) — host odejmie autorytatywnie
			net.send(m);
			if (!ST._digFwdLogged) { ST._digFwdLogged = true; log("DIG: pierwszy forward do hosta @", x, y, "(host powinien zalogować 'pierwsze kopanie klienta odtworzone')"); }
		} catch (e) {}
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
		if (!ST._projSent || !ST._projSent.set) ST._projSent = new Map(); // 0.9.98: pozycja -> czas (okno 3 s)
		// 0.9.97: ten sam pocisk potrafił lecieć wielokrotnie (log hosta: ta sama pozycja x10) — wysyłamy RAZ.
		try {
			const pk = proj && (proj.id != null ? "id" + proj.id : Math.round(proj.x) + "," + Math.round(proj.y) + "," + (proj.type != null ? proj.type : "?"));
			if (pk) { const nowP = performance.now(); const last = ST._projSent.get ? ST._projSent.get(pk) : 0; if (last && nowP - last < 3000) return; if (!ST._projSent.set) ST._projSent = new Map(); ST._projSent.set(pk, nowP); if (ST._projSent.size > 400) ST._projSent.clear(); }
		} catch (e) {}
		try { net.send({ t: "act", k: "proj", p: proj }); if ((ST._prDiag = (ST._prDiag || 0) + 1) <= 20) log("CLIENT forward proj:", proj && proj.type, "@", proj && Math.round(proj.x), proj && Math.round(proj.y)); } catch (e) {}
	};
	// _setCell (patch B/Gz): KLIENT nigdy nie pisze komórek lokalnie (host-autorytatywnie).
	// - podczas aplikacji struktury z sieci (_applyingNet): pomiń zapis (teren pokaże lustro mapData hosta)
	// - spray gracza (_sprayCtx): wyślij intencję do hosta
	// - w każdym wypadku pomiń lokalny zapis
	ST._setCell = (state, x, y, cellId, opts) => {
		if (!isClientSync()) return false; // host/offline: normalnie
				if (!ST._applyingNet && ST._sprayCtx) {
			// 0.9.100: dla elementu NIE wysyłamy samego cellId (to numer slotu, u hosta znaczy co innego) —
			// dokładamy TYP, żeby host mógł stworzyć własny, żywy element.
			let ty = 0;
			try {
				if (cellId >= ELEMENTS_MIN && cellId <= ELEMENTS_MAX) {
					const ed = state.shared && state.shared.sim && state.shared.sim.elementData;
					if (ed && ed.type) ty = ed.type[cellId - ELEMENTS_MIN] | 0;
				}
			} catch (e) {}
			try { net.send({ t: "act", k: "set", x, y, c: cellId, ty }); } catch (e) {}
		}
		return true; // klient NIGDY nie zapisuje komórek lokalnie
	};
	// _dropLu: przy pauzie klienta kolejka mutacji nigdy nie drenuje — nie pozwól jej rosnąć
	ST._dropLu = () => isClientSync() && ST.wsx.paused;
	// _place (patch bundle, u ŹRÓDŁA akcji stawiania — przed runInterceptorsSafe("building:place")):
	// KLIENT wysyła intencję do hosta i ANULUJE lokalne stawianie (return true → gra robi return null,
	// zero zapisu komórek). Host stawia autorytatywnie w replayAction("place") i odsyła "st add" (lustro).
	// Host/offline: return false → normalne stawianie lokalne. buildOne/SA.build NIE przechodzi przez ten
	// hook (to niżej-poziomowe API), więc aplikacja struktur z sieci i budowanie hosta się nie zapętlają.
	ST._place = (state, structureType, x, y, data, clearance) => {
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
		// 0.9.143: clearance z walidacji klienta (3/4 = nad terenem/do zastapienia → u hosta tez "queued", teren zostaje)
		try {
			const m = { t: "act", k: "place", type: structureType, x, y, data: d };
			if (clearance === 3 || clearance === 4) m.cl = clearance;
			// 0.9.146: FILTR STAWIAJACEGO. Gra nadaje filtr swiezej strukturze w building:placed z
			// e.store.options.defaultFilter — a to odpala sie U HOSTA, wiec klient dostawal konfiguracje
			// hosta niezaleznie od wlasnej (Maelle: "gets placed in the config the host currently has").
			// Copy-paste: rdzen bierze filtr z session.copiedStructure, ktorej host nie ma w swojej sesji.
			// Wysylamy filtr przy KAZDYM stawianiu (host nakłada go tylko na struktury filtrowe — patrz handler).
			try {
				const cd = state.session && state.session.action && state.session.action.customData;
				const cs = cd && cd.copiedStructure;
				if (cs && cs.filter != null) m.fl = JSON.parse(JSON.stringify(cs.filter));
				else if (state.store.options && state.store.options.defaultFilter != null) m.fl = JSON.parse(JSON.stringify(state.store.options.defaultFilter));
			} catch (e) {}
			net.send(m);
		} catch (e) {}
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
				// TRYB RUR (raport TCentraL "removes pipe and blocks"): usuwanie RUR celowo zostawia
				// struktury/bloki w recie — dobijacz brałby je za zacięte niedobitki QUEUED i zdejmował.
				// W trybie rur NIE uzbrajamy dobijacza (rury gra usuwa sama, poprawnie).
				try {
					const sel = ST.FH.action && ST.FH.action.getSelected && ST.FH.action.getSelected(state);
					if (sel && String(sel.id).toLowerCase().indexOf("pipe") >= 0) return false;
				} catch (e) {}
				// Capture each selected structure's real footprint BEFORE the game removes it. The drag
				// rectangle only selects structures; it does not describe their foundation geometry.
				try {
					const SA = structNs();
					const x0 = Math.floor(Math.min(start.x, end.x)), y0 = Math.floor(Math.min(start.y, end.y));
					const x1 = Math.ceil(Math.max(start.x, end.x)), y1 = Math.ceil(Math.max(start.y, end.y));
					const found = new Map(), bounds = [];
					if (SA && (x1 - x0 + 1) * (y1 - y0 + 1) <= 40000) {
						for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
							let st = null; try { st = SA.getAtCell(state, x, y); } catch (e) {}
							if (!st || found.has(structKey(st))) continue;
							found.set(structKey(st), st);
							const b = structureBounds(state, SA, st, x, y); if (b) bounds.push(b);
						}
					}
					// FALLBACK (review PR #11): przeciągnięcie po SAMYCH starych czerwonych kaflach (bez żywej struktury)
					// dawało puste bounds = brak sprzątania. Zachowujemy workflow graczy: pusty rect → czyść osierocone
					// kafle w recie (isOrphanTile per komórkę chroni zdrowe, malowane fundamenty).
					if (!bounds.length && (x1 - x0 + 1) * (y1 - y0 + 1) <= 40000) bounds.push({ x0, y0, x1, y1 });
					armDemolCleanup(bounds);
				} catch (e) { log("demolish bounds error:", e.message); }
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
				if (msg.en > 0) {
					// 0.9.142: energia autorytatywnie u hosta (laser/wiertlo klienta) — brak pradu = brak wykopu
					let got = msg.en;
					try { if (ST.FH.energy && typeof ST.FH.energy.consume === "function") got = ST.FH.energy.consume(state, msg.en, { allOrNothing: true }); } catch (e) { got = msg.en; }
					if (!(got >= msg.en)) { if ((ST._enDenyN = (ST._enDenyN || 0) + 1) <= 5) log("HOST: wykop klienta odrzucony — brak energii (" + msg.en + ")"); return; }
				}
				if (ex) { ex(state, msg.x, msg.y, msg.m, msg.v, msg.d, msg.o || {}); markUrgent(state, msg.x, msg.y, 1); if (!ST._digLogged) { ST._digLogged = true; log("HOST: pierwsze kopanie klienta odtworzone @", msg.x, msg.y); } }
				else if (!ST._digErrLogged) { ST._digErrLogged = true; log("BŁĄD: brak API excavate — FH klucze:", Object.keys(ST.FH || {}).join(",")); }
			} else if (msg.k === "set") {
				const isElem = msg.c >= ELEMENTS_MIN && msg.c <= ELEMENTS_MAX;
				if (isElem) {
					// 0.9.100: NIGDY nie wpisujemy cudzego numeru slotu — tworzymy własny element z typu.
					const ty = msg.ty | 0;
					if (ty > 0) {
						try { if (ST.FH.world.isCellEmpty(state, msg.x, msg.y)) ST.FH.elements.createAt(state, msg.x, msg.y, ty); } catch (e) { log("set(elem) blad:", e.message); } markUrgent(state, msg.x, msg.y, 0);
					} else if ((ST._setNoTy = (ST._setNoTy || 0) + 1) <= 5) log("set: element bez typu (stary klient?) — pomijam, zeby nie tworzyc martwej komorki");
				} else {
					const sc = findApi("setCellId");
					if (sc) { sc(state, msg.x, msg.y, msg.c); markUrgent(state, msg.x, msg.y, 0); }
					else log("BŁĄD: brak API setCellId");
				}
			} else if (msg.k === "place") {
				// klient poprosił o postawienie — host stawia AUTORYTATYWNIE. force=true: ufamy walidacji
				// klienta (kontrola kolizji przeszła u niego), więc pomijamy kontrolę hosta podając
				// clearance=Available (patrz CLEARANCE_AVAILABLE) — inaczej minimalna różnica stanu → build null → "auto-delete".
				if ((ST._plRxDiag = (ST._plRxDiag || 0) + 1) <= 300) log("HOST RX place:", msg.type, "@", msg.x, msg.y, "od", fromId);
				ST._applyingNet = true;
				let built = null;
				try { built = buildOne(state, { type: msg.type, x: msg.x, y: msg.y, data: msg.data || undefined, cl: msg.cl }, true); } finally { ST._applyingNet = false; }
				if (built) {
					// 0.9.146: building:placed odpalilo sie juz U HOSTA i wpisalo hostowy defaultFilter —
					// nadpisujemy konfiguracja STAWIAJACEGO. Tylko struktury filtrowe (built.filter != null;
					// gra sama je znaczy). Typy przepustowe (filter wall, przenosnik przepustowy) maja
					// affectsLiquid/affectsGas WYMUSZONE przez gre — te flagi zachowujemy z wersji hosta.
					if (msg.fl !== undefined && built.filter != null) {
						const forced = built.data && built.data.filterPassThrough ? { affectsLiquid: built.filter.affectsLiquid, affectsGas: built.filter.affectsGas } : null;
						built.filter = Object.assign({}, msg.fl, forced || {});
						if ((ST._flDiag = (ST._flDiag || 0) + 1) <= 40) log("HOST: filtr stawiajacego nalozony @", built.x, built.y);
					}
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
				// Resolve the client's targets on the host and snapshot their true occupied bounds before
				// removeAt destroys the shape information needed to clean orphan foundation terrain.
				const SA = structNs(), actual = [], bounds = [], seen = new Set();
				for (const s of (Array.isArray(msg.list) ? msg.list : [])) {
					if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
					let st = null; try { st = SA && SA.getAtCell(state, s.x, s.y); } catch (e) {}
					if (!st || seen.has(structKey(st))) continue;
					seen.add(structKey(st)); actual.push(slimStruct(st));
					const b = structureBounds(state, SA, st, s.x, s.y); if (b) bounds.push(b);
				}
				log("HOST demolish: prosba o " + ((msg.list||[]).length) + " struktur, znaleziono u siebie " + actual.length + (actual.length ? "" : " — NIC do usuniecia (wspolrzedne nie trafiaja?)"));
				ST._applyingNet = true;
				try { for (const s of actual) removeOne(state, s); } finally { ST._applyingNet = false; }
				if (actual.length) net.send({ t: "st", k: "rm", list: actual });
				armDemolCleanup(bounds);
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
						// PEŁNY unlock "pay": gra sama sprawdza wymagania i AUTORYTATYWNIE odejmuje koszt ze
						// wspólnej puli (bez naszego deductCosts — podwójne pobranie/brak złota = odmowa, fix 0.9.71).
						const real = techUnlock(state, msg.id, "pay");
						if (real === true) {
							state.store.player.tech[msg.id] = true; // unlockTech nie stawia flagi node'a → tech tree pokazywał "niekupione" (Warlow: podwójny zakup)
							log("HOST: tech klienta odblokowany:", msg.id, "(REAL unlockTech, koszt odjęty przez grę)");
						} else if (real === null) {
							deductCosts(state, msg.cost);
							state.store.player.tech[msg.id] = true;
							try { ST.FH.events.emit(state, "tech:unlocked", { techId: msg.id, suppressMusic: true }); } catch (e) {}
							log("HOST: tech klienta:", msg.id, "(FALLBACK flaga — patch _techMod nie pasuje do tego builda gry!)");
						} else {
							// gra odmówiła (wymagania/tutorial/brak surowców): flagi NIE stawiamy (inaczej "zbadane, ale
							// nie da się budować" na zawsze) i odsyłamy klientowi NAK → cofa swoją lokalną flagę i może spróbować znów.
							log("HOST: gra ODMÓWIŁA tech klienta:", msg.id, "→ NAK do", fromId); // fix 0.9.72: było `from` (ReferenceError → NAK nigdy nie wychodził)
							try { net.send({ t: "tech-nak", id: msg.id }, fromId); } catch (e) {}
						}
					} else if (state.store.player && state.store.player.tech && state.store.player.tech[msg.id]) {
						log("HOST: tech klienta już odblokowany (ignoruję):", msg.id);
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
						if (msg.f !== undefined) ex.filter = msg.f; // 0.9.142: filtr klienta
						if (SA3.update) SA3.update(state, ex, { propagateToWorkers: true });
						try { dataSeenSet(structKey(ex), ex); } catch (e) {}
						try { if (ST.peers.size > 1) net.send({ t: "st", k: "add", list: [slimStruct(ex)] }); } catch (e) {} // pozostali klienci od razu
						log("HOST: config maszyny od klienta:", msg.type, "@", msg.x, msg.y, msg.f !== undefined ? "(+filtr)" : "");
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "aug") {
				// wybór augmentu przez klienta: host przejmuje cały obiekt (nodes/pendingChoice/sockety);
				// stream mods rozniesie stan do wszystkich (zamyka overlay także u klienta)
				ST._applyingNet = true;
				try {
					if (msg.a && typeof msg.a === "object") {
						state.store.mods = state.store.mods || {};
						state.store.mods.augments = Object.assign(state.store.mods.augments || {}, msg.a);
						try { ST.FH.ui && ST.FH.ui.overlays && ST.FH.ui.overlays.update && ST.FH.ui.overlays.update(state, "global"); } catch (e) {}
						log("HOST: augmenty klienta zastosowane (wybór z ekranu augmentów)");
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
					((ST._pickMiss=(ST._pickMiss||0)+1)<=5) && log("HOST grabPick @", msg.x, msg.y, "before=" + gbefore, "after=" + gafter, gbefore >= ELEMENTS_MIN && gafter === 0 ? "[OK retiré]" : gafter === gbefore ? "[!! removeAt N'A RIEN retiré]" : "[after=" + gafter + "]");
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
					// REFUND (domknięcie R5): vanilla oddaje element do tanku gdy komórka okazała się zajęta —
					// u klienta refund-callback (Lu) nigdy nie działa, więc host odsyła zwrot jawnie.
					const placed = after >= ELEMENTS_MIN && after <= ELEMENTS_MAX && after !== before;
					if (!placed) try { net.send({ t: "grabRef", et: msg.et }, fromId); } catch (e) {}
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
	// Adres lokalny/VPN vs publiczny — tylko do etykiety transportu w HUD i lobby. Poza RFC1918 lapiemy tez
	// CGNAT 100.64/10 (Tailscale) oraz Hamachi 25/8 i Radmin 26/8, bo to sieci wirtualne, nie internet.
	function isLocalAddr(h) {
		const a = String(h || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
		if (!a || a === "localhost" || a.endsWith(".local") || a === "::1" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
		const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
		if (!m) return false;   // nazwa DNS (np. DuckDNS) = traktujemy jak internet
		const o1 = +m[1], o2 = +m[2];
		return o1 === 10 || o1 === 127 || o1 === 25 || o1 === 26
			|| (o1 === 192 && o2 === 168) || (o1 === 172 && o2 >= 16 && o2 <= 31)
			|| (o1 === 169 && o2 === 254) || (o1 === 100 && o2 >= 64 && o2 <= 127);
	}

	function updatePingDisplay() {
		if (!ST._hud) return;
		const el = ST._hud.querySelector("#st-ping");
		if (!el) return;
		if (!ST.peers.size) { el.textContent = ""; return; }
		const parts = [];
		for (const p of ST.peers.values()) parts.push((p.nick || "Player") + ": " + (p.ping != null ? p.ping + "ms" : "…"));
		el.textContent = "Ping — " + parts.join("  |  ");
		// Relay Valve: gdy obieg pakietu liczy sie w SEKUNDACH, to nie jest "slabe lacze" tylko dlawiony relay —
		// akcje gracza stoja w tej samej kolejce co transfer swiata, wiec nic sie nie dzieje w swiecie.
		try {
			if (ST.net.transport === "steam" && ST.net.role !== "idle") {
				let worst = 0;
				for (const p of ST.peers.values()) if (p.ping != null && p.ping > worst) worst = p.ping;
				if (worst > 5000 && performance.now() - (ST._relayWarnT || 0) > 20000) {
					ST._relayWarnT = performance.now();
					setStatus(t("relay_slow", Math.round(worst / 1000)), "#f66");
					log("RELAY: RTT", Math.round(worst), "ms przez Steam — zalecany Host (Internet — direct)");
				}
			}
		} catch (e) {}
	}

	function buildHud() {
		if (ST._hud) return;
		const hud = document.createElement("div");
		hud.id = "st-hud";
		hud.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;background:rgba(10,10,14,.85);color:#ddd;font:12px monospace;padding:8px 10px;border:1px solid #444;border-radius:6px;user-select:none;min-width:210px";
		hud.innerHTML =
			'<div id="st-head" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
			'<span id="st-title-full" style="font-weight:bold;color:#ffb454">SandTogether <span style="color:#666">' + VER + '</span> <span style="color:#555;font-size:9px">' + t("by") + "</span></span>" +
			// zwinięty panel = mała pigułka "ST ●" z kropką w kolorze stanu (feedback TCentraL: "wish I could hide it")
			'<span id="st-title-mini" style="display:none;font-weight:bold;color:#ffb454">ST <span id="st-mini-dot" style="color:#f66">●</span></span>' +
			'<span id="st-collapse" style="color:#888;font-size:14px;line-height:1">▾</span>' +
			"</div>" +
			'<div id="st-body">' +
			// BADGE ROLI: zawsze widoczne, kolorowe "czy hostuję / czy jestem połączony" (feedback usera:
			// "nie pisze tam czy hostuje gre czy nie")
			'<div id="st-badge" style="margin:4px 0 2px;font-weight:bold;font-size:12px;color:#f66">' + t("badge_offline") + "</div>" +
			'<div id="st-status" style="margin:2px 0;color:#aaa">' + t("offline") + "</div>" +
			'<div id="st-sync" style="margin:2px 0;color:#7af;font-size:10px"></div>' +
			'<div id="st-ping" style="margin:2px 0;color:#fc7;font-size:10px"></div>' +
			'<div id="st-lobbyid" style="margin:2px 0;color:#9f9;font-size:10px;display:none"></div>' +
			// LISTA GRACZY: kto jest w sesji (nick + zgodność wersji moda)
			'<div id="st-players" style="margin:3px 0;display:none;font-size:11px;line-height:1.5"></div>' +
			// przyciski KONTEKSTOWE — updatePanel() pokazuje tylko sensowne dla aktualnej roli
			'<div id="st-buttons" style="display:flex;flex-wrap:wrap;gap:1px">' +
			'<button id="st-host">' + t("btn_host") + "</button>" +
			'<button id="st-invite" style="display:none">' + t("btn_invite") + "</button>" +
			'<button id="st-host-lan">' + t("btn_host_lan") + "</button>" +
			'<button id="st-join-lan">' + t("btn_join_lan") + "</button>" +
			'<button id="st-stop">' + t("btn_stop") + "</button>" +
			'<button id="st-send-world">' + t("btn_send_world") + "</button>" +
			'<button id="st-resync">' + t("btn_resync") + "</button>" +
			'<button id="st-join-id">' + t("btn_join_id") + "</button>" +
			// Wiersz z polem IP dla Join LAN — Electron/Chromium NIE obsługuje window.prompt(),
			// więc adres wpisuje się tu, w panelu (nie przez dialog przeglądarki).
			// osobne pola IP i PORT (QoL — TCentraL)
			'<div id="st-lan-row" style="display:none;margin-top:4px">' +
			'<input id="st-lan-addr" placeholder="IP" value="127.0.0.1" spellcheck="false" ' +
			'style="width:104px;background:#111;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;padding:2px 4px">' +
			'<input id="st-lan-port" placeholder="port" value="27777" spellcheck="false" maxlength="5" ' +
			'style="width:44px;margin-left:2px;background:#111;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;padding:2px 4px"> ' +
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
		updatePanel(); setInterval(updatePanel, 1000); // badge/przyciski/gracze zawsze aktualne
		// STRAŻNIK ROLI (0.9.91): renderer bierze rolę ze zdarzeń, więc zgubione/spóźnione zdarzenie
		// (przeładowanie strony, wyścig przy ponownym łączeniu) potrafi zostawić grę w przekonaniu,
		// że jest hostem, choć sieć wie, że jest klientem. Skutek: bramka wyrzuca KAŻDĄ akcję gracza
		// po cichu (grabber nie podnosi, nie da się budować). Prawdą jest proces sieciowy — pytamy go.
		setInterval(() => {
			try {
				net.status().then((st) => {
					if (!st || !st.role || st.role === ST.net.role) return;
					log("KOREKTA ROLI: gra miała \"" + ST.net.role + "\", sieć ma \"" + st.role + "\" — poprawiam");
					ST.net.role = st.role; ST.net.transport = st.transport || ST.net.transport;
					if (st.role !== "client") { ST.wsx.everApplied = false; setClientPaused(false); }
					updatePanel(); if (ST._lobbyOpen) renderLobby(true);
				}).catch(() => {});
			} catch (e) {}
		}, 3000);
		hud.querySelector("#st-host").onclick = async () => { setStatus(t("creating_lobby")); const r = await net.hostSteam(); if (!r.ok) setStatus(t("error", r.error), "#f66"); };
		hud.querySelector("#st-invite").onclick = () => net.invite();
		hud.querySelector("#st-host-lan").onclick = async () => { const r = await net.hostWs(27777); if (!r.ok) setStatus(t("error", r.error), "#f66"); };
		// Join LAN: osobne pola IP i PORT (QoL — TCentraL); window.prompt nie działa w Electronie
		const lanRow = hud.querySelector("#st-lan-row");
		const lanInput = hud.querySelector("#st-lan-addr");
		const lanPort = hud.querySelector("#st-lan-port");
		async function doJoinLan() {
			let h = (lanInput.value || "").trim();
			let p = (lanPort.value || "").trim();
			// wygoda: wklejenie "ip:port" w pole IP rozdziela się samo
			if (h.indexOf(":") >= 0) { const parts = h.split(":"); h = parts[0]; if (parts[1]) { p = parts[1]; lanPort.value = p; } lanInput.value = h; }
			if (!h) { lanInput.focus(); return; }
			const port = parseInt(p || "27777", 10);
			if (!(port > 0 && port < 65536)) { setStatus(t("error", "port?"), "#f66"); lanPort.focus(); lanPort.select(); return; }
			setStatus(t("creating_lobby"));
			const r = await net.joinWs(h, port);
			if (!r.ok) setStatus(t("error", r.error), "#f66");
			else { lanRow.style.display = "none"; lanInput.blur(); lanPort.blur(); } // oddaj klawiaturę grze
		}
		// Klawisze wpisywane w pola nie mogą docierać do gry (keyup w grze NIE filtruje INPUT-ów;
		// bąbelkują do window — stopPropagation na inputach ucina całą klasę problemu)
		for (const el2 of [lanInput, lanPort]) {
			el2.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); doJoinLan(); } });
			el2.addEventListener("keyup", (e) => e.stopPropagation());
		}
		hud.querySelector("#st-join-lan").onclick = () => {
			const showing = lanRow.style.display !== "none";
			if (!showing) { lanRow.style.display = "block"; lanInput.focus(); lanInput.select(); }
			else doJoinLan(); // drugie kliknięcie = połącz z wpisanym adresem
		};
		hud.querySelector("#st-lan-go").onclick = doJoinLan;
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
		const setCollapsed = (c) => {
			collapsed = c; body.style.display = c ? "none" : "block"; arrow.textContent = c ? "▸" : "▾";
			// mini-pigułka: zwinięty panel zajmuje ~40px zamiast pełnej szerokości nagłówka
			const full = hud.querySelector("#st-title-full"), mini = hud.querySelector("#st-title-mini");
			if (full) full.style.display = c ? "none" : "";
			if (mini) mini.style.display = c ? "" : "none";
			hud.style.minWidth = c ? "0" : "210px";
			hud.style.padding = c ? "3px 8px" : "8px 10px";
		};
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
			// HOST W MENU (raport TCentraL: Steam-join zanim host wczytał mapę → klient ładował
			// spekulacyjny "ostatni save" w kółko): świat wysyłamy dopiero gdy host FAKTYCZNIE w nim jest —
			// auto-send strzeli sam przy wejściu. Klient dostaje world-wait zamiast palić limit world-req.
			// NIE zaczynaj nowego transferu, póki poprzedni jeszcze pompuje — przeplot paczek dwóch
			// transferów = zepsuty save u klienta (fix derErste67)
			if (ST._wtx && ST._wtx.queue && ST._wtx.queue.length) {
				log("sendWorld POMINIĘTY — poprzedni transfer w toku (" + ST._wtx.queue.length + " paczek w kolejce)");
				return;
			}
			const hostScene = ST.state && ST.state.store && ST.state.store.scene && ST.state.store.scene.active;
			if (hostScene === 1) {
				setStatus(t("host_enter_world_first"), "#fd5");
				log("sendWorld wstrzymany — host w menu; wysyłam world-wait");
				try { net.send({ t: "world-wait" }); } catch (e) {}
				return;
			}
			const saves = await window.electron.getSaveFiles();
			if (!saves || !saves.length) { setStatus(t("no_saves"), "#f66"); return; }
			const ts = (s) => s.timestamp || s.updatedAt || s.savedAt || s.time || s.date || 0;
			saves.sort((a, b) => (ts(a) > ts(b) ? 1 : -1));
			const save = saves[saves.length - 1];
			setStatus(t("exporting", save.name || save.id), "#ff5");
			const t0 = performance.now();
			const res = await window.electron.exportSave(save.id);
			if (!res || !res.success) { setStatus(t("export_err", res && res.error), "#f66"); log("sendWorld: exportSave FAILED:", res && res.error); return; }
			log("sendWorld: eksport", save.name || save.id, "w", Math.round(performance.now() - t0), "ms");
			const bytes = new Uint8Array(res.data.data || res.data);
			const b64 = b64enc(bytes);
			const CH = 49152; // 48 KB/paczkę — bezpiecznie pod limitami Steam P2P
			const total = Math.ceil(b64.length / CH);
			const parts = new Array(total);
			for (let i = 0; i < total; i++) parts[i] = b64.substr(i * CH, CH);
			// kolejka do wysyłki z rozłożeniem w czasie (nie blast) + zapamiętane do ponowienia.
			// tid = identyfikator transferu (fix derErste67 "żółte pół świata"): paczki DWÓCH transferów
			// przeplatały się w jednym odbiorze → klient sklejał save z dwóch wersji świata (autosave
			// hosta między wysyłkami!) i wczytywał ZEPSUTY świat. Teraz klient przyjmuje tylko paczki
			// bieżącego tid, a host nie zaczyna nowego transferu póki trwa poprzedni (guard wyżej).
			ST._wtxSeq = (ST._wtxSeq || 0) + 1;
			ST._wtx = { tid: ST._wtxSeq, name: save.name || save.id, parts, total, queue: [], sent: 0, sizeKB: Math.round(bytes.length / 1024) };
			for (let i = 0; i < total; i++) ST._wtx.queue.push(i);
			net.send({ t: "world-begin", tid: ST._wtx.tid, name: ST._wtx.name, size: bytes.length, chunks: total });
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
				net.send({ t: "world-chunk", tid: w.tid, i, data: w.parts[i] });
				w.sent++; n++;
			}
			if (w.queue.length) { ST._wtxTimer = setTimeout(step, 25); } // ~160 paczek/s = ~7.5 MB/s
			else { net.send({ t: "world-end", tid: w.tid }); ST._wtxTimer = null; }
		};
		ST._wtxTimer = setTimeout(step, 0);
	}

	// ------------------------------------------------------------------
	// Panel: badge roli + kontekstowe przyciski + lista graczy.
	// Stan sesji musi być widoczny NA OKO (feedback usera: "overlay nie pokazuje
	// żadnych informacji, nie pisze czy hostuję").
	// ------------------------------------------------------------------
	function updatePanel() {
		const hud = document.getElementById("st-hud"); if (!hud) return;
		const q = (id) => hud.querySelector(id);
		const role = ST.net.role;
		const trName = ST.net.transport === "steam" ? "Steam" : (ST._directMode ? "Internet" : "LAN");
		const badge = q("#st-badge");
		const roleColor = role === "host" ? "#5f5" : role === "client" ? "#6cf" : "#f66";
		if (badge) {
			if (role === "host") { badge.textContent = t("badge_host", trName); badge.style.color = roleColor; }
			else if (role === "client") { badge.textContent = t("badge_client", trName); badge.style.color = roleColor; }
			else { badge.textContent = t("badge_offline"); badge.style.color = roleColor; }
		}
		const miniDot = q("#st-mini-dot");
		if (miniDot) miniDot.style.color = roleColor; // kropka stanu też na zwiniętej mini-pigułce
		const show = (id, on) => { const el = q(id); if (el) el.style.display = on ? "" : "none"; };
		show("#st-host", role === "idle");
		show("#st-host-lan", role === "idle");
		show("#st-join-lan", role === "idle");
		show("#st-join-id", role === "idle");
		show("#st-invite", role === "host" && ST.net.transport === "steam");
		show("#st-send-world", role === "host");
		show("#st-resync", role === "client");
		show("#st-stop", role !== "idle");
		if (role !== "idle") show("#st-lan-row", false);
		const pl = q("#st-players");
		if (pl) {
			if (role === "idle") { pl.style.display = "none"; pl.innerHTML = ""; }
			else {
				pl.style.display = "";
				pl.innerHTML = "";
				const mk = (dotColor, nick, info) => {
					const r = document.createElement("div");
					const d = document.createElement("span"); d.textContent = "● "; d.style.color = dotColor;
					const n = document.createElement("span"); n.textContent = nick; n.style.color = "#fff";
					const i = document.createElement("span"); i.textContent = info ? "  " + info : ""; i.style.color = "#889";
					r.appendChild(d); r.appendChild(n); r.appendChild(i);
					pl.appendChild(r);
				};
				mk("#5f5", ST._myNick || "Player", "(" + t("lb_you") + (role === "host" ? " · host)" : ")"));
				for (const [, pr] of ST.peers) {
					const ok = !pr.modVer || pr.modVer === VER;
					mk(ok ? "#5f5" : "#f66", pr.nick || "?", ok ? "" : pr.modVer);
				}
			}
		}
	}

	// ------------------------------------------------------------------
	// Menu główne: przycisk MULTIPLAYER + pełnoekranowe lobby.
	// Menu gry to React+Tailwind w DOM — NIE dotykamy jego drzewa (React by nas
	// wyrzucił przy re-renderze); nasz przycisk to osobny fixed element
	// pozycjonowany po getBoundingClientRect prawdziwych przycisków.
	// ------------------------------------------------------------------
	// teksty w wielu językach gry (PL/EN/DE/FR/ES) — kotwica pozycji przycisku Multiplayer
	const MENU_LEAF_TEXTS = ["kontynuuj", "continue", "weiter", "continuer", "continuar", "nowa", "new game", "neu", "wczytaj", "load game", "laden", "charger", "cargar", "opcje", "options", "optionen", "opciones", "wyjdź", "exit", "quit", "beenden", "quitter", "salir"];
	const MENU_ANCHOR_TEXTS = ["mody", "mods", "mapy", "maps", "karten", "cartes", "mapas"];

	function findMenuLeaf(texts) {
		const all = document.body.querySelectorAll("div,button,span,a,p");
		for (const el of all) {
			if (el.id && el.id.indexOf("st-") === 0) continue;
			if (el.closest && (el.closest("#st-hud") || el.closest("#st-lobby"))) continue;
			if (el.childElementCount > 0) continue;
			const txt = (el.textContent || "").trim().toLowerCase();
			if (txt && txt.length <= 14 && texts.indexOf(txt) >= 0) return el;
		}
		return null;
	}

	function ensureMenuUi(state) {
		const now = performance.now();
		if (now - (ST._menuUiT || 0) < 500) return;
		ST._menuUiT = now;
		const inMenu = state.store && state.store.scene && state.store.scene.active === 1;
		let btn = document.getElementById("st-mp-btn");
		if (!inMenu) {
			if (btn) btn.style.display = "none";
			if (ST._lobbyOpen) closeLobby();
			return;
		}
		let anchor = findMenuLeaf(MENU_ANCHOR_TEXTS) || findMenuLeaf(MENU_LEAF_TEXTS);
		// element znaleziony, ale niewidoczny/zerowy (podekran renderuje co innego) = brak kotwicy
		if (anchor) {
			const ar = (anchor.closest("button") || anchor.parentElement || anchor).getBoundingClientRect();
			if (ar.width < 5 || ar.height < 5) anchor = null;
		}
		if (anchor) ST._menuAnchorSeen = true;
		// PODMENU (Wczytaj/Opcje/Mody...) — przyciski menu głównego ZNIKAJĄ z DOM, a fallback pokazywał
		// nasz przycisk nad podekranem (raport Psychospark89). Jeśli kotwicę już kiedyś widzieliśmy,
		// jej brak = podmenu → chowamy. Fallback zostaje TYLKO dla nieznanych języków (kotwica nigdy nie znaleziona).
		if (!anchor && ST._menuAnchorSeen) { if (btn) btn.style.display = "none"; if (ST._lobbyOpen) renderLobby(false); return; }
		if (!btn) {
			btn = document.createElement("div");
			btn.id = "st-mp-btn";
			btn.textContent = t("mp_btn");
			btn.style.cssText = "position:fixed;z-index:99998;cursor:pointer;color:#fff;background:rgba(13,30,44,.92);" +
				"border-radius:4px;padding:6px 22px;font-weight:700;letter-spacing:.5px;box-shadow:0 3px 6px rgba(0,0,0,.45);" +
				"border:1px solid rgba(255,255,255,.14);user-select:none;white-space:nowrap";
			btn.onmouseenter = () => { btn.style.background = "rgba(32,64,92,.95)"; };
			btn.onmouseleave = () => { btn.style.background = "rgba(13,30,44,.92)"; };
			btn.onclick = openLobby;
			document.body.appendChild(btn);
		}
		btn.style.display = "block";
		// stan połączenia widoczny BEZ otwierania lobby (feedback TCentraL: "no real way to know if
		// you're connected") — zielona kropka i ramka gdy hostujesz / jesteś połączony
		const conn = ST.net.role !== "idle";
		btn.textContent = t("mp_btn") + (conn ? "  ●" : "");
		btn.style.borderColor = conn ? "#4c8" : "rgba(255,255,255,.14)";
		btn.style.color = conn ? "#aef5c8" : "#fff";
		if (anchor) {
			const src = anchor.closest("button") || anchor.parentElement || anchor;
			const cs = getComputedStyle(src);
			ST._gameFont = cs.fontFamily || ST._gameFont; // font gry — lobby też go używa
			// stały, DUŻY rozmiar (feedback usera: "bardzo mały, ledwo widoczny" — rozmiar Mody/Mapy był za mały)
			btn.style.font = "700 20px " + cs.fontFamily;
			btn.style.padding = "10px 30px";
			const r = src.getBoundingClientRect();
			btn.style.left = Math.round(r.left) + "px";
			btn.style.top = Math.round(r.bottom + 10) + "px";
			btn.style.bottom = "";
		} else {
			btn.style.left = "24px"; btn.style.top = ""; btn.style.bottom = "24px";
			btn.style.font = "700 20px sans-serif";
			btn.style.padding = "10px 30px";
		}
		if (ST._lobbyOpen) renderLobby(false);
	}

	function openLobby() {
		ST._lobbyOpen = true; ST._lobbyView = null;
		try { net.status().then((s) => { ST._myNick = s.myNick || ST._myNick; }).catch(() => {}); } catch (e) {}
		let ov = document.getElementById("st-lobby");
		if (!ov) {
			ov = document.createElement("div");
			ov.id = "st-lobby";
			ov.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(2,10,18,.72);display:flex;align-items:center;justify-content:center";
			ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeLobby(); });
			document.body.appendChild(ov);
		}
		renderLobby(true);
	}
	function closeLobby() {
		ST._lobbyOpen = false; ST._lobbyView = null;
		const ov = document.getElementById("st-lobby");
		if (ov) ov.remove();
	}

	function lbBtn(label, desc, primary) {
		const b = document.createElement("div");
		b.style.cssText = "cursor:pointer;margin:7px 0;padding:10px 14px;border-radius:4px;border:1px solid rgba(255,255,255,.14);" +
			"background:" + (primary ? "#1d4a6b" : "#14283a") + ";user-select:none";
		b.onmouseenter = () => { b.style.background = primary ? "#276089" : "#1c3850"; };
		b.onmouseleave = () => { b.style.background = primary ? "#1d4a6b" : "#14283a"; };
		const l1 = document.createElement("div");
		l1.style.cssText = "font-weight:700;font-size:16px;color:#fff"; l1.textContent = label;
		b.appendChild(l1);
		if (desc) {
			const l2 = document.createElement("div");
			l2.style.cssText = "font-size:11px;color:#9fb6c9;margin-top:2px"; l2.textContent = desc;
			b.appendChild(l2);
		}
		return b;
	}

	function lbInput(ph, val, w) {
		const i = document.createElement("input");
		i.placeholder = ph; i.value = val; i.spellcheck = false;
		i.style.cssText = "width:" + w + "px;background:#0b1620;color:#dfe9f2;border:1px solid #33506a;border-radius:3px;font:13px monospace;padding:5px 7px";
		i.addEventListener("keydown", (e) => e.stopPropagation()); // klawisze nie przeciekają do gry
		i.addEventListener("keyup", (e) => e.stopPropagation());
		return i;
	}

	async function loadLatestAndPlay() {
		try {
			const saves = await window.electron.getSaveFiles();
			if (!saves || !saves.length) { setStatus(t("no_saves"), "#f66"); return; }
			const ts = (s) => s.timestamp || s.updatedAt || s.savedAt || s.time || s.date || 0;
			saves.sort((a, b) => (ts(a) > ts(b) ? 1 : -1));
			const save = saves[saves.length - 1];
			if (!(ST.FH && ST.FH.game && typeof ST.FH.game.load === "function" && ST.state)) { setStatus(t("error", "game.load?"), "#f66"); return; }
			closeLobby();
			log("lobby: wczytuję ostatni save:", save.name || save.id);
			const lr = await ST.FH.game.load(ST.state, save.id);
			if (lr && lr.success === false) throw new Error(lr.error || "load failed");
			// auto-send save'a do graczy zrobi frame hook hosta (auto-wyślij gdy host w świecie)
		} catch (e) { setStatus(t("error", e.message), "#f66"); log("lobby loadLatestAndPlay error:", e.message); }
	}

	function renderLobby(force) {
		const ov = document.getElementById("st-lobby");
		if (!ov || !ST._lobbyOpen) return;
		const view = ST.net.role === "idle" ? "start" : "lobby";
		if (force || ST._lobbyView !== view) {
			ST._lobbyView = view;
			ov.innerHTML = "";
			const p = document.createElement("div");
			p.style.cssText = "width:540px;max-width:92vw;max-height:86vh;overflow:auto;background:rgba(8,20,30,.97);" +
				"border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:20px 26px;color:#dfe9f2;box-shadow:0 10px 40px rgba(0,0,0,.6)";
			p.style.fontFamily = ST._gameFont || "sans-serif";
			// nagłówek + zamknięcie
			const head = document.createElement("div");
			head.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px";
			const h1 = document.createElement("div");
			h1.style.cssText = "font-weight:800;font-size:22px;letter-spacing:1px;color:#ffb454"; h1.textContent = t("lb_title");
			const x = document.createElement("div");
			x.style.cssText = "cursor:pointer;color:#9fb6c9;font-size:20px;padding:0 4px"; x.textContent = t("lb_close");
			x.onclick = closeLobby;
			head.appendChild(h1); head.appendChild(x); p.appendChild(head);
			const sub = document.createElement("div");
			sub.style.cssText = "font-size:11px;color:#7d95a8;margin-bottom:12px";
			sub.textContent = t("lb_sub") + " — " + VER;
			p.appendChild(sub);

			if (view === "start") {
				// nick gracza (feedback TCentraL: na LAN każdy jest "Player") — zapis w localStorage,
				// rozgłaszany protokołem hello przy joinie / do nowych peerów
				const nickRow = document.createElement("div");
				nickRow.style.cssText = "margin:0 0 8px;font-size:12px;color:#9fb6c9";
				const nickLbl = document.createElement("span"); nickLbl.textContent = t("lb_nick") + ":  ";
				const nickIn = lbInput(t("lb_nick"), ST._nickCustom || ST._myNick || "", 150);
				nickIn.maxLength = 24;
				nickIn.addEventListener("input", () => {
					const v = nickIn.value.trim().slice(0, 24);
					ST._nickCustom = v || null;
					try { if (v) localStorage.setItem("st_nick", v); else localStorage.removeItem("st_nick"); } catch (e) {}
					if (v) ST._myNick = v;
				});
				nickRow.appendChild(nickLbl); nickRow.appendChild(nickIn);
				p.appendChild(nickRow);
				const bSteam = lbBtn(t("btn_host") /* Host (Steam) */, t("lb_host_steam_d"), true);
				bSteam.onclick = async () => {
					setStatus(t("creating_lobby"));
					try { const r = await net.hostSteam(); if (!r.ok) setStatus(t("error", r.error), "#f66"); }
					catch (e) { setStatus(t("error", e.message), "#f66"); log("lobby hostSteam error:", e.message); }
					renderLobby(true);
				};
				p.appendChild(bSteam);
				// 0.9.79: hosting BEZPOSREDNI — omija relay Steama (dlawi pasmo, ping do sekund).
				const bDir = lbBtn(t("btn_host_direct"), t("lb_host_direct_d"), true);
				bDir.onclick = async () => {
					setStatus(t("creating_lobby"));
					try {
						ST._directMode = true;
						if (typeof net.hostDirect !== "function") { ST._directMode = false; setStatus(t("bridge_old"), "#f66"); log("hostDirect: brak w mostku preload (stara instalacja) — auto-update/patch.js wymieni mostek"); renderLobby(true); return; }
						const r = await net.hostDirect(27777);
						if (!r || !r.ok) setStatus(t("error", (r && r.error) || "?"), "#f66");
						else {
							ST._directAddr = (r.publicIp ? r.publicIp : null); ST._directPort = r.port || 27777; ST._directUpnp = !!r.upnp;
							ST._directShown = false;
							setStatus(r.upnp ? t("direct_ready") : t("direct_no_upnp", ST._directPort), r.upnp ? "#5f5" : "#fd5");
							log("HOST DIRECT: upnp=" + r.upnp + " port=" + r.port + " ip=" + (r.publicIp ? "(ukryty)" : "nieznany") + (r.error ? " err=" + r.error : ""));
						}
					} catch (e) { setStatus(t("error", e.message), "#f66"); }
					renderLobby(true);
				};
				p.appendChild(bDir);
				const bLan = lbBtn(t("btn_host_lan"), t("lb_host_lan_d"), false);
				bLan.onclick = async () => {
					try { const r = await net.hostWs(27777); if (!r.ok) setStatus(t("error", r.error), "#f66"); }
					catch (e) { setStatus(t("error", e.message), "#f66"); log("lobby hostWs error:", e.message); }
					renderLobby(true);
				};
				p.appendChild(bLan);
				// Dołącz LAN: przycisk + pola adresu
				const bJoin = lbBtn(t("btn_join_lan"), t("lb_join_lan_d"), false);
				const row = document.createElement("div");
				row.style.cssText = "display:none;margin:2px 0 6px;padding:0 2px";
				const ip = lbInput("IP", "127.0.0.1", 170);
				const port = lbInput("port", "27777", 62); port.maxLength = 5;
				const go = document.createElement("button");
				go.textContent = t("btn_connect");
				go.style.cssText = "margin-left:6px;background:#1d4a6b;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:3px;font:600 13px inherit;cursor:pointer;padding:5px 12px";
				const doJoin = async () => {
					let h = (ip.value || "").trim(); let pr = (port.value || "").trim();
					if (h.indexOf(":") >= 0) { const a = h.split(":"); h = a[0]; if (a[1]) { pr = a[1]; port.value = pr; } ip.value = h; }
					if (!h) { ip.focus(); return; }
					const pn = parseInt(pr || "27777", 10);
					if (!(pn > 0 && pn < 65536)) { port.focus(); port.select(); return; }
					setStatus(t("creating_lobby"));
					const r = await net.joinWs(h, pn);
					if (!r.ok) setStatus(t("error", r.error), "#f66");
					renderLobby(true);
				};
				for (const el of [ip, port]) el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doJoin(); } });
				go.onclick = doJoin;
				row.appendChild(ip); row.appendChild(port); row.appendChild(go);
				bJoin.onclick = () => { row.style.display = row.style.display === "none" ? "block" : "none"; if (row.style.display === "block") { ip.focus(); ip.select(); } };
				p.appendChild(bJoin); p.appendChild(row);
				const bId = lbBtn(t("btn_join_id"), t("lb_join_id_d"), false);
				bId.onclick = async () => {
					let id; try { id = (await navigator.clipboard.readText()).trim(); } catch (e) { setStatus(t("error", "clipboard: " + e.message), "#f66"); return; }
					if (!id || !/^\d{5,}$/.test(id)) { setStatus(t("clipboard_no_id"), "#f66"); return; }
					setStatus(t("creating_lobby"));
					const r = await net.joinSteam(id);
					if (!r.ok) setStatus(t("error", r.error), "#f66");
					renderLobby(true);
				};
				p.appendChild(bId);
				const hint = document.createElement("div");
				hint.style.cssText = "margin-top:10px;font-size:11px;color:#7d95a8"; hint.textContent = t("lb_hint");
				p.appendChild(hint);
			} else {
				// LOBBY: badge roli + status + lobby id + zaproś + lista graczy + świat + rozłącz
				const badge = document.createElement("div");
				const trName = ST.net.transport === "steam" ? "Steam" : (ST._directMode ? "Internet" : "LAN");
				badge.style.cssText = "font-weight:800;font-size:15px;margin:2px 0 4px;color:" + (ST.net.role === "host" ? "#5f5" : "#6cf");
				badge.textContent = ST.net.role === "host" ? t("badge_host", trName) : t("badge_client", trName);
				p.appendChild(badge);
				if (ST.net.role === "host") {
					const steps = document.createElement("div");
					steps.style.cssText = "font-size:12px;color:#ffd27a;margin:0 0 6px";
					steps.textContent = t("lb_steps");
					p.appendChild(steps);
				}
				const st2 = document.createElement("div");
				st2.id = "st-lb-status"; st2.style.cssText = "font-size:12px;color:#ffd27a;margin:2px 0 8px";
				p.appendChild(st2);
				if (ST.net.role === "host" && ST.net.transport === "steam") {
					const inv = lbBtn(t("lb_invite"), null, true);
					inv.onclick = () => net.invite();
					p.appendChild(inv);
					const idRow = document.createElement("div");
					idRow.style.cssText = "font-size:12px;color:#9f9;margin:4px 0 8px;cursor:pointer";
					idRow.id = "st-lb-id"; idRow.title = "Click to copy";
					idRow.onclick = async () => {
						if (!ST.net.lobbyId) return;
						try { await navigator.clipboard.writeText(ST.net.lobbyId); idRow.textContent = t("lb_id") + ": " + t("lb_copied"); } catch (e) {}
					};
					p.appendChild(idRow);
				}
				// adres hosta bezposredniego — DOMYSLNIE ZAMASKOWANY (stream-safe), kopiowanie bez odslaniania
				if (ST.net.role === "host" && ST._directAddr) {
					const row = document.createElement("div");
					row.style.cssText = "margin:6px 0 8px;font-size:13px;color:#9f9;display:flex;align-items:center;gap:8px;flex-wrap:wrap";
					const lbl = document.createElement("span"); lbl.style.color = "#9fb6c9"; lbl.textContent = t("direct_addr") + ":";
					const val = document.createElement("span");
					val.style.cssText = "font:13px monospace;color:#9f9";
					const paint = () => { val.textContent = ST._directShown ? (ST._directAddr + ":" + ST._directPort) : ("●●●.●●●.●●●.●●●:" + ST._directPort); };
					paint();
					const eye = document.createElement("span");
					eye.style.cssText = "cursor:pointer;font-size:11px;color:#6cf;text-decoration:underline";
					eye.textContent = ST._directShown ? t("direct_hide") : t("direct_show");
					eye.onclick = () => { ST._directShown = !ST._directShown; paint(); eye.textContent = ST._directShown ? t("direct_hide") : t("direct_show"); };
					const cp = document.createElement("span");
					cp.style.cssText = "cursor:pointer;font-size:11px;color:#6cf;text-decoration:underline";
					cp.textContent = "📋 " + t("lb_copy");
					cp.onclick = async () => { try { await navigator.clipboard.writeText(ST._directAddr + ":" + ST._directPort); cp.textContent = t("direct_copied"); setTimeout(() => { cp.textContent = "📋 " + t("lb_copy"); }, 1200); } catch (e) {} };
					const hint = document.createElement("span");
					hint.style.cssText = "font-size:10px;color:#7d95a8"; hint.textContent = t("direct_hidden_hint");
					row.appendChild(lbl); row.appendChild(val); row.appendChild(eye); row.appendChild(cp); row.appendChild(hint);
					p.appendChild(row);
				}
				const plH = document.createElement("div");
				plH.style.cssText = "font-weight:700;font-size:14px;color:#fff;margin-top:6px"; plH.textContent = t("lb_players");
				p.appendChild(plH);
				const pl2 = document.createElement("div");
				pl2.id = "st-lb-players"; pl2.style.cssText = "margin:4px 0 10px;font-size:13px;line-height:1.6";
				p.appendChild(pl2);
				if (ST.net.role === "host") {
					const play = lbBtn(t("lb_play_last"), t("lb_play_note"), true);
					play.onclick = loadLatestAndPlay;
					p.appendChild(play);
					// wybór KONKRETNEGO save'a (feedback TCentraL: "maybe do: New map option, load map option")
					const pick = lbBtn(t("lb_pick_save"), t("lb_pick_save_d"), false);
					const list = document.createElement("div");
					list.style.cssText = "display:none;max-height:180px;overflow:auto;margin:2px 0 6px;border:1px solid rgba(255,255,255,.1);border-radius:4px";
					pick.onclick = async () => {
						if (list.style.display !== "none") { list.style.display = "none"; return; }
						list.style.display = "block"; list.innerHTML = "";
						try {
							const saves = await window.electron.getSaveFiles();
							const tsv = (s) => s.timestamp || s.updatedAt || s.savedAt || s.time || s.date || 0;
							(saves || []).sort((a, b) => (tsv(a) < tsv(b) ? 1 : -1));
							for (const sv of (saves || []).slice(0, 25)) {
								const row = document.createElement("div");
								row.style.cssText = "cursor:pointer;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.06);color:#cfe0ee;font-size:13px";
								const tv = tsv(sv);
								row.textContent = (sv.name || sv.id) + (tv > 1e12 ? "   ·   " + new Date(tv).toLocaleString() : "");
								row.onmouseenter = () => { row.style.background = "#1c3850"; };
								row.onmouseleave = () => { row.style.background = ""; };
								row.onclick = async () => {
									closeLobby();
									try {
										log("lobby: wczytuję wybrany save:", sv.name || sv.id);
										const lr = await ST.FH.game.load(ST.state, sv.id);
										if (lr && lr.success === false) throw new Error(lr.error || "load failed");
									} catch (e) { setStatus(t("error", e.message), "#f66"); }
								};
								list.appendChild(row);
							}
							if (!list.childElementCount) list.textContent = t("no_saves");
						} catch (e) { list.textContent = "error: " + e.message; }
					};
					p.appendChild(pick); p.appendChild(list);
					const newNote = document.createElement("div");
					newNote.style.cssText = "font-size:11px;color:#7d95a8;margin:0 0 8px";
					newNote.textContent = t("lb_new_note");
					p.appendChild(newNote);
				} else {
					const w8 = document.createElement("div");
					w8.style.cssText = "font-size:12px;color:#9fb6c9;margin:6px 0 10px"; w8.textContent = t("lb_wait_host");
					p.appendChild(w8);
				}
				const dc = lbBtn(t("lb_disconnect"), null, false);
				dc.onclick = () => { setClientPaused(false); net.stop(); renderLobby(true); };
				p.appendChild(dc);
			}
			ov.appendChild(p);
		}
		// dynamiczne odświeżenie (bez przebudowy — inputy nie tracą focusa)
		if (view === "lobby") {
			const st2 = document.getElementById("st-lb-status");
			if (st2) {
				const hudSt = document.getElementById("st-status");
				st2.textContent = (hudSt && hudSt.textContent) || "";
			}
			const idRow = document.getElementById("st-lb-id");
			if (idRow && ST.net.lobbyId && idRow.textContent.indexOf(t("lb_copied")) < 0) {
				const id = String(ST.net.lobbyId);
				idRow.textContent = t("lb_id") + ": ●●●●●●" + id.slice(-3) + "  📋 (" + t("lb_copy") + ")";
			}
			const pl2 = document.getElementById("st-lb-players");
			if (pl2) {
				pl2.innerHTML = "";
				const mk = (nick, info, ok) => {
					const r = document.createElement("div");
					const dot = document.createElement("span");
					dot.textContent = "● "; dot.style.color = ok ? "#5f5" : "#f66";
					const nm = document.createElement("span"); nm.textContent = nick; nm.style.color = "#fff";
					const inf = document.createElement("span"); inf.textContent = "  " + info; inf.style.cssText = "color:#7d95a8;font-size:11px";
					r.appendChild(dot); r.appendChild(nm); r.appendChild(inf);
					return r;
				};
				pl2.appendChild(mk(ST._myNick || "Player", "(" + t("lb_you") + ") " + VER, true));
				for (const [, pr] of ST.peers) pl2.appendChild(mk(pr.nick || "?", pr.modVer || "?", !pr.modVer || pr.modVer === VER));
			}
		}
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
				if (p.bt != null && p.btT && performance.now() - p.btT < 2000 && Array.isArray(p.boffs) && p.boffs.length) {
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
	// 0.9.142: haki na wspolny obiekt FH (ten sam dla calego bundle) — narzedzia klienta, ktore omijaja hak DN:
	//  - energy.consume: podczas AKTYWNEJ akcji narzedzia u klienta-lustra nie liczymy z lokalnej (bywa nieaktualnej) kopii
	//    baterii → falszywe "Not enough power"; zbieramy kwote i doklejamy do wykopu (host odejmuje autorytatywnie),
	//  - world.excavate: wiertlo reczne kopie przez kolejke mutacji Lu (u klienta porzucana) → forward jako wykop 1x1.
	function installFhHooks(FH) {
		ST._fhHooked = true;
		try {
			if (FH.energy && typeof FH.energy.consume === "function" && !FH.energy.consume._st) {
				const orig = FH.energy.consume;
				const w = function (state, amt, opts) {
					try {
						if (isClientSync() && ST.wsx.paused && state && state.session && state.session.action && state.session.action.state && state.session.action.state[2]) {
							ST._pendEn = (ST._pendEn || 0) + (amt > 0 ? amt : 0);
							return amt;
						}
					} catch (e) {}
					return orig.apply(this, arguments);
				};
				w._st = true; FH.energy.consume = w;
			}
			if (FH.world && typeof FH.world.excavate === "function" && !FH.world.excavate._st) {
				const orig = FH.world.excavate;
				const w = function (state, x, y, vel, dmg, opts) {
					if (isClientSync() && ST.wsx.paused && !ST._projCtx) { try { ST._dig(state, x, y, [[1]], vel, dmg, opts || {}); } catch (e) {} return; }
					return orig.apply(this, arguments);
				};
				w._st = true; FH.world.excavate = w;
			}
			log("FH hooks: energy.consume=" + !!(FH.energy && FH.energy.consume && FH.energy.consume._st) + " world.excavate=" + !!(FH.world && FH.world.excavate && FH.world.excavate._st));
		} catch (e) { log("installFhHooks error:", e.message); }
	}
	ST._frame = (state, FH) => {
		ST._pendEn = 0; // energia narzedzia liczona per klatka (patrz installFhHooks)
		if (FH && !ST._fhHooked) installFhHooks(FH);
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
		ensureMenuUi(state); // przycisk MULTIPLAYER w menu głównym + lobby (throttle 500 ms w środku)
		// host: auto-wyślij save gdy jest w świecie z graczami i jeszcze nie wysłał TEGO świata (klucz: worldId).
		// Sprawdzamy stan CIĄGLE (nie edge menu->świat, który przy próbkowaniu łatwo przegapić). (wkład dotNine)
		if (ST.net.role === "host" && ST.peers.size && state.store && state.store.scene && state.store.scene.active !== 1) {
			const wid = (state.store.meta && state.store.meta.worldId) || "unknown";
			if (ST._autoSentWid !== wid) { ST._autoSentWid = wid; sendWorld(); }
		}
		// auto-naprawa zbrickowanego researchu (0.9.71): host/solo raz na świat, 3 s po wejściu (po loadzie)
		if (ST.net.role !== "client" && state.store && state.store.scene && state.store.scene.active !== 1 && state.store.player && now > (ST._loadGuardUntil || 0)) {
			const wid = (state.store.meta && state.store.meta.worldId) || "unknown";
			if (ST._techRepairWid !== wid) { ST._techRepairWid = wid; techRepair(state, ST.net.role === "host" ? "host" : "solo"); }
		}
		// HOST W MENU NIE STREAMUJE (fix "instant kick" — Akriz + derErste67): w menu bufory świata
		// należą do SCENY MENU; streamowanie ich klientowi malowało śmieci i uruchamiało u niego
		// auto-wyjście do menu (everApplied w menu) = klient wylatywał sekundę po dołączeniu.
		// OSIEROCONE KAFLE (0.9.136): kafel fundamentu (terrain Block 15..18) bez zywej struktury to smiec,
		// ktory renderuje sie na czerwono i ktorego gra sama nie usunie. Sprzatamy okolice graczy co 5 s,
		// z potwierdzeniem w drugim przebiegu (kafel w trakcie stawiania bywa chwilowo "bez struktury").
		if (ST.net.role !== "client" && state.store.scene && state.store.scene.active !== 1 && now - (ST._orphanScanT || 0) > 5000) {
			ST._orphanScanT = now;
			try {
				const sim = state.shared.sim, W = sim.width;
				const ids = new Uint32Array(sim.cellIds.buffer, sim.cellIds.byteOffset, sim.cellIds.length);
				const tt = sim.terrainType, TR = ST.FH.terrains, SA = structNs();
				if (ids && tt && TR && TR.removeAt && SA && SA.getAtCell) {
					if (!ST._orphanSeen) ST._orphanSeen = new Map();
					const spots = [{ x: state.store.player.x / 4, y: state.store.player.y / 4 }];
					for (const p of ST.peers.values()) spots.push({ x: p.tx / 4, y: p.ty / 4 });
					const widziane = new Set();
					let usuniete = 0;
					for (const sp of spots) {
						const cx = sp.x | 0, cy = sp.y | 0;
						if (!(cx > 0 && cy > 0 && cx < W)) continue;
						const x0 = Math.max(1, cx - 160), x1 = Math.min(W - 2, cx + 160);
						const y0 = Math.max(1, cy - 120), y1 = Math.min(sim.height - 2, cy + 120);
						for (let y = y0; y <= y1 && usuniete < 300; y++) for (let x = x0; x <= x1 && usuniete < 300; x++) {
							const i = x + y * W, id = ids[i];
							if (id <= 0 || id > 1000) continue;
							const ty = tt[id];
							if (!TEREN_STRUKTUR.has(ty)) continue;      // kafle struktur: fundamenty, przenosniki, wstrzasarki...
							try { if (SA.getAtCell(state, x, y)) continue; } catch (e) { continue; }
							widziane.add(i);
							const od = ST._orphanSeen.get(i);
							if (!od) { ST._orphanSeen.set(i, now); continue; }   // pierwszy raz — daj mu szanse
							if (now - od < 6000) continue;
							try { TR.removeAt(state, x, y); markCellDirty(state, x, y); usuniete++; ST._orphanSeen.delete(i); } catch (e) {}
						}
					}
					for (const k of ST._orphanSeen.keys()) if (!widziane.has(k)) ST._orphanSeen.delete(k); // juz nie osierocony
					if (usuniete) log("SPRZATANIE: usunieto", usuniete, "osieroconych kafli fundamentu (czerwone klocki bez struktury)");
				}
			} catch (e) { if (!ST._orphanErrLogged) { ST._orphanErrLogged = true; log("sprzatanie osieroconych kafli blad:", e.message); } }
		}
		// SPRZĄTANIE MARTWYCH KOMÓREK (0.9.100): komórka wskazuje na element, którego nie ma w tablicy
		// (typ = 0) => nic za nią nie stoi: rysuje się na czerwono, nie da się jej usunąć ani podnieść.
		// Skanujemy okno wokół graczy, nie całą mapę.
		if (ST.net.role !== "client" && state.store.scene && state.store.scene.active !== 1 && now - (ST._deadScanT || 0) > 5000) {
			ST._deadScanT = now;
			try {
				const sim = state.shared.sim, W = sim.width, H = sim.height;
				const ids = new Uint32Array(sim.cellIds.buffer, sim.cellIds.byteOffset, sim.cellIds.length);
				const ed = sim.elementData, ety = ed && ed.type;
				if (ety) {
					const spots = [{ x: state.store.player.x / 4, y: state.store.player.y / 4 }];
					for (const p of ST.peers.values()) spots.push({ x: p.tx / 4, y: p.ty / 4 });
					let dead = 0;
					for (const sp of spots) {
						const cx = sp.x | 0, cy = sp.y | 0;
						if (!(cx > 0 && cy > 0 && cx < W && cy < H)) continue;
						const x0 = Math.max(1, cx - 120), x1 = Math.min(W - 2, cx + 120);
						const y0 = Math.max(1, cy - 90), y1 = Math.min(H - 2, cy + 90);
						for (let y = y0; y <= y1 && dead < 400; y++) for (let x = x0; x <= x1 && dead < 400; x++) {
							const cid = ids[x + y * W];
							if (cid < ELEMENTS_MIN || cid > ELEMENTS_MAX) continue;
							if ((ety[cid - ELEMENTS_MIN] | 0) !== 0) continue;   // element żyje — zostaw
							ids[x + y * W] = 0; dead++;                          // martwy slot — komórka do skasowania
						}
					}
					if (dead) { log("SPRZATANIE: usunieto " + dead + " martwych komorek (element bez wpisu w tablicy)"); enqueueAround(state, spots); }
				}
			} catch (e) { if (!ST._deadErrLogged) { ST._deadErrLogged = true; log("sprzatanie martwych komorek blad:", e.message); } }
		}
		if (isHostSync() && state.store.scene && state.store.scene.active !== 1) {
			scanDirty(state);
			maybeSendBatch(state);
			sendSnapshotIfDue(state);
			scanDataEditsIfDue(state); // 0.9.142: host: zmiana filtra przy graczu → natychmiast do klientow
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
					const cleanupBounds = Array.isArray(hd.bounds) ? hd.bounds : [];
					const cleanupArea = cleanupBounds.reduce((n, b) => n + (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1), 0);
					if (SA && cleanupBounds.length && cleanupArea <= 40000) {
						const leftovers = new Map();
						for (const bound of cleanupBounds)
							for (let y = bound.y0; y <= bound.y1; y++) for (let x = bound.x0; x <= bound.x1; x++) {
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
						if (hd.cleanOrphans) try {
							const sh = state.shared || {};
							const simc = sh.sim && sh.sim.cellIds;
							const tt = sh.sim && sh.sim.terrainType;
							const TR = ST.FH.terrains;
							const { W } = worldBuffers(state);

							if (simc && tt && TR && TR.removeAt && W) {
								const sim = new Uint32Array(simc.buffer, simc.byteOffset, simc.length);
								const H = Math.floor(sim.length / W);
								// The host captured these bounds from getAtCell while each structure still existed.
								// Clean exactly those foundation boxes; the user's drag rectangle is deliberately absent.
								const isOrphanTile = (xx, yy) => {
									const n = sim[xx + yy * W];
									if (n <= 0 || n > 1000) return false;
									const ty2 = tt[n];
									if (!TEREN_STRUKTUR.has(ty2)) return false;
									try { if (SA.getAtCell(state, xx, yy)) return false; } catch (e) { return false; }
									return true;
								};
								let cleaned = 0;
								for (const bound of cleanupBounds)
									for (let y = bound.y0; y <= bound.y1; y++) for (let x = bound.x0; x <= bound.x1; x++) {
										if (!isOrphanTile(x, y)) continue;
										try { TR.removeAt(state, x, y); cleaned++; } catch (e) {}
									}
								if (cleaned) log("demolish-dobicie: usunięto", cleaned, "OSIEROCONYCH kafli (structure bounds)");
							}
						} catch (e) {
							log("ORPHAN CLEANUP ERROR:", e.message);
						}
					}
				} catch (e) { log("demolish-dobicie error:", e.message); }
			}
		}
		// 0.9.130: znaczniki cooldownow potrafia trafic "w przyszlosc" po kazdym imporcie swiata/profilu
		if (now - (ST._cdFixT || 0) > 5000) { ST._cdFixT = now; fixFutureCooldowns(state, "kontrola cykliczna"); }
		// 0.9.137: dokoncz odbudowe struktur odlozonych przez ciecie pracy (patrz wyzej).
		if (isClientSync() && ST._snapRest && ST._snapRest.length && !ST._loadingWorld) {
			try {
				const t0 = performance.now();
				let n = 0;
				while (ST._snapRest.length && performance.now() - t0 < 6) {
					const s2 = ST._snapRest.pop();
					if (!s2) continue;
					const k2 = structKey(s2);
					const sig2 = snapSig(s2); // 0.9.143: ten sam wzor co w petli snapshotu
					if (ST._structSig && ST._structSig.get(k2) === sig2) continue;
					buildOne(state, s2, true);
					if (ST._structSig) ST._structSig.set(k2, sig2);
					if (ST._structApplied) ST._structApplied.set(k2, Date.now());
					n++;
				}
				if (n && (ST._restDiag = (ST._restDiag || 0) + 1) <= 20) log("SNAP: dokonczono", n, "odlozonych struktur, zostalo", ST._snapRest.length);
			} catch (e) { if (!ST._restErr) { ST._restErr = 1; log("dokanczanie struktur blad:", e.message); } }
		}
		if (isClientSync()) {
			// Heartbeat re-pauzy (fix G1): ESC-menu gry śle własne SetPaused(false) przy zamknięciu i cicho
			// wznawiało symulację klienta (nasza flaga wciąż true → setClientPaused nie re-pauzowało) →
			// podwójna symulacja walczyła z lustrem = masywny desync. Wysyłamy [54,true] co 2s — idempotentne.
			// ZAPIS GRY (0.9.127): gra pauzuje watek symulacji na czas zapisu i po nim go WZNAWIA.
			// Czekanie na heartbeat oznaczaloby do 2 s wlasnej symulacji u klienta = trwaly desync.
			try {
				const saving = !!(state.session && state.session.saving);
				if (saving) {
					ST._wasSaving = true;
					const mgr = managerWorker(state);
					if (mgr) try { mgr.postMessage([68, 0]); } catch (e) {}   // trzymaj pauze przez caly zapis
				} else if (ST._wasSaving) {
					ST._wasSaving = false;
					const mgr = managerWorker(state);
					if (mgr) try { mgr.postMessage([68, 0]); } catch (e) {}   // gra wlasnie wznowila — pauzuj natychmiast
					// i popros hosta o odswiezenie DOKLADNIE tych chunkow, ktore mogla ruszyc nasza symulacja
					try {
						const flags = state.shared.sim && state.shared.sim.chunkShouldUpdate;
						if (flags && flags.length) {
							const m = new Uint8Array((flags.length + 7) >> 3);
							let n = 0;
							for (let i = 0; i < flags.length; i++) if (flags[i]) { m[i >> 3] |= 1 << (i & 7); n++; }
							if (n) { net.send({ t: "redirty", m: b64enc(m), n: flags.length }); log("Po zapisie gry: prosze hosta o odswiezenie", n, "chunkow, ktore ruszyla moja symulacja"); }
						}
					} catch (e) {}
				}
			} catch (e) {}
			if (ST.wsx.paused && now - (ST._rePauseT || 0) > 2000) {
				ST._rePauseT = now;
				const mgr = managerWorker(state);
				if (mgr) try { mgr.postMessage([68, 0]); } catch (e) {}
			}
			// Mirror ack at 10 Hz, matching the host's batch rate. The host derives its lag from this and
			// throttles itself. Cheap (~20 B) and sent unordered, so it never queues behind world packets.
			// A slower ack (2 Hz say) would add ~5 batches of its own age to the measurement and the
			// controller would throttle a perfectly healthy link.
			if (ST._lastAppliedSq != null && now - (ST._lastAckT || 0) > 100) {
				ST._lastAckT = now;
				try { net.send({ t: "wcack", sq: ST._lastAppliedSq, qd: (ST._applyQ || []).length }); } catch (e) {} // qd = ile paczek czeka u mnie na nalozenie
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
				if (!ST._worldRx) setStatus(t("waiting_world"), "#fd5"); // nie nadpisuj "Receiving world x/y"
			}
			// SELF-HEALING (fix TCentraL reconnect na dużej mapie): brak world-begin mimo połączenia
			// (auto-send hosta nie zadziałał / zgubiony) → klient prosi o save co 15 s, MAX 4 razy na sesję,
			// i NIGDY po udanym odbiorze świata (_worldRxDone) — inaczej pętla transferów/przeładowań (0.9.58!).
			// ...i TYLKO gdy siedzimy w MENU (0.9.73). Prosba o save W SWIECIE = kolejny auto-load =
			// PRZELADOWANIE strony = petla co ~10-15 s (ZeroHazard, J.Slayer, Akriz).
			if (!ST._worldRxDone && !ST._gotHostWorld && !ST._worldRx && !ST.wsx.everApplied && ST.peers.size > 0 &&
				state.store.scene && state.store.scene.active === 1 &&
				(ST._worldReqN || 0) < 4 && now - (ST._worldReqT || 0) > 15000) {
				ST._worldReqT = now; ST._worldReqN = (ST._worldReqN || 0) + 1;
				try { net.send({ t: "world-req" }); log("world-req " + ST._worldReqN + "/4: nie dostałem world-begin — proszę hosta o save"); } catch (e) {}
			}
			// MIRROR-KICK (0.9.73 — PRZYCZYNA "klient nie moze kopac / kopie u siebie", odtworzona e2e):
			// auto-load konczy sie PRZELADOWANIEM STRONY renderera. Mod wstaje od zera (everApplied=false,
			// sim NIE zapauzowany), ale siec zyje w procesie main — host NIE dostaje nowego peer-hello,
			// wiec NIGDY nie wola enqueueFullWorld. Efekt: klient stoi w swiecie hosta z martwym lustrem
			// i gra lokalnie (kopanie nie idzie do hosta, host go nie widzi). Prosimy o STRUMIEN (resync),
			// nie o save — nic sie nie przeladowuje, wiec nie ma z czego zrobic petli.
			if (!ST.wsx.everApplied && !ST._loadingWorld && ST.peers.size > 0 &&
				state.store.scene && state.store.scene.active !== 1 &&
				(ST._mirrorKickN || 0) < 6 && now - (ST._mirrorKickT || 0) > 6000) {
				ST._mirrorKickT = now; ST._mirrorKickN = (ST._mirrorKickN || 0) + 1;
				try { net.send({ t: "resync" }); log("mirror-kick " + ST._mirrorKickN + "/6: jestem w swiecie, lustro nie startuje — prosze hosta o pelny swiat"); } catch (e) {}
			}
			// klient FAKTYCZNIE był w świecie w tej sesji — warunek auto-wyjścia (pas i szelki po
			// incydencie instant-kick: everApplied ustawione w menu nie może rozłączać)
			if (state.store.scene && state.store.scene.active !== 1) ST.wsx.wasInWorld = true;
			// POWRÓT DO MENU TYTUŁOWEGO = wyjście z sesji (sugestia tony.s.jennette): po tym jak lustro
			// już działało (everApplied) I klient był w świecie, scena 1 oznacza świadome wyjście —
			// rozłączamy czysto zamiast zostawiać sesję w limbo. (Przed pierwszym światem klient CZEKA w menu.)
			// !_loadingWorld: podczas NASZEGO FH.game.load scena przelatuje przez menu — auto-wyjście
			// w tym oknie robiło net.stop() → reconnect → nowy transfer → load → PĘTLA (raport ZeroHazard)
			if (ST.wsx.everApplied && ST.wsx.wasInWorld && !ST._loadingWorld && state.store.scene && state.store.scene.active === 1) {
				log("Klient wrócił do menu tytułowego — opuszczam sesję co-op");
				profileSave(state); // pozycja/ekwipunek per świat — PRZED zdjęciem pauzy (profileSave wymaga paused)
				setClientPaused(false);
				try { net.stop(); } catch (e) {}
				setStatus(t("left_to_menu"), "#fd5");
				return; // rola już idle — reszta pętli klienta nie ma sensu w tej klatce
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
			// AUGMENTY: wybór klienta (ekran po artefakcie) mutuje mods.augments lokalnie — diff co 500ms
			// vs ostatni snapshot streamu → forward całego obiektu do hosta (host = autorytet drużynowy).
			if (now - (ST._augScanT || 0) > 500) {
				ST._augScanT = now;
				try {
					const cur = JSON.stringify((state.store.mods && state.store.mods.augments) || null);
					if (ST._augLast !== undefined && cur !== ST._augLast && cur !== "null") {
						ST._augLast = cur;
						ST._augEditT = now;
						net.send({ t: "act", k: "aug", a: JSON.parse(cur) });
						log("CLIENT augments → forward (wybór w ekranie augmentów)");
					}
				} catch (e) {}
			}
			// zator lustra (fix G4): działało, a od >4s nic nie przychodzi i host NIE zgłasza pauzy → pokaż ile czekamy
			// FIX 0.9.74: alarm tylko gdy host ZYJE (paczki zasobow ida), a strumien swiata milczy >15 s.
			// Wczesniej: 4 s ciszy = alarm, a cisza jest NORMALNA gdy w swiecie nic sie nie zmienia
			// (host nie wysyla nic, bo kolejka pusta) — gracz mial wiecznie czerwony status o zatorze.
			if (ST.wsx.everApplied && !ST._hostPausedShown && ST._lastWcT && now - ST._lastWcT > 15000 &&
				ST._lastResT && now - ST._lastResT < 5000 && now - (ST._stallHintT || 0) > 5000) {
				ST._stallHintT = now;
				setStatus(t("sync_stalled", Math.round((now - ST._lastWcT) / 1000)), "#fd5");
				ST._stallShown = true;
			}
		}
		drawGhosts(state);
	};
})();
