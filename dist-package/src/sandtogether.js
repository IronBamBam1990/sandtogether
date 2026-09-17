// ============================================================================
// SandTogether — co-op multiplayer mod for Sandustry
// Author / Autor: KAMIL PADULA
// Contributor: dotNine (cellIds collision sync, lobby-ID join,
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
	const VER = "0.9.287-beta";
	const AUTHOR = "Kamil Padula";
	const CONTRIBUTORS = "Qustux, dotNine, Knight-HD, DwoaC, Cr0ss0vr, TCentraL, AlyxiaFox, NanYu_sad.";
	const VACUUM_CAPS = [500, 1000, 1500, 2000, 2500, 3000]; // capacity table from the game code (module 6420)
	const RJ_FIRE = 11, RJ_FREEZINGICE = 12; // RJ enum values from the current build (for createAt on the host)
	const MT_LIQUID = 2, MT_GAS = 4, MT_STATIC = 5; // MatterType from the current build — vacuum does NOT suck them up (vanilla)
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
			status_host: (tr, n) => "HOST (" + tr + ") — players: " + n, status_client: (n) => "CONNECTED — players: " + n,
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
			status_host: (tr, n) => "HOST (" + tr + ") — gracze: " + n, status_client: (n) => "POŁĄCZONO — gracze: " + n,
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
			status_host: (tr, n) => "房主(" + tr + ")——玩家:" + n, status_client: (n) => "已连接——玩家:" + n,
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
			hairpin_hint: "连接被拒绝。如果房主和你在同一个网络中,请使用他的局域网地址(192.168.x.x)——路由器通常不允许连接到自己的公网 IP。",
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
		// FIX 0.9.74: texts with {0} placeholders were returned LITERALLY — the player saw
		// "No world data from host for {0}s..." or "reconnecting (attempt {0}/5)".
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
			pending: new Set(),   // host: indices of chunks to send
			priority: new Set(),  // host: grabber/vacuum chunks — ALWAYS sent first (bypasses the 120 fast-lane limit)
			sweep: 0,             // host: rolling full sweep
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
		// structures/resources/vacuum
		_greeted: new Set(),      // who we have already introduced ourselves to by nickname (hello anti-loop, 0.9.85)
		_rxWorldGen: (function () { try { return sessionStorage.getItem("st_world_gen") || null; } catch (e) { return null; } })(), // token of the MOST RECENTLY loaded transfer (survives a renderer reload)
		_applyingNet: false,      // event loop throttle when applying changes from the network
		_subscribedState: null,
		_lastSnap: 0,
		_lastRes: 0,
		_lastVac: 0,
		// v0.5: full sync
		_pd: 0,                   // flag: player digging (patch I)
		_projCtx: 0,              // flag: projectile update (patch m)
		_sprayCtx: 0,             // flaga: spray (patch _)
		_lastEnt: 0,              // stream encji 10 Hz
		_lastMyProj: 0,
		remoteProjectiles: [],    // remote players' projectiles (ghost render)
		peerPuppets: new Map(),   // id -> {puppet:PIXI.Container, parent} — the player's real sprites (dotNine)
		_lastResDelta: 0, _resSnapshot: null, // resDelta (dotNine)
		_mvHalfFrom: null,        // 0.9.198: halves of a move pair — event ordering is not guaranteed
		_mvHalfTo: null,
		_pickedPending: new Map(),// item id -> timestamp (picked up locally, waiting for host confirmation)
		_structApplied: new Map(),// structKey -> timestamp (grace period against deletion in reconcile)
		_grabbedCells: new Map(), // idx(x+y*W) -> ts: cells taken by the grabber locally; blocks taking them again before the host confirms removal (mirror)
		_placedCells: new Map(),  // idx -> ts: cells PLACED by the grabber locally; the sentinel blocks re-targeting the same "empty" cell for the tank's subsequent slots (the second element would be lost: host createAt no-ops on an occupied cell)
		_sndWarned: false,
	});
	// ST-FEAT undo: the game's Ctrl+Z history (the `rf` object of the "undo" module) is filled with EVENTS
	// structures:removed / moved / pasted / afterStructuresPlaced. The mod, when applying someone else's changes,
	// calls the same build/demolition functions -> in each player's history the OTHER player's actions were loading
	// and Ctrl+Z was undoing actions that weren't its own. The game skips writing to history when rf.isUndoing === true, so we mirror
	// our _applyingNet there. _undoState comes from a new hook on the bundle's "undo module export".
	// _undoSuppressed distinguishes "we suppressed this" from "the game is currently performing undo" (needed in the FH hooks).
	// 0.9.209: INSTEAD of saving and restoring the flag — OUR OWN ACCESSOR on rf.isUndoing.
	// The old version did save/restore: on entering _applyingNet it saved the current value and, on
	// exit, restored it. When the game's setTimeout (which clears the flag after an undo) landed in that window,
	// we restored an already stale "true" and the flag stayed raised FOREVER. The time guard
	// only masked the effect, and on a LARGE undo (over a second) it cleared the flag in the middle of the operation —
	// then the rest of the undo went through as a normal removal, and the "remove first, then place" order disappeared
	// and some structures were lost. The log shows it outright: "GUARD ... clears it", and right after that
	// 7x "CLIENT placeN: 400 pcs." and ONLY THEN "HOST demolish: request for 2732 structures".
	// Now we separate two things: what the GAME set (backing) and what WE are holding (_undoHold).
	// The game's write always goes to backing, even while we're holding the flag — so nothing can loop.
	ST._undoRaw = () => false;
	function ensureUndoAccessor() {
		try {
			const U = ST._undoState;
			if (!U || U.__stAcc) return;
			let backing = !!U.isUndoing;
			Object.defineProperty(U, "isUndoing", {
				configurable: true, enumerable: true,
				get() { return backing || !!ST._undoHold; },   // the game sees "true" even when we're holding it
				set(v) {
					backing = !!v;                              // the game's write always goes to backing
					// 0.9.210: the guard's timer starts EXACTLY when the game raises the flag, and resets
					// when it lowers it. Previously _undoOnT was only cleared on the CALL to
					// _inGameUndo() with the flag lowered — and between undos nobody checks it. The marker
					// from the previous undo remained, and on the NEXT one the guard immediately saw
					// "hanging for over 15 s" and cleared a perfectly fresh flag. In the log: GUARD, and right after it
					// 7x "CLIENT placeN: 400 pcs." — meaning placements before removals again.
					ST._undoOnT = backing ? performance.now() : 0;
				},
			});
			U.__stAcc = true;
			ST._undoRaw = () => backing;
			log("undo flag accessor installed");
		} catch (e) { log("undo accessor error:", e && e.message); }
	}
	try {
		let _an = false;
		Object.defineProperty(ST, "_applyingNet", {
			configurable: true, enumerable: true,
			get() { return _an; },
			set(v) {
				const nv = !!v;
				try { ensureUndoAccessor(); ST._undoHold = nv; } catch (e) {}
				_an = nv;
				ST._undoSuppressed = nv;
			},
		});
	} catch (e) {}
	// true only when the GAME is performing its own undo (and not us applying the network)
	ST._inGameUndo = () => {
		try {
			ensureUndoAccessor();
			if (ST._undoSuppressed) return false;
			const U = ST._undoState;
			if (!U) return false;
			const raw = U.__stAcc ? ST._undoRaw() : !!U.isUndoing;
			if (!raw) { ST._undoOnT = 0; return false; }
			// the guard stays, but now only as a last resort: a very large undo can
			// take several seconds and it MUST NOT be interrupted halfway (that's exactly what broke the order).
			const now2 = performance.now();
			if (!ST._undoOnT) ST._undoOnT = now2;          // flag raised before we managed to install the accessor
			if (now2 - ST._undoOnT > 15000) {
				try { U.isUndoing = false; } catch (e) {}
				ST._undoOnT = 0;
				if (lim("undoStuckDiag", 20)) log("WATCHDOG: undo flag was stuck >15 s — removing it");
				return false;
			}
			return true;
		} catch (e) { return false; }
	};
	// appending an entry to the game's history (client: our own actions are intercepted, so the game doesn't see them)
	ST._undoPush = (entry) => {
		try {
			const U = ST._undoState;
			if (!U || !Array.isArray(U.history)) return;
			U.history.push(entry);
			const max = U.maxHistory || 50;
			while (U.history.length > max) U.history.shift();
		} catch (e) {}
	};
	// ST-FEAT undo: we merge consecutive placements into ONE history entry — the game also treats a drag
	// as a single batch. Without this the client had to undo one block at a time.
	//
	// 0.9.223 (REPORT: "Ctrl+Z sometimes undoes several actions at once, sometimes only part of one"):
	// the action boundary was guessed by a TIMER — 700 ms since the last placement. Both symptoms are the same bug:
	//   * two quick clicks fit within 700 ms → they get merged into ONE entry → a single Ctrl+Z undoes both;
	//   * a slow drag has gaps longer than 700 ms → it gets cut into SEVERAL entries → Ctrl+Z undoes only a part.
	// The game knows where an action ends, and it says so explicitly: its structures API has beginBatchWrite/endBatchWrite
	// (visible in the listing the mod prints on startup). We hook into them and close the entry exactly
	// where the game closes its own write batch.
	// CAUTION: we don't know in advance whether the game wraps the WHOLE drag, or each structure separately.
	// If it were the latter, trusting the boundaries would make things worse (undoing one block at a time). So we only trust them
	// once we see a batch with MORE THAN ONE placement — a single click also
	// then gets its own entry, and that's correct. Until then, the old time window applies.
	ST._undoSeal = (why) => { ST._undoOpen = false; ST._undoSealWhy = why || ""; };
	ST._undoPushBuild = (x, y) => {
		try {
			const U = ST._undoState;
			if (!U || !Array.isArray(U.history)) return;
			// 0.9.224 (REPORT: "when placed blocks overlap existing ones, the undo takes with it
			// someone else's blocks"): EVERY position the player dragged over went into the history entry — including one
			// where something already stood and nothing new was created. Ctrl+Z runs removeAtPositions on those positions,
			// so it deleted blocks the player never placed. This is the same bug as with moving,
			// in 0.9.216: we recorded INTENT as fact. So now we ask the game whether something already stands in the cell.
			try {
				const SAu = structNs();
				if (SAu && SAu.getAtCell && SAu.getAtCell(ST.state, x, y)) {
					ST._undoSkip = (ST._undoSkip || 0) + 1;
					if (lim("undoSkip", 5)) log("undo history: skipping @" + x + "," + y + " — something is already there (total " + ST._undoSkip + ")");
					return;
				}
			} catch (e) { swallow("undoPushBuild", e); }
			const now2 = Date.now();
			const last = U.history[U.history.length - 1];
			ST._bwBuilds = (ST._bwBuilds || 0) + 1;
			// the boundary from the game (write batch OR the session.building.placing flag) always beats the timer, when it is
			const granicaZGry = ST._bwGood || ST._sealSeen;
			const wolnoSkleic = granicaZGry ? !!ST._undoOpen : (last && now2 - last.timestamp < 700);
			if (wolnoSkleic && last && last.type === "build" && last.__st && Array.isArray(last.positions)) {
				if (last.positions.length >= 200000) {
					if (lim("undoBuildCap", 3)) log("undo history: entry reached 200000 items — starting a new one");
				} else {
					// 0.9.224: the same cell twice in one drag = one placement
					const kk = x + "," + y;
					if (last.__seen && last.__seen.has(kk)) { last.timestamp = now2; return; }
					if (last.__seen) last.__seen.add(kk);
					last.positions.push({ x, y }); last.timestamp = now2; return;
				}
			}
			const wpis = { type: "build", positions: [{ x, y }], timestamp: now2, __st: 1 };
			wpis.__seen = new Set([x + "," + y]);
			ST._undoPush(wpis);
			ST._undoOpen = true;
			// 0.9.232 (REPORT "the client's Ctrl+Z deletes the host's blocks"): the game's history entry holds ONLY
			// POSITIONS. If in the meantime the host removed the client's block there and placed its own, the undo
			// would delete someone else's new structure. So we remember WHAT the client placed there, so that when
			// undoing we can compare it with what stands there now.
			try {
				if (!ST._myBuilt) ST._myBuilt = new Map();
				let typ = null;
				try { const SAb = structNs(); const st9 = SAb && SAb.getAtCell && SAb.getAtCell(ST.state, x, y); if (st9) typ = st9.type; } catch (e2) { swallow("undoPushBuild", e2); }
				ST._myBuilt.set(x + "," + y, { t: typ, ts: Date.now() });
				if (ST._myBuilt.size > 300000) ST._myBuilt.clear();
			} catch (e) { swallow("undoPushBuild", e); }
		} catch (e) { swallow("undoPushBuild", e); }
	};
	// 0.9.225 (WHY 0.9.223 DIDN'T WORK — verified in the game's bundle.js, not guessed):
	//   * the game TURNS OFF session.building.placing AT THE START of the batch: the code has
	//       { ...successfulBuilds:[] }, beginBatchWrite(), V(e)     gdzie V(e) => building.placing = !1
	//     meaning the flag drops BEFORE the structures are placed. So our guard was closing the entry before
	//     the action, and the placements themselves fell into the NEXT entry — which stayed open and merged
	//     with the start of the next action. Hence "undo takes away part of the previous action".
	//   * the game calls beginBatchWrite/endBatchWrite as MODULE functions (T.beginBatchWrite), while we
	//     wrapped a copy in the FH namespace — the same bug as once happened with pipe demolition.
	// The game itself announces the true end of an action, with the "structures:placed" event (emitted just before V(e),
	// together with afterStructuresPlaced). We hook into that. The second, independent signal is releasing
	// the mouse button — the same input the game sees; on a single click there is no batch.
	// 0.9.234 (PROBE, not a fix): in 0.5.7, after a move the client is left with a yellow, dashed frame.
	// The bundle has TWO places that draw exactly this style (rgba(255, 220, 50, 0.6), dash [6,4]):
	//   1) the outline of the source area when customData.mode === Moving,
	//   2) a function that draws a LIST OF ZONES, fed by two registries from other modules.
	// Our own diagnostics show that on the client customData is EMPTY (mode=-), so point 1
	// is ruled out — but I don't want to keep guessing. So we hook into the overlay's strokeRect and, on the first
	// yellow rectangle, we record a call trace: it will point to the exact game function.
	// The probe is cheap (a string comparison per call) and goes silent after three entries.
	function installYellowProbe(state) {
		try {
			if (ST._yProbe) return;
			const ctx = state.session && state.session.rendering && state.session.rendering.overlayContext;
			if (!ctx || typeof ctx.strokeRect !== "function") return;
			ST._yProbe = true;
			const oSR = ctx.strokeRect.bind(ctx);
			ctx.strokeRect = function (x, y, w, h) {
				try {
					const st = String(ctx.strokeStyle || "");
					// 0.9.236: twice in a row what was missing wasn't the budget, but the FILTER. During dragging this frame
					// is completely valid and was eating the whole limit in a fraction of a second, while we're only interested in
					// the unusual case: a frame drawn while NO movement is in progress. So we log only then —
					// during normal dragging the probe stays silent and costs nothing.
					const cdP = state.session && state.session.action && state.session.action.customData;
					const wRuchu = !!(cdP && cdP.mode === 3);
					if (st.indexOf("255, 220, 50") >= 0 && !wRuchu && lim("zoltaRamka", 10, 60000)) {
						const cd = cdP;
						const slad = (new Error("slad").stack || "").split("\n").slice(1, 7).map((l) => l.trim()).join("  <<  ");
						log("YELLOW FRAME WITHOUT MOVEMENT @" + Math.round(x) + "," + Math.round(y) + " " + Math.round(w) + "x" + Math.round(h)
							+ " | customData=" + (cd ? ("mode=" + cd.mode + " sel=" + ((cd.selectedStructures || []).length)) : "none")
							+ " | since move=" + (ST._mvSentT ? Math.round(performance.now() - ST._mvSentT) + "ms" : "none")
							+ " | trace: " + slad);
					}
				} catch (e) {}
				return oSR(x, y, w, h);
			};
			// 0.9.236: the same frame also has a FILL COMPONENT — a diagonal grid drawn as a pattern via
			// fillRect just before the outline. If it were this one staying on screen, the probe on strokeRect alone
			// would never have caught it. So we observe both calls.
			if (typeof ctx.fillRect === "function") {
				const oFR = ctx.fillRect.bind(ctx);
				ctx.fillRect = function (x, y, w, h) {
					try {
						const fs = ctx.fillStyle;
						const wzor = fs && typeof fs === "object";   // CanvasPattern = grid, not a plain color
						const cdP2 = state.session && state.session.action && state.session.action.customData;
						if (wzor && !(cdP2 && cdP2.mode === 3) && w > 8 && h > 8 && lim("zoltaKratka", 10, 60000)) {
							const slad2 = (new Error("slad").stack || "").split("\n").slice(1, 7).map((l) => l.trim()).join("  <<  ");
							log("YELLOW GRID WITHOUT MOVEMENT @" + Math.round(x) + "," + Math.round(y) + " " + Math.round(w) + "x" + Math.round(h)
								+ " | customData=" + (cdP2 ? ("mode=" + cdP2.mode) : "none") + " | trace: " + slad2);
						}
					} catch (e) {}
					return oFR(x, y, w, h);
				};
			}
			log("yellow-frame probe installed (outline + grid)");
		} catch (e) { log("yellow frame probe error:", e && e.message); }
	}
	// 0.9.237 (CAUSE of "yellow frame stays on the client" — pinpointed by the probe, then read from the bundle):
	// the call trace showed a function "te" drawing a LIST OF ZONES, not the outline from customData. This list is built like this:
	//     P.push(o);                       // o = the preview rectangle of the area being moved
	//     (0, U.a6)(r => { const a = P.indexOf(o); if (a !== -1) P.splice(a,1); ... perform the move });
	// meaning the game WRITES the rectangle in immediately, and only REMOVES it in a deferred task — the same one that
	// a paused client never runs (this is the same U.a6 queue that earlier caused
	// the client's move and manual drill not to work). The entry stays in P forever and the frame lingers.
	// We already handle the move ourselves, so we also have to clean up after this entry. On a paused client EVERY
	// entry in this list is by definition an orphan — the deferred task that would remove it never starts.
	function sprzatnijPodgladyPrzeniesienia(state) {
		try {
			const Q = ST._movePreviewQ;
			if (!Q || !Q.length) return;
			if (!isClientSync() || !ST.wsx.paused) return;   // on the host the queue works normally — we don't touch it
			const cd = state.session && state.session.action && state.session.action.customData;
			if (cd && cd.mode === 3) return;                 // a drag is in progress — this is not an orphan
			const n = Q.length;
			Q.length = 0;
			if (lim("sierotyPodgladu", 10, 60000)) log("cleaning up " + n + " orphaned preview transfers (deferred queue, client game will not start)");
		} catch (e) { swallow("preview cleanup", e); }
	}
	function installUndoBoundary(state) {
		try {
			if (ST._undoBoundInst) return;
			ST._undoBoundInst = true;
			try {
				ST.FH.events.on(state, "structures:placed", () => {
					ST._sealSeen = true;
					const U = ST._undoState, l2 = U && U.history && U.history[U.history.length - 1];
					const n2 = (l2 && l2.__st && Array.isArray(l2.positions) && l2.positions.length) || 0;
					ST._undoSeal("structures:placed");
					if (n2 && lim("sealDiag", 10)) log("undo history: end of game batch — entry has " + n2 + " items");
				});
				log("undo history: action boundary = game event structures:placed");
			} catch (e) { log("undo history: failed to hook structures:placed:", e && e.message); }
			try {
				window.addEventListener("mouseup", () => { ST._sealSeen = true; ST._undoSeal("mouseup"); }, true);
				window.addEventListener("blur", () => ST._undoSeal("blur"));
			} catch (e) { swallow("installUndoBoundary", e); }
		} catch (e) { log("undo boundary error:", e && e.message); }
	}
	ST._undoRmQ = null;
	// 0.9.201 (CAUSE of "outlines only break on the client's OWN actions"): on a client action the game
	// manages to write something to ITS OWN world buffers (removal via removeCells, rebuild on Ctrl+Z),
	// before we redirect that action to the host. On the host nothing changes in those places, so its
	// chunk is NOT dirty and the mirror never overwrites those cells — the client is left with its own, incorrect
	// write of the outline layer. Only the rolling sweep fixes this, i.e. after ~a minute.
	// The mod already has a ready channel for this: the "redirty" message (the host clears the row hash and resends the chunk).
	// It used to be used only after a game write — now we also report chunks from our own actions.
	function noteLocalDirty(x, y) {
		try {
			if (!isClientSync()) return;
			const st2 = ST.state; if (!st2) return;
			const { W, H } = worldBuffers(st2); if (!W) return;
			if (!(x >= 0 && y >= 0 && x < W && y < H)) return;
			if (!ST._redirtyQ) ST._redirtyQ = new Set();
			const d = chunkDims(W, H);
			const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = cx + dx, ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= d.cx || ny >= d.cy) continue;
				// 0.9.219 (REVISION 2.2): the limit was SILENT. There are 9216 chunks in the whole world, so 20000 is
				// unreachable — but if it ever were, it would mean some outlines will NOT be refreshed,
				// and I want to see that in the log, not guess from the symptom.
				if (ST._redirtyQ.size < 20000) ST._redirtyQ.add(nx + ny * d.cx);
				else if (lim("redirtyCap", 3)) log("redirty: queue full (20000) — some chunks will not be refreshed");
			}
			if (!ST._redirtyT) ST._redirtyT = setTimeout(flushRedirty, 600); // after the action, not during it
		} catch (e) {}
	}
	function flushRedirty() {
		ST._redirtyT = null;
		try {
			const set = ST._redirtyQ; ST._redirtyQ = null;
			if (!set || !set.size || !isClientSync()) return;
			const st2 = ST.state; if (!st2) return;
			const { W, H } = worldBuffers(st2); if (!W) return;
			const d = chunkDims(W, H), total = d.cx * d.cy;
			const m = new Uint8Array((total + 7) >> 3);
			let n = 0;
			for (const i of set) { if (i >= 0 && i < total) { m[i >> 3] |= 1 << (i & 7); n++; } }
			if (!n) return;
			net.send({ t: "redirty", m: b64enc(m), n: total });
			if (lim("redirtyDiag", 30))
				log("after own action: requesting host refresh " + n + " chunks (outlines)");
		} catch (e) { log("redirty (own action) error:", e && e.message); }
	}
	function queueUndoRemoval(items) {
		if (!items || !items.length) return;
		// 0.9.232: we filter out positions where something OTHER than what the client placed already stands. The type of the current
		// structure is read from the game (slimStruct took it from getAtCell right before sending), and the type of our own
		// placement comes from _myBuilt. Different types = this isn't our block, the undo doesn't apply to it.
		try {
			if (ST._myBuilt && ST._myBuilt.size) {
				const zostaw = [];
				let obce = 0;
				for (const it of items) {
					if (!it || !Number.isFinite(it.x)) { zostaw.push(it); continue; }
					const moj = ST._myBuilt.get((it.x | 0) + "," + (it.y | 0));
					if (moj && moj.t != null && it.type != null && moj.t !== it.type) { obce++; continue; }
					zostaw.push(it);
				}
				if (obce) {
					if (lim("undoObce", 10, 60000)) log("undo: skipping " + obce + " items — something other than what this player placed is already there");
					items = zostaw;
					if (!items.length) return;
				}
			}
		} catch (e) { swallow("queueUndoRemoval", e); }
		for (const it of items) if (it && Number.isFinite(it.x)) noteLocalDirty(it.x | 0, it.y | 0);
		if (!ST._undoRmQ) {
			ST._undoRmQ = [];
			setTimeout(() => {
				const list = ST._undoRmQ; ST._undoRmQ = null;
				if (!list || !list.length) return;
				let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
				for (const it of list) {
					if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
					if (it.x < x0) x0 = it.x; if (it.y < y0) y0 = it.y;
					if (it.x > x1) x1 = it.x; if (it.y > y1) y1 = it.y;
				}
				try {
					// ST-FIX: in batches of 800. The host runs structureBounds for EVERY structure (flooding
					// neighbours via getAtCell), so 2000 pieces in a single message is ~1.3 s in a single
					// frame on its side. Splitting it gives it breathing room between frames and doesn't block the rest of the sync.
					for (let i = 0; i < list.length; i += 800) {
						const m2 = { t: "act", k: "demolish", list: list.slice(i, i + 800), u: 1 }; // u=1: UNDO, not a demolition drag
						if (Number.isFinite(x0) && i === 0) m2.rect = { x0, y0, x1, y1 };
						net.send(m2);
					}
				} catch (e) {}
				log("CLIENT undo → demolish x" + list.length);
				// 0.9.204: ONLY NOW do we release placements from the same undo — the game does
				// exactly that: first removeAtPositions(target), then build(source). With overlapping
				// areas the order is critical, because the host refuses to build on an occupied cell.
				try {
					if (ST._placeQ && ST._placeQ.length) {
						if (ST._placeT) { clearTimeout(ST._placeT); ST._placeT = null; }
						const q2 = ST._placeQ; ST._placeQ = null;
						placeFlush(q2);
						log("CLIENT undo → place x" + q2.length + " (after removals)");
					}
				} catch (e) {}
			}, 0);
		}
		for (const it of items) ST._undoRmQ.push(it);
	}
	// ST-FIX (build throughput): a queue of the client's placements. It collects what was created in the
	// same frame, and sends it as a single "placeN" batch (the host handles it via the same
	// authoritative path as a single "place"). The keys are shortened — with 2000 blocks, field names weigh in too.
	ST._placeQ = null;
	function placePart(o) {
		const e = { t: o.type, x: o.x, y: o.y };
		if (o.data != null) e.d = o.data;
		if (o.cl != null) e.c = o.cl;
		if (o.fl != null) e.f = o.fl;
		if (o.flc) e.fc = 1;
		// 0.9.227 (WHY 0.9.225/226 DIDN'T WORK): the color was attached to the "place" message,
		// but PRACTICALLY EVERY client placement goes through the "placeN" batch — and that function only packs
		// selected fields, and "col" simply wasn't among them. The host received a packet without color and stayed
		// with its own. The key "c" is already taken by clearance, so the color goes as "cr".
		// 0.9.228: null also has meaning (no color), so we pack it via a presence marker
		if (o.col !== undefined) e.cr = o.col === null ? 0 : o.col;
		if (o.u) e.u = 1;
		return e;
	}
	function placeFlush(q) {
		if (!q || !q.length) return;
		try {
			// 0.9.217: in 0.9.216 the stamp stood AFTER a brace-less loop and reached for "i" outside its scope —
			// a ReferenceError was thrown, which the same empty catch swallowed whole. Sending worked,
			// but there was no measurement. This is exactly the case described in point 3.2 of the revision, so the catch no longer stays silent.
			if (q.length === 1) net.send(q[0]);
			else {
				for (let i = 0; i < q.length; i += 200)
					net.send({ t: "act", k: "placeN", l: q.slice(i, i + 200).map(placePart) });
			}
			stampAct("placeN", q.length);
		} catch (e) { log("placeFlush error:", e && e.message); }
		// AFTER the pipe batch: the host must have them before it replays the drag (otherwise it won't find anything along the path)
		try {
			const pr = ST._pipeRunQ; ST._pipeRunQ = null;
			if (pr) for (const m of pr) net.send(m);
		} catch (e) { log("pipe drag send error:", e && e.message); }
		if (lim("plQDiag", 60)) log("CLIENT placeN: " + q.length + " pcs. in one batch");
	}
	function queuePlace(m) {
		if (!ST._placeQ) {
			ST._placeQ = [];
			// 50 ms groups ~3 drag frames into one batch. We don't give more than that: the client sees
			// its own build only after host confirmation, so it feels this delay with its own eyes.
			ST._placeT = setTimeout(() => { ST._placeT = null; const q = ST._placeQ; ST._placeQ = null; placeFlush(q); }, 50);
		}
		ST._placeQ.push(m);
		try { if (m && Number.isFinite(m.x)) noteLocalDirty(m.x | 0, m.y | 0); } catch (e) { swallow("queuePlace", e); }
		// 0.9.204 (CAUSE of "undoing a large move makes most structures disappear"):
		// the immediate dump at 400 pieces got ahead of sending the REMOVALS from the same undo
		// (those go through setTimeout 0). With overlapping areas the host received a build for
		// cells it hadn't freed yet, and refused — structures were lost. Small undos
		// worked, because they didn't cross the 400 threshold and waited for their 50 ms timer, i.e. AFTER the removals.
		const inUndo = !!(ST._undoRmQ || (ST._inGameUndo && ST._inGameUndo()));
		if (!inUndo && ST._placeQ.length >= 400) {   // a sudden burst — we don't wait for the timer
			if (ST._placeT) { clearTimeout(ST._placeT); ST._placeT = null; }
			const q = ST._placeQ; ST._placeQ = null; placeFlush(q);
		}
	}
	ST._sprayFlag = () => { ST._sprayCtx = 1; queueMicrotask(() => { ST._sprayCtx = 0; }); };
	// HOST HEARTBEAT (fix G4): when the host pauses (menu), frame:update does NOT fire → the whole sync freezes
	// without a word. setInterval is a JS timer — it works despite the sim's pause. The client gets a hb and knows what's happening.
	setInterval(() => {
		try {
			if (ST.net.role === "host" && ST.peers.size && ST.state && net) {
				const p = !!(ST.state.session && ST.state.session.paused);
				net.send({ t: "hb", p });
			}
		} catch (e) {}
	}, 1000);

	log("Renderer mod loaded", VER);
	// 0.9.161: the renderer's EXCEPTION RECORDER — every uncaught error and rejected promise ends up
	// in the log file (the first 20). Without this a "static screen" left no trace at all.
	window.addEventListener("error", (ev) => {
		if ((ST._winErrN = (ST._winErrN || 0) + 1) > 20) return;
		try { log("WINDOW ERROR:", String(ev.message).slice(0, 300), "@" + String(ev.filename || "").split("/").pop() + ":" + ev.lineno, String(ev.error && ev.error.stack || "").split("\n").slice(0, 5).join(" | ")); } catch (e) {}
	});
	window.addEventListener("unhandledrejection", (ev) => {
		ST._winRejN = (ST._winRejN || 0) + 1;
		// 0.9.161b: we KEEP the reason in memory (ST._lastRejection) — the file log could sometimes write nothing,
		// and it's exactly the rejection that breaks the game's promise-based frame loop (static screen with no trace).
		let m = "?", stk = "";
		try { m = String((ev.reason && (ev.reason.message || ev.reason)) || "?").slice(0, 400); } catch (e) {}
		try { stk = String((ev.reason && ev.reason.stack) || "").split("\n").slice(0, 8).join(" | "); } catch (e) {}
		ST._lastRejection = { t: Date.now(), msg: m, stack: stk };
		if (ST._winRejN <= 20) { try { log("UNHANDLED REJECTION:", m, stk); } catch (e) {} try { console.error("[SandTogether] REJECTION:", m, stk); } catch (e) {} }
	});

	// ------------------------------------------------------------------
	// Tools
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
	// access to the world buffers (defensively: {data:...} or a bare array)
	const arr = (v) => (v && v.data && v.data.buffer ? v.data : v && v.buffer ? v : null);
	function worldBuffers(state) {
		const sh = state.shared || {};
		const map = arr(sh.mapData), wall = arr(sh.wallData), shadow = arr(sh.shadowMap), auth = arr(sh.authorization);
		// sim.cellIds (Uint32 per cell) = a SEPARATE layer from mapData; this is what the player's collision reads
		// (FH.player.isPositionClear -> isCellTerrain -> getCellId). Without syncing it the client SEES the dug-out
		// terrain, but it's still physically "solid". Sync = the client can walk into the hole. (contribution by dotNine)
		const sim = sh.sim && sh.sim.cellIds;
		// elementData.type: maps the element's INDEX → type. Grabber/vacuum read it via getResolvedTypeFromCellId
		// (cellId→index→type). The mirror syncs cellIds but NOT elementData → the client doesn't recognize elements
		// (the grabber doesn't pick them up). Syncing this layer (v4) fixes the grabber. index = cellId - ELEMENTS_MIN.
		const etype = (sh.sim && sh.sim.elementData && sh.sim.elementData.type) || null;
		const W = (sh.mapData && sh.mapData.width) || (state.store.world && state.store.world.size && state.store.world.size.width) || 0;
		const H = (sh.mapData && sh.mapData.height) || (state.store.world && state.store.world.size && state.store.world.size.height) || (map && W ? map.length / 4 / W : 0);
		return { map, wall, shadow, auth, sim, etype, W, H };
	}
	const ELEMENTS_MIN = 1000001, ELEMENTS_MAX = 2000000; // the cellId range for elements (Lk.ELEMENTS in build 0.5.4)
	// A valid element type for the network: an integer > 0. Filters out null/undefined/0 (an empty tank slot,
	// T[o+2] out-of-bounds on a desynced client) — otherwise the host does createAt(...,undefined) and crashes.
	const validElement = (v) => Number.isInteger(v) && v > 0;
	// PER-PLAYER PERSISTENCE (G7-lite): joining used to reset the client to the player from the HOST's save (position,
	// equipment). We save the client's profile per host-world (localStorage, key = trusted wid)
	// and restore it after the mirror starts. Resources/upgrades are shared (team-wide) — those don't need a profile.
	function profileSave(state) {
		try {
			if (!isClientSync() || !ST.wsx.paused || !ST._trustedWid) return;
			const p = state.store.player;
			if (!p || typeof p.x !== "number") return;
			const prof = { x: p.x, y: p.y, t: Date.now() };
			// 0.9.131: we do NOT save the equipment — it belongs to the host's world, not the local profile
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
			// 0.9.131: we do NOT restore the equipment. Progress (tools, upgrades, buildings) is the property
			// of the host's world — the client gets it from the save. Swapping in a local copy gave back tools
			// from a previous game and cooldowns from a foreign clock (tools locked forever).
			if (prof.inv) { delete prof.inv; try { localStorage.setItem("st_prof_" + wid, JSON.stringify(prof)); } catch (e) {} log("Profile: removing saved inventory — progress comes from the host's world"); }
			log("Client profile restored for world", wid, "(position " + Math.round(prof.x) + "," + Math.round(prof.y) + ")");
		} catch (e) {}
	}

	// Grabber (client): zero out the cell's cellId locally and remember it, so the grabber doesn't take it again
	// before the host confirms the removal via the mirror. Called only on the client side (the one rendering the mirror).
	function grabClearLocal(state, x, y) {
		try {
			const { sim, W, H } = worldBuffers(state);
			if (!sim || !W || x < 0 || y < 0 || x >= W || y >= H) return;
			const idx = x + y * W;
			const sim32 = new Uint32Array(sim.buffer, sim.byteOffset, W * H);
			const cid = sim32[idx]; // cellId of the grabbed element — to distinguish "the same one" vs "a new element fell in"
			sim32[idx] = 0;
			ST._placedCells.delete(idx); // GRAB clears any PLACE sentinel of the same cell (otherwise the maps clash → re-grab lock)
			ST._grabbedCells.set(idx, { ts: performance.now(), cid });
			if (lim("grabDiag", 60)) log("GRAB pick @", x, y, "(cellId->0, forward)");
		} catch (e) {}
	}
	// Grabber PLACE (client): write a sentinel (non-zero cellId) into the cell where we placed the element —
	// the placement loop reads LOCAL cellIds, and it would target the "still empty" cell (mirror lag) again
	// next tank slot; host createAt no-ops on an occupied one → the second element would be lost.
	// cellIds do NOT drive the render (mapData) — the sentinel only affects logic; the mirror will overwrite it with the real id.
	const GRAB_SENTINEL = 1;
	function grabSetLocal(state, x, y) {
		try {
			const { sim, W, H } = worldBuffers(state);
			if (!sim || !W || x < 0 || y < 0 || x >= W || y >= H) return;
			const idx = x + y * W;
			new Uint32Array(sim.buffer, sim.byteOffset, W * H)[idx] = GRAB_SENTINEL;
			ST._grabbedCells.delete(idx); // PLACE clears any GRAB marker of the same cell
			ST._placedCells.set(idx, performance.now());
			if (lim("grabDiag", 60)) log("GRAB place @", x, y, "(sentinel, forward)");
		} catch (e) {}
	}
	// Adaptive mirror protection period: 3×RTT+300ms (min 1200, max 3000) — at 300ms+ ping
	// a fixed 600ms was shorter than the act→host→chunk round trip, and the duplicate bug came back under lag.
	function grabGraceMs() {
		let ping = 0;
		for (const p of ST.peers.values()) if (p.ping != null) { ping = p.ping; break; } // the client has 1 peer (the host)
		return Math.min(3000, Math.max(1200, 3 * ping + 300));
	}
	// preferredNs: some names exist in SEVERAL FH namespaces and are NOT the same thing.
	// Confirmed (dotNine): FH.world.excavate "looks fine but does nothing", while
	// FH.patterns.excavate (calls the real DN) actually digs. That's why we check preferredNs FIRST.
	function findApi(fnName, preferredNs) {
		const FH = ST.FH;
		if (!FH) return null;
		// preferredNs: string or array (names differ between builds: 0.5.3=patterns, current=excavation)
		const prefs = Array.isArray(preferredNs) ? preferredNs : (preferredNs ? [preferredNs] : []);
		for (const ns of prefs) if (FH[ns] && typeof FH[ns][fnName] === "function") return FH[ns][fnName].bind(FH[ns]);
		for (const ns of Object.keys(FH)) {
			try {
				if (FH[ns] && typeof FH[ns][fnName] === "function") return FH[ns][fnName].bind(FH[ns]);
				// one level deeper (e.g. FH.world.patterns.excavate)
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
	// Network
	// ------------------------------------------------------------------
	const net = window.sandtogetherNet;
	if (!net) log("WARNING: missing window.sandtogetherNet — preload out of date?");
	// 0.9.268: the congestion controller only ever sees the world mirror, but the socket carries everything —
	// structure snapshots, resource sections, action replays. Anything else that goes out is a blind spot: it
	// occupies the same reliable ordered channel and the mirror queues behind it, while every number the
	// controller reads still says the link is healthy. So we count bytes per message type and print the
	// heaviest non-mirror senders next to the mirror's own stats. Measurement only, no behaviour change.
	// 0.9.269: the 0.9.268 attempt wrapped net.send in place and silently did nothing — window.sandtogetherNet
	// comes across the contextBridge, and those objects are frozen, so the assignment failed without an error
	// and every log line came back with no tx figure at all. Now the counting is an explicit call at the send
	// sites that can actually be big, which needs no monkey patching to work.
	function txNote(typ, n) {
		try { const tally = ST._tx || (ST._tx = {}); tally[typ] = (tally[typ] || 0) + (n | 0); } catch (e) {}
	}

	const setStatus = (text, color) => {
		if (ST._hud) { const el = ST._hud.querySelector("#st-status"); el.textContent = text; el.style.color = color || "#8f8"; }
	};
	const setSyncInfo = (text) => {
		if (ST._hud) ST._hud.querySelector("#st-sync").textContent = text;
	};
	// chat: append a line (max 5 visible), text via textContent (zero HTML injection)
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
				ST.net.lobbyId = ev.lobbyId || null; ST._autoSentWid = null; // reset auto-send; remember lobbyId
				resetWorldQueue(); // new host session starts clean, peer-connected re-queues the full world
					updateLobbyIdDisplay();
					if (ev.transport === "steam") showInviteButton(true);
			} else if (ev.kind === "joined") {
				ST.net.role = "client"; ST.net.transport = ev.transport;
				ST.wsx.everApplied = false; ST.wsx.mismatchLogged = false; ST.wsx.wasInWorld = false; // new client session
				ST._lastAppliedSq = null; ST._lastAckT = 0; // new host numbers its batches from zero, a stale ack would be wrong
				ST._mirrorKickN = 0; ST._mirrorKickT = 0; if (ST._structSig) ST._structSig.clear(); if (ST._snapRest) ST._snapRest.length = 0; try { sessionStorage.removeItem("st_rescue_n"); } catch (e) {} if (ST._applyQ) ST._applyQ.length = 0; ST._greeted.clear(); ST._worldRxDone = false; ST._worldReqN = 0; ST._worldReqT = performance.now(); ST._autoResynced = false; ST._autoLoadedOnce = false; // fresh cycle; the 1st world-req at the earliest 15 s after join (host's auto-send gets a head start)
				ST._trustedWid = null; ST._pendingTrustUntil = 0;
				// Transport label on the client: public address = "Internet", private/VPN = "LAN". Previously it always
				// came out as "LAN" and players thought the mod was switching them somewhere (Shadow City Empire, 24.08.2026).
				ST._directMode = ev.transport === "ws" && !isLocalAddr(ev.host);
				ST._directAddr = null; autoLoadClear(); // new client session = fresh auto-load guard (0.9.72)
				ST._gotHostWorld = false; // CRITICAL: world trust does NOT carry over between sessions (different host = different world; without a reset the mirror would overwrite the wrong world)
				ST._fireQ = []; ST._cryoQ = []; ST._grabbedCells.clear(); ST._placedCells.clear(); ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = []; if (ST._projSent) ST._projSent.clear(); // state from the previous session = different coordinates/world
				// own nick (localStorage) broadcast via the existing hello protocol — no changes to the IPC bridge
				if (ST._nickCustom) { try { net.send({ t: "hello", nick: ST._nickCustom }); } catch (e) {} }
				setStatus(t("joined", ev.transport));
			} else if (ev.kind === "peer-hello" || ev.kind === "peer-connected") {
				const isNew = !ST.peers.has(ev.id);
				if (isNew) ST.peers.set(ev.id, { nick: ev.nick || "?", x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() });
				if (ev.nick) ST.peers.get(ev.id).nick = ev.nick;
				if (ev.kind === "peer-hello") addChat("★", t("chat_joined", ev.nick || "?")); // visible information about WHO joined
				// 0.9.85: EXACTLY ONCE per peer — replying with hello on every peer-hello created a loop
					if (ST._nickCustom && !ST._greeted.has(ev.id)) {
						ST._greeted.add(ev.id);
						try { net.send({ t: "hello", nick: ST._nickCustom, greet: 1 }, ev.id); } catch (e) {}
					}
				setStatus(t("players", ST.peers.size + 1));
				if (ST.net.role === "host") {
					const hostInWorld = ST.state && ST.state.store && ST.state.store.scene && ST.state.store.scene.active !== 1;
					// new player -> full world (mirror); ONLY when the host is in the world — in the menu, dimensions/buffers
					// belong to the menu scene (we don't stream them anyway, see the gate in the frame hook).
					// 20 s cooldown on AUTO-sending the save: peer-hello cycle (reconnects under overloaded P2P)
					// was spamming transfers = a reload loop on the client (ZeroHazard). The manual "Send World"
					// and the client's world-req work without a cooldown (they have their own guards).
					// 0.9.279: was this peer here a moment ago? Then this is a transport reconnect, and the
					// mirror's model of what the client holds is still valid: only what was in flight at the
					// instant of the drop can have been lost, and we know exactly which chunks those were.
					// Re-queueing all 9216 with the row hashes cleared costs a save-sized flood for nothing.
					// A peer that genuinely restarted its game announces itself a second later with no world
					// generation of ours, and THAT path still sends the save and the full world, as before.
					const wrocilT = ST._ostatnioZnikl && ST._ostatnioZnikl.get(ev.id);
					const powrot = wrocilT !== undefined && performance.now() - wrocilT < 90000;
					if (hostInWorld && powrot) {
						const wRe = ST.wsx;
						let wroc = 0;
						if (wRe && wRe.unacked && wRe.unacked.size) {
							for (const rec of wRe.unacked.values()) {
								if (!rec || !rec.idx) continue;
								for (const i of rec.idx) {
									if (wRe.rowH) wRe.rowH.delete(i);        // the client may never have received these
									if (wRe.rowPrev) wRe.rowPrev.delete(i);  // so no cell delta may be based on them
									wRe.pending.add(i); wroc++;
								}
							}
						}
						resetAckBaseline(ev.id, "powrot pira po zerwaniu polaczenia");
						log("peer " + ev.id + " came back after " + Math.round(performance.now() - wrocilT)
							+ " ms: reconnect, not a join. Re-queued " + wroc + " chunks that were in flight.");
					} else if (hostInWorld) {
						resetAckBaseline(null, "powitanie/pelny swiat"); enqueueFullWorld();
						// 0.9.185 (CAUSE of the second, unnecessary transfer): this event does NOT know whether the client
						// is already on our world — only the "hello" MESSAGE handler (gen/wid/ready) knows that,
						// which arrives a few ms later. In the 15:42:06 log the event fired sendWorld, and
						// the message handler immediately afterward decided "client is ALREADY on my world — no save":
						// a second 675 KB export and 30 s of mirror silence for nothing. So we wait 1.5 s and
						// only send the save when the message handler hasn't weighed in (old mod
						// client without "hello"). For a new player nothing is delayed — the handler sends the save anyway.
						const pid = ev.id;
						setTimeout(() => {
							try {
								if (ST.net.role !== "host" || !ST.peers.has(pid)) return;
								const sc = ST.state && ST.state.store && ST.state.store.scene;
								if (!sc || sc.active === 1) return;
								const hs = ST._helloMsgT && ST._helloMsgT.get(pid);
								if (hs && performance.now() - hs < 5000) return; // the "hello" handler already decided
								if (performance.now() - (ST._autoSendT || 0) > 20000) { ST._autoSendT = performance.now(); log("auto-send save (no hello message from " + pid + ")"); sendWorld(); }
								else log("auto-send save SKIPPED (cooldown 20 s since previous)");
							} catch (e) {}
						}, 1500);
					}
				}
			} else if (ev.kind === "peer-disconnected") {
				if (ST.state) profileSave(ST.state); // persist the profile BEFORE any state change (G7-lite)
				const gone = ST.peers.get(ev.id);
				if (gone) addChat("★", t("chat_left", gone.nick || "?"));
				// 0.9.279: remember the drop. A Steam P2P session can blip for a few milliseconds and come
				// straight back, and without this the return looks exactly like a stranger arriving.
				if (!ST._ostatnioZnikl) ST._ostatnioZnikl = new Map();
				ST._ostatnioZnikl.set(ev.id, performance.now());
				ST._greeted.delete(ev.id); ST.peers.delete(ev.id); removePeerPuppet(ev.id);
				setStatus(t("player_left", ST.peers.size + 1), "#fa5");
				// THE CLIENT STAYS PAUSED — a silent unpause created a forked world (the player "kept playing"
				// locally without knowing everything would be lost on the next join). Want to play solo → Stop.
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
			else if (ev.kind === "error" && /ECONNREFUSED/i.test(String(ev.message || "")) && /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/.test(String(ev.message || ""))) {
				// 0.9.133: public address + refusal = usually an attempt to connect to your own IP from the same network
				const ip = String(ev.message).match(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/);
				const A = ip ? +ip[1] : 0, B = ip ? +ip[2] : 0;
				const priv = A === 127 || A === 10 || (A === 192 && B === 168) || (A === 172 && B >= 16 && B <= 31);
				if (!priv) { setStatus(t("hairpin_hint"), "#fd5"); log("HINT: refused connection to public IP — from the same network use the host's local address (router does not do loopback)"); }
			}
			if (ev.kind === "error") setStatus(t("error", ev.message), "#f66");
			updatePanel(); // badge/buttons/player list reflect EVERY network state change
			if (ST._lobbyOpen) renderLobby(false);
		});
				// 0.9.111: with a binary frame, world data arrives alongside the header, already as bytes
		net.onMsg(({ from, msg, bin }) => {
			if (bin && msg) msg.__bytes = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
			handleMsg(from, msg);
		});
		net.status().then((s) => {
			ST.net.role = s.role; ST.net.transport = s.transport;
			try { ST._nickCustom = localStorage.getItem("st_nick") || null; } catch (e) { ST._nickCustom = null; }
			ST._myNick = ST._nickCustom || s.myNick || null; // own nick > Steam nick > default (feedback from TCentraL: LAN = "Player" permanently)
			ST._gameFp = s.gameFp || null; // game build fingerprint (guard against different builds between players)
			for (const p of s.peers) { const old = ST.peers.get(p.id); ST.peers.set(p.id, Object.assign({ x: 0, y: 0, tx: 0, ty: 0 }, old || {}, { nick: p.nick, lastSeen: performance.now() })); } // 0.9.82: keep the modVer/ping of a peer we already know
			// 0.9.76 HANDSHAKE: the renderer came up (game start OR a reload after loading a world).
			// The connection lives in the main process, so the host does NOT know we lost the entire session state —
			// we tell it explicitly and state which world we're on (this decides: stream or save).
			if (s.role === "client") {
				// we wait for the frame hook to capture the game state — otherwise we'd send wid=null and the host
				// would needlessly send the ENTIRE SAVE (bug 0.9.76). Max ~20 s, then we report in anyway.
				let tries = 0;
				const announce = () => {
					const st = ST.state;
					if (!st && ++tries < 40) return void setTimeout(announce, 500);
					try {
						const wid = st && st.store.meta && st.store.meta.worldId, sc = st && st.store.scene && st.store.scene.active;
						net.send({ t: "hello", nick: ST._myNick || "Player", wid: wid || null, scene: sc || null, ready: 1, gen: ST._rxWorldGen || null });
						log("HANDSHAKE: renderer ready — announcing myself to host (wid=" + wid + " scene=" + sc + ")");
					} catch (e) {}
				};
				setTimeout(announce, 800);
			}
			// 0.9.262: these two lines used to carry hardcoded Polish text, bypassing the language table
			// every other status message goes through. Now they use t() like the rest.
			if (s.role === "host") setStatus(t("status_host", s.transport, s.peers.length + 1));
			else if (s.role === "client") setStatus(t("status_client", s.peers.length + 1));
		}).catch(() => {});
	}

	// Auto-load guard resistant to a page reload (see the comment at auto-load). Key per host save,
	// TTL 30 min (after that time a deliberate re-join/load should work normally).
	function autoLoadDoneBefore(saveId) {
		try { const v = Number(sessionStorage.getItem("st_autoload_" + saveId) || 0); return v > 0 && Date.now() - v < 30 * 60 * 1000; } catch (e) { return false; }
	}
	function autoLoadMark(saveId) {
		try { sessionStorage.setItem("st_autoload_" + saveId, String(Date.now())); } catch (e) {}
	}
	function autoLoadClear() {
		try { const del = []; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k && k.indexOf("st_autoload_") === 0) del.push(k); } del.forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
	}
	// ST-DIAG: client -> host log reporting channel. Without this the client's state is invisible —
	// and that's exactly where the "red tiles" bug lives.
	function diagToHost(txt) {
		try {
			if (ST.net.role !== "client") return;
			ST._diagN = (ST._diagN || 0) + 1;
			if (ST._diagN > 120) return;
			net.send({ t: "diag", m: String(txt).slice(0, 300) });
		} catch (e) {}
	}
	function handleMsg(from, msg) {
		if (msg.t === "relay") { handleMsg(msg.from, msg.msg); return; }
		// ST-FIX: peer ALIVE marker on any message (pong goes out every 1 s regardless of frames).
		// lastSeen only updates on "pos", which goes still when the player is sitting in the menu — not fit for a timeout.
		try { const _pk = ST.peers.get(from); if (_pk) _pk.lastNet = performance.now(); } catch (e) {}
		if (msg.t === "ping") { try { net.send({ t: "pong", ts: msg.ts }, from); } catch (e) {} return; }
		if (msg.t === "pong") {
			const p = ST.peers.get(from);
			if (p && typeof msg.ts === "number") { const rtt = performance.now() - msg.ts; p.ping = p.ping != null ? Math.round(p.ping * 0.7 + rtt * 0.3) : Math.round(rtt); }
			return;
		}
		if (msg.t === "diag") { log("CLIENT-DIAG od " + from + ": " + msg.m); return; }
		if (msg.t === "pos") {
			let p = ST.peers.get(from);
			const now0 = performance.now();
			if (!p) { p = { nick: "?", x: msg.x, y: msg.y, tx: msg.x, ty: msg.y, vx: 0, vy: 0, tUpdate: now0, lastSeen: 0 }; ST.peers.set(from, p); }
			if (!p._gotPos) { p._gotPos = true; log("first position from", from, "->", msg.x, msg.y); }
			// velocity from the ACTUAL dt (on a large gap we assume 0, so dead-reckoning doesn't "launch" the player) (dotNine)
			const rawDt = now0 - (p.tUpdate || now0);
			if (rawDt < 1 || rawDt > 1500) { p.vx = 0; p.vy = 0; }
			else { p.vx = (msg.x - p.tx) / rawDt; p.vy = (msg.y - p.ty) / rawDt; const vm = Math.hypot(p.vx, p.vy); if (vm > 3) { const s = 3 / vm; p.vx *= s; p.vy *= s; } }
			p.tx = msg.x; p.ty = msg.y; p.tUpdate = now0; p.lastSeen = now0;
			// 0.9.281: the peer's visible rectangle in cells [x0,y0,x1,y1], measured on its side from the
			// renderer itself, so it already accounts for the zoom and for the window size.
			if (Array.isArray(msg.vr) && msg.vr.length === 4) { p.vr = msg.vr; p.vrT = now0; }
			p.tools = msg.tools || [];
			if (msg.facing === 1 || msg.facing === -1) p.syncedFacing = msg.facing;
			p.aim = typeof msg.aim === "number" ? msg.aim : 0;
			p.trailAlpha = typeof msg.trail === "number" ? msg.trail : 0;
			// action preview (pose phantom / grabber reticle) — cursor in the world + build intent
			p.mwx = typeof msg.mwx === "number" ? msg.mwx : null;
			p.mwy = typeof msg.mwy === "number" ? msg.mwy : null;
			p.mcx = typeof msg.mcx === "number" ? msg.mcx : null;   // ST-FIX: cursor in cells
			p.mcy = typeof msg.mcy === "number" ? msg.mcy : null;
			// ST-FEAT: build intent is STICKY. Previously every frame with bt=null immediately cleared p.bt,
			// so even a brief gap in detection meant the phantom never managed to show despite btT.
			if (msg.bt != null) {
				p.bt = msg.bt;
				p.btT = performance.now();
				p.boffs = Array.isArray(msg.boffs) ? msg.boffs : [[0, 0]];
				p.bw = typeof msg.bw === "number" ? msg.bw : 1;
				p.bh = typeof msg.bh === "number" ? msg.bh : 1;
			} else if (p.btT && performance.now() - p.btT > 400) { p.bt = null; p.btT = 0; }
			p.dw = typeof msg.dw === "number" ? msg.dw : 0;   // shovel area
			p.dh = typeof msg.dh === "number" ? msg.dh : 0;
			p.sk = typeof msg.sk === "number" ? msg.sk : 0;   // ST-FIX: category of the selected item
			p.sid = msg.sid != null ? msg.sid : null;
			p.gv = typeof msg.gv === "number" ? msg.gv : 0;   // side of the grabber grid
			if (typeof msg.dax === "number") { p.dax = msg.dax; p.day = msg.day; p.daT = performance.now(); }
			else { p.dax = null; }
			p.bsx = typeof msg.bsx === "number" ? msg.bsx : null;   // ST-FEAT: poczatek przeciagniecia
			p.bsy = typeof msg.bsy === "number" ? msg.bsy : null;
			p.bm = typeof msg.bm === "string" ? msg.bm : null;
			p.bd = typeof msg.bd === "string" ? msg.bd : null;
			p.ct = typeof msg.ct === "number" ? msg.ct : 0;         // 0.9.196: 1=rozbiorka, 2=zaznaczanie
			p.pm = msg.pm ? 1 : 0;                                  // 0.9.213: the peer is in pipe mode
			// 0.9.187: selection frame (the "Select/Copy" tool) straight from the game — hook _bpSelRect
			if (Array.isArray(msg.sr) && msg.sr.length === 4) { p.srect = msg.sr; p.srectT = performance.now(); }
			else if (p.srectT && performance.now() - p.srectT > 400) { p.srect = null; p.srectT = 0; }
			// 0.9.188: DRAG PREVIEW for the copier and demolition. Both keep it in the same place:
			// session.action.customData.pos = {start,end} in world coordinates — so no hook in the bundle
			// is needed, the game state is enough.
			if (Array.isArray(msg.dr) && msg.dr.length === 5) { p.drag = msg.dr; p.dragT = performance.now(); }
			else if (p.dragT && performance.now() - p.dragT > 300) { p.drag = null; p.dragT = 0; }
			if ((ST._prevDiag = (ST._prevDiag || 0) + 1) % 300 === 1 && ST._prevDiag < 9000)
				if (lim("previewDiag", 3)) log("PREVIEW-DIAG from " + (p.nick || from) + ": sel=" + msg.sk + "/" + JSON.stringify(msg.sid)
					+ " bt=" + msg.bt + " bw/bh=" + msg.bw + "/" + msg.bh
					+ " dig=" + msg.dw + "x" + msg.dh + " grabV=" + msg.gv + " tank=" + ((p.gslots && p.gslots.length) || 0)
					+ " tools=[" + (msg.tools || []).join(",") + "]");
			if (p.x === 0 && p.y === 0) { p.x = msg.x; p.y = msg.y; }
		} else if (msg.t === "orphanClean") {
			// ST-FIX: the host confirmed there is NO structure in these cells — the red tile is garbage
			if (ST.net.role !== "client" || !ST.state) return;
			try {
				const TR = ST.FH && ST.FH.terrains;
				const cells = Array.isArray(msg.cells) ? msg.cells : [];
				if (TR && TR.removeAt) {
					// ST-FIX: the client REPORTS 4x4 block anchors (one entry per block), but was only cleaning THOSE
					// a single cell. The remaining 15 cells of the block stayed red, the next scan reported
					// the same block — over and over. We clean the whole block.
					ST._applyingNet = true;
					let done = 0;
					try {
						for (const c of cells) {
							if (!Array.isArray(c)) continue;
							const cx = c[0] | 0, cy = c[1] | 0;
							for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) { TR.removeAt(ST.state, cx + dx, cy + dy); done++; }
						}
					} finally { ST._applyingNet = false; }
					if (cells.length) log("CLEANUP (with host's consent): " + cells.length + " blocks / " + done + " cells");
				}
			} catch (e) { log("orphanClean error:", e && e.message); }
		} else if (msg.t === "bprev") {
			// ST-FEAT: peer's build-preview positions
			// ST-FIX: the packet is compressed (base + type dictionary + flat offset list). The version
			// with [x,y,type] per position grew so fast that the list had to be cut to 200 positions —
			// with a larger rectangle the receiver was missing the tail and the shape would "fall apart".
			const p = ST.peers.get(from);
			if (p) {
				let out = null;
				try {
					const fl = msg.p;
					if (Array.isArray(fl) && fl.length >= 3 && Array.isArray(msg.b) && Array.isArray(msg.ty)) {
						const bx = msg.b[0] | 0, by = msg.b[1] | 0;
						out = [];
						const cls2 = Array.isArray(msg.cl) ? msg.cl : null;
						const ci2 = Array.isArray(msg.ci) ? msg.ci : null;
						for (let i4 = 0, j4 = 0; i4 + 2 < fl.length; i4 += 3, j4++) {
							// 0.9.216: the fourth element = color. A single color for the whole batch goes without an index list.
							let col = null;
							if (cls2 && cls2.length) col = cls2[ci2 ? (ci2[j4] | 0) : 0] || null;
							const mk4 = Array.isArray(msg.pm) ? msg.pm[j4] : undefined;
							const br4 = Array.isArray(msg.br) ? (msg.br[j4] | 0) : 0;
							out.push([bx + (fl[i4] | 0), by + (fl[i4 + 1] | 0), msg.ty[fl[i4 + 2] | 0], col, mk4, br4]);
						}
						if (!out.length) out = null;
					}
				} catch (e) { out = null; }
				p.bprev = out;
				p.bprevT = performance.now();
				// ST-FIX: direction arrow straight from the game (hook _bpArw) — [cellX, cellY, angleInDegrees]
				p.arw = Array.isArray(msg.a) && msg.a.length === 3 ? msg.a : null;
			}
		} else if (msg.t === "dmask") {
			// ST-FIX: the pira dig mask -> a list of cells relative to the cursor
			const p = ST.peers.get(from);
			if (p) {
				p.dcells = null;
				try {
					const rows = Array.isArray(msg.m) ? msg.m : null;
					if (rows && rows.length) {
						const h = rows.length, w = String(rows[0]).length, out = [];
						for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (String(rows[y])[x] === "1") out.push([x - (w - 1) / 2, y - (h - 1) / 2]);
						if (out.length) p.dcells = out;
					}
				} catch (e) {}
			}
		} else if (msg.t === "gtank") {
			// ST-FEAT: peer's grabber tank layout — we draw it 1:1 at their cursor
			const p = ST.peers.get(from);
			if (p) { p.gslots = Array.isArray(msg.s) ? msg.s : []; p.gslotsT = performance.now(); }
		} else if (msg.t === "hello") {
			const p = ST.peers.get(from) || { x: 0, y: 0, tx: 0, ty: 0, lastSeen: performance.now() };
			p.nick = msg.nick || "?";
			ST.peers.set(from, p);
			setStatus(t("players", ST.peers.size + 1));
			try { net.send({ t: "mver", v: VER, gf: ST._gameFp || null }, from); } catch (e) {} // MOD version + GAME build fingerprint
			// old mod (≤0.9.7) doesn't know mver and won't reply — after 5s with no reply, ALARM (the "buddy on 0.9.0" case)
			// "Old mod" check WITH RETRIES (0.9.88): no reply within 5 s doesn't mean old mod —
			// the peer might be in the middle of loading a world, or their renderer is just coming up after a reload.
			if (!msg.ready) {
				const askVer = (attempt) => {
					const pp = ST.peers.get(from);
					if (!pp || pp.modVer) return;                       // we already know — done
					if (attempt < 3) {
						try { net.send({ t: "mver", v: VER, gf: ST._gameFp || null }, from); } catch (e) {}
						setTimeout(() => askVer(attempt + 1), attempt === 1 ? 7000 : 13000);
						return;
					}
					setStatus(t("ver_mismatch") + " [" + (pp.nick || from) + ": OLD mod (<= 0.9.7)! / you: " + VER + "]", "#f66");
					log("PEER ON OLD MOD (no mver response after 25 s):", pp.nick || from, "— must run install.bat!");
				};
				setTimeout(() => askVer(1), 5000);
			}
			// 0.9.279 (MEASURED, the 4-second freeze of 16.09 that happened with nothing heavy going on).
			// The host's log for that second reads:
			//     15:46:01.267  LobbyChatUpdate ... member_state_change:"Disconnected"
			//     15:46:01.268  peer-disconnected steam:...STITCH
			//     15:46:01.281  peer-connected   steam:...STITCH      <- 13 ms later, same peer
			//     15:46:01.285  Full world queued: 9216 chunks
			//     15:46:01.391  hello: new player - sending save
			//     15:46:01.394  mirror SUSPENDED while transferring save (queue 9216)
			//     ... suspended for ~10 s, then queue 4191 and a flood
			// A 13 millisecond transport blip, and we answered it with a 764 KB save and the whole world.
			// The cause: "hello" is TWO different messages wearing one name. The peer's renderer announces
			// itself with { wid, scene, gen, ready:1 } - that is a player telling us what world it is on. But
			// st-main.js also sends { nick, ver } on every transport connect, and a nick change sends { nick }
			// alone. Neither carries any world state, yet both fell through to "!msg.ready" and were read as
			// "a player with no world", i.e. a new joiner.
			// A hello with NO world information at all cannot tell us anything about the client's world, so it
			// must not decide anything about it. If the peer really is new, its renderer announces ~800 ms
			// later and that hello does the work. If this is a reconnect, the only thing that can have been
			// lost is what was in flight at that instant, and we know exactly which chunks those were.
			const pustePowitanie = msg.ready === undefined && msg.wid === undefined
				&& msg.scene === undefined && msg.gen === undefined;
			if (ST.net.role === "host" && pustePowitanie) {
				const wRe = ST.wsx;
				let wroc = 0;
				if (wRe && wRe.unacked && wRe.unacked.size) {
					for (const rec of wRe.unacked.values()) {
						if (!rec || !rec.idx) continue;
						for (const i of rec.idx) {
							if (wRe.rowH) wRe.rowH.delete(i);        // the client may never have got these rows
							if (wRe.rowPrev) wRe.rowPrev.delete(i);  // so no cell delta may be based on them
							wRe.pending.add(i); wroc++;
						}
					}
				}
				resetAckBaseline(from, "greeting without world state (transport reconnect or nick change)");
				log("greeting from " + ((p && p.nick) || from) + " carries no world state: not a join. Re-queued "
					+ wroc + " chunks that were in flight, mirror continues.");
			} else if (ST.net.role === "host") {
				if (!ST._helloMsgT) ST._helloMsgT = new Map();
				ST._helloMsgT.set(from, performance.now()); // 0.9.185: marker for a deferred auto-send from the peer-hello event
				ST._snapForce = true; resetAckBaseline(null, "powitanie/pelny swiat"); enqueueFullWorld(); // 0.9.76: EVERY hello (even after a client renderer reload) = full world from scratch
				const hst = ST.state, myWid = hst && hst.store.meta && hst.store.meta.worldId;
				const hostInWorld = hst && hst.store.scene && hst.store.scene.active !== 1;
				// SAVE only when the client is NOT already on our world. After a reload the client already has our world
				// loaded (same worldId) → sending the save = another auto-load = reload = LOOP.
				const clientInMenu = msg.scene === 1 || msg.scene == null;
				const clientElsewhere = msg.wid != null && msg.wid !== myWid;
				// 0.9.150: worldId alone isn't enough — an old copy of THE SAME world was passing as
				// "ALREADY on my world" and the client stayed on the old content (PROBLEM #1). gen matches =
				// the client has EXACTLY our transfer. msg.gen undefined -> old mod: behavior from before the change.
				const genOk = msg.gen !== undefined ? (msg.gen != null && msg.gen === ST._worldGen) : !clientElsewhere;
				// 0.9.152: a matching gen is enough — import assigns the client a NEW local wid, so a "different wid"
				// with a matching gen is normal, not a reason for another transfer (a resend loop on every hello).
				if (hostInWorld && (!genOk || (clientInMenu && msg.ready))) { ST._autoSendT = performance.now(); log("hello: client without my world (wid=" + msg.wid + " gen=" + msg.gen + "/" + ST._worldGen + " scene=" + msg.scene + ") — sending save"); sendWorld(); }
				else if (hostInWorld && !msg.ready) { ST._autoSendT = performance.now(); log("hello: new player — sending save"); sendWorld(); }
				else if (hostInWorld) log("hello: client ALREADY on my world — stream only, no save");
			}
		} else if (msg.t === "mver") {
			const p = ST.peers.get(from); if (p) p.modVer = msg.v;
			// 0.9.275 (MEASURED, the diagnostic added in 0.9.274 named it in one run: "CELL DELTA OFF (peer
			// version): Qustux [ws:::ffff:127.0.0.1:61370] ver=unknown"). The handshake was ONE-WAY. Only the
			// side that receives a hello answers with mver, and over a local ws link only the client sends a
			// hello, so the client learned the host's version and the host never learned the client's. The host
			// is the side that decides, and with one peer of unknown version it fell back for everyone: no cell
			// delta, no raw stream, whole rows instead. Every local test we have run was measuring the v5
			// fallback while both logs cheerfully said "mod version OK". Now the message answers itself once;
			// msg.r marks the reply, so there is no ping-pong.
			if (!msg.r) { try { net.send({ t: "mver", v: VER, gf: ST._gameFp || null, r: 1 }, from); } catch (e) {} }
			if (msg.v !== VER) {
				setStatus(t("ver_mismatch") + " [" + ((p && p.nick) || from) + ": " + msg.v + " / you: " + VER + "]", "#f66");
				log("DIFFERENT MOD VERSIONS:", from, "ma", msg.v, "— I have", VER);
			} else log("mod version OK at", (p && p.nick) || from, "->", msg.v);
			// GAME build fingerprint (guard R3): different builds = different element enums/anchors → warn instead of silent corruption
			if (msg.gf && ST._gameFp && msg.gf !== ST._gameFp) {
				setStatus("⚠ DIFFERENT GAME BUILDS! [" + ((p && p.nick) || from) + "] — update the game on both sides", "#f66");
				log("DIFFERENT GAME BUILDS:", from, "ma", msg.gf, "— I have", ST._gameFp);
			}
		} else if (msg.t === "wi") {
			if (ST.net.role === "client" && ST.state && ST.wsx.paused) { ST._applyingNet = true; try { applyWorldItems(ST.state, msg.wi); } finally { ST._applyingNet = false; } }
		} else if (msg.t === "chat") {
			const nick = (ST.peers.get(from) && ST.peers.get(from).nick) || "?";
			addChat(nick, String(msg.m || "").slice(0, 200));
		} else if (msg.t === "hb") {
			// host heartbeat (fix G4): the only signal that gets through when the host is paused (frame is frozen)
			if (ST.net.role === "client") {
				ST._lastHb = performance.now();
				if (msg.p && !ST._hostPausedShown) { ST._hostPausedShown = true; setStatus(t("host_paused"), "#fd5"); }
				else if (!msg.p && ST._hostPausedShown) { ST._hostPausedShown = false; setStatus(t("players", ST.peers.size + 1)); }
			}
		} else if (msg.t === "wc") {
			applyWorldBatch(msg).catch((e) => { if (lim("applyErrN", 3)) log("apply error:", e.message, String(e.stack || "").split(String.fromCharCode(10)).slice(0, 4).join(" | "), "bin=" + (msg.__bytes ? msg.__bytes.length : "NONE") + " d=" + (msg.d ? msg.d.length : "NONE") + " z=" + msg.z); });
		} else if (msg.t === "wcack") {
			// Client acks the last APPLIED batch. This is the only signal we have for how far behind it is:
			// Steam's send buffer is invisible to us and sendP2PPacket never reports that it is full.
			if (ST.net.role === "host" && typeof msg.sq === "number") {
				const p = ST.peers.get(from);
				// ST-FIX: once acks STARTED MOVING, the backlog measured since then is already stale —
				// we also reset the counter of time spent paused, otherwise the correction would stay forever.
				if (p) { if (p.ackSq !== msg.sq) { ST.wsx.ackAdvanceT = performance.now(); ST.wsx.pauseAccum = 0; } p.ackSq = msg.sq; p.qd = msg.qd | 0; ST.wsx.ackSeen = true; } // per peer, so the slowest one governs
				// 0.9.78: batches acknowledged by the SLOWEST client can be forgotten
				const w0 = ST.wsx;
				if (w0.unacked && w0.unacked.size) {
					let minAck = null;
					for (const pp of ST.peers.values()) if (typeof pp.ackSq === "number" && (minAck === null || pp.ackSq < minAck)) minAck = pp.ackSq;
					// 0.9.264: while forgetting the confirmed batches, measure what the wire ACTUALLY drains.
					// Everything the slowest client has just confirmed has left the socket and been applied, so
					// bytes / elapsed is the end-to-end goodput. That number is what the in-flight gate in the
					// send loop paces against — it is the only honest measure of this link we can get.
					if (minAck !== null) {
						let doneB = 0, doneN = 0;
						for (const sq of [...w0.unacked.keys()]) if (sq <= minAck) {
							const r = w0.unacked.get(sq);
							doneB += (r && r.bytes) || 0; doneN++;
							w0.unacked.delete(sq);
						}
						if (doneN) {
							const tNow = performance.now();
							// 0.9.269: accumulate until the window is long enough to divide by. The old form used the
							// gap between two consecutive ack advances directly and threw the sample away when that
							// gap was under 20 ms — so if acks ever arrived faster than that, the estimate froze at
							// whatever it happened to be. Found in an offline simulation of this loop, not in a log.
							w0.gpB = (w0.gpB || 0) + doneB;
							const dt = w0.gpT ? (tNow - w0.gpT) / 1000 : 0;
							if (!w0.gpT || dt >= 5) { w0.gpB = 0; w0.gpT = tNow; }
							// 0.9.271: half a second, not 50 ms. The client acks ten times a second and several packets
							// can be confirmed by one ack, so a short window measures a burst rather than a rate:
							// in the 0.9.270 log the estimate ran to 595 KB/s while the host was actually pushing
							// 240 KB/s, the token bucket never bound anything, and the mirror was effectively
							// unpaced again. A longer window averages the bunching out.
							else if (dt >= 0.5) {
								const bps = w0.gpB / dt;
								w0.gpB = 0; w0.gpT = tNow;
								// 0.9.269: goodput has to estimate what the LINK can carry, not what we happened to
								// send. Once the token bucket paces the mirror, a plain EMA would measure our own
								// throttled rate, lower the estimate, throttle harder, and spiral to zero. So we
								// raise it freely on evidence of more capacity, and lower it only when the link is
								// actually pushing back.
								const dociskane = (w0.lagMs || 0) > 150
									|| (w0.inflight || 0) > 0.8 * Math.max(48 * 1024, (w0.goodput || 0) * 0.3);
								if (!w0.goodput) w0.goodput = bps;
								else if (bps > w0.goodput) w0.goodput = w0.goodput * 0.8 + bps * 0.2;
								else if (dociskane) w0.goodput = w0.goodput * 0.9 + bps * 0.1;
								// Not pressed: whatever we delivered is a LOWER bound on what this link can carry,
								// never an upper one, so the estimate probes a little above it and keeps probing
								// until the link pushes back. Without this the estimate converges onto our own
								// throttled rate and the mirror can never reach 100% of the wire again — in the
								// offline simulation that showed up as a permanent 15% shortfall with a backlog
								// that only grew.
								else w0.goodput = Math.max(w0.goodput, bps * 1.25);
							}
						}
					}
				}
			}
		} else if (msg.t === "act") {
			if (ST.net.role === "host") replayAction(msg, from);
		} else if (msg.t === "st") {
			if (ST.net.role === "client") applyNetStructs(msg);
		} else if (msg.t === "snap") {
			if (ST.net.role === "client") applySnapshot(msg).catch((e) => log("snap error:", e.message));
		} else if (msg.t === "snapp") {
			if (ST.net.role === "client") applySnapPart(msg).catch((e) => log("snapp error:", e.message));
		} else if (msg.t === "res") {
			ST._lastResT = performance.now(); // proof that the host is ALIVE (separate from the world stream)
			if (ST.net.role === "client") applyResources(msg);
		} else if (msg.t === "resz") {
			// 0.9.270: a heavy section, compressed. Same fields, same handler, just not 346 KB on the wire.
			ST._lastResT = performance.now();
			if (ST.net.role === "client") {
				(async () => {
					try { applyResources(JSON.parse(new TextDecoder().decode(await inflate(b64dec(msg.d))))); }
					catch (e) { log("resz error:", e && e.message); }
				})();
			}
		} else if (msg.t === "tech-nak") {
			// the host (host's game) refused our research — we roll back the local optimistic unlock at the
			// flag level (the game has no "lockTech"; buildings in the menu will stay until restart, but building without the host's tech won't
			// get through the mirror anyway). Resources will come back with the host's stream within ≤1 s.
			if (ST.net.role === "client" && ST.state && ST.state.store.player && ST.state.store.player.tech && msg.id) {
				ST.state.store.player.tech[msg.id] = false;
				setStatus(t("tech_rejected", msg.id), "#fa5");
				log("tech-nak from host:", msg.id, "— reverting local flag");
			}
		} else if (msg.t === "resDelta") {
			if (ST.net.role === "host") applyResourceDelta(msg);
		} else if (msg.t === "ent") {
			if (ST.net.role === "client") {
				applyEntities(msg);
				if (msg.fl && ST.state) applyFlame(ST.state, msg.fl);
				if (msg.al && ST.state) applySimLights(ST.state, msg.al);
			}
		} else if (msg.t === "myproj") {
			const p = ST.peers.get(from);
			if (p) p.projectiles = msg.list || [];
		} else if (msg.t === "snd") {
			playRemoteSound(msg);
		} else if (msg.t === "vacrelres") {
			// the host refused part of the discharge (outside the world / zone) — the units go back to the tank, they aren't lost
			if (ST.net.role === "client" && (msg.n | 0) > 0 && msg.et) {
				try {
					const inv = ST.state.store.player.inventory || [];
					const vac = inv.find((i) => i && i.data && Array.isArray(i.data.tanks));
					if (vac) {
						let lvl = 0; try { lvl = (ST.FH.upgrades.getLevel(ST.state, "vacuum", "capacity") | 0) || 0; } catch (e) {}
						const CAP = VACUUM_CAPS[lvl] || VACUUM_CAPS[0];
						for (let i = 0; i < (msg.n | 0); i++) {
							const t = vacSlotFor(vac.data.tanks, msg.et, CAP, vac.data.activeTankIdx | 0, vac.data.onlyFillActiveTank === true);
							if (!t) break;
							if (t.elementType === 0) t.elementType = msg.et;
							t.amount++;
						}
					}
				} catch (e) {}
			}
		} else if (msg.t === "vacres") {
			if (ST.net.role === "client") {
				clientFillTanks(msg.types || []);
				// full tanks: vanilla toast (i18n key + cooldown — like in F(); NEVER with a raw string, see the waypoints incident)
				if (msg.fullT && ST.FH && ST.FH.ui && ST.FH.ui.toast) {
					try {
						let nm = null; try { nm = ST.FH.elements.getName(ST.state, msg.fullT); } catch (e) {}
						ST.FH.ui.toast(ST.state, { key: "ui|vacuum|tanksFullToast", params: { name: nm || "?" } }, { cooldown: 1500, cooldownKey: "vacuum-tanks-full" });
					} catch (e) {}
				}
			}
		} else if (msg.t === "grabres") {
			if (ST.net.role === "client") { ST._grabInFlight = false; if ((msg.types || []).length) clientFillGrabTank(msg.types, msg.offs || null, msg.sl || null, msg.bx, msg.by); }
		} else if (msg.t === "grabRef") {
			// placement REFUND (R5): the host failed to place the element (cell occupied) → give it back to the tank
			if (ST.net.role === "client" && typeof msg.et === "number" && msg.et > 0) clientFillGrabTank([msg.et], null);
		} else if (msg.t === "redirty") {
			// The client briefly ran its own simulation (the game save resumed its thread) — these chunks may
			// differ from ours. We clear the row hashes for them, so they get resent in full.
			if (ST.net.role !== "client" && msg.m) {
				try {
					const m = b64dec(msg.m), total = msg.n | 0;
					let n = 0;
					// 0.9.201: the report now also goes out after the client's OWN action (outlines), not only after
					// a game save — so we put these chunks at the front of the queue, so they come back right away.
					for (let i = 0; i < total; i++) if (m[i >> 3] & (1 << (i & 7))) {
						if (ST.wsx.rowH) ST.wsx.rowH.delete(i);
						if (ST.wsx.rowPrev) ST.wsx.rowPrev.delete(i);   // 0.9.265: the client reported this area as wrong -> send full rows
						ST.wsx.pending.add(i);
						// 0.9.219 (REVISION 2.5): the chunk ends up in pending anyway — the limit only takes away its priority.
						if (ST.wsx.priority && ST.wsx.priority.size < 20000) ST.wsx.priority.add(i);
						else if (lim("prioCap", 3)) log("priority: queue full (20000) — chunks will return via normal queue");
						n++;
					}
					if (n) log("redirty od", from, "-> refreshing", n, "chunks (urgently)");
				} catch (e) { log("redirty error:", e.message); }
			}
		} else if (msg.t === "resync") {
			if (ST.net.role !== "client") resetAckBaseline(from, "resync od gracza");
			if (ST.net.role === "host") { ST._wtxHold = 0; log("resync od", from, "-> full world to queue (end of mirror silence)"); resetAckBaseline(null, "powitanie/pelny swiat"); enqueueFullWorld(); ST._lastSnap = 0; ST._snapForce = true; }
		} else if (msg.t === "world-req") {
			// the client asks for a SAVE (self-healing: reconnect / auto-send didn't work) — rate-limit 15 s
			if (ST.net.role === "host" && performance.now() - (ST._lastWorldReqT || 0) > 15000) {
				ST._lastWorldReqT = performance.now();
				// ST-FIX: if a transfer is ALREADY in progress, a new export only wipes the client's progress (new tid).
				// The log shows 5 exports in 45 s and not one of them finished. We retry the current one.
				if (ST._wtx && ST._wtxHold && performance.now() < ST._wtxHold) {
					log("world-req from " + from + " — transfer tid " + ST._wtx.tid + " already in progress, retrying world-begin");
					try { net.send({ t: "world-begin", tid: ST._wtx.tid, name: ST._wtx.name, size: (ST._wtx.sizeKB || 0) * 1024, chunks: ST._wtx.total, gen: ST._worldGen || null }, from); } catch (e) {}
					ST._wtx.queue.length = 0;
					for (let i = 0; i < ST._wtx.total; i++) ST._wtx.queue.push(i);
					ST._wtxActiveT = performance.now();
					pumpWtx();
				} else {
					log("world-req od", from, "-> sending save");
					sendWorld();
				}
			}
		} else if (msg.t === "world-wait") {
			// the host hasn't entered the world yet — we wait calmly, the world-req attempt isn't lost
			if (ST.net.role === "client") {
				ST._worldReqN = Math.max(0, (ST._worldReqN || 0) - 1);
				setStatus(t("waiting_host_world"), "#fd5");
			}
		} else if ((msg.t === "world-begin" || msg.t === "world-chunk" || msg.t === "world-end" || msg.t === "world-wait") && ST.net.role === "host") {
			// the host never receives a world (0.9.72): a world packet at the host = echo/self-loop or a foreign client → ignore
			if (!ST._hostWorldPktLogged) { ST._hostWorldPktLogged = true; log("HOST: ignored world packet", msg.t, "od", from); }
		} else if (msg.t === "world-begin") {
			// a NEW transfer while one is being received = a restart with shuffled packet indices → a world-need storm
			// (fix TCentraL "went crazy with the retrys"): we ignore it until the current receive finishes.
			// 0.9.75: guard only for a LIVE receive. A stuck one (the host already sent world-end, but we're
			// missing packets, or it's been running >30 s) MUST yield — otherwise the client will never get the full world.
			// 0.9.87: the NEWER transfer wins (packets are filtered by tid anyway, so interleaving is impossible).
			if (ST._worldRx && !ST._worldRx.done && msg.tid !== undefined && ST._worldRx.tid !== undefined && msg.tid < ST._worldRx.tid) {
				log("world-begin OLDER (tid " + msg.tid + " < " + ST._worldRx.tid + ") — ignoring"); return;
			}
			if (ST._worldRx && !ST._worldRx.done) log("switching receive: tid " + ST._worldRx.tid + " (" + ST._worldRx.got + "/" + ST._worldRx.total + ") → tid " + msg.tid);
			
			ST._gotHostWorld = true; // we received the world FROM the host → we trust its worldId when both are in the game (see applyWorldBatch)
			ST._worldRx = { tid: msg.tid, name: msg.name, total: msg.chunks, parts: new Array(msg.chunks), got: 0, from, done: false, ended: false, t0: performance.now(), gen: msg.gen || null };
			ST._rxLastGot = -1; // ST-FIX: progress counter for scheduleRxCheck
			log("world-begin: tid", msg.tid, "-", msg.name, "-", msg.chunks, "packets,", Math.round((msg.size || 0) / 1024), "KB");
			setStatus(t("receiving", 0, msg.chunks), "#ff5");
			scheduleRxCheck();
		} else if (msg.t === "world-chunk" && ST._worldRx) {
			// a packet from a DIFFERENT transfer than the current one = interleaving (the host autosaved between sends) —
			// letting it through would glue the save together from two world versions → CORRUPTED world (report from derErste67)
			if (ST._worldRx.tid !== undefined && msg.tid !== undefined && msg.tid !== ST._worldRx.tid) {
				if (!ST._tidDropLogged) { ST._tidDropLogged = true; log("world-chunk from a foreign transfer REJECTED (tid " + msg.tid + " ≠ " + ST._worldRx.tid + ")"); }
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
			// host: the client asks for missing pieces -> resend them (as a priority)
			// 0.9.75: we keep packets only for the CURRENT transfer. A request for an older tid (the client got stuck
			// on the previous one) = sending it packets from the new transfer, which it will reject anyway → endless "recovering".
			// Instead we start a fresh, complete transfer.
			// ST-FIX (game 0.5.6, restart loop): on a foreign tid we do NOT re-export the save.
			// The parts of the current transfer are still sitting in ST._wtx.parts — resending world-begin is enough
			// (the client will switch to the current tid) and requeue everything from scratch. The old code did
			// ST._wtx = null; sendWorld(), and sendWorld is ASYNC (FH.game.save + up to 10 s waiting for the file):
			// for ~3 s the host sent NOTHING, the client sent world-need with the old tid every 700 ms, and the first
			// of them, after the new _wtx was set, hit the mismatch again — an endless loop
			// (host log 17:16:53-17:19:36: 41 restarts, the client never got the whole save).
			if (ST._wtx && msg.tid !== undefined && ST._wtx.tid !== undefined && msg.tid !== ST._wtx.tid) {
				if (performance.now() - (ST._wtxRestartT || 0) < 1500) { return; }
				ST._wtxRestartT = performance.now();
				log("world-need for old transfer tid " + msg.tid + " (we have " + ST._wtx.tid + ") — retrying world-begin for the current transfer");
				try { net.send({ t: "world-begin", tid: ST._wtx.tid, name: ST._wtx.name, size: (ST._wtx.sizeKB || 0) * 1024, chunks: ST._wtx.total, gen: ST._worldGen || null }); } catch (e) {}
				ST._wtx.queue.length = 0;
				for (let i = 0; i < ST._wtx.total; i++) ST._wtx.queue.push(i);
				ST._wtxActiveT = performance.now();
				pumpWtx(); return;
			}
			// no current transfer (asynchronous preparation is in progress) — don't start another one
			if (!ST._wtx) return;
			if (ST._wtx && Array.isArray(msg.idx)) for (const i of msg.idx) if (ST._wtx.parts[i] !== undefined) ST._wtx.queue.push(i);
			ST._wtxActiveT = performance.now();
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
				ST._worldRxDone = true; // we have a world in this session → world-req turns itself off
				ST._recAskN = 0; ST._recAskT = 0;   // 0.9.215: the world arrived — the next request again after 60 s, not after 5 min
				log("World import OK:", rx.name, bytes.length, "bytes");
				// Auto-load: if FH.game.load exists, jump straight into the game (without a manual Load Game). (contribution by dotNine)
				const saveId = r && r.metaData && r.metaData.id;
				// RELOAD LOOP — ROOT CAUSE (0.9.72, reproduced e2e): auto-load = FH.game.load =
				// a PAGE RELOAD, which wipes the renderer's memory (_autoLoadedOnce, _worldRxDone from 0.9.68).
				// After the reload the client "doesn't remember" it already loaded this save → another transfer (world-req after 15 s
				// if the mirror hasn't started, host re-send) → auto-load again → reload → ... The guard must survive
				// the reload: sessionStorage (per window, cleared on a new join/stop). The same host save in this
				// session = import only, no auto-load.
								// 0.9.116: EXCEPTION — I'm in a world, but a DIFFERENT one than the host, and the mirror never started.
				// Without this, after a renderer restart the client is left with a frozen image until a manual Load Game.
				// 0.9.132: the mirror alone isn't enough — the player must BE in the host's world, otherwise their progress
				// (inventory, research, buildings) stays from the previous game.
				// 0.9.134: loading the transferred save assigns a NEW worldId, so we don't chase ID matching
				// (0.9.132 turned this into a reload loop). Rescue load only when the mirror has never started.
				let rescueN = 0;
				try { rescueN = Number(sessionStorage.getItem("st_rescue_n") || 0); } catch (e) {}
				const inWrongWorld = rescueN < 1 && !ST.wsx.everApplied && ST._hostWidSeen &&
					ST.state && ST.state.store.meta && ST.state.store.meta.worldId !== ST._hostWidSeen &&
					Date.now() - (ST._rescueLoadT || 0) > 30000;
				if (inWrongWorld) { ST._rescueLoadT = Date.now(); try { sessionStorage.setItem("st_rescue_n", String(rescueN + 1)); } catch (e) {} log("LOADING HOST'S WORLD: I am in", ST.state.store.meta.worldId, "host is playing in", ST._hostWidSeen, "— without this my progress would be left from the previous game"); }
				// 0.9.150: a transfer with a NEW gen token = the host explicitly stated that our copy is stale
				// (PROBLEM #1) — such a load must NOT be blocked by "mirror already running". A limit of 2 loads
				// per window session protects against a loop if loading kept failing.
				let genLoads = 0; try { genLoads = Number(sessionStorage.getItem("st_genload_n") || 0); } catch (e) {}
				const genForce = !!(rx.gen && ST._rxWorldGen !== rx.gen && genLoads < 2);
				if (!genForce && !inWrongWorld && saveId && autoLoadDoneBefore(saveId)) { log("auto-load SKIPPED (this host save was already auto-loaded in this session — guard after reload) — save only imported"); setStatus(t("world_imported", rx.name), "#5f5"); return; }
				// RELOAD LOOP (fix TCentraL "reloading the same map over and over"): another transfer
				// of the same world does NOT yank the player out of the game — when the mirror is already running or a load is in progress, we don't load.
				// auto-load ONLY ONCE per session (fix ZeroHazard "reload every 10 s"): a repeated transfer
				// (e.g. the peer-hello cycle under overloaded P2P) can't keep yanking the player into a load over and over —
				// we only import further saves; the player can load them manually via Load Game.
				if (!genForce && !inWrongWorld && (ST.wsx.everApplied || ST._loadingWorld || ST._autoLoadedOnce)) { log("auto-load SKIPPED (mirror active / load in progress / already auto-loaded this session) — save only imported"); setStatus(t("world_imported", rx.name), "#5f5"); return; }
				if (genForce && ST._loadingWorld) { log("gen-load DEFERRED — a load is in progress"); return; }
				ST._autoLoadedOnce = true;
				if (saveId) autoLoadMark(saveId);
				if (saveId && ST.FH && ST.FH.game && typeof ST.FH.game.load === "function" && ST.state) {
					try {
						if (rx.gen) { ST._rxWorldGen = rx.gen; try { sessionStorage.setItem("st_world_gen", rx.gen); if (genForce) sessionStorage.setItem("st_genload_n", String(genLoads + 1)); } catch (e) {} }
						ST._loadingWorld = true; // the mirror does NOT write to buffers during a load (fix for a freeze on a large map)
						setStatus(t("loading_world"), "#ff5"); // a large map = minutes; without this it looks like a hang
						const t0 = performance.now();
						const lr = await ST.FH.game.load(ST.state, saveId);
						log("auto-load of host's save completed in", Math.round(performance.now() - t0), "ms");
						if (lr && lr.success === false) throw new Error(lr.error || "load success:false");
						// the engine may assign a NEW local worldId to the loaded world despite identical content —
						// a trust window, so subsequent "wc" (mirror) messages aren't rejected as "a different world"
						ST._pendingTrustUntil = performance.now() + 15000;
						setStatus(t("world_imported_loaded", rx.name), "#5f5");
						// full world IMMEDIATELY after entering (we don't wait for everApplied — with a fully matching
						// save there might be nothing to apply, and AUTO-RESYNC at mirror startup wouldn't fire)
						if (!ST._autoResynced) { ST._autoResynced = true; try { net.send({ t: "resync" }); log("AUTO-RESYNC po auto-load"); } catch (e2) {} }
						return;
					} catch (e) { log("auto-load failed, falling back to manual Load Game:", e.message); }
					finally { ST._loadingWorld = false; }
				}
				setStatus(t("world_imported", rx.name), "#5f5");
			}).catch((e) => setStatus(t("import_err", e.message), "#f66"));
		} catch (e) { setStatus(t("decode_err", e.message), "#f66"); }
	}
	// every 700 ms: if pieces are missing, ask the host for them again (recovery after Steam P2P)
	function scheduleRxCheck() {
		if (ST._rxTimer) clearTimeout(ST._rxTimer);
		ST._rxTimer = setTimeout(() => {
			const rx = ST._worldRx;
			if (!rx || rx.done) return;
			// ST-FIX (game 0.5.6, restart loop): world-need ONLY when the transfer is STALLED. The old version sent it
			// every 700 ms regardless of progress — at the start there are always missing pieces, so the host got
			// an avalanche of requests, and each one with a stale tid wiped its whole transfer and forced a save re-export.
			const stalled = rx.ended || rx.got === ST._rxLastGot;
			ST._rxLastGot = rx.got;
			if (stalled) {
				const miss = missingRxIndices();
				if (miss.length) {
					net.send({ t: "world-need", tid: rx.tid, idx: miss.slice(0, 200) }, rx.from);
					setStatus(t("receiving", rx.got, rx.total) + " (recovering " + miss.length + ")", "#ff5");
				}
			} else setStatus(t("receiving", rx.got, rx.total), "#ff5");
			scheduleRxCheck();
		}, 700);
	}

	// ------------------------------------------------------------------
	// WORLD SYNC — HOST: mirror stream of dirty chunks
	// ------------------------------------------------------------------
	function chunkDims(W, H) { return { cx: Math.ceil(W / CHUNK), cy: Math.ceil(H / CHUNK) }; }

	// HOST: mark the chunk of cell (x,y) as "dirty" for sending via the mirror. CRUCIAL for the grabber/vacuum:
	// FH.elements.createAt/removeAt from the mod does NOT always set chunkShouldUpdate → the mirror skips the chunk →
	// the client never gets the placed element (until the host touches that zone again). We force the send here.
	function markCellDirty(state, x, y) {
		try {
			if (ST.net.role !== "host") return;
			const { W, H } = worldBuffers(state);
			if (!W || x < 0 || y < 0 || x >= W || y >= H) return;
			const d = chunkDims(W, H);
			const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { // + neighbours (the element may affect the edge)
				const nx = cx + dx, ny = cy + dy;
				if (nx >= 0 && ny >= 0 && nx < d.cx && ny < d.cy) { const ci = nx + ny * d.cx; ST.wsx.pending.add(ci); ST.wsx.priority.add(ci); } // priority: immediate delivery (re-grab)
			}
		} catch (e) {}
	}

	// after changing cells "by hand" (outside the engine) the chunks must be dirtied so the mirror refreshes them
	// 0.9.103: the effect of a player's action should come back to them AS FAST AS POSSIBLE — chunks around the action point
	// go to the front of the nearest batch (priority), with a cleared hash, so they definitely get sent.
	// 0.9.197: moving something used to leave "ghosts" on the client at the old spot until the moment someone
	// built something there. It's the same mechanism as with undoing a demolition: the terrain write on removing a
	// structure doesn't always set chunkShouldUpdate, so the mirror skips the chunk and the client is left with
	// old tiles. Building in that spot dirties the chunk, and only then does the picture refresh.
	function markMoveUrgent(state, from, to) {
		try {
			if (ST.net.role !== "host") return;
			const r = markPosListsUrgent(state, [from, to]);
			if (r.n && lim("mvUrgDiag", 20))
				log("move: " + r.n + " chunks marked as urgent" + (r.capped ? " (limit 6000 reached)" : ""));
		} catch (e) {}
	}
	// 0.9.215 (REVISION 2.3): ONE procedure for marking terrain from a list of positions. There were two copies, and only
	// this one counted CHUNKS — the other, in the undo branch, counted POSITIONS. With dense construction, hundreds of positions
	// land in the same chunk, so the limit ran out after a few dozen chunks, and the rest of the area
	// stayed unmarked: hence the red (QUEUED) tiles after Ctrl+Z, which only disappeared with a snapshot.
	// We already fixed this same bug once in 0.9.205 — but only in one of the two places.
	function markPosListsUrgent(state, arrs, cap) {
		const out = { n: 0, capped: false };
		try {
			const { W } = worldBuffers(state); if (!W) return out;
			const seen = new Set(), lim = cap || 6000;
			for (const arr of arrs) {
				if (!Array.isArray(arr)) continue;
				for (const q of arr) {
					if (!q || !Number.isFinite(q.x)) continue;
					const key = Math.floor((q.y | 0) / CHUNK) * 100000 + Math.floor((q.x | 0) / CHUNK);
					if (seen.has(key)) continue;
					if (seen.size >= lim) { out.capped = true; break; }
					seen.add(key);
					markUrgent(state, q.x | 0, q.y | 0, 1); out.n++;
				}
				if (out.capped) break;
			}
		} catch (e) { swallow("markPosListsUrgent", e); }
		return out;
	}
	// 0.9.215 (REVISION 3.1): THE RECONCILE VALVE ACTUALLY ASKS FOR THE WORLD. The comment next to it promised that
	// "gen-transfer will bring the correct save right away anyway" — but nobody requested it: world-req disables
	// itself forever after the first world load (ST._worldRxDone), and resync didn't run on this branch.
	// Effect: with a desync of over 2000 structures the mod wrote the same line every 30 s and did NOTHING, endlessly.
	// The host already has a ready path for "resync" (enqueueFullWorld + a forced snapshot), so it's enough to just ask.
	// The interval grows with each attempt, so that a persistent version mismatch doesn't loop the world transfer.
	function askWorldResync(absent) {
		try {
			if (ST.net.role !== "client") return;
			const now4 = performance.now();
			const tries = ST._recAskN || 0;
			const wait = Math.min(60000 * (tries + 1), 300000);
			if (ST._recAskT && now4 - ST._recAskT < wait) return;
			ST._recAskT = now4; ST._recAskN = tries + 1;
			net.send({ t: "resync" });
			log("RECONCILE: divergence " + absent + " structures — requesting full world from host (attempt " + (tries + 1)
				+ ", next not before " + Math.round(wait / 1000) + " s)");
		} catch (e) { log("RECONCILE: world request did not go through:", e && e.message); }
	}
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
	// 0.9.117: the player starts listening again from scratch (welcome / resync / restart of his window) — his counter
	// of acknowledgments started from zero, so our reference point must too. Otherwise we count the backlog
	// relative to numbers he will never see, and we halt sending forever.
	function resetAckBaseline(peerId, why) {
		const w = ST.wsx;
		if (!w) return;
		const p = peerId ? ST.peers.get(peerId) : null;
		if (p) { p.ackSq = w.seq; p.qd = 0; }
		else for (const pp of ST.peers.values()) { pp.ackSq = w.seq; pp.qd = 0; }
		w.lag = 0;
		w.rate = Math.max(w.rate || 0.03, 0.5);   // we give back bandwidth immediately, not after a minute of climbing
		w.ackAdvanceT = performance.now();
		w.pauseAccum = 0; w.stalled = false; w.stallTick = 0;
		if (w.unacked) w.unacked.clear();
		w.gpT = 0; w.gpB = 0; w.inflight = 0; w.tok = 0; w.tokT = undefined;   // 0.9.264/269: the goodput window and the wire budget start over with the acks
		log("RESET confirmations for", peerId || "everyone", "(" + why + ") — resuming full send");
	}
	function enqueueFullWorld() {
		if (!ST.state) return;
		// 0.9.81: handshake, peer-hello and resync can hit at the same moment — without this lock
		// we go through 9216 chunks several times in a row with no gain at all (the queue is a set).
		const nowE = performance.now();
		if (nowE - (ST._fullWorldT || 0) < 3000) { log("Full world: skipping (already queued " + Math.round(nowE - ST._fullWorldT) + " ms ago)"); return; }
		ST._fullWorldT = nowE;
		const { W, H } = worldBuffers(ST.state);
		if (!W) return;
		const d = chunkDims(W, H);
		for (let i = 0; i < d.cx * d.cy; i++) ST.wsx.pending.add(i);
		if (ST.wsx.rowH) ST.wsx.rowH.clear(); // full re-send: row-delta must not skip "unchanged" rows (a new client doesn't have them)
		if (ST.wsx.rowPrev) ST.wsx.rowPrev.clear();   // 0.9.265: a client that gets the whole world has no base for a cell delta
		log("Full world queued:", d.cx * d.cy, "chunks");
	}

	// Mirror queue and congestion state are SESSION state, like _grabbedCells and _fireQ. They were the
	// only part never reset. A host that stopped and hosted again started with the previous session's
	// backlog, and worse, with row hashes from the previous world, so chunks counted as "unchanged" and
	// were never sent at all.
	function resetWorldQueue() {
		ST.wsx.pending.clear();
		ST.wsx.priority.clear();
		if (ST.wsx.rowH) ST.wsx.rowH.clear();   // stale hashes would suppress sends in the new world
		ST.wsx.carry = null;
		if (ST.wsx.rowPrev) ST.wsx.rowPrev.clear();
		ST.wsx.sweep = 0;
		ST.wsx.bpc = 0; ST.wsx.lastNear = 0; if (ST.wsx.sentAt) ST.wsx.sentAt.clear();    // re-measure chunk cost, the new world compresses differently
		ST.wsx.seq = 0; ST.wsx.ackSeen = false; ST.wsx.lag = 0; ST.wsx.rate = 0.25; ST.wsx.boost = 1; ST.wsx.buildMs = 0; // 0.9.78: cautious start, the regulator will raise it itself
		// 0.9.161: this statement was SWALLOWED by the comment above (glued onto its tail) — the old
		// unacked records from the previous session counted as "lost" after 20 s and dirtied the queue.
		if (ST.wsx.unacked) ST.wsx.unacked.clear(); // start un-throttled
	}

	function scanDirty(state) {
		try {
			const sim = state.shared.sim; if (!sim) return;
			const flags = sim.chunkShouldUpdate;
			if (flags) for (let i = 0; i < flags.length; i++) if (flags[i]) ST.wsx.pending.add(i);
			// 0.9.200 (CAUSE OF "black outlines missing on the client, they come back on their own after ~a minute"):
			// the sim has TWO flag arrays — chunkShouldUpdate and chunkShouldUpdateNext (a double buffer).
			// We only read the first one, so changes written to "next" and swapped before we got
			// to the scan were simply lost. The chunk only came back with the rolling sweep (4 chunks per batch,
			// 9216 chunks => ~70-80 s), which matches the report "after about a minute" exactly.
			const flagsN = sim.chunkShouldUpdateNext;
			if (flagsN) for (let i = 0; i < flagsN.length; i++) if (flagsN[i]) ST.wsx.pending.add(i);
		} catch (e) {}
	}

	async function maybeSendBatch(state) {
		const w = ST.wsx;
		const now = performance.now();
		// ST-FIX (client gets stuck on "Receiving world"): while the SAVE transfer is in progress, the mirror STAYS SILENT.
		// The client has nothing to update with it anyway until it assembles the world, and the mirror stream
		// (in the log: a queue of 3359 chunks) clogged the link so badly that small control packets were lost:
		// the client kept asking for "world-need tid 2", the host kept sending back "world-begin tid 4",
		// and that response never reached him. The transfer never finished.
		// NOTE: ST._wtx stays alive after the transfer ends (it isn't zeroed out), so the condition is
		// ACTIVITY: the marker is refreshed on every sent save batch and on every world-need.
		// It expires on its own after 2 s, so the mirror can't be paused permanently.
		// ST-FIX: 2 s after handing the packets to the socket is too little — the save is still physically sitting in the buffer
		// Steam. We hold the window until the client reports "resync" (i.e. has loaded the world), for at most 30 s.
		if (ST._wtxPreparing || (ST._wtxHold && now < ST._wtxHold) || (ST._wtxActiveT && now - ST._wtxActiveT < 2000)) {
			w.lastBatch = now;
			if (now - (w.wtxHoldLogT || 0) > 5000) { w.wtxHoldLogT = now; log("mirror SUSPENDED while transferring save (queue " + w.pending.size + ")"); }
			return;
		}
		// 0.9.103: urgent changes (the effect of a player's action) don't wait the full 100 ms
		// 0.9.104: 30 packets/s instead of 10 — the world moves smoothly on the client, and the tool's effect
		// comes back on average 3x faster. Applying it costs 2 ms, so we can afford it.
				// 0.9.105: ADAPTIVE CYCLE with a floor of 8 ms (125 Hz). We aim for the maximum that the machine and the client
		// can handle: we go down only when building the packet starts eating into the frame or the client can't keep up.
				if (w.gap == null) w.gap = 33;
		const msB = w.serMs || 0;                 // only the time BLOCKING the frame
		const behind = w.pending.size > 400;      // big queue = catch up first, smoothness second
		// ST-FIX: thresholds on the BACKLOG IN MS (w.lagMs), not in packets — see the comment below where it's calculated.
		const lagMs = w.lagMs || 0;
		// 0.9.265 (THE "his water runs at 10 FPS" BUG, found in the LAN session of 15.09, where bandwidth was
		// demonstrably NOT the limit: queue 30-80, lag 1-2 packets, lagMs 0, the client applying in 1-4 ms with
		// 160 FPS to spare — and the host still sending only 10 packets a second).
		// The two thresholds below were absolute: speed up only while the build costs under 4 ms. But the build
		// loop always spends its whole time budget, which was a flat 10 ms, so msB sat at ~10 and the "speed up"
		// branch could never fire. Once lagMs spiked during the initial sync and pushed gap to 100 ms, nothing
		// could ever bring it back: a one-way ratchet down to 10 Hz for the rest of the session.
		// Now both the build budget and the thresholds are a FRACTION OF THE CYCLE, so they converge instead of
		// latching. Total work per second is unchanged (the same chunks get dirty either way) — it is just spread
		// over 4x as many packets, which is exactly what the client's smoothness is made of.
		const cykl = w.gap || 33;
		// 0.9.274: THE SECOND HALF OF THE STUTTER, and this one is ours. A lag spike used to multiply the cycle
		// by 1.25 on every batch until the mirror was at 10 Hz, and recovery (x0.85, and only while lagMs < 150)
		// took another ten batches at that rate, so ONE spike cost between one and one and a half seconds of a
		// frozen world followed by a fast catch-up. That is the report, word for word. In the 0.9.271 session 18
		// of 154 windows ended up at 10-30 Hz this way.
		// The cadence is the wrong knob for congestion and has been since 0.9.269: fewer batches with the same
		// byte budget is not less data, it is the same data in lumpier pieces, which makes the client jerkier
		// while doing nothing for the link. Bytes are the token bucket's job, depth is the in-flight gate's job,
		// and a client that cannot keep up still brakes us through applyBrake and w.rate. So the cycle now
		// answers to ONE thing: how much of the host's frame the serialization is eating.
		if (msB > cykl * 0.6) w.gap = Math.min(100, w.gap * 1.25);
		else if (!behind && msB < cykl * 0.35) w.gap = Math.max(16, w.gap * 0.85); // up to ~60 Hz
		else if (behind) w.gap = Math.max(25, Math.min(40, w.gap));                     // catching up: ~30 Hz
		const minGap = w.priority && w.priority.size ? Math.min(w.gap, 12) : w.gap;
		if (w.busy || now - w.lastBatch < minGap) return;
		const { map, wall, shadow, auth, sim, etype, W, H } = worldBuffers(state);
		if (!map || !W) return;
		const cellIds32 = sim ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null; // for reading the element type per cell (v4)
		// 0.9.267: word-wide views of the same memory, used ONLY for change detection (see fnvRow below).
		// Built once per batch, not per chunk; a layer whose buffer is not 4-byte aligned simply stays null
		// and that chunk falls back to the byte-at-a-time path.
		const u32 = (a) => { try { return a && (a.byteOffset & 3) === 0 && (a.length & 3) === 0 ? new Uint32Array(a.buffer, a.byteOffset, a.length >>> 2) : null; } catch (e) { return null; } };
		const map32 = (map && (map.byteOffset & 3) === 0 && (map.length & 3) === 0) ? new Uint32Array(map.buffer, map.byteOffset, map.length >>> 2) : null;
		const wall32 = u32(wall), shadow32 = u32(shadow), auth32 = u32(auth);
		const d = chunkDims(W, H);
		const total = d.cx * d.cy;
		// rolling sweep — self-healing of overlooked chunks (4 per batch)
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
				// 0.9.78: PING as a second overload signal. Packet backlog reacts with a delay,
				// while rising RTT is visible immediately — at 3000 ms the connection is already clogged and packets are getting lost.
				let pingMs = 0;
				for (const pp of ST.peers.values()) if (pp.ping != null && pp.ping > pingMs) pingMs = pp.ping;
				// ST-FIX: BACKLOG IN MILLISECONDS. The 4/8/25 thresholds were calibrated for a steady rhythm of 10 packets/s
				// ("lag 600 = 60 s"), but the rate is adaptive and drops to 16 ms, i.e. ~60 packets/s.
				// At 60/s the granularity of acknowledgments alone (the client acknowledges 10x/s) plus RTT is already ~14 packets —
				// the host treated a HEALTHY connection as clogged, cut the rate down to 10 Hz, then came back, over and over
				// (in the log, alternating 63Hz and 10Hz). On the client this shows up as stuttering of granular elements.
				// We subtract the known overhead (ACK window 100 ms + RTT), so that what remains is the REAL backlog.
				// ST-FIX (FEEDBACK LOOP — a regression from my own previous fix):
				// we calculated the backlog as "number of packets x CURRENT rate". But those unacknowledged packets
				// went out at the OLD, fast rate. Once the controller cut the pace from 63 Hz (gap 16 ms) to
				// 10 Hz (gap 100 ms), the same backlog started counting as 6x bigger — so the controller
				// kept the throttling going forever. In the log: "lag 27/2458ms (3%) 10Hz" with an empty queue.
				// We have the real send time of every packet (w.unacked), so we take the AGE of the oldest
				// unacknowledged one. This measure doesn't depend on the current rate, so there's no loop.
				let oldestT = 0;
				if (w.unacked && w.unacked.size) {
					let scan = 0;
					for (let sq = minAck + 1; sq <= w.seq && scan < 5000; sq++, scan++) {
						const u = w.unacked.get(sq);
						if (u && u.t) { oldestT = u.t; break; }
					}
				}
				// ST-FIX (regression 0.9.175): the age of the oldest packet alone also grows when it's WE
				// who paused sending — and that's not the connection's fault. Without this correction, the 2500 ms threshold after
				// entering the pause never ended (in the log: "623 batches behind (~2.5 s)" growing
				// to 23 s with an UNCHANGED number of packets). We subtract the time spent in the pause.
				if (w.stalled) w.pauseAccum = (w.pauseAccum || 0) + Math.max(0, now - (w.stallTick || now));
				w.stallTick = now;
				// 0.9.278: the subtracted constant is the ACK WINDOW, so it follows the ack cadence (40 ms now,
				// was 100). A peer on an older mod still acks at 10 Hz, which makes its backlog read up to 60 ms
				// worse than it is — harmless against thresholds of 350 and 700 ms.
				w.lagMs = oldestT ? Math.max(0, now - oldestT - 40 - pingMs - (w.pauseAccum || 0)) : 0;
				if (pingMs > 1000) w.rate = Math.max(0.02, w.rate * 0.7);            // link congested: cut hard
				else if (pingMs > 400) w.rate = Math.max(0.03, w.rate * 0.9);
				if (w.lagMs > 700) w.rate = Math.max(0.03, w.rate * 0.85);           // really more than 0.7 s behind
				else if (w.lagMs < 350 && pingMs < 250) w.rate = Math.min(1, w.rate * 1.05); // we give back bandwidth only with a healthy RTT
				// Hard stop. The buffer is so full that shrinking batches cannot drain it in time. Send
				// nothing at all: pending grows here instead, where chunks coalesce, so the client gets
				// one current state rather than replaying every intermediate frame in order.
				if (w.lagMs > 2500) {
					w.stalled = true;
										// 0.9.117: if, despite the pause, acknowledgments don't move for 8 s, that's not congestion
					// of the connection, just a desynced counter (e.g. the client reloaded the window) — we reset and resume.
					if (now - (w.ackAdvanceT || 0) > 8000) { resetAckBaseline(null, "brak postepu potwierdzen przez 8 s"); }
					else if (now - (w.stallLogT || 0) > 2000) { w.stallLogT = now; log("CONGESTION: client", w.lag, "batches behind (~" + (Math.round(w.lagMs / 100) / 10) + " s), pausing sends, queue", w.pending.size); }
					w.lastBatch = now; // hold the 100 ms cadence while stalled, else the sweep runs every frame
					return;
				}
				else { w.stalled = false; }
			} else { w.lag = 0; w.stalled = false; }
		}
		// 0.9.78: packets without acknowledgment after 10 s we treat as LOST (typical for Steam P2P).
		// Without this, their rows stay empty on the client FOREVER (the host considers them delivered) — this is
		// the cause of the "holey world" over the internet while it works fine on LAN.
		// 0.9.90: not during the initial sync (a huge queue) — there a missing ACK means "can't keep up", not "lost"
		if (w.ackSeen && w.unacked && w.unacked.size && w.pending.size < 200) {
			let lost = 0;
			for (const [sq, rec] of [...w.unacked]) {
				if (now - rec.t < 20000) continue;
				if (w.ackAdvanceT && now - w.ackAdvanceT < 20000) continue; // the ACK is advancing => the client is just falling behind
				w.unacked.delete(sq);
				// 0.9.265: these bytes never reached the client, so they are NOT a valid base for a cell delta
				for (const idx of rec.idx) { if (w.rowH) w.rowH.delete(idx); if (w.rowPrev) w.rowPrev.delete(idx); w.pending.add(idx); lost++; }
			}
			if (lost && now - (w.lostLogT || 0) > 3000) { w.lostLogT = now; log("LOSS: " + lost + " chunks unconfirmed — resending them (queue " + w.pending.size + ")"); }
		}
		// 0.9.264 IN-FLIGHT GATE (measured on the Steam session of 15.09, not guessed).
		// In a busy area the host sat at the 256 KB raw floor, pushing ~280 KB/s, while the client reported an
		// EMPTY apply queue (qd 0) and an ack age of 1.5-2.5 s. An empty queue together with old acks means the
		// packets were not late because the client could not apply them — they were sitting in the transport's
		// send buffer. We were keeping a permanent two-second standing queue in the socket, which is exactly the
		// "his water and conveyors run a second behind" symptom. The old controller could not fix it: its rate had
		// already collapsed to 3% and the raw floor below ignores rate entirely.
		// So pace against what the wire really drains: never allow more than TARGET_MS worth of measured goodput
		// to be in flight. Throughput does not change (the link is the link), but the delay collapses to the
		// target, and what we hold back coalesces in `pending` — the client then receives the CURRENT state of a
		// chunk instead of replaying every intermediate frame of it in order.
		if (w.ackSeen && w.goodput > 0 && w.unacked && w.unacked.size) {
			let inflight = 0;
			for (const rec of w.unacked.values()) inflight += (rec && rec.bytes) || 0;
			w.inflight = inflight;
			// 0.9.274 (MEASURED, the 0.9.271 Steam log). Every stat window that shows the mirror at 10 Hz also
			// shows in-flight between 107 and 269 KB with a goodput around 300 KB/s, i.e. between a third of a
			// second and a full second of data sitting in the Steam socket waiting its turn. 269 KB is not an
			// accident: the old gate allowed cap*3 with cap at 300 ms, so it permitted 0.9 s of standing queue
			// by design. Everything behind that queue waits, which is exactly the freeze.
			// The target has to be at least a couple of round trips, or we throttle ourselves: with a 200 ms
			// link the bandwidth-delay product alone is 60 KB, and an offline run of the controller against a
			// fixed 48 KB floor delivered only 224 KB/s of a 300 KB/s link. Measured ping, not a constant.
			let rttMs = 0;
			for (const pp of ST.peers.values()) if (pp.ping != null && pp.ping > rttMs) rttMs = pp.ping;
			const TARGET_MS = Math.max(150, (rttMs || 60) * 2.5);   // how deep we are willing to keep the pipe
			// the floor keeps at least one full packet in flight, so the gate can never deadlock the mirror
			const cap = Math.max(48 * 1024, w.goodput * (TARGET_MS / 1000));
			// 0.9.269: the 0.9.267 "proportional" version was a regression of mine, and the arithmetic says why.
			// It scaled the SIZE of each packet but left the RATE at 63 per second, with a floor of 8 KB per
			// packet. 63 x 8 KB is 504 KB/s, i.e. the floor alone guaranteed two to three times more than this
			// link carries. In-flight then climbed until the hard stop fired, and the hard stop is a freeze:
			// the 0.9.268 log shows hold 1760-2395 ms in a 2 s window with the queue exploding to 1742 chunks
			// and nearAge 5472 ms. Everything else sharing the channel waited behind it too, which is why a
			// structure could take ten seconds to appear.
			// The right shape is a token bucket on BYTES PER SECOND, refilled at the measured goodput. Then the
			// packet size and the send rate both fall out of one number that is grounded in the real link, and
			// there is nothing left to oscillate. The in-flight test stays only as a safety net.
			w.ifFactor = 1;
			// 0.9.274: hold at the target, not at three times the target. The bandwidth-delay product here is
			// about 18 KB (300 KB/s at 60 ms), so the 48 KB floor still keeps the wire busy; everything above
			// that is pure queueing delay and buys nothing.
			if (inflight > cap) {
				w.holdMs = (w.holdMs || 0) + Math.max(0, now - (w.lastBatch || now));
				w.skIf = (w.skIf || 0) + 1;   // 0.9.278: which of the two limiters is actually binding
				w.lastBatch = now;   // wait one cycle instead of spinning on this test every frame
				if (now - (w.ifLogT || 0) > 5000) {
					w.ifLogT = now;
					log("PACING: " + Math.round(inflight / 1024) + " KB in flight, far over the " + Math.round(cap / 1024)
						+ " KB target (goodput " + Math.round(w.goodput / 1024) + " KB/s) — holding back, queue " + w.pending.size);
				}
				return;
			}
		} else { w.inflight = 0; w.ifFactor = 1; }
		// 0.9.269 WIRE BUDGET. The mirror may spend at most MIRROR_SHARE of the measured goodput; the rest is
		// left for everything else on the same channel (structure snapshots, resource sections, action replays),
		// which is what the snapshot pump draws on. Burst is capped at a third of a second so a quiet moment
		// cannot be cashed in as one huge packet.
		{
			const gp = (w.ackSeen && w.goodput > 0) ? w.goodput : 256 * 1024;
			const MIRROR_SHARE = 0.85;   // the snapshot pump is gated on in-flight as well, so this can be generous
			if (w.tokT === undefined) { w.tok = gp * 0.10; w.tokT = now; }
			// 0.9.274: burst was a THIRD OF A SECOND of the link, and the log shows the bucket sitting at that
			// cap (tok 90-140 KB) window after window. A full bucket means the next batch may spend all of it at
			// once, and that single packet is where the 200 KB of in-flight above comes from. The mirror does not
			// need to burst: it sends 60 times a second, so 80 ms of credit is already more than one packet's
			// worth, and a quiet moment can no longer be cashed in as one huge one.
			w.tok = Math.min(gp * 0.08, (w.tok || 0) + gp * MIRROR_SHARE * Math.max(0, now - w.tokT) / 1000);
			w.tokT = now;
			w.gpNow = gp;
			if (w.tok < 1536) {           // less than a minimal packet's worth: wait, do not dribble
				w.skTok = (w.skTok || 0) + 1;   // 0.9.278
				w.lastBatch = now;
				return;
			}
		}
		w.busy = true; w.lastBatch = now;
		try {
			// TWO LANES (fix "queue 8600, client sees a world from 20s ago" — a big map gets dirtied faster
			// than the old limit of 40/batch, and sorting by distance was STARVING distant chunks indefinitely):
			// fast lane = ALL dirty chunks within radius FAST_R of any player (this is what players see — always fresh),
			// slow lane = a portion of the oldest from the rest (Set iterates in insertion order → FIFO, zero starvation).
			//
			// Adaptive budget. slowN used to be FIXED (20 or 40), so far lane drain never grew with the
			// backlog. A far chunk's delay is |far| / slowN, which rose linearly with base size and time
			// played. Now the portion grows with the queue but is capped by a BYTE budget (bpc is the
			// measured average compressed chunk size) scaled by w.rate from the controller above.
			// 0.9.281 (MEASURED by the "mine" counter added in 0.9.280, over 346 steady-state windows):
			//     247 windows with the players together: mine 0 of a 50-chunk fast lane
			//      80 windows with the players apart:   mine 31 of a 33-chunk fast lane, i.e. 94%
			// The first anchor used to be the HOST'S OWN position. But this stream goes TO the peers, and the
			// host does not receive its own mirror: it has the authoritative world already. So whenever the
			// two of them were not standing together, almost the entire fast lane was spent refreshing ground
			// that only the host could see, at full rate, while the ground the client was actually looking at
			// queued behind it. In those windows the host was pushing 946 chunks a second of that.
			// The anchors are the peers now. Nothing is lost: the host's surroundings still travel, on the far
			// lane's own clock, and the moment a peer walks over there it becomes a near anchor again.
			const anchors = [];
			for (const p of ST.peers.values()) anchors.push({ x: p.tx / 4, y: p.ty / 4 });
			if (!anchors.length) anchors.push({ x: state.store.player.x / 4, y: state.store.player.y / 4 });
			const FAST_R = 24 * CHUNK; // fallback radius, for a peer that reports no viewport (Manhattan, in cells)
			// 0.9.282 (MEASURED by the "out" counter of 0.9.281, 56 windows where the fast lane was busy):
			// 27 of its 48 chunks per batch, a median 57% and up to 81%, were outside what the peer could
			// actually see. The radius was a guess at a screen and it was a poor one: a screen at zoom 1 is
			// 480x272 cells, about 104 chunks, while the Manhattan diamond of 24 chunks covers 1152. Eleven
			// times too much, and at higher zoom far worse, because the diamond does not know about zoom at all.
			// Now the clients measure their own viewport from the renderer (see "vr" in the pos message,
			// verified against the log: px/cell 4, the player landing at 954,529 of 1920x1088, dead centre)
			// and the fast lane is exactly that rectangle, grown by a margin and by where the player is heading.
			// A peer that reports nothing - an older mod, a hidden window whose renderer has stopped - keeps
			// the old radius, so nobody ends up with less than before.
			// 0.9.283 widened this ring from 2 chunks to 6, guessing that the edge was why the client felt
			// worse. 0.9.284 puts it back, because the measurement says the guess was wrong and Andrew's
			// objection was right: a uniform ring grows as the SQUARE of its width and picks up whatever
			// happens to sit around, other containers included.
			//   what it cost (busy windows, same map, same spot):
			//     margin 2 chunks: near 38/batch, nearAge  41 ms, 1% of picks over a second, gate holding 25%
			//     margin 6 chunks: near 50/batch, nearAge  65 ms, 3% of picks over a second, gate holding 66%
			//   and from the clients themselves, the new "vis" counter, both directions of hosting:
			//     51% and 59% of everything received landed on the receiver's screen. Half the stream was
			//     paying for ground nobody was looking at.
			// So the static ring goes back to 2 chunks (80 cells), and the part that actually needs covering,
			// the ground you are running INTO, is handled by the lead below, which is directional and costs
			// nothing while you stand still. Measured camera speed in these sessions was about 8 cells/s, so
			// 80 cells is ten seconds of buffer at a walk; the lead is there for a sprint.
			const MARG_OKNA = 2 * CHUNK;         // the edge of the screen must not be the edge of what is fresh
			const LEAD_MS = 900;                 // and neither must the direction the player is running in
			const LEAD_MAX = 8 * CHUNK;
			const okna = [], promienie = [];
			for (const pp of ST.peers.values()) {
				if (pp.vr && pp.vr.length === 4 && now - (pp.vrT || 0) < 5000) {
					// vx/vy are world units per ms (see the pos handler); 4 world units make one cell
					let lx = (pp.vx || 0) * LEAD_MS / 4, ly = (pp.vy || 0) * LEAD_MS / 4;
					lx = Math.max(-LEAD_MAX, Math.min(LEAD_MAX, lx));
					ly = Math.max(-LEAD_MAX, Math.min(LEAD_MAX, ly));
					okna.push([
						Math.min(pp.vr[0], pp.vr[0] + lx) - MARG_OKNA,
						Math.min(pp.vr[1], pp.vr[1] + ly) - MARG_OKNA,
						Math.max(pp.vr[2], pp.vr[2] + lx) + MARG_OKNA,
						Math.max(pp.vr[3], pp.vr[3] + ly) + MARG_OKNA,
					]);
				} else promienie.push({ x: pp.tx / 4, y: pp.ty / 4 });
			}
			// no peer said anything at all: keep the old behaviour around whoever we know about
			if (!okna.length && !promienie.length) for (const an of anchors) promienie.push(an);
			w.oknaN = okna.length; w.promN = promienie.length;
			const FAR_HOT_MS = 600;    // a distant chunk at most ~1.6x/s (with no change at the player: full 10 Hz)
			if (!w.sentAt) w.sentAt = new Map();
			// 0.9.91: LAN/localhost is NOT a Steam relay — there the 24 KB/packet ceiling was our own brake.
			// With a fast connection (low RTT, zero backlog) we allow more; with a slow one it stays cautious.
			let linkPing = 0;
			for (const pp of ST.peers.values()) if (pp.ping != null && pp.ping > linkPing) linkPing = pp.ping;
			// 0.9.92: NO FIXED CEILING — the multiplier grows as long as the client keeps up, the connection handles it
			// and building the packet doesn't eat into the frame (buildMs measured below). Otherwise: sharply down.
			// FRAME TIME BUDGET (0.9.94) — it, not the connection, is the real bottleneck.
			// Building the packet happens in the host's render loop; applying it on the client does too.
			// Goal: packet below 8 ms. Above 15 ms the game starts to stutter — then sharply down.
			const pingOk = linkPing === 0 || linkPing < 60;
			const ms = w.buildMs || 0;
			// ST-FIX: these thresholds were also in PACKETS. At 63 Hz the acknowledgment window alone (the client acknowledges
			// 10x/s) is already ~6 unacknowledged packets, so the condition "lag <= 2" could never
			// be met — the throughput multiplier constantly sat at x1 (visible in every log). We count in ms.
			const lagMsB = w.lagMs || 0;
			// ST-FIX (cause of a clogged connection when a player JOINS): until there is NOT A SINGLE
			// acknowledgment, lag is zero by definition — the condition was met on every frame and the multiplier
			// climbed to x64 in ~2 s. Exactly when the host is sending the save and the full world (9216 chunks),
			// so the save transfer had no chance to squeeze through. In the log: "queue 9172 x64" right after joining.
			if (pingOk && w.ackSeen && lagMsB < 150 && ms < 8) w.boost = Math.min(64, (w.boost || 1) * 1.15);      // calm growth
			else if (ms > 15 || lagMsB > 400) w.boost = Math.max(1, (w.boost || 1) * 0.6);            // stuttering — we back off
			else { /* comfort zone: hold the level */ }
			const fast = w.boost || 1;
			// 0.9.93: CEILING 150 Mbit/s = 18.75 MB/s; packets fly ~10x/s, so 1.875 MB per packet.
			// 0.9.263: on Steam that ceiling is above what the transport can carry. sendP2PPacket takes
			// at most 1 MB in a single reliable packet and REFUSES anything larger — it returns false and
			// the packet simply never arrives, which on the receiving side looks like the mirror freezing
			// for no reason. We were not even reading that return value until now. 384 KB leaves room for
			// the header and for the compression ratio EMA being off by a factor of two on a bad estimate.
			const HARD_CAP = ST.net.transport === "steam" ? 384 * 1024 : Math.floor((150 * 1000 * 1000) / 8 / 10);
			// budget PROPORTIONAL to the cycle: at 8 ms the packets are small, at 100 ms they're big — bandwidth/s stays constant
						// how many packets are waiting at the slowest client to be APPLIED — if it grows, we send less,
			// because pouring in data faster than the client applies it only bloats its queue (0.9.111: 548 MB).
			let worstQd = 0;
			for (const pp of ST.peers.values()) if ((pp.qd | 0) > worstQd) worstQd = pp.qd | 0;
			const applyBrake = worstQd >= 12 ? 0.25 : worstQd >= 6 ? 0.5 : worstQd >= 3 ? 0.8 : 1;
			w.qd = worstQd;
			const budget = Math.min(HARD_CAP, Math.floor(4000 * (w.gap || 33) * w.rate * fast * applyBrake)); // 4 KB/ms = ~4 MB/s baseline // 8 KB x 30/s = the same as 24 KB x 10/s // 0.9.78: 24 KB/packet = ceiling ~240 KB/s (~1.9 Mbit/s) instead of ~960 KB/s.
			// LAN won't feel this (we rarely have that many changes anyway), and the internet stops choking on its own stream.
			const bpc = w.bpc || 512;                       // measured compressed bytes per chunk, updated after deflate
			// Floor of 2, not 8. At the measured bpc of ~2 KB a floor of 8 still held ~310 KB/s, which is
			// nearly the 349 KB/s that caused the jam: the controller had nowhere to go and degenerated
			// into pure on/off stalling.
			// 0.9.90: maxN is now just the UPPER limit of candidates — the packet size is decided by the byte budget below.
			const ratio = w.ratio || 0.12;                  // measured ratio: after compression / before
			// 0.9.97: will THIS packet go out raw? (the same conditions as at send time — we need to know them EARLIER,
			// because the budget depends on it: without compression, the output bytes are exactly what we serialize).
			// Does EVERY peer run this same build? Three separate decisions hang off it: the raw (uncompressed)
			// stream, the packet format (v6 cell delta) and the binary wire. All three have to fall back together
			// for anyone still on an older mod, so the check lives in one place.
			let sameVerAll = ST.peers.size > 0;
			for (const pp of ST.peers.values()) if (pp.modVer !== VER) sameVerAll = false;
			// 0.9.274: three things hang off this flag, and when it is false the mirror silently falls back to
			// whole rows and no raw stream — which is what happened in the local test of 16.09 even though both
			// sides logged "mod version OK". A flag that expensive should say who is holding it down.
			if (!sameVerAll && now - (w.verLogT || 0) > 20000) {
				w.verLogT = now;
				const kto = [];
				for (const [pid, pp] of ST.peers) if (pp.modVer !== VER) kto.push((pp.nick || "?") + " [" + pid + "] ver=" + (pp.modVer || "unknown"));
				log("CELL DELTA OFF (peer version): " + (kto.join(", ") || "no peers") + " — I am " + VER);
			}
			let willSendRaw = sameVerAll && ST.net.transport === "ws";
			if (willSendRaw) for (const pid of ST.peers.keys()) {
				const ip = (String(pid).match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/) || [])[0];
				if (!ip) { if (String(pid) !== "host") willSendRaw = false; continue; }
				const [A, B] = ip.split(".").map(Number);
				if (!(A === 127 || A === 10 || (A === 192 && B === 168) || (A === 172 && B >= 16 && B <= 31) || (A === 169 && B === 254))) willSendRaw = false;
			}
			// without compression, output bytes = serialized bytes, so we do NOT divide by the ratio
			// 0.9.265: with the cell delta one byte carries roughly five times more world than it used to, so the
			// floor drops with it — otherwise the same 256 KB would quietly mean five times the content per packet.
			const podloga = sameVerAll ? 64 * 1024 : 256 * 1024;
			// 0.9.267: the in-flight factor scales the WHOLE budget, floor included — otherwise the floor would
			// undo the proportional throttle the moment it started to matter.
			// 0.9.269: the old controller's budget still applies as an UPPER bound, but the wire budget is the
			// token bucket above, converted from output bytes to serialized bytes through the measured ratio.
			const stary = willSendRaw ? Math.max(podloga, budget) : Math.max(podloga, Math.floor(budget / Math.max(0.02, ratio)));
			const zTokenow = Math.floor((w.tok || 0) / (willSendRaw ? 1 : Math.max(0.02, ratio)));
			const rawBudget = Math.max(4 * 1024, Math.min(stary, zTokenow));
			const maxN = Math.max(2, Math.min(6000, Math.floor(budget / bpc) * 8));
			const nearN = Math.min(3000, maxN);              // what players can actually see gets the budget first
			// Fast lane usage from the PREVIOUS batch, which is stable frame to frame. Without it we
			// reserved all 120 slots even when nothing near the players was dirty, so the far lane got
			// scraps on a link that was doing nothing.
			const nearEst = Math.min(nearN, w.lastNear || 0);
			// The floor min(20, maxN) must not exceed maxN, otherwise throttling would never take effect
			const slowN = Math.max(Math.min(20, maxN), Math.min(maxN - nearEst, Math.ceil(w.pending.size / 20)));
			// 0.9.272 COST-AWARE RATE LIMIT, WITHDRAWN IN 0.9.273 (see the note below it). Andrew found the
			// trigger himself: a large container of amethyst
			// that is stirred continuously for sorting. Stop the stirring and the stutter goes; start it again
			// and it comes back every few seconds. The measurements from 0.9.271 say why, and they say it is
			// not a bug any more. That pile is roughly 225x300 cells, about 50 chunks, and EVERY cell in it
			// changes every tick. The cell delta saves nothing there — when everything changed, the delta is
			// the whole thing — so one refresh of the pile alone is about 950 KB raw, near 100 KB compressed,
			// against a link that carries about 250 KB/s. The pile by itself would eat the entire channel at
			// two refreshes a second, and it was doing exactly that: near lane oversubscribed about 2:1, cut
			// 2000-3100 chunks per 2 s window, while the client sat idle at 160 FPS with nothing to apply.
			// No amount of compression or pacing fixes that, and it gets worse as more containers are built.
			// What we CAN decide is who pays. Until now the carry rotation shared the shortfall evenly, so the
			// water, the conveyors and the weapon effects degraded together with the pile. Now every chunk
			// remembers what it cost to serialize last time, and an expensive one has to WAIT in proportion to
			// that cost: all the expensive chunks together may use at most HOT_SHARE of the measured goodput.
			// The pile then animates at about one refresh a second — coarse, but it is visual noise anyway —
			// and the rest of the link stays free for the things whose timing actually matters.
			// 0.9.273: THE GATE IS GONE, and the reason is the useful part. Delaying a chunk because it is
			// expensive delays everything inside it, and a chunk does not contain one kind of change. When a
			// player grabs material, the cells that empty and the cells that collapse into the gap are in the
			// SAME chunk as the cosmetic churn that made it expensive, so the gate held the correction back
			// together with the noise: the hole stayed open and the material above it hung in the air for as
			// long as the wait lasted. That is worse than the stutter it was meant to cure, and no amount of
			// tuning fixes it, because the gate has no idea what it is delaying.
			// What survives is the cost table, and a measurement. The world layers are not equally important:
			//   mapData    4 B  is the RGBA texture, uploaded straight to the GPU (texSubImage2D in the game's
			//                   renderer). Its alpha byte is read back by the simulation, so alpha is meaning
			//                   and RGB is appearance.
			//   cellIds    4 B  is a per-cell element INSTANCE id (range 1000001..2000000), what collision and
			//                   the grabber read. When a grain moves, its id travels with it.
			//   type       1 B  is which element it is, wall/shadow/auth are the rest.
			// Stirring a uniform pile mostly permutes identity and dither inside a mass that stays, cell for
			// cell, the same material. If that is where the bytes go, then those bytes can be slowed down
			// without touching anything a player can act on, which is the difference between this and the gate.
			// If instead most of it is genuine structure, there is nothing to win here and we will know that
			// too. So: measure first, decide after.
			const near = [], far = [];
			for (const a of w.pending) {
				// Early break. The Set is FIFO, so the first nearN and slowN hits are EXACTLY the chunks a
				// full scan would pick. Without it every batch walked the WHOLE queue (O(|pending|)) and
				// allocated a far array of that size 10x per second, on the renderer thread inside the
				// frame hook. Bigger backlog gave longer frames, fewer batches per second, and a bigger
				// backlog again, which is why lag grew the longer a session ran.
				if (near.length >= nearN && far.length >= slowN) break;
				const ax = (a % d.cx) * CHUNK, ay = Math.floor(a / d.cx) * CHUNK;
				// 0.9.282: is this chunk on somebody's screen (or about to be)? The boxes already carry the
				// margin and the movement lead, so this is a plain rectangle overlap.
				let bliski = false;
				for (const o of okna) {
					if (ax + CHUNK > o[0] && ax < o[2] && ay + CHUNK > o[1] && ay < o[3]) { bliski = true; break; }
				}
				if (!bliski && promienie.length) {
					for (const an of promienie) {
						if (Math.abs(ax - an.x) + Math.abs(ay - an.y) <= FAST_R) { bliski = true; break; }
					}
				}
				if (bliski) {
					if (near.length < nearN) {
						near.push(a);
						const ostH = w.sentAt && w.sentAt.get(a);   // 0.9.273: the 0.9.272 gate stood here
						// 0.9.266: how stale is a chunk NEXT TO A PLAYER by the time we pick it up again? This is
						// the number the smoothness complaint is really about — total chunks per second says
						// nothing about whether the part of the world someone is staring at is being refreshed.
						const ost = ostH;
						if (ost !== undefined) {
							const wiek = now - ost;
							// 0.9.267: the raw maximum was useless — it was always ~48 s, because a chunk that had
							// simply been quiet for a minute and then changed reports its whole quiet time. What we
							// actually want to know is how often the ground beside a player comes back STALE, so we
							// count the ones over a second and cap the "worst" at a window where it still means
							// something.
							w.naSum = (w.naSum || 0) + wiek; w.naN = (w.naN || 0) + 1;
							if (wiek > 1000) w.naLate = (w.naLate || 0) + 1;
							if (wiek > (w.naMax || 0) && wiek <= 5000) w.naMax = wiek;
						}
					}
				}
				else if (far.length < slowN) {
					// 0.9.153: SLOW CLOCK for distant hot chunks. Conveyors change cells every tick, so their
					// chunk comes back for sending ~10x/s — cosmetics that nobody sees from afar (Sessional:
					// "boatload of materials on conveyors" = hundreds of KB/s). A distant chunk is resent
					// no sooner than every FAR_HOT_MS; a one-off change far away (no fresh sentAt) goes out immediately.
					// The chunk stays in pending — nothing is lost, it just waits for its own clock.
					const lastTx = w.sentAt && w.sentAt.get(a);
					if (lastTx === undefined || now - lastTx >= FAR_HOT_MS) far.push(a);
				}
			}
			w.lastNear = near.length; // feeds nearEst on the next batch
			// PRIORITY first (grabber/vacuum) — ALWAYS sent, they bypass the near/far limit (fix "re-grab: miroir ne livre pas").
			const prio = w.priority.size ? [...w.priority] : [];
			w.priority.clear();
			// far is already capped to slowN by the loop above, so the old far.slice(0, slowN) is redundant
			// 0.9.266 (STARVATION, the likely "freezes for a second or two" mechanism): the batch is cut by a
			// time budget, and everything past the cut went back to the END of the queue. The selection loop walks
			// the queue in order, so those same chunks landed at the end of the near lane again, were cut again,
			// and kept losing for as long as the near lane was bigger than one batch. Some of the ground beside a
			// player then refreshed every batch while the rest of it sat still for seconds. Now whatever the
			// budget cut is CARRIED and goes first in the next batch, so no chunk can lose twice in a row.
			// (prio.includes() inside a filter was also O(near x prio) 40 times a second; one Set does it all.)
			const carry = w.carry && w.carry.length ? w.carry : null;
			w.carry = null;
			const wziete = new Set();
			const take = [];
			const dodaj = (arr) => { if (arr) for (const i of arr) if (!wziete.has(i)) { wziete.add(i); take.push(i); } };
			dodaj(prio); dodaj(carry); dodaj(near); dodaj(far);
			for (const i of take) w.pending.delete(i);
			w.lanP = (w.lanP || 0) + prio.length; w.lanN = (w.lanN || 0) + near.length; w.lanF = (w.lanF || 0) + far.length;
			// v4 serialization: [u16 cx][u16 cy][u8 cw][u8 ch] + per-cell: 4 maps + 1 wall + 1 shadow + 1 auth + 4 cellIds + 1 elemType = 12 B
			const parts = [];
			let size = 0;
			let fogSkipped = 0;
			// CELL DELTA (v6). Measured on the LAN session of 15.09: of the 40 cells in a row that changed,
			// on average 4.2-4.8 actually differ, and wall/shadow/authorization did not change ONCE in the whole
			// session. Sending the whole row was ~87% waste in raw bytes and, after deflate, still 63-81%.
			// A peer on an older mod cannot read v6, so for that peer everyone falls back to v5.
			const deltaKom = sameVerAll;
			if (deltaKom && !w.rowPrev) w.rowPrev = new Map();
			// immediate fuse: after a really expensive packet we cut the raw budget in half
			const rawBudgetEff = (w.buildMs || 0) > 30 ? Math.floor(rawBudget / 2) : rawBudget;
			const buildT0 = performance.now(); // 0.9.92: we measure the cost of building the packet
			// 0.9.265: the build budget follows the cycle instead of being a flat 10 ms — see the note next to w.gap
			const budowaMs = Math.max(3, Math.min(10, (w.gap || 33) * 0.25));
			let stoppedAt = -1;
			for (let ti = 0; ti < take.length; ti++) {
				if (size >= rawBudgetEff) { stoppedAt = ti; break; } // budget exhausted — the rest will go back to the queue
				// 0.9.155: TIME budget. Hashing dirty-but-unchanged chunks doesn't produce bytes,
				// so the byte budget never tripped, while the frame burned (measured: 80 ms at a factory).
				if (ti > 0 && performance.now() - buildT0 > budowaMs) { stoppedAt = ti; break; }
				const idx = take[ti];
				const ccx = idx % d.cx, ccy = Math.floor(idx / d.cx);
				const x0 = ccx * CHUNK, y0 = ccy * CHUNK;
				const cw = Math.min(CHUNK, W - x0), ch = Math.min(CHUNK, H - y0);
				if (cw <= 0 || ch <= 0) continue;
				// FOG-SKIP (join optimization): a chunk that is COMPLETELY undiscovered (shadow=255 everywhere)
				// is black on the client — we don't send it. After discovery the shadow changes → the chunk becomes dirty → it will be sent.
				// (initial fill: out of 9216 chunks, only the discovered part of the map actually goes out — joining is 2-4x faster)
				if (shadow) {
					let fogged = true;
					for (let r = 0; r < ch && fogged; r++) {
						const src = (y0 + r) * W + x0;
						for (let c = 0; c < cw; c++) if (shadow[src + c] !== 255) { fogged = false; break; }
					}
					if (fogged) { fogSkipped++; continue; }
				}
				// ROW-DELTA v5: a hash per ROW (12*cw bytes across 6 layers); we send only changed rows.
				// Horizontal movement (water in a channel, conveyors) = 1-3 rows instead of the full 40 → 2-10x less bandwidth.
				// Memory: 9216 chunks × 40 × 4B ≈ 1.5 MB. Full re-send = rowH.clear() in enqueueFullWorld.
				if (!w.rowH) w.rowH = new Map();
				let rh = w.rowH.get(idx);
				if (!rh || rh.length < ch) { rh = new Uint32Array(CHUNK); rh.fill(0); w.rowH.set(idx, rh); }
				const etRows = new Uint8Array(cw * ch); // the element-type layer computed once (hash + write)
				const et32 = ((cw * ch) & 3) === 0 ? new Uint32Array(etRows.buffer, 0, (cw * ch) >>> 2) : null;
				if (cellIds32 && etype) {
					for (let r = 0; r < ch; r++) for (let cc = 0; cc < cw; cc++) {
						const cid = cellIds32[(y0 + r) * W + x0 + cc];
						etRows[r * cw + cc] = (cid >= ELEMENTS_MIN && cid <= ELEMENTS_MAX) ? (etype[cid - ELEMENTS_MIN] || 0) & 0xff : 0;
					}
				}
				// 0.9.267 (MEASURED, 0.9.266 diagnostics): the host was pinned at ~17 chunks per batch with
				// "ser 4ms" = exactly its whole time budget, while the link sat at 150-200 KB/s and the queue was
				// almost empty. So the mirror was not short of bandwidth, it was short of CPU — and all of that CPU
				// went here, hashing 19200 bytes per chunk one byte at a time (40 rows x 480 B across 6 layers).
				// Reading the same memory 4 bytes at a time cuts it to 120 steps per row instead of 480. Same
				// detection, a quarter of the work. The old byte path stays for the (unlikely) unaligned case.
				// It also stops allocating a Uint8Array view per ROW for the cellId layer — 40 throwaway objects
				// per chunk, thousands per second, all of it garbage for the collector to sweep.
				const rowAlign = ((W & 3) === 0) && ((x0 & 3) === 0) && ((cw & 3) === 0);
				const cw4 = cw >>> 2;
				// 0.9.276 split this hash into "structure" and "appearance" so that rows where only the RGB moved
				// could travel on a slower clock. 0.9.277 TOOK IT BACK OUT, and the number is worth keeping:
				// measured over every chunk, the bytes divide str85 / id9 / rgb5. Only five per cent of what we
				// send is pure colour, and a row that has a colour change almost always has a structural change
				// in it too, so the deferral never had anything to defer: the "cosm" counter stayed at zero for
				// the whole session and the upload did not move. The idea was reasonable, the world just is not
				// shaped that way. What churns is real material moving, not paint.
				const fnvRow = (rowAlign && map32 && wall32 && cellIds32 && et32 && (!shadow || shadow32) && (!auth || auth32)) ? (r) => {
					let h = 0x811c9dc5;
					const c0 = (y0 + r) * W + x0;      // cell index; map32 and cellIds32 are 1 word per cell
					const b0 = c0 >>> 2;               // byte layers: 4 cells per word
					for (let i = 0; i < cw; i++) { h ^= map32[c0 + i]; h = Math.imul(h, 0x01000193) >>> 0; }
					for (let i = 0; i < cw4; i++) { h ^= wall32[b0 + i]; h = Math.imul(h, 0x01000193) >>> 0; }
					if (shadow32) for (let i = 0; i < cw4; i++) { h ^= shadow32[b0 + i]; h = Math.imul(h, 0x01000193) >>> 0; }
					if (auth32) for (let i = 0; i < cw4; i++) { h ^= auth32[b0 + i]; h = Math.imul(h, 0x01000193) >>> 0; }
					for (let i = 0; i < cw; i++) { h ^= cellIds32[c0 + i]; h = Math.imul(h, 0x01000193) >>> 0; }
					const e0 = (r * cw) >>> 2;
					for (let i = 0; i < cw4; i++) { h ^= et32[e0 + i]; h = Math.imul(h, 0x01000193) >>> 0; }
					return h === 0 ? 1 : h; // 0 reserved = "never sent"
				} : (r) => {
					let h = 0x811c9dc5;
					const m0 = ((y0 + r) * W + x0) * 4, s0 = (y0 + r) * W + x0;
					for (let i = 0; i < cw * 4; i++) { h ^= map[m0 + i]; h = (h * 0x01000193) >>> 0; }
					for (let i = 0; i < cw; i++) { h ^= wall[s0 + i]; h = (h * 0x01000193) >>> 0; }
					if (shadow) for (let i = 0; i < cw; i++) { h ^= shadow[s0 + i]; h = (h * 0x01000193) >>> 0; }
					if (auth) for (let i = 0; i < cw; i++) { h ^= auth[s0 + i]; h = (h * 0x01000193) >>> 0; }
					if (sim) { const sb = new Uint8Array(sim.buffer, sim.byteOffset + s0 * 4, cw * 4); for (let i = 0; i < cw * 4; i++) { h ^= sb[i]; h = (h * 0x01000193) >>> 0; } }
					for (let i = 0; i < cw; i++) { h ^= etRows[r * cw + i]; h = (h * 0x01000193) >>> 0; }
					return h === 0 ? 1 : h; // 0 reserved = "never sent"
				};
				const mask = new Uint8Array(5); // 40 bits
				const rows = [];
				for (let r = 0; r < ch; r++) {
					const h = fnvRow(r);
					if (rh[r] !== h) { rh[r] = h; mask[r >> 3] |= 1 << (r & 7); rows.push(r); }
				}
				if (!rows.length) continue; // nothing changed in the chunk
				if (deltaKom) {
					// v6 layout per chunk: the same 11-byte header, then per marked row
					//   [u8 kind] kind 1 = the whole row exactly as in v5 (12*cw bytes, layer-major)
					//             kind 0 = [5 B cell mask][ per set cell: u8 layer mask + only the changed layers ]
					//   layer mask bits: 1 colour(4B) 2 wall(1B) 4 shadow(1B) 8 auth(1B) 16 cellId(4B) 32 type(1B)
					// A delta is only emitted for a row whose PREVIOUSLY SENT bytes we still remember; that memory
					// is what the client is holding, so the delta always applies to the right base. Chunks we no
					// longer remember simply get full rows, which is why falling out of the LRU is harmless.
					const maxW = 1 + Math.max(cw * 12, 5 + cw * 13);
					const buf = new Uint8Array(11 + rows.length * maxW);
					const dv = new DataView(buf.buffer);
					dv.setUint16(0, ccx, true); dv.setUint16(2, ccy, true);
					buf[4] = cw; buf[5] = ch;
					buf.set(mask, 6);
					let o = 11;
					let pr = w.rowPrev.get(idx);
					if (!pr) {
						// LRU over chunks: 512 * 40 rows * 480 B is about 10 MB at worst, and the hot set around
						// the players is far smaller than that in practice.
						if (w.rowPrev.size >= 512) { const k0 = w.rowPrev.keys().next().value; w.rowPrev.delete(k0); }
						pr = new Map(); w.rowPrev.set(idx, pr);
					} else { w.rowPrev.delete(idx); w.rowPrev.set(idx, pr); }
					const cur = new Uint8Array(cw * 12);
					const cm = new Uint8Array(5), lm = new Uint8Array(cw);
					for (const r of rows) {
						const m0 = ((y0 + r) * W + x0) * 4, s0 = (y0 + r) * W + x0;
						cur.set(map.subarray(m0, m0 + cw * 4), 0);
						cur.set(wall.subarray(s0, s0 + cw), cw * 4);
						if (shadow) cur.set(shadow.subarray(s0, s0 + cw), cw * 5); else cur.fill(0, cw * 5, cw * 6);
						if (auth) cur.set(auth.subarray(s0, s0 + cw), cw * 6); else cur.fill(0, cw * 6, cw * 7);
						if (sim) cur.set(new Uint8Array(sim.buffer, sim.byteOffset + s0 * 4, cw * 4), cw * 7); else cur.fill(0, cw * 7, cw * 11);
						cur.set(etRows.subarray(r * cw, r * cw + cw), cw * 11);
						const old = pr.get(r);
						let zapisane = false;
						if (old && old.length === cur.length) {
							cm.fill(0);
							let ile = 0, tresc = 0;
							for (let c = 0; c < cw; c++) {
								let mm = 0;
								for (let b = 0; b < 4; b++) if (old[c * 4 + b] !== cur[c * 4 + b]) { mm |= 1; break; }
								if (old[cw * 4 + c] !== cur[cw * 4 + c]) mm |= 2;
								if (old[cw * 5 + c] !== cur[cw * 5 + c]) mm |= 4;
								if (old[cw * 6 + c] !== cur[cw * 6 + c]) mm |= 8;
								for (let b = 0; b < 4; b++) if (old[cw * 7 + c * 4 + b] !== cur[cw * 7 + c * 4 + b]) { mm |= 16; break; }
								if (old[cw * 11 + c] !== cur[cw * 11 + c]) mm |= 32;
								lm[c] = mm;
								if (mm) {
									cm[c >> 3] |= 1 << (c & 7); ile++;
									tresc += 1 + ((mm & 1) ? 4 : 0) + ((mm & 2) ? 1 : 0) + ((mm & 4) ? 1 : 0)
										+ ((mm & 8) ? 1 : 0) + ((mm & 16) ? 4 : 0) + ((mm & 32) ? 1 : 0);
								}
								// 0.9.273 measured here which layers the bytes go to, per changed cell, and 0.9.287
								// removed the measurement once it had answered: str 76 / id 19 / rgb 5, stable across
								// sessions. That is what closed the "send appearance on a slower clock" idea (0.9.277)
								// and it is what the encoding lab (0.9.285/286) was aimed at. Keeping the classifier
								// would mean a byte compare and three branches for every changed cell, tens of
								// thousands a second, to re-derive a number we already have.
							}
							if (5 + tresc < cw * 12) {
								buf[o++] = 0;
								buf.set(cm, o); o += 5;
								if (ile) for (let c = 0; c < cw; c++) {
									const mm = lm[c];
									if (!mm) continue;
									buf[o++] = mm;
									if (mm & 1) { buf.set(cur.subarray(c * 4, c * 4 + 4), o); o += 4; }
									if (mm & 2) buf[o++] = cur[cw * 4 + c];
									if (mm & 4) buf[o++] = cur[cw * 5 + c];
									if (mm & 8) buf[o++] = cur[cw * 6 + c];
									if (mm & 16) { buf.set(cur.subarray(cw * 7 + c * 4, cw * 7 + c * 4 + 4), o); o += 4; }
									if (mm & 32) buf[o++] = cur[cw * 11 + c];
								}
								zapisane = true;
							}
						}
						if (!zapisane) { buf[o++] = 1; buf.set(cur, o); o += cw * 12; }
						pr.set(r, cur.slice(0));
					}
					const wyc = buf.subarray(0, o);
					parts.push(wyc); size += wyc.length;
				} else {
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
			}
			// 0.9.266 (BUG): sentAt used to be stamped on EVERY chunk we selected, including the tail the byte or
			// time budget never got to. Those chunks went back into the queue already marked "just sent", so the
			// FAR_HOT_MS clock started ticking for a send that never happened and the chunk was made to wait up to
			// another 600 ms on top of its queue time. Only stamp what was really serialized.
			const wyslane = stoppedAt >= 0 ? stoppedAt : take.length;
			for (let ti = 0; ti < wyslane; ti++) w.sentAt.set(take[ti], now);
			if (stoppedAt >= 0) {
				w.cut = (w.cut || 0) + (take.length - stoppedAt);
				w.carry = take.slice(stoppedAt);   // 0.9.266: served first in the next batch, see above
				for (let ti = stoppedAt; ti < take.length; ti++) w.pending.add(take[ti]); // 0.9.90: we don't lose the rest
			}
			if (!parts.length) { w.busy = false; return; }
			const all = new Uint8Array(size);
			let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
			// 0.9.95: fast connection + the same version for everyone => we send RAW (saving CPU
			// on both sides: no packing on the host, no unpacking on the client).
						// A peer on a local/private address => bandwidth is free => we don't pack (saving CPU
			// on both sides). Peer identifiers look like "ws:::ffff:127.0.0.1:5xxxx" or "ws:192.168...".
			let allLocal = ST.peers.size > 0 && ST.net.transport === "ws";
			for (const pid of ST.peers.keys()) {
				const ip = (String(pid).match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/) || [])[0];
				if (!ip) { if (String(pid) !== "host") allLocal = false; continue; }   // "host" = we are the client
				const [A, B] = ip.split(".").map(Number);
				const priv = A === 127 || A === 10 || (A === 192 && B === 168) || (A === 172 && B >= 16 && B <= 31) || (A === 169 && B === 254);
				if (!priv) allLocal = false;
			}
			const rawOk = willSendRaw && sameVerAll && allLocal && all.length < 8 * 1024 * 1024;
			const __ser = performance.now() - buildT0; // time BLOCKING the frame (without waiting for compression)
			w.serMs = w.serMs ? w.serMs * 0.7 + __ser * 0.3 : __ser;
			const packed = rawOk ? all : await deflate(all);
			w.rawMode = rawOk;
			w.seq++; // batch number the client echoes back in wcack
			// 0.9.78: remember the chunks of this packet — the row hashes are "conditional" until the client's ACK.
			if (!w.unacked) w.unacked = new Map();
			w.unacked.set(w.seq, { idx: take.slice(0), t: now, bytes: packed.length });   // 0.9.264: bytes -> goodput + in-flight gate
			w.tok = (w.tok || 0) - packed.length;   // 0.9.269: pay for the packet out of the wire budget
			// q = size of the host's queue (progress countdown on the client, 0.9.62) + sq = packet number (wcack, PR #8)
			sendWorldPacket({ t: "wc", v: deltaKom ? 6 : 5, z: w.rawMode ? 0 : 1, sq: w.seq, wid: state.store.meta && state.store.meta.worldId, g: ST._worldGen || undefined, scene: state.store.scene && state.store.scene.active, W, H, n: parts.length, q: w.pending.size }, packed, sameVerAll && (ST.net.transport === "ws" || ST.net.transport === "steam")); // 0.9.263: binary on Steam too (marker 0x00 in st-main.js)
			// EMA of what a chunk really costs on the wire, drives the batch budget above. Cheap chunks
			// (few changed rows) earn a bigger portion, expensive ones a smaller one, so the byte ceiling
			// holds regardless of what the sim is doing.
			// 0.9.265: the lab reads the v5 layer-major layout, so it only runs when that is what we are sending.
			// Its job is done anyway: it is what measured the cell delta at 63-81% off the wire.
			const bpcNow = packed.length / parts.length;
			w.bpc = w.bpc ? w.bpc * 0.8 + bpcNow * 0.2 : bpcNow;
			const ratioNow = packed.length / Math.max(1, all.length);
			w.ratio = w.ratio ? w.ratio * 0.8 + ratioNow * 0.2 : ratioNow;
			const buildMsNow = performance.now() - buildT0;
			w.buildMs = w.buildMs ? w.buildMs * 0.7 + buildMsNow * 0.3 : buildMsNow; // brake: we don't eat into the host's frame // 0.9.90: how much actually remains after compression
			// statystyki
			w.applyBytes += packed.length; w.applyCount += parts.length;
			w.statN = (w.statN || 0) + 1;   // batches in this stat window, so the lane counts read per batch
			w.fogSkipped = (w.fogSkipped || 0) + fogSkipped;
			if (now - w.statT > 2000) {
				// lag and rate appended raw, no i18n: this is a diagnostic readout, not player facing text.
				// Blank when no client acks, so an un-throttled session does not show a misleading zero.
				const cc = (w.ackSeen ? "  lag " + w.lag + "/" + Math.round(w.lagMs || 0) + "ms (" + Math.round(w.rate * 100) + "%)" + (w.qd ? " qd" + w.qd : "") + (w.goodput ? " gp" + Math.round(w.goodput / 1024) + "KB/s if" + Math.round((w.inflight || 0) / 1024) + "KB" : "") : "") + "  x" + (Math.round((w.boost || 1) * 10) / 10) + "  ser " + Math.round(w.serMs || 0) + "/" + Math.round(w.buildMs || 0) + "ms" + "  " + Math.round(1000/(w.gap||33)) + "Hz" + (w.rawMode ? "  raw" : "");
				// 0.9.266 diagnostics for the "freezes for 1-2 s every 5 s" report:
				//   lanes  = chunks picked per batch from the priority / near-player / distant lanes
				//   cut    = chunks selected but dropped by the budget and pushed back into the queue
				//   nearAge= how old a chunk beside a player is when we pick it again (average / worst)
				//   hold   = milliseconds the in-flight gate kept the mirror waiting in this window
				const batches = Math.max(1, w.statN || 1);
				const dg = "  lanes " + Math.round((w.lanP || 0) / batches) + "/" + Math.round((w.lanN || 0) / batches)
					+ "/" + Math.round((w.lanF || 0) / batches)
					+ (w.cut ? "  cut " + w.cut : "")
					+ (w.naN ? "  nearAge " + Math.round(w.naSum / w.naN) + "/" + Math.round(w.naMax || 0) + "ms late" + (w.naLate || 0) + "/" + w.naN : "")
					+ (w.holdMs ? "  hold " + Math.round(w.holdMs) + "ms" : "")
					+ ("  tok " + Math.round((w.tok || 0) / 1024) + "KB")
					+ ((w.oknaN || w.promN) ? "  vp " + (w.oknaN || 0) + (w.promN ? "+r" + w.promN : "") : "")
					+ ((w.skIf || w.skTok) ? "  skip if" + (w.skIf || 0) + "/tok" + (w.skTok || 0) : "")
					+ (() => {
						const tally = ST._tx; if (!tally) return "";
						const lista = Object.keys(tally).filter((k) => k !== "wc").map((k) => [k, tally[k]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
						ST._tx = {};
						return lista.length ? "  tx " + lista.map((p) => p[0] + " " + Math.round(p[1] / 1024) + "KB").join(" ") : "";
					})();
				const info = t("sync_up", Math.round(w.applyBytes / 2048), Math.round(w.applyCount / 2), w.pending.size) + cc + dg;
				setSyncInfo(info);
				log("SYNC-HOST", info, w.fogSkipped ? "(fog-skip: " + w.fogSkipped + ")" : "");
				w.applyBytes = 0; w.applyCount = 0; w.statT = now; w.fogSkipped = 0;
				w.lanP = 0; w.lanN = 0; w.lanF = 0; w.cut = 0; w.naSum = 0; w.naN = 0; w.naMax = 0; w.naLate = 0; w.holdMs = 0; w.statN = 0; w.skIf = 0; w.skTok = 0;
			}
		} catch (e) { log("batch error:", e.message); }
		w.busy = false;
	}

	// ------------------------------------------------------------------
	// WORLD SYNC — CLIENT: applying batches + simulation pause
	// ------------------------------------------------------------------
	function setClientPaused(paused) {
		if (!ST.state || ST.wsx.paused === paused) return;
		const mgr = managerWorker(ST.state);
		if (!mgr) { log("ERROR: no manager worker to pause"); return; }
		// 0.9.129: we throttle via SPEED (68), not the pause flag (54) — the flag breaks rendering on the client
		// and gets touched by the game on save. We clear the flag on resume, in case it was left over from an older version.
		mgr.postMessage([68, paused ? 0 : 1]);
		if (!paused) mgr.postMessage([54, false]);
		ST.wsx.paused = paused;
		log("Client simulation:", paused ? "PAUSED (host mirror)" : "resumed");
	}

	// 0.9.110: NAKLADANIE LUSTRA W PORCJACH.
	// A large packet carries a lot of chunks (that's good: throughput), but applying it in a single frame
	// froze the picture for ~240 ms. So packets go into a FIFO queue (order is mandatory —
	// the row-delta protocol sends ONLY changed rows, so skipping a packet leaves a hole),
	// and every frame gets a limited time budget for applying.
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
			const tStos = it.tApply || (it.tApply = performance.now());
			while (o + 6 <= raw.length) {
				const ccx = dv.getUint16(o, true), ccy = dv.getUint16(o + 2, true);
				const cw = raw[o + 4], ch = raw[o + 5];
				// v5 ROW-DELTA: a 5-byte row mask; the stream contains ONLY the marked rows (the rest unchanged)
				if (o + 11 > raw.length) break;
				const mask = raw.subarray(o + 6, o + 11);
				o += 11;
				const x0 = ccx * CHUNK, y0 = ccy * CHUNK;
				// 0.9.283 (measurement only). Every host-side number says the mirror got better, and the player
				// on the other end says it looks worse. Both can be true, because the host measures what it
				// SENDS and the client judges what it SEES. So measure that directly, on the client, where the
				// viewport is already known: of the chunks arriving, how many land on my screen, and how long
				// it has been since that same chunk was last refreshed. "vis N/s" and "gap M ms" is what
				// smoothness actually is, and it is comparable between builds in the same spot.
				if (ST._viewRect) {
					const vr = ST._viewRect;
					if (x0 + CHUNK > vr[0] && x0 < vr[2] && y0 + CHUNK > vr[1] && y0 < vr[3]) {
						if (!ST._vidT) ST._vidT = new Map();
						if (ST._vidT.size > 4000) ST._vidT.clear();
						const kluczV = ccx + ccy * 4096;
						const poprzV = ST._vidT.get(kluczV);
						ST._vidT.set(kluczV, tStos);
						const wV = ST.wsx;
						if (wV) {
							wV.vidN = (wV.vidN || 0) + 1;
							if (poprzV !== undefined && tStos > poprzV) { wV.vidGap = (wV.vidGap || 0) + (tStos - poprzV); wV.vidGapN = (wV.vidGapN || 0) + 1; }
						}
					}
				}
				const rows = [];
				for (let r = 0; r < ch; r++) if (mask[r >> 3] & (1 << (r & 7))) rows.push(r);
				if (it.v === 6) {
					// v6: per row a kind byte, then either the whole row or a cell delta. See the serializer.
					let zly = false;
					for (const r of rows) {
						if (o + 1 > raw.length) { zly = true; break; }
						const kind = raw[o++];
						const d1 = (y0 + r) * W + x0;
						if (kind === 1) {
							if (o + cw * 12 > raw.length) { zly = true; break; }
							map.set(raw.subarray(o, o + cw * 4), d1 * 4);
							wall.set(raw.subarray(o + cw * 4, o + cw * 5), d1);
							if (shadow) shadow.set(raw.subarray(o + cw * 5, o + cw * 6), d1);
							if (auth) auth.set(raw.subarray(o + cw * 6, o + cw * 7), d1);
							if (sim) new Uint8Array(sim.buffer, sim.byteOffset + d1 * 4, cw * 4).set(raw.subarray(o + cw * 7, o + cw * 11));
							for (let cc = 0; cc < cw; cc++) {
								const ty = raw[o + cw * 11 + cc];
								if (etype && cellIds32) { const cid = cellIds32[d1 + cc]; if (cid >= ELEMENTS_MIN && cid <= ELEMENTS_MAX) etype[cid - ELEMENTS_MIN] = ty; }
							}
							o += cw * 12;
						} else {
							if (o + 5 > raw.length) { zly = true; break; }
							const cmk = raw.subarray(o, o + 5); o += 5;
							for (let c = 0; c < cw; c++) {
								if (!(cmk[c >> 3] & (1 << (c & 7)))) continue;
								if (o + 1 > raw.length) { zly = true; break; }
								const mm = raw[o++];
								const need = ((mm & 1) ? 4 : 0) + ((mm & 2) ? 1 : 0) + ((mm & 4) ? 1 : 0) + ((mm & 8) ? 1 : 0) + ((mm & 16) ? 4 : 0) + ((mm & 32) ? 1 : 0);
								if (o + need > raw.length) { zly = true; break; }
								const p1 = d1 + c;
								if (mm & 1) { const dm = p1 * 4; map[dm] = raw[o]; map[dm + 1] = raw[o + 1]; map[dm + 2] = raw[o + 2]; map[dm + 3] = raw[o + 3]; o += 4; }
								if (mm & 2) wall[p1] = raw[o++];
								if (mm & 4) { if (shadow) shadow[p1] = raw[o]; o++; }
								if (mm & 8) { if (auth) auth[p1] = raw[o]; o++; }
								if (mm & 16) { if (cellIds32) cellIds32[p1] = (raw[o] | (raw[o + 1] << 8) | (raw[o + 2] << 16) | (raw[o + 3] << 24)) >>> 0; o += 4; }
								if (mm & 32) { const ty = raw[o++]; if (etype && cellIds32) { const cid = cellIds32[p1]; if (cid >= ELEMENTS_MIN && cid <= ELEMENTS_MAX) etype[cid - ELEMENTS_MIN] = ty; } }
							}
							if (zly) break;
						}
					}
					if (zly) {
						// should not happen on a reliable transport; if it ever does, drop the rest of this packet
						// and ask for the world again rather than writing garbage into the mirror
						if (!ST._v6Err) { ST._v6Err = 1; log("v6: truncated packet — dropping the rest and requesting resync"); try { net.send({ t: "resync" }); } catch (e2) {} }
						o = raw.length;
						break;
					}
					applied++;
					if ((applied & 7) === 0 && performance.now() - tSlice > budgetMs) { done = false; break; }
					continue;
				}
				if (o + rows.length * cw * 12 > raw.length) break; // uszkodzony batch
				for (const r of rows) { const dst = ((y0 + r) * W + x0) * 4; map.set(raw.subarray(o, o + cw * 4), dst); o += cw * 4; }
				for (const r of rows) { const dst = (y0 + r) * W + x0; wall.set(raw.subarray(o, o + cw), dst); o += cw; }
				for (const r of rows) { const dst = (y0 + r) * W + x0; if (shadow) shadow.set(raw.subarray(o, o + cw), dst); o += cw; }
				for (const r of rows) { const dst = (y0 + r) * W + x0; if (auth) auth.set(raw.subarray(o, o + cw), dst); o += cw; }
				for (const r of rows) { const dst = (y0 + r) * W + x0; if (sim) new Uint8Array(sim.buffer, sim.byteOffset + dst * 4, cw * 4).set(raw.subarray(o, o + cw * 4)); o += cw * 4; }
				// element type layer: write to elementData.type[cellId-MIN] so getResolvedTypeFromCellId works (grabber)
				for (const r of rows) { for (let cc = 0; cc < cw; cc++) { const ty = raw[o++]; if (etype && cellIds32) { const cid = cellIds32[(y0 + r) * W + x0 + cc]; if (cid >= ELEMENTS_MIN && cid <= ELEMENTS_MAX) etype[cid - ELEMENTS_MIN] = ty; } } }
				applied++;
				// every 8 chunks we check the clock — the rest of the packet will wait for the next frame
				if ((applied & 7) === 0 && performance.now() - tSlice > budgetMs) { done = false; break; }
			}
			it.o = o;
			// ACK only after the WHOLE thing has been APPLIED — otherwise the host measures the speed of the connection instead of the speed of the client
			// and speeds up without limit (the queue grew to hundreds of MB).
			if (done) q.shift(); else break;
		}
		if (q.length) scheduleApplyDrain();
		if (applied > 0 && ST.wsx) { ST.wsx.applyCount += applied; ST._lastWcT = performance.now(); }
		// 0.9.158: ACK also from the pump (background watchdog) — the frame hook in a hidden window runs at ~1 Hz, so
		// the ack carried ~1 s of age = a constant "26 batches behind" and the host paused, even though the client WAS keeping up.
		// 0.9.278: 25 Hz, see the note by the other ack site.
		if (applied > 0 && ST._lastAppliedSq != null && performance.now() - (ST._lastAckT || 0) > 40) {
			ST._lastAckT = performance.now();
			try { net.send({ t: "wcack", sq: ST._lastAppliedSq, qd: (ST._applyQ || []).length }); } catch (e) {}
		}
		return applied;
	}
	function scheduleApplyDrain() {
		if (ST._applyRaf) return;
		ST._applyRaf = 1; // the "scheduled" marker shared by both tracks
		// 0.9.156: rAF + watchdog setTimeout. Chromium throttles rAF of an OBSCURED window (despite flags) —
		// the client in the background stopped applying, the host fell into a CONGESTION pause (a "freeze" for the user).
		// The background timer is also throttled (down to ~1 Hz), but 1 Hz is enough; with a visible window rAF wins.
		const run = () => {
			if (!ST._applyRaf) return; // the second lane has already fired
			ST._applyRaf = 0;
			if (ST._applyRafId) { try { cancelAnimationFrame(ST._applyRafId); } catch (e) {} ST._applyRafId = 0; }
			if (ST._applyTmr) { clearTimeout(ST._applyTmr); ST._applyTmr = 0; }
			try {
				const q = ST._applyQ;
				if (!q || !q.length) return;
				// the bigger the congestion, the more time per frame (but never enough to lose smoothness)
				const n = drainApplyQ(ST.state, q.length > 4 ? 10 : 6);
				if (n > 0) ST._lastWcT = performance.now();
			} catch (e) { if (!ST._drainErr) { ST._drainErr = 1; log("drainApplyQ error:", e.message); } }
		};
		ST._applyRafId = requestAnimationFrame(run);
		ST._applyTmr = setTimeout(run, 150);
	}
	// =================== WHAT THE TWO MEASUREMENT LABS ANSWERED (code removed in 0.9.287) ===================
	// BANDWIDTH LAB (0.9.247-0.9.274) weighed four candidate wire formats on real packets. It is the reason
	// the cell delta exists: of the 40 cells in a changed row only 3.5 really differed, and encoding just
	// those cut the stream by 83% after deflate. Shipped in 0.9.265 and measured again on the wire at -73%.
	// Splitting the 4-byte layers into byte planes, the other candidate, came out WORSE (-16% to +22%), so it
	// was never built. The lab only ever ran on the v5 fallback path, which is the path a local two-instance
	// test takes, so from 0.9.274 it was switched off and in 0.9.287 the code went with it.
	//
	// ===== ENCODING LAB (0.9.285), RUN AND REMOVED IN 0.9.286. The number is the point of keeping this note.
	// The idea: per changed cell we spend 1 byte of layer mask + 4 colour + 4 cellId + 1 type, and the two
	// four-byte fields looked wasteful. The candidate sent colour as a 4-bit sub-mask plus only the bytes that
	// really changed, and cellId as a zigzag varint of the difference from the previous changed cell in the
	// row. On synthetic rows it was 28% smaller, and a round-trip test over 4000 rows decoded byte-exact.
	// On real packets from Andrew's world, 18 windows of 4000 rows each:
	//     raw:            8 to 15 per cent SMALLER  (median about 11%)
	//     after deflate:  2% smaller once, then -6 -12 -2 -9 -7 -11 -7 -9 -9 -12 -7 -12 -10 -9 -13 -10 -9
	//                     i.e. about 9 per cent BIGGER, consistently
	// Which makes sense in hindsight. Today's format puts a 4-byte cellId at a FIXED offset in every cell
	// record, so the same and nearly-the-same byte runs line up across cells and rows and LZ77 matches them
	// wholesale. Varints destroy that alignment: every cell record becomes a different length, the repeats
	// stop repeating, and the per-cell sub-mask adds a high-entropy byte that compresses to nothing. Deflate
	// was already collecting this redundancy, and collecting it better than we can by hand.
	// So: no varints here. Fewer bytes has to come from sending less, not from packing tighter.
	// ===================================================================================================
	// 0.9.111: sending the world packet. When the peer has the same mod and we're on WS — a binary frame goes out
	// (without base64: -25% bytes, zero encoding on both sides). Otherwise the old way: base64 in JSON.
	function sendWorldPacket(hdr, bytes, useBin) {
		if (useBin) {
			try {
				const h = new TextEncoder().encode(JSON.stringify(hdr));
				const out = new Uint8Array(2 + h.length + bytes.length);
				out[0] = (h.length >> 8) & 255; out[1] = h.length & 255;
				out.set(h, 2); out.set(bytes, 2 + h.length);
				net.send(out);
				return;
			} catch (e) { if (!ST._binErr) { ST._binErr = 1; log("binary send failed, falling back to base64:", e.message); } }
		}
		hdr.d = b64enc(bytes);
		net.send(hdr);
	}
	async function applyWorldBatch(msg) {
		if (ST.net.role !== "client" || !ST.state) return;
		const state = ST.state;
		const myWid = state.store.meta && state.store.meta.worldId;
		const myScene = state.store.scene && state.store.scene.active;
		// The old "test mode" (both in the menu → paint despite the menu) REMOVED (fix instant-kick, Akriz+derErste67):
		// it painted the host's menu buffers over the client's menu and set everApplied in the menu → auto-exit
		// immediately disconnected a freshly joined player. The mirror in the menu NEVER PAINTS.
		const menuTest = false;
		// CLIENT IN THE MENU (fix tony: "the main menu turns into red blocks"): the host's mirror MUST NOT
		// paint over the menu scene — world data was landing in the menu scene's buffers as red tiles.
		if (myScene === 1) return;
		// WORLD LOADING IN PROGRESS (fix TCentraL "big map freeze"): writing to the world buffers
		// WHILE FH.game.load IS RUNNING = a race with the engine loading the save (freeze/corruption).
		// We drop it — AUTO-RESYNC after the mirror starts will send the full world anyway.
		if (ST._loadingWorld) return;
		if (msg.wid && myWid && msg.wid !== myWid && !menuTest) {
			// Trust: the engine assigns the loaded world a DIFFERENT local worldId than the one the host uses in "wc", even though it's
			// EXACTLY the same save (fix "REJECT world" → mirror rejected → reconcile was deleting the client's structures).
			// We trust when: (a) already trusted, (b) the window right after auto-load, OR (c) we received the world FROM this host (world-begin)
			// and we're BOTH in the game (scene≠1) — meaning the client actually loaded the host's save (auto or manually).
			const bothInWorld = msg.scene !== 1 && myScene !== 1;
			// PAIRED TRUST (fix tony: "loading a different world adds it as red blocks"):
			// trust binds the HOST's wid to the CLIENT's WORLD wid at the moment of trusting (_trustedMyWid).
			// The client loads a DIFFERENT world → the pair doesn't match → REJECT (the mirror doesn't paint over someone else's save).
			// _gotHostWorld is ONE-TIME (consumed on the first acceptance).
			// 0.9.152: the world session token OVERRIDES wid. Auto-load is a PAGE RELOAD — the entire
			// trust state above is lost, and an import by a player who already has a copy of the world assigns a NEW local wid:
			// without this, every packet ended up as REJECT and the client's world was static (Quadbro, 0.9.150).
			// gen from sessionStorage survives a reload and proves: I loaded EXACTLY this host's transfer.
			const genTrust = !!(msg.g && ST._rxWorldGen && msg.g === ST._rxWorldGen) && bothInWorld;
			const trusting = genTrust
				|| (ST._trustedWid === msg.wid && ST._trustedMyWid === myWid)
				|| (ST._pendingTrustUntil && performance.now() < ST._pendingTrustUntil)
				|| (ST._gotHostWorld && bothInWorld)
				|| (ST._lastGoodWid === msg.wid && ST._lastGoodMyWid === myWid && bothInWorld);
			if (!trusting) {
				setStatus(t("other_world"), "#f66");
				ST._hostWidSeen = msg.wid; // 0.9.116: the host's world, even when we reject the packet — used to detect "I'm sitting in the wrong world"
			if (!ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = true; log("REJECT world: worldId host=" + msg.wid + " me=" + myWid + " scene h/c=" + msg.scene + "/" + myScene); }
				return;
			}
			ST._hostWidSeen = msg.wid; // 0.9.132: we also know the host's world when we are receiving the packet
			if (ST._trustedWid !== msg.wid) log("worldId differs after auto-load, but trusting it (freshly received from host):", msg.wid);
			ST._trustedWid = msg.wid; ST._trustedMyWid = myWid; ST._pendingTrustUntil = 0;
			ST._gotHostWorld = false; // one-off — from now on the pair (hostWid, myWid) governs
			ST._lastGoodWid = msg.wid; ST._lastGoodMyWid = myWid; // memory across reconnect (deliberately NOT cleared on joined/stopped)
		}
		const { map, wall, shadow, W, H } = worldBuffers(state);
		if (!map || W !== msg.W || H !== msg.H) {
			setStatus(t("dims_differ", W + "x" + H, msg.W + "x" + msg.H), "#f66");
			if (!ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = true; log("REJECT world: dims host=" + msg.W + "x" + msg.H + " me=" + W + "x" + H + " map=" + (!!map)); }
			return;
		}
		// v5 = row delta (a mask of changed rows per chunk), v6 = the same plus a cell delta inside the row
		if (msg.v !== 5 && msg.v !== 6) { setStatus(t("ver_mismatch"), "#f66"); return; }
		if (ST.wsx.mismatchLogged) { ST.wsx.mismatchLogged = false; log("World MATCH — mirror starting"); }
		ST.wsx.mismatchWarned = false;
		setClientPaused(true);
		const { auth, sim, etype } = worldBuffers(state);
		const cellIds32 = sim ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null;
		const __t0 = performance.now(); // 0.9.101: what applying the mirror costs
		const __rb = msg.__bytes || b64dec(msg.d); // 0.9.111: a binary frame bypasses base64
		const raw = msg.z === 0 ? __rb : await inflate(__rb); // 0.9.95: z=0 => raw packet (fast link)
		if (!ST._applyQ) ST._applyQ = [];
				// hard limit: if the client falls so far behind that the queue grows into megabytes, there's no point
		// keeping it — the data is already stale. We discard it and request the full world again.
		let __qb = 0; for (const it of ST._applyQ) __qb += it.raw.length;
		if (__qb > 32 * 1024 * 1024) {
			ST._applyQ.length = 0;
			log("JAM: apply queue exceeded 32 MB — clearing and requesting resync");
			try { net.send({ t: "resync" }); } catch (e) {}
			return;
		}
		ST._applyQ.push({ raw: raw, o: 0, v: msg.v | 0, sq: typeof msg.sq === "number" ? msg.sq : null });
		const applied = drainApplyQ(state, ST._applyQ.length > 4 ? 10 : 6);

		// Grabber protection: the mirror could have brought an OLD content of the cell (the host hasn't yet processed
		// our grabPick/grabPlace). PICK: hold 0 until the host confirms the removal. PLACE: hold the sentinel
		// until the host confirms non-zero content. Grace period adaptive to ping (grabGraceMs).
		if (sim && (ST._grabbedCells.size || ST._placedCells.size)) {
			const tNow = performance.now(), grace = grabGraceMs();
			const sim32 = new Uint32Array(sim.buffer, sim.byteOffset, W * H);
			for (const [idx, o] of ST._grabbedCells) {
				if (tNow - o.ts > grace) { ST._grabbedCells.delete(idx); continue; } // the host had time — release control
				const v = sim32[idx];
				// FIX "2-3 then stop": release as soon as a NEW element (≠ the one grabbed) appears — it's an element
				// that FELL from above into the grabbed cell, it must be grabbable. Before: we forced 0 blindly
				// (v!==0 → 0) for 1200ms → the collapsing pile was masked → impossible to grab what followed.
				if (v !== 0 && v !== o.cid) ST._grabbedCells.delete(idx); // new element fell in → release (grabbable)
				else sim32[idx] = 0; // still the old element (o.cid) or empty → keep it empty (anti-duplicate)
			}
			for (const [idx, ts] of ST._placedCells) {
				if (tNow - ts > grace) { if (lim("grabDiag2", 60)) log("GRAB place TIMEOUT @idx", idx, "po", Math.round(tNow - ts), "ms — the mirror never confirmed the element (dropped/lost?), mirror cellId=" + sim32[idx]); ST._placedCells.delete(idx); continue; }
				// FIX re-grab: release ONLY if a REAL element has arrived (cellId∈[MIN,MAX]). Before: sim32!==0
				// would release on our OWN sentinel (=1) → the cell stayed at 1 (not grabbable) → re-grab impossible.
				if (sim32[idx] >= ELEMENTS_MIN && sim32[idx] <= ELEMENTS_MAX) { if (lim("grabDiag2", 60)) log("GRAB place CONFIRMÉ @idx", idx, "po", Math.round(tNow - ts), "ms, real cellId=" + sim32[idx], "→ re-grab OK"); ST._placedCells.delete(idx); }
				else sim32[idx] = GRAB_SENTINEL; // not yet a real element (0 or sentinel) → keep it marked "occupied"
			}
		}
		const w = ST.wsx;
		if (applied > 0) ST._lastWcT = performance.now();
		// 0.9.196: we SEPARATELY remember the mere FACT of receiving the mirror packet and the queue length declared by the host
		// its queue length. The "No world data" alarm only watched _lastWcT, which moves EXCLUSIVELY
		// when we actually applied something — and when nothing changes in the world, the host sends empty packets
		// and after 15s the red status would light up, even though the connection is healthy.
		ST._lastWcRx = performance.now();
		ST._lastWcQ = typeof msg.q === "number" ? msg.q : 0;
		if (applied > 0 && ST._stallShown) { ST._stallShown = false; setStatus(t("players", ST.peers.size + 1)); } // data came back => clear the stall message // to the stall indicator (sync_stalled)
		// Record the batch AFTER applying it, not on receipt, so the host's lag also catches a client that
		// is CPU bound, not only a saturated link.
		if (typeof msg.sq === "number") ST._lastAppliedSq = msg.sq;
		if (applied > 0 && !w.everApplied) {
			w.everApplied = true; log("First world batches applied — mirror running"); setStatus(t("players", ST.peers.size + 1));
			techRepair(state, "client"); // bricked flags in the save from the host (0.9.71)
			fixFutureCooldowns(state, "start lustra");
			profileRestore(state, msg.wid || ST._trustedWid); // return to where you left off in THIS world (G7-lite)
			// AUTO-RESYNC (fix TCentraL "big map"): the initial flood (enqueueFullWorld after peer-hello) used to run
			// while the client was still in the MENU/loading and got DROPPED, yet the host's rowH considers it delivered
			// → without this, persistent holes in the world until a manual Resync. Once per session (flag _autoResynced).
			if (!ST._autoResynced) { ST._autoResynced = true; try { net.send({ t: "resync" }); log("AUTO-RESYNC: requesting full world from host (batches before world entry were dropped)"); } catch (e) {} }
		}
		const __ms = performance.now() - __t0;
		w.applyMs = w.applyMs ? w.applyMs * 0.7 + __ms * 0.3 : __ms;
		if (__ms > (w.applyWorst || 0)) w.applyWorst = __ms;
		w.applyBytes += msg.__bytes ? msg.__bytes.length : (msg.d ? msg.d.length * 0.75 : 0); // binary: the exact size, base64: ~3/4 of the text length // (chunks counted in drainApplyQ, including those applied between frames)
		const now = performance.now();
		if (now - w.statT > 2000) {
			// q = how many packets are left in the host's queue — a real progress indicator for the initial sync
			// of a large map (feedback from TCentraL: "no real progress to when it loads")
			const info = t("sync_down", Math.round(w.applyBytes / 2048), Math.round(w.applyCount / 2), typeof msg.q === "number" ? msg.q : 0);
			const okno = (w.vidN || w.vidGapN)
				? "  vis " + Math.round((w.vidN || 0) / Math.max(0.001, (now - w.statT) / 1000)) + "/s"
					+ (w.vidGapN ? " gap " + Math.round(w.vidGap / w.vidGapN) + "ms" : "")
				: "";   // 0.9.283: chunks landing ON MY SCREEN per second, and how stale each one was
			const extra = "  lustro " + Math.round(w.applyMs || 0) + "/" + Math.round(w.applyWorst || 0) + "ms  snap " + Math.round(w.snapMs || 0) + "/" + Math.round(w.snapWorst || 0) + "ms" + okno;
			setSyncInfo(info + extra);
			log("SYNC-CLIENT", info + extra);
			w.applyBytes = 0; w.applyCount = 0; w.statT = now; w.vidN = 0; w.vidGap = 0; w.vidGapN = 0;
		}
	}

	// ------------------------------------------------------------------
	// STRUCTURES — event-driven replication + periodic reconciliation (snapshot)
	// ------------------------------------------------------------------
	// 0.9.142: structure.filter (filters, shakers, growers, filter wall) also travels over the network — previously only data did,
	// so a filter set by the client never reached the host (and vice versa): "filters only work when host configures them".
	// 0.9.143: queued (a structure "in the queue" — placed ABOVE the terrain, the blocks stay, e.g. a Mk2 conveyor over stone) and frame
	// (foundation frame) also travel over the network — without them the client built everything as FULL (erases terrain / different collision).
	// ST-FIX (red tiles on the client): when the host broadcasts a structure in a TRANSIENT "queued" state
	// (this is what comes out of the game right after undoing a demolition), the client creates it with clearance=3, i.e. as
	// queued — and it just stays that way, because the next snapshot skips a structure with an unchanged signature.
	// Detecting it after the fact is more reliable than guessing the moment of the undo: EVERY send of q=1 schedules
	// a forced full snapshot in 2s, by which time the state on the host is already settled.
	const slimStruct = (s) => {
		const o = { type: s.type, x: s.x, y: s.y, data: s.data };
		if (s.filter != null) o.f = s.filter;
		// 0.9.225: COLOR. The game paints foundations in "building:placed" with a value from its OWN color choice
		// (FH.foundationColorPicker), so without sending the color, each side would broadcast its own — hence blocks
		// of different colors on the host and on the client.
		if (s.color != null) o.c = s.color;
		// ST-FIX (Kamil Padula's remark, rightly so): slimStruct is called for EVERY structure during
		// snapshot serialization, so a world with permanently queued buildings would arm a full
		// resync on EVERY pass — an 85k-structure snapshot every ~2.2s, endlessly, and constant
		// restarts blocked reconciliation (58 structures never reached the client).
		// Trigger removed: the function once again has no side effects. The reason I added it
		// is gone — bcastStruct reads the state 40ms AFTER the event, i.e. already settled, not transient.
		if (s.queued) o.q = 1;
		if (s.frame) o.fr = 1;
		return o;
	};
	const structSig = (s) => { try { return JSON.stringify([s.data == null ? null : s.data, s.filter == null ? null : s.filter, s.queued ? 1 : 0, s.frame ? 1 : 0, s.color == null ? null : s.color]); } catch (e) { return ""; } };
	// structure signature FROM THE PACKET (slim: data/f/q/fr) — ONE for the snapshot loop and for finishing off deferred
	// (0.9.143: different formulas in both places = endless rebuilds of the deferred remainder at 90k structures)
	const snapSig = (s) => (s.data != null ? JSON.stringify(s.data) : "") + "|" + (s.f != null ? JSON.stringify(s.f) : "") + "|" + (s.q ? 1 : 0) + (s.fr ? 1 : 0) + "|" + (s.c != null ? s.c : "");
	const structKey = (s) => s.type + "@" + s.x + "," + s.y;
	// MACHINE CONFIG by the client (G5b): edits to structure.data in the machine UI have no event — we detect
	// them via a JSON diff NEAR the player (that's where clicking happens; a full scan of thousands of structures every frame = too expensive).
	const dataSeenSet = (k, s) => { if (!ST._dataSeen) ST._dataSeen = new Map(); ST._dataSeen.set(k, structSig(s)); };
	function scanDataEditsIfDue(state) {
		const now = performance.now();
		if (now - (ST._dataScanT || 0) < 800) return;
		ST._dataScanT = now;
		try {
			const role = ST.net.role;
			if (role === "client" && !ST._dataSeen) return; // the baseline comes from the host's snapshot
			if (role === "host" && !ST.peers.size) return;
			if (!ST._dataSeen) ST._dataSeen = new Map();
			if (!ST._dataEdited) ST._dataEdited = new Map();
			const px = state.store.player.x / 4, py = state.store.player.y / 4, R = 48; // ~screen around the player (cells)
			for (const s of state.store.structures || []) {
				if (Math.abs(s.x - px) > R || Math.abs(s.y - py) > R) continue;
				const k = structKey(s);
				const prev = ST._dataSeen.get(k);
				if (prev === undefined) { dataSeenSet(k, s); continue; }
				const cur = structSig(s);
				if (cur === prev) continue;
				ST._dataSeen.set(k, cur);
				if (role === "host") {
					// 0.9.142: the HOST only broadcasts FILTER changes (the host's machine data changes constantly — that goes via the snapshot);
					// without this the client saw the old filter after an edit on the host
					let pv = null, cv = null; try { pv = JSON.parse(prev); cv = JSON.parse(cur); } catch (e) {}
					if (!pv || !cv || JSON.stringify(pv.slice(1)) === JSON.stringify(cv.slice(1))) continue; // [1..] = filtr, queued, frame (0.9.143)
					try { net.send({ t: "st", k: "add", list: [slimStruct(s)] }); } catch (e) {}
					log("HOST filter/queued changed ->", k);
					continue;
				}
				ST._dataEdited.set(k, now);
				// 0.9.159: we attach the filter ONLY when the FILTER itself changed (sig[1]), not just the machine data.
				// Previously every data change also carried the client's local filter — if it was OUTDATED
				// (the host edited the filter off the client's screen — no broadcast), the host would REVERT its own filter to
				// the client's old state → "all filters reset" (report from MaxMasterB).
				let fZmieniony = false;
				try { const pv2 = JSON.parse(prev), cv2 = JSON.parse(cur); fZmieniony = JSON.stringify(pv2[1]) !== JSON.stringify(cv2[1]); } catch (e) { fZmieniony = true; }
				try { const m = { t: "act", k: "sdata", x: s.x, y: s.y, type: s.type, data: s.data }; if (fZmieniony && s.filter != null) m.f = s.filter; net.send(m); } catch (e) {}
				log("CLIENT machine config ->", k, fZmieniony && s.filter != null ? "(+filter)" : "");
			}
			// hygiene of the protection window
			for (const [k, ts] of ST._dataEdited) if (now - ts > 10000) ST._dataEdited.delete(k);
		} catch (e) {}
	}

	function subscribeGameEvents(state) {
		if (ST._subscribedState === state || !ST.FH || !ST.FH.events) return;
		ST._subscribedState = state;
		try {
			// CLIENT: we intercept placement via a bundle patch (_place) — since the game's 2026-08-17 update
			// "building:place" to formalny INTERCEPTOR (FH.hooks.intercept + ctrl.cancel() + {structureTypes}),
			// not a cancellable event anymore (return true no longer cancels it) → the old events.on no longer worked here
			// = the client couldn't place ANYTHING. The _place patch takes the intent at the source (see ST._place).
			// ST-FIX: we listen for "building:placed" (emitted on EVERY structure creation, per piece),
			// not "structures:placed" (emitted only by the building tool's batch finalizer).
			// The list of paths we were losing because of this — in the comment next to bcastStruct.
			ST.FH.events.on(state, "building:placed", (st, data) => {
				// only the HOST broadcasts its own placements; the client no longer does (cancels before the save)
				if (ST._applyingNet || ST.net.role !== "host") return;
				bcastStruct(state, data && data.structure);
			});
			ST.FH.events.on(state, "structures:removed", (st, data) => {
				if (ST._applyingNet || ST.net.role === "idle") return;
				// ST-FIX (found in the Rexisaurus fork, confirmed in bundle 0.5.6):
				//   N(e,t,n,r,a): n.push({x:t.x,y:t.y})  <- POSITIONS, without a type
				//                 r.push(t)              <- FULL structures, with a type
				//   D(e,t,n,o): {removed: t, structures: n}
				// meaning "removed" is just coordinates. Reading them, we were sending type: undefined —
				// and structKey() is composed from the type, so every key read as "undefined@x,y" and didn't
				// hit any of our caches. We take "structures" when it's present.
				const raw = (data && (data.structures || data.removed)) || [];
				if (!raw.length) return;
				const list = raw.map((s) => ({ type: s.type, x: s.x, y: s.y }));
				if (data && data.byMove) {
					// 0.9.199: on a move, the game emits "structures:removed" TWICE:
					//   1) the real removal from the old spots — entries have x/y,
					//   2) tuz po "structures:moved":  { removed: failedToPlace, byMove: true }
					//      i.e. structures that FAILED to be placed because the target was occupied. These entries
					//      powstaja w S(): p.push({ from:{x,y}, type, data, filter, color }) — maja "from",
					//      and DO NOT HAVE x/y. We were treating them as one half of a pair, and the pair would glue together with garbage
					//      coordinates (x=undefined), after which the real removal no longer had anything to
					//      pair up with, and it got lost. Hence ghosts when moving TO AN OCCUPIED spot.
					//      These structures are covered by emission #1 anyway (they disappear from the old position), so
					//      it's enough not to confuse them here with half of a pair.
					if (!Number.isFinite(list[0] && list[0].x)) {
						if (lim("mvFailDiag", 20))
							log("move: " + raw.length + " structures did not fit at destination (space occupied) — skipping, already being removed from old location");
						return;
					}
					setMoveHalf("from", list); return; // old positions — paired with structures:moved
				}
				if (ST.net.role === "host") {
					txNote("st", list.length * 40); net.send({ t: "st", k: "rm", list });
					// 0.9.200: removal via Ctrl+Z goes through the undo module's removeAtPositions, not through
					// our demolition path — so nobody marked the terrain there as urgent, and the client
					// kept the red (QUEUED) tiles until the next snapshot.
					if (ST._inGameUndo && ST._inGameUndo()) {
						// 0.9.215 (REVISION 2.3): there used to be "if (n2 >= 4000) break" after the POSITIONS — see markPosListsUrgent.
						const r2 = markPosListsUrgent(st || ST.state, [list]);
						if (r2.n && lim("undoRmUrg", 20))
							log("undo: " + r2.n + " chunks marked as urgent (items " + list.length + ")"
								+ (r2.capped ? " (limit 6000 reached)" : ""));
					}
				} else { if (lim("demFwdN", 5)) log("CLIENT: forwarding demolition to the host x" + list.length + " (player's own action)"); net.send({ t: "act", k: "demolish", list }); stampAct("demolish", list.length); }
			});
			ST.FH.events.on(state, "structures:moved", (st, data) => {
				if (ST._applyingNet || ST.net.role === "idle") return;
				// 0.9.199: "moved" entries DO NOT have x/y fields. In S() they are created as
				//   h.push({ from:{x,y}, to:{x,y}, type, data, filter, color })
				// and we were passing them through slimStruct, which reads s.x/s.y — meaning we were sending
				// the NEW positions as undefined. This masked the fact that the structures themselves reached the client
				// via a separate path ("building:placed" -> "st add"); as a result only the removal of the old ones worked,
				// and marking the terrain as urgent for the NEW spot didn't work at all.
				const to = ((data && data.moved) || []).map((m2) => {
					const tp = m2 && m2.to ? m2.to : m2;
					const o2 = { type: m2.type, x: (tp && tp.x) | 0, y: (tp && tp.y) | 0, data: m2.data };
					if (m2.filter != null) o2.f = m2.filter;
					return o2;
				}).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
				// 0.9.202: when the target is occupied, "moved" can be EMPTY, and everything lands in failedToPlace.
				// Previously we exited here via `if (!to.length) return;` — the "to" half never
				// came into being, the pair never glued together with the real removal, and NOTHING went to the client.
				// The host would delete the structures, the client kept holding them at the old spot.
				// An empty "to" is a correct result: the move degenerated into a plain removal.
				setMoveHalf("to", to);
			});
			ST.FH.events.on(state, "worldItem:pickedUp", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.item) return;
				ST._pickedPending.set(data.item.id, performance.now());
				net.send({ t: "act", k: "pickup", id: data.item.id });
			});
			// Grabber: the client forwards picking up/putting down an element → the host executes it authoritatively
			// via FH.elements.removeAt/createAt (without patching the bundle). Fixes "grabber doesn't pick up wet sand". (dotNine)
			ST.FH.events.on(state, "grabber:elementPickedUp", (st, data) => {
				// Unconditional DIAG: does the pick fire on the client side, and with which elementType?
				if (lim("pickDiag", 80)) log("GRAB pickEvent fired: role=" + ST.net.role, "et=" + (data && data.elementType), "@", data && data.x, data && data.y, "applyingNet=" + ST._applyingNet);
				if (ST._applyingNet || !data) return;
				// 0.9.186 (ASYMMETRY IN THE CODE): when replaying the CLIENT's grabber, the host explicitly calls markCellDirty
				// ("force-send the chunk via the mirror"), because the grabber's deferred write queue does NOT always set
				// chunkShouldUpdate. The host's OWN grabber had this nowhere — the same writes, but without
				// the forcing. Hence on the client: the material appears at the drop spot, hangs there, and only
				// then falls (the first frames of flight were never sent), while the other direction works fine.
				if (ST.net.role === "host") { markCellDirty(state, data.x, data.y); return; }
				if (ST.net.role !== "client" || !ST.wsx.paused) return;
				if (!validElement(data.elementType)) { if (lim("pickDiag3", 20)) log("GRAB pick REJECTED: invalid elementType =", data.elementType); return; }
				net.send({ t: "act", k: "grabPick", x: data.x, y: data.y, et: data.elementType });
				// KEY: we remove the cell locally IMMEDIATELY. The grabber's write to the world goes through the deferred
				// queue Lu, which does NOT execute on a paused client → the cell "stays", so the grabber
				// picks it up AGAIN every frame (tank full of duplicates) until the host's mirror (~100ms) removes it.
				// We clear cellId=0 (getCellId→0, isCellIdElement→false) → the grabber sees it empty, doesn't take it again.
				// The host removes it authoritatively and confirms via the mirror. _grabbedCells protects against restoring it.
				grabClearLocal(state, data.x, data.y);
			});
			ST.FH.events.on(state, "grabber:elementPlaced", (st, data) => {
				if (ST._applyingNet || !data) return;
				if (ST.net.role === "host") { markCellDirty(state, data.x, data.y); return; } // 0.9.186: see the comment next to elementPickedUp
				if (ST.net.role !== "client" || !ST.wsx.paused) return;
				// The rest of PLACING from an empty/out-of-bounds tank slot (T[o+2] undefined on a desynced client):
				// elementType == null/0 → JSON drops the field → host createAt(...,undefined) = crash "reading 'type'"
				// + "element lost" (912×/session in the logs). We forward ONLY real element types.
				if (!validElement(data.elementType)) return;
				net.send({ t: "act", k: "grabPlace", x: data.x, y: data.y, et: data.elementType });
				grabSetLocal(state, data.x, data.y); // block re-targeting this cell (see the comment next to grabSetLocal)
			});
			// UPGRADES AND TECH TREE — SHARED POOL model (one factory = shared unlocks).
			// Client purchase: the game mutates its local store and deducts resources ONLY locally (in 1s the host
			// would overwrite this = a free purchase invisible to the host — gap G2). Forward: we compute the cost
			// from the resource difference vs. the host's last snapshot (the event fires RIGHT after the deduction).
			const resCostDiff = () => {
				const cost = {};
				try {
					const cur = state.store.resources || {};
					const base = ST._resSnapshot || {};
					for (const k of Object.keys(base)) {
						const b = base[k], c = cur[k];
						if (typeof b === "number" && typeof c === "number" && c < b) cost[k] = b - c;
					}
					ST._resSnapshot = Object.assign({}, cur); // re-baseline (several purchases within <1s are counted correctly)
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
			// STORY (fix G6): a step triggered by the CLIENT's position/action mutates only its local storage
			// (storyProgression.completedSteps) and after 1s the host would overwrite it. Forward → the host appends the step.
			ST.FH.events.on(state, "story:stepCompleted", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.stepId) return;
				net.send({ t: "act", k: "story", id: data.stepId });
				log("CLIENT story step →", data.stepId);
			});
			// CRITTER COLLECTIONS (fix G6): found/available/tickets live in store.creatures/conservatory,
			// which get overwritten by the host — the client's collection would revert within 100ms. Forward → the host adds it up.
			ST.FH.events.on(state, "entity:collected", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.typeId) return;
				net.send({ t: "act", k: "collect", ty: data.typeId, eid: data.entityId });
				log("CLIENT collect →", data.typeId, "(id " + data.entityId + ")");
			});
			// SIGNALS (fix G5): the client's link/unlink mutates the "signals" storage, which gets overwritten by the host →
			// the client's automation would disappear after 1s. Forwarding changes → the host executes FH.signals.link/unlink.
			ST.FH.events.on(state, "signals:userChanged", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.changes) return;
				const ch = data.changes.map((c) => ({ a: c.action, f: c.from && { x: c.from.x, y: c.from.y }, t: c.to && { x: c.to.x, y: c.to.y } })).filter((c) => c.a && c.f && c.t);
				if (ch.length) { net.send({ t: "act", k: "sig", ch }); log("CLIENT signals →", ch.length, "changes"); }
			});
			// signal button: state toggled by the client
			ST.FH.events.on(state, "signalButton:pressed", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.structure) return;
				const s = data.structure;
				net.send({ t: "act", k: "sbtn", x: s.x, y: s.y, on: !!(s.data && s.data.on) });
			});
			// COPY-PASTE of blueprints (fix G5): the client's pasted structures were local → reconcile would delete them
			ST.FH.events.on(state, "structures:pasted", (st, data) => {
				if (ST._applyingNet || ST.net.role !== "client" || !ST.wsx.paused || !data || !data.structures) return;
				const list = data.structures.map(slimStruct);
				let links = null;
				try { if (data.signalLinks) links = JSON.parse(JSON.stringify(data.signalLinks)); } catch (e) {}
				if (list.length) { net.send({ t: "act", k: "paste", list, links }); log("CLIENT paste →", list.length, "structures"); }
			});
			log("Structure/item event subscription active");
		} catch (e) { log("subscribe error:", e.message); }
	}

	// The game's 2026-08-17 update renamed/moved FH.structures (it disappeared from top-level FH).
	// Resolver: find the namespace with build+removeAt wherever it is (top-level or 1 level deeper).
	// 0.9.222: once per session we print out WHAT functions the game's structure API has. Twice in a row it turned out
	// that the game already has a ready-made batch function, while the mod was calling a single one in a loop (removeAtPositions). Instead of
	// guessing any further, we want that list in the log.
	function logStructApi(SA) {
		try {
			if (ST._apiLogged || !SA) return;
			ST._apiLogged = true;
			const fn = [], pol = [];
			for (const k of Object.keys(SA)) { (typeof SA[k] === "function" ? fn : pol).push(k); }
			log("game structures API — functions: " + fn.sort().join(", "));
			if (pol.length) log("game structures API — fields: " + pol.sort().join(", "));
		} catch (e) { swallow("logStructApi", e); }
	}
	function structNs() {
		if (ST._structNs && typeof ST._structNs.build === "function") return ST._structNs;
		const FH = ST.FH; if (!FH) return null;
		const isIt = (v) => v && typeof v === "object" && typeof v.build === "function" && typeof v.removeAt === "function" && typeof v.getAtCell === "function";
		if (isIt(FH.structures)) { ST._structNs = FH.structures; logStructApi(ST._structNs); return ST._structNs; }
		for (const k of Object.keys(FH)) { try { if (isIt(FH[k])) { ST._structNs = FH[k]; log("structures API under FH." + k); return ST._structNs; } } catch (e) {} }
		for (const k of Object.keys(FH)) {
			try {
				const v = FH[k]; if (!v || typeof v !== "object") continue;
				for (const k2 of Object.keys(v)) { if (isIt(v[k2])) { ST._structNs = v[k2]; log("structures API under FH." + k + "." + k2); return ST._structNs; } }
			} catch (e) {}
		}
		if (!ST._structNsWarned) { ST._structNsWarned = true; log("ERROR: could not find structures API (build/removeAt/getAtCell) in FH:", Object.keys(FH).join(",")); }
		return null;
	}
	// force=true (host placing the client's intent / client rendering the confirmation): skips the
	// collision check by EXPLICITLY passing clearance = Available (foundation built, unblocked). IMPORTANT (0.5.4): the old
	// clearance:-1 hack wrote an INVALID J6 enum value onto the structure → the game treated it as
	// damaged/blocked and DELETED it ("the structure was deleted outright"). J6.Available=1 (Blocked=2/3) → build
	// passes the checks (≠FullyBlocked/≠PartiallyBlocked) and the structure is VALID → it doesn't disappear.
	const CLEARANCE_AVAILABLE = 1; // J6.Available in build 0.5.4 (see the enum: Available=1,FullyBlocked=2,PartiallyBlocked=3,CanBeReplaced=4)
	// 0.9.222: _bldNew tells the caller whether the structure was PLACED or just found.
	// Previously (0.9.216) the host asked about this separately, calling getAtCell before every buildOne — i.e.
	// the exact same query twice. buildOne already knows the answer anyway, since it gets it from the game itself.
	// 0.9.230: "mirror" = we replicate a state that ALREADY exists on the sender (st add / st mv / snapshot / paste).
	// Only in this mode are we allowed to repaint a structure that's already standing in the cell. On a regular ATTEMPT
	// to place (moving onto an occupied area, building on an occupied one) nothing gets placed — and in that case someone else's,
	// untouched block has no right to change color. This is the same bug as with the undo in 0.9.216: we were taking
	// INTENT for FACT, only this time in the opposite direction.
	// 0.9.231 (MEASUREMENT FROM 0.9.222: "placing 1273 ms (build 902 ms, update 334 ms)"): we call SA.update
	// for EVERY placed structure, and it sends a separate message to the simulation threads every single time.
	// The game has its own batch function for this — updateMany — which does literally the same thing in a loop, but
	// wrapped in beginBatchWrite/endBatchWrite and with ONE postAll for the whole list (checked in bundle.js).
	// The same story as with removeAtPositions in 0.9.221: we're not writing our own logic, we're just stopping
	// calling a single-item function a thousand times.
	function flushBuildBatch(state) {
		const b = ST._bldBatch; ST._bldBatch = null;
		if (!b || !b.length) return 0;
		try {
			const SA = structNs(); if (!SA) return 0;
			const opt = { propagateToWorkers: ST.net.role === "host" };
			if (typeof SA.updateMany === "function") SA.updateMany(state, b, opt);
			else if (SA.update) for (const q of b) SA.update(state, q, opt);
		} catch (e) { swallow("flushBuildBatch", e); }
		return b.length;
	}
	function buildOne(state, s, force, lustro) {
		ST._bldNew = false;
		try {
			const SA = structNs(); if (!SA) return null;
			// ST-FIX (from Rexisaurus's fork): a pipe is NOT a regular structure — it lives in store.pipes and in
			// its own cache. Pushing it through the collision repair below ended with the mod
			// treated the pipe as "replacing" a pump or a valve and deleted them (16 such cases in the author's
			// issue log). We place it directly.
			if (isPipe(s, state)) {
				let pipe = (state.store.pipes || []).find((q) => q.x === s.x && q.y === s.y);
				if (!pipe) { pipe = SA.build(state, { x: s.x, y: s.y, clearance: CLEARANCE_AVAILABLE }, s.type, {}); ST._bldNew = !!pipe; }
				if (pipe && s.data) pipe.data = s.data;
				return pipe || null;
			}
			let existing = SA.getAtCell(state, s.x, s.y);
			// ST-FIX: on the client, a cell can hold a structure of a DIFFERENT type (a leftover from a desync —
			// e.g. after an undo of a demolition on the host). The old code would go straight to SA.build, and the game would refuse
			// (cell occupied), build returned null and the divergence stayed PERMANENTLY: neither a snapshot nor a resync
			// this wasn't fixing it, because the host sends correct data, but the client has nowhere to store it.
			if (existing && existing.type !== s.type && ST.net.role === "client") {
				try {
					diagToHost("kolizja typow @" + s.x + "," + s.y + " lokalnie=" + existing.type + " host=" + s.type + " q=" + (existing.queued ? 1 : 0));
					if (SA.removeAt) SA.removeAt(state, s.x, s.y, { removeCells: true });
					existing = SA.getAtCell(state, s.x, s.y);
				} catch (e) { swallow("buildOne", e); }
			}
			if (existing && existing.type === s.type) {
				// MACHINE CONFIG (G5b): data/filter freshly edited by the client is protected from being overwritten
				// by the host's snapshot (act sdata is in transit; the host will confirm it in the next snapshot)
				const k = structKey(s);
				const edited = ST._dataEdited && ST._dataEdited.get(k);
				const chroniony = ST.net.role === "client" && edited != null && performance.now() - edited < 6000;
				const dataDiff = !!s.data && JSON.stringify(existing.data) !== JSON.stringify(s.data);
				// 0.9.142: we sync the filter (structure.filter) too — see slimStruct
				const filtDiff = s.f !== undefined && JSON.stringify(existing.filter == null ? null : existing.filter) !== JSON.stringify(s.f);
				// 0.9.225: we also reconcile the color — otherwise a repaint by one player never reaches the other.
				// 0.9.230: but ONLY when we're replicating someone else's state (see the comment next to the signature).
				if (lustro && s.c !== undefined && existing.color !== s.c) existing.color = s.c;
				// 0.9.143: queued/frame from the host (snapshot/st add carry q/fr only when set → absent = built)
				const qDiff = ST.net.role === "client" && (!!existing.queued !== !!s.q || !!existing.frame !== !!s.fr);
				if ((dataDiff || filtDiff || qDiff) && !chroniony) {
					if (dataDiff) existing.data = s.data;
					if (filtDiff) existing.filter = s.f;
					if (qDiff) { existing.queued = s.q ? true : undefined; existing.frame = s.fr ? true : undefined; }
					// 0.9.143: SA.update does store.structures.findIndex (linear over 90k) — on the client we call it ONLY when
					// the tile mode changes (queued/frame); the renderer reads data and the filter straight from the object. Without this a snapshot = a 2s freeze.
					if (ST._bldBatch) ST._bldBatch.push(existing);
					else if (SA.update && (ST.net.role === "host" || qDiff)) SA.update(state, existing, { propagateToWorkers: ST.net.role === "host" });
				}
				if (ST.net.role === "client" && !chroniony) dataSeenSet(k, existing); // baseline for detecting client edits
				if (ST.net.role === "client") { const D2 = ST._bStat || (ST._bStat = { ok: 0, nul: 0, unreg: 0, t: performance.now() }); D2.exist = (D2.exist || 0) + 1; }
				return existing;
			}
			// 0.9.143: the client's clearance (3=PartiallyBlocked, 4=CanBeReplaced) or the host's queued (→3) — the game will set queued itself
			// and will NOT write the shape into the terrain. Previously it was always Available → the host built a FULL conveyor and erased blocks/stone.
			const cl = (s.cl === 3 || s.cl === 4) ? s.cl : (s.q ? 3 : CLEARANCE_AVAILABLE);
			const pos = force ? { x: s.x, y: s.y, clearance: cl } : { x: s.x, y: s.y };
			const __tb = ST._bldProf ? performance.now() : 0;
			const built = SA.build(state, pos, s.type, {});
			if (ST._bldProf) ST._bldProf.build += performance.now() - __tb;
			ST._bldNew = !!built;
			if (!built && ST.net.role === "client" && force) diagToHost("build ZWROCIL NULL @" + s.x + "," + s.y + " typ=" + s.type + " cl=" + cl);
			// ST-DIAG: balance of structures delivered to the client. Without this you can't tell "the host didn't
			// send it" from "sent it, but the game didn't build it" from "built it and it disappeared right away".
			if (ST.net.role === "client") {
				const D = ST._bStat || (ST._bStat = { ok: 0, nul: 0, unreg: 0, t: performance.now() });
				if (built) D.ok++; else D.nul++;
				try { if (built && SA.getAtCell && !SA.getAtCell(state, s.x, s.y)) D.unreg++; } catch (e) { swallow("buildOne", e); }
				const nw = performance.now();
				if (nw - D.t > 5000 && (D.ok || D.nul)) {
					log("BUILD-STAT (client): built " + D.ok + ", refused " + D.nul + ", without registration " + D.unreg + ", already had " + (D.exist || 0));
					D.ok = 0; D.nul = 0; D.unreg = 0; D.exist = 0; D.t = nw;
				}
			}
			if (built) {
				if (s.data) built.data = s.data;
				if (s.f !== undefined) built.filter = s.f;
				if (s.c !== undefined) built.color = s.c;   // 0.9.225: color from the sender, not from the local choice
				if (ST.net.role === "client") {
					// 0.9.143: on the client, SA.update (O(n) over the store) only when the tile mode (queued/frame) differs from what the game set
					if (!!built.queued !== !!s.q || !!built.frame !== !!s.fr) { built.queued = s.q ? true : undefined; built.frame = s.fr ? true : undefined; if (SA.update) SA.update(state, built, { propagateToWorkers: false }); }
					// ST-FIX (red tiles after the host's Ctrl+Z — ROOT CAUSE): SA.build can return an object
					// that the game did NOT register in the structure grid — in that case getAtCell in that cell still
					// returns null, the foundation tile is left "orphaned" and renders red.
					// Diagnostics confirmed it: every few seconds the client would report the same 80 cells as
					// orphaned, and the host would reply "structures on my end: 8" and resend them — with no effect.
					// SA.update re-registers the structure; it's O(n) over the store, so we do this ONLY when
					// the registration really is missing, and with a per-frame limit.
					try {
						if (SA.getAtCell && SA.update && !SA.getAtCell(state, s.x, s.y)) {
							// 0.9.217 NOTE: this is the ONLY one of the 55 counters that doesn't throttle the LOG, but the WORK itself —
							// at most 60 registration fixes per second. That's why it gets its own 1000ms window
							// (the default 5 minutes would block the fixes for a long time). Manual resetting is now unnecessary.
							if (lim("regFixN", 60, 1000)) {
								SA.update(state, built, { propagateToWorkers: false });
								if (lim("regFixLog", 5)) diagToHost("naprawiam rejestracje struktury @" + s.x + "," + s.y + " typ=" + s.type);
							}
						}
					} catch (e) { swallow("buildOne", e); }
					return built;
				}
				// HOST: ALWAYS propagate the structure to the simulation workers (not only when there's data!). Without this
				// the structure is in the store, but the host's running sim "doesn't know" it → it does NOT render on the host
				// (the client, with its sim PAUSED, draws it from the store anyway — hence "client sees it, host doesn't").
				// (fix 0.5.4: pose du client invisible côté hôte)
				// 0.9.222: THIS is now the most expensive spot in the move. The mod's own comment from 0.9.143
				// says that SA.update does findIndex over the whole store.structures — meaning for every structure
				// it goes through tens of thousands of positions. We measure this separately to know for sure.
				const __tu = ST._bldProf ? performance.now() : 0;
				if (ST._bldBatch) ST._bldBatch.push(built);   // 0.9.231: jedno updateMany po petli
				else if (SA.update && (ST.net.role === "host" || s.data)) SA.update(state, built, { propagateToWorkers: ST.net.role === "host" });
				if (ST._bldProf) ST._bldProf.update += performance.now() - __tu;
			}
			return built;
		} catch (e) { log("buildOne error:", s.type, e.message); return null; }
	}
	// ST-FIX (CAUSE of "red blocks that cannot be removed"):
	// during REAL demolition the game calls removeAt with {removeCells:true} — you can see this in its own code
	// (the undo module: removeAt(e,x,y,{removeCells:!0}), moving: {removeCells:!0,skipVisuals:!0}).
	// We were calling removeAt(...,{}) — the structure disappeared, but ITS FOUNDATION CELLS stayed in the terrain.
	// On the host, "orphaned" red tiles were being created, the mirror faithfully copied them to the client, the client
	// would ask for permission to clean up, the host allowed it, the client cleaned up on its side — and the mirror brought them
	// back. An endless loop (in the log: "removed 400 red tiles" every 1.5s, without end).
	// ST-FIX (from the Rexisaurus fork): Pipe has its OWN cache (session.cache.pipes) and its own removal
	// procedure in the game. Removing it via structures.removeAt hit the wrong registry.
	// Confirmed in bundle 0.5.6: e[e.Pipe=23]="Pipe", and update() explicitly skips the Pipe type.
	// 0.9.211 (from the author's 0.9.167): we detect the pipe type from the game itself, not from the hardcoded number 23 —
	// the enum can change between game builds.
	// 0.9.231 (REVISION 1.2): the game has its own dictionary of type names — resolveTypeName("Pipe") returns the value
	// of the enum for the pipe. We take it from there instead of the hardcoded 23; the old path (first pipe in the world)
	// remains as a fallback, because it only works when pipes are already on the map.
	function isPipeType(state, t) {
		try {
			// isPipe/isPipeType run in loops over all structures, so when there is no answer
			// we retry the query at most once per second, not on every block
			if (ST._pipeType === undefined && !(ST._pipeTypeT && performance.now() - ST._pipeTypeT < 1000)) {
				ST._pipeTypeT = performance.now();
				let v = null;
				try {
					const SA = structNs();
					if (SA && typeof SA.resolveTypeName === "function") {
						const r = SA.resolveTypeName("Pipe");
						if (r !== "Pipe" && r != null) v = r;
					}
				} catch (e) { swallow("isPipeType", e); }
				if (v == null) { const L = (state && state.store && state.store.pipes) || []; v = L.length && L[0] ? L[0].type : null; }
				if (v != null) { ST._pipeType = v; log("pipe type per game: " + JSON.stringify(v)); }
				else ST._pipeType = undefined;   // we'll try again once the API is ready
			}
			return ST._pipeType != null && t === ST._pipeType;
		} catch (e) { return false; }
	}
	// 0.9.213: PIPE MODE — exactly the same test that _demol uses (Pipe has id 23 or the name
	// "pipe"; since 0.9.211 we also read the type from the game itself). Needed for the other player: when a teammate
	// drags a selection in pipe mode, the game on their side touches ONLY pipes — but we were highlighting
	// regular blocks for them, which that drag would not touch at all.
	function isPipeMode(state) {
		try {
			const sel = ST.FH && ST.FH.action && ST.FH.action.getSelected && ST.FH.action.getSelected(state);
			if (!sel) return false;
			return sel.id === 23 || String(sel.id).toLowerCase().indexOf("pipe") >= 0 || isPipeType(state, sel.id);
		} catch (e) { return false; }
	}
	// 0.9.231 (REVISION 1.4): first the GAME's answer, only then our own __pipe tag (we put it
	// on objects from the network that don't exist locally yet) and finally the hardcoded 23 as a last resort.
	function isPipe(s, state) {
		if (!s) return false;
		if (isPipeType(state || ST.state, s.type)) return true;
		return !!s.__pipe || s.type === 23;
	}
	// 0.9.211 (from the author's 0.9.166): PIPE ON A CELL? Pipes live in store.pipes, NOT in store.structures,
	// so SA.getAtCell doesn't see them. Without this check, cleaning up orphaned tiles deletes walls
	// through which pipes run (report 10.09: blocks above pipes, pumps and valves disappear).
	// 0.9.212 (CAUSE of "pipes only get removed on the host"): a pipe is NOT a structure, so removing it
	// does NOT emit "structures:removed" — and the host has nothing to notify clients with. The snapshot doesn't catch this either,
	// because since 0.9.211 the pipe-phase reconcile deliberately deletes NOTHING (it used to delete positionally, removing
	// a pump standing on a pipe). So we set a hook on the game's OWN pipe-demolition function (m.Zn, exported
	// from the "demolish module exports" patch) and compare store.pipes before and after. We don't guess anything —
	// we take the diff that the game itself produced.
	function installPipeHook() {
		try {
			if (ST._pipeZnWrapped || typeof ST._pipeZn !== "function") return;
			const orig = ST._pipeZn;
			ST._pipeZnRaw = orig;
			// 0.9.214: the hook no longer broadcasts by itself. The store.pipes watcher sees EVERY pipe removal,
			// including the one done by this function, so the duplication produced two identical "st rm" for one pipe
			// (in the log: "demolished pipes 1" and 100 ms later "pipes decreased 1"). The wrapper stays only so that,
			// after the patch swaps the export, there still exists one pipe-demolition function known to us
			// (used by removeOne and the handler for the "pipeRm" request from the client).
			ST._pipeZn = function () { return orig.apply(this, arguments); };
			ST._pipeZnWrapped = true;
			log("pipe demolition hook installed");
		} catch (e) { log("pipe hook error:", e && e.message); }
	}
	// 0.9.213 (CAUSE of "host pipes don't disappear on the client"): the hook from 0.9.212 wrapped the function's EXPORT
	// (window.SandTogether._pipeZn), but the game calls its own m.Zn DIRECTLY — our copy only caught the
	// calls that we make ourselves (the "pipeRm" request from the client). The log shows this directly: the line
	// "HOST: demolished pipes N" appears ONLY next to "client pipes demolished on request".
	// We no longer guess which function removes a pipe — we observe the RESULT, i.e. the store.pipes list itself.
	// 0.9.214 (cost with a LARGE number of pipes): a normal pass is a SINGLE numeric loop over the array, with no
	// allocation at all — we sum a reversible position hash (odd multiplier, so moving
	// a single pipe always changes the sum) and compare it with the previous one. Maps and diff lists are created
	// only when the sum or the counter actually changed, i.e. after a real change in the world.
	// With 50k pipes, a quiet pass is ~50k multiplications (~0.05 ms), not 50k string concatenations
	// and Map insertions, 3 times per second.
	function watchHostPipes(state) {
		try {
			if (ST.net.role !== "host") return;
			const now2 = performance.now();
			if (ST._pipeWatchT && now2 - ST._pipeWatchT < 300) return;
			ST._pipeWatchT = now2;
			const L = (state.store && state.store.pipes) || [];
			// Without listeners there's no point remembering anything; on the player's next entry we'll start from scratch
			// (the first pass only remembers the state anyway, so no avalanche of "pipes added" will fire).
			if (!ST.peers.size) { ST._pipeSeen = null; ST._pipeSig = 0; ST._pipeN = -1; return; }
			let sig = 0;
			for (let i = 0; i < L.length; i++) {
				const q = L[i]; if (!q) continue;
				// Math.imul, because an ordinary multiplication by 2654435761 would go past 2^53 and would lose
				// the low bits — and change detection rests on exactly those.
				sig = (sig + Math.imul((q.x | 0) * 8192 + (q.y | 0), 2654435761)) | 0;
			}
			const prev = ST._pipeSeen;
			if (prev && sig === ST._pipeSig && L.length === ST._pipeN) return;   // pipe world unchanged
			ST._pipeSig = sig; ST._pipeN = L.length;
			const cur = new Map();
			for (const q of L) if (q) cur.set((q.x | 0) * 8192 + (q.y | 0), q);
			ST._pipeSeen = cur;
			if (!prev) return;                      // first pass: we only remember the state
			const gone = [], born = [];
			for (const [k4, q] of prev) if (!cur.has(k4)) gone.push({ type: q.type, x: q.x, y: q.y, __pipe: 1 });
			for (const [k4, q] of cur) if (!prev.has(k4)) born.push({ type: q.type, x: q.x, y: q.y, data: q.data, __pipe: 1 });
			if (gone.length) {
				for (let i = 0; i < gone.length; i += 300) txNote("st", 300 * 40), net.send({ t: "st", k: "rm", list: gone.slice(i, i + 300) });
				if (lim("pipeRmDiag", 30)) log("HOST: pipes removed " + gone.length + " -> broadcasting removal");
			}
			if (born.length) {
				for (let i = 0; i < born.length; i += 300) txNote("st", 300 * 40), net.send({ t: "st", k: "add", list: born.slice(i, i + 300) });
				if (lim("pipeAddDiag", 30)) log("HOST: pipes added " + born.length + " -> broadcasting");
			}
		} catch (e) { if (!ST._pipeWatchErr) { ST._pipeWatchErr = 1; log("pipe observer error:", e && e.message); } }
	}
	// ===================== PIPE CONNECTIONS (0.9.248) =====================
	// 0.5.7 changed the rules: pipes no longer connect to a neighbour by themselves, the connection is made by the player with a separate
	// drag. The connection state sits in q.data (pipeConnectionMask, pipeBridgeConnectionMask,
	// pipeBridgeAxis, disabled) of THE SAME pipe — the position doesn't change.
	// That's why the old pipe watcher didn't see this: its signature was computed ONLY from x and y
	//     sig = sig + imul(x * 8192 + y, ...)
	// and the list had the same number of elements as before, so the function exited via "pipe world unchanged".
	// Connections made on the host never went out into the world, and the client's connections never reached
	// the host, because no new structure was created to pass along.
	// The watcher below looks ONLY at pipe data and works on both sides: the host broadcasts changes
	// to everyone, the client sends its own back to the host. We don't touch added/removed pipes here — that's still
	// handled by watchHostPipes, so there's no risk of regression in building and demolition.
	const OS_POZIOMA = 1, OS_PIONOWA = 2;
	function pipeDataSig(q) {
		const d = (q && q.data) || {};
		const os = d.pipeBridgeAxis === "horizontal" ? OS_POZIOMA : d.pipeBridgeAxis === "vertical" ? OS_PIONOWA : 0;
		return ((d.pipeConnectionMask | 0) & 15)
			| (((d.pipeBridgeConnectionMask | 0) & 15) << 4)
			| (os << 8)
			| ((d.disabled === true ? 1 : 0) << 10);
	}
	// Hook from the patch: the game calls it at the END of a pipe drag, right before its own cZ. On the host and solo we don't do
	// anything — the game is about to do everything itself. On the client, our own building is intercepted and cancelled,
	// so cZ has nothing to connect; we pass the host two route points, and it replays the drag on its side.
	// 0.9.251 (CAUSE of the REGRESSION FROM 0.9.250, visible in the log): "CLIENT pipe drag -> host" was there,
	// but on the host's side, SILENCE — because the message was OUTRUNNING the pipes themselves. The game calls this hook synchronously at
	// the end of the drag, but the client collects placements into a batch and only sends them on a 50 ms timer (queuePlace).
	// So the host was receiving the drag into a world where not a single pipe from that line existed yet,
	// found nothing on the route and quietly exited. In 0.9.249 this bug didn't exist, because the connecting
	// fired INSIDE the placeN handler, i.e. by definition after placement.
	// Now the drag waits in the same queue as the placements and goes right after them.
	// ===================== UNDO FOR PIPES AND BACKSPACE (0.9.253) =====================
	// The rule has been in place for a long time and we're not changing it here: on the client WE intercept the actions, so the game
	// doesn't see them and doesn't add an entry to the Ctrl+Z history itself (and even if it wanted to, _applyingNet
	// keeps its isUndoing flag raised, so that the OTHER player's actions don't end up in the history).
	// So we create the entries ourselves, in EXACTLY the shape the game looks for when undoing:
	//     { type: "remove",     structures: [{type,x,y,data,filter,color}] }
	//     { type: "pipeRemove", snapshots:  [{x,y,data:{...}}] }
	//     { type: "pipeBuild",  positions:  [{x,y}], previous: [{x,y,data:{...}}] }
	// The shape of the pipe snapshot taken directly from the game (function g in the pipe module).
	function migawkaRury(q) {
		const d = (q && q.data) || {};
		return {
			x: q.x, y: q.y,
			data: {
				pipeConnectionMask: d.pipeConnectionMask || 0,
				pipeBridgeConnectionMask: d.pipeBridgeConnectionMask || 0,
				pipeBridgeAxis: d.pipeBridgeAxis,
				disabled: d.disabled === true || undefined,
			},
		};
	}
	function migawkiRurWRecie(state, x0, y0, x1, y1) {
		const out = [];
		try {
			for (const q of (state.store && state.store.pipes) || []) {
				if (!q) continue;
				if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) out.push(migawkaRury(q));
			}
		} catch (e) { swallow("pipe snapshots", e); }
		return out;
	}
	// The game undoes pipe actions through TWO public FH functions:
	//     pipeBuild  -> removeAtCells(positions) [+ restoreSnapshots(previous)]
	//     pipeRemove -> restoreSnapshots(snapshots)
	//     pipeMove   -> removeAtCells(placed) + restoreSnapshots(snapshots)
	// On the client, these calls have to reach the host, otherwise the undo only lives locally and will soon
	// be painted over by the mirror. We wrap them on the FH object — the game reaches for them exactly there
	// (in the code: se.FH.pipes.removeAtCells), so the wrapper is seen. This isn't the case
	// where we already got burned once with Zn and beginBatchWrite, where the game called the module's function.
	// PROBE 0.9.255: on every Ctrl+Z we print the top of the history stack — the entry type and its sizes.
	// This is the only missing piece of information: from the 0.9.254 log it was visible that ONE undo sent only
	// a removal without a restore, meaning it hit an entry with an empty "previous" — but it isn't visible which one
	// the entry was or where it came from. Now it will be visible directly, along with its neighbours on the stack (which will also
	// immediately reveal whether bridge pipes create a second, redundant entry).
	function sondaHistorii() {
		try {
			const U = ST._undoState;
			if (!U || !Array.isArray(U.history)) return;
			const n = U.history.length;
			let opis = "";
			for (let i = n - 1; i >= 0 && i >= n - 3; i--) {
				const w = U.history[i];
				if (!w) continue;
				const ile = (t) => (Array.isArray(w[t]) ? w[t].length : "-");
				opis += (opis ? " | " : "") + "[" + i + "] " + w.type
					+ " pos:" + ile("positions") + " prev:" + ile("previous")
					+ " snap:" + ile("snapshots") + " str:" + ile("structures")
					+ (w.__st ? " (nasz)" : "");
			}
			log("HISTORY (" + n + " entries): " + opis);
		} catch (e) { swallow("history probe", e); }
	}
	function podepnijSondeHistorii() {
		if (ST._sondaHistOn) return;
		ST._sondaHistOn = 1;
		const naKlawisz = (ev) => {
			try { if ((ev.ctrlKey || ev.metaKey) && (ev.key === "z" || ev.key === "Z" || ev.code === "KeyZ")) sondaHistorii(); } catch (e) {}
		};
		// in 0.9.255 the probe didn't fire even once while listening on window — we're adding document
		window.addEventListener("keydown", naKlawisz, true);
		try { document.addEventListener("keydown", naKlawisz, true); } catch (e) {}
	}
	function przechwycCofanieRur() {
		try {
			const P = ST.FH && ST.FH.pipes;
			if (!P || P.__stWrap) return;
			const origRm = P.removeAtCells, origRest = P.restoreSnapshots;
			if (typeof origRm === "function") {
				P.removeAtCells = function (state, cells, opts) {
					if (isClientSync() && ST.wsx.paused && !ST._applyingNet) {
						try {
							const lista = (cells || []).map((c) => ({ x: c.x, y: c.y }));
							if (lista.length) { net.send({ t: "act", k: "pipeDel", c: lista }); stampAct("demolish", lista.length); }
							if (lim("pipeDelTx", 200, 600000)) log("CLIENT pipe undo -> host: remove " + lista.length
								+ " [" + lista.slice(0, 12).map((c) => c.x + "," + c.y).join(" ") + (lista.length > 12 ? " ..." : "") + "]");
						} catch (e) { swallow("pipe undo", e); }
						return null;                       // the host executes, the mirror confirms
					}
					return origRm.apply(this, arguments);
				};
			}
			if (typeof origRest === "function") {
				P.restoreSnapshots = function (state, snaps) {
					if (isClientSync() && ST.wsx.paused && !ST._applyingNet) {
						try {
							const lista = (snaps || []).map((q) => ({ x: q.x, y: q.y, data: q.data }));
							if (lista.length) { net.send({ t: "act", k: "pipeRestore", s: lista }); stampAct("placeN", lista.length); }
							if (lim("pipeRestTx", 200, 600000)) log("CLIENT pipe undo -> host: restore " + lista.length);
						} catch (e) { swallow("pipe undo", e); }
						return null;
					}
					return origRest.apply(this, arguments);
				};
			}
			P.__stWrap = 1;
			podepnijSondeHistorii();
			log("pipe undo: hooked removeAtCells and restoreSnapshots");
		} catch (e) { log("pipe undo: failed to hook:", e && e.message); }
	}
	// ==================================================================================
	// ===================== USUWANIE ZAZNACZENIA — BACKSPACE (0.9.252) =====================
	// 0.9.252 (REPORT FROM ANDREW, diagnosis correct): the game has TWO different removal paths and we had
	// only one is hooked up. The X key is the demolition tool, which we intercept with the _demol hook.
	// Backspace on a selection is a completely separate key handler; in bundle 0.5.7 it looks like this:
	//     case $V.Delete: return { down: e => {
	//         ... mode === Selected || mode === Moving ...
	//         pipes     -> l4(e, n, {playSound:true})                                  (= FH.pipes.removeAtCells)
	//         struktury -> Cj(e, start, end, {removeCells:true, playSound:true, onlyPositions:r})
	//     }}
	// Neither one nor the other was hooked up on our side, so the client would delete on its own side and nobody
	// found out about it. Hence "gone on the client, still there on the host".
	// Important: we do NOT replace this with our own demolition. It's precisely this path that can remove the "ghosts" that
	// the X tool doesn't touch — if we rerouted it to our regular path, we'd lose that property.
	// The host calls exactly the same two game functions, at the same positions.
	ST._delSel = (state) => {
		try {
			if (!isClientSync() || !ST.wsx.paused) return false;     // host and solo: the game does it itself
			const cd = state.session && state.session.action && state.session.action.customData;
			if (!cd || cd.selectedStructures === undefined) return false;
			if (cd.mode !== 1 && cd.mode !== 3) return false;        // Selected / Moving — same as the game
			const rury = [], struktury = [];
			for (const o of cd.selectedStructures || []) {
				const a = o && o.originalPos;
				if (!a || !Number.isFinite(a.x)) continue;
				(isPipe(o, state) ? rury : struktury).push({ x: a.x, y: a.y });
			}
			if (!rury.length && !struktury.length) return false;     // nothing to delete — let the game handle it
			// HISTORY ENTRIES (0.9.253, report: "undo after Backspace undoes the previous action").
			// On the client, the game doesn't perform this demolition itself, so it won't record it on its own and Ctrl+Z
			// would reach for the entry FROM BEFORE it — hence "it undid my build instead of the deletion".
			try {
				const migawki = [];
				for (const c of rury) { const q = pipeAt(state, c.x, c.y); if (q) migawki.push(migawkaRury(q)); }
				if (migawki.length) ST._undoPush({ type: "pipeRemove", snapshots: migawki, timestamp: Date.now() });
				const str = [];
				for (const o of cd.selectedStructures || []) {
					const a = o && o.originalPos;
					if (!a || !Number.isFinite(a.x) || isPipe(o, state)) continue;
					str.push({ type: o.type, x: a.x, y: a.y, data: o.data, filter: o.filter, color: o.color });
					try {
						if (!ST._colByPos) ST._colByPos = new Map();
						if (o.color != null) ST._colByPos.set((a.x | 0) + "," + (a.y | 0), o.color);
					} catch (e2) { swallow("selection removal", e2); }
				}
				if (str.length) ST._undoPush({ type: "remove", structures: str, timestamp: Date.now() });
			} catch (e) { swallow("Backspace history", e); }
			net.send({
				t: "act", k: "delSel", p: rury, s: struktury,
				a: cd.start ? { x: cd.start.x, y: cd.start.y } : null,
				b: cd.end ? { x: cd.end.x, y: cd.end.y } : null,
			});
			stampAct("demolish", rury.length + struktury.length);
			state.session.action.customData = null;                  // the same thing the game does at the end
			log("CLIENT Backspace -> host: pipes " + rury.length + ", structures " + struktury.length);
			return true;                                             // the game no longer deletes anything on our side
		} catch (e) { swallow("selection removal", e); return false; }
	};
	// ======================================================================================
	ST._pipeRunQ = null;
	ST._pipeRun = (state, positions, start, end) => {
		try {
			if (!isClientSync() || !ST.wsx.paused || ST._applyingNet) return;
			if (!start || !end) return;
			// 0.9.256 (CAUSE OF BOTH REPORTS, straight from the log). One drag produced TWO entries
			// in the history. The log shows this four times in a row, without exception:
			//     DRAG-PROBE: points 2, new 0, previous 2      <- one player action
			//     CLIENT pipe undo -> host: delete 0 []                 <- first Ctrl+Z
			//     CLIENT pipe undo -> host: delete 0 []                 <- second Ctrl+Z
			// The second entry is made by the game itself. Right after our hook, its cZ runs, and after that:
			//     if (n.length > 0 || t.changed) emit("pipes:built", { placed: r, previous: t.previous })
			// On the client, "n" is EMPTY (we intercept and cancel its building), but "t.changed" can be
			// true — because cZ can connect pipes that are ALREADY standing on the client. In that case the game writes an entry
			// with an empty position list: such an undo removes nothing, it only disconnects. Hence both symptoms at once:
			//   * with a bridge and with a regular connection, Ctrl+Z had to be pressed twice,
			//   * the first press "only undid part of it" — it disconnected the pipes, leaving a dangling segment
			//     (this is exactly what's visible in the third screenshot: horizontal pipes with outlets again, and a vertical piece
			//     osobno).
			// The entry from the game is useless here, because it's created based on a world in which the build didn't
			// happen. We create the correct entry ourselves below, so we silence its write with the same mechanism
			// we've long used to block other players' actions from being written to the history: the game skips the write when it sees
			// the isUndoing flag raised, and our accessor raises it for the duration of _undoHold.
			// We clear it with a microtask — the "pipes:built" emission still fires within the same block as cZ.
			try {
				ST._inGameUndo();                      // forces the accessor to be set up, if it doesn't exist yet
				ST._undoHold = true;
				queueMicrotask(() => { ST._undoHold = !!ST._applyingNet; });
			} catch (e) { swallow("game entry mute", e); }
			// History entry for Ctrl+Z. The game has already assigned roles to the points (function k7 in the preview), so
			// we read them ready-made: "new" = a pipe will be created here, the rest = pipes that ALREADY stand and are about to
			// have their shape changed. We take the snapshots NOW, because on the client the world hasn't changed yet.
			try {
				const nowe = [], poprzednie = [];
				for (const pkt of positions || []) {
					if (!pkt || !Number.isFinite(pkt.x)) continue;
					if (pkt.pipeBuildRole === "new") { nowe.push({ x: pkt.x, y: pkt.y }); continue; }
					if (!pkt.pipeBuildRole) continue;                      // punkt poza trasa
					// 0.9.255: we take the snapshot from EVERY pipe lying on the route, including "blockedOverlap".
					// The reason is mechanical: the game restores shapes only when the entry has a non-empty
					// "previous" (in its code: a.previous.length>0 ? (delete, restore) : (delete only)).
					// With an empty list, the undo deletes new pipes and does NOT touch the ones whose shape
					// the drag changed — and that's exactly what the report "a piece at the end of the pipe remains" looks like.
					// A snapshot of a pipe that nothing changed is empty work when restoring, so
					// having extra ones breaks nothing, while missing one can break everything.
					const q = pipeAt(state, pkt.x, pkt.y);
					if (q) poprzednie.push(migawkaRury(q));
				}
				if (nowe.length || poprzednie.length)
					ST._undoPush({ type: "pipeBuild", positions: nowe, previous: poprzednie, timestamp: Date.now() });
				// PROBE 0.9.254: report "undoes 4 out of 5 pipes, the one at the end of an existing one remains". Instead of
				// guessing, we print the WHOLE route with the roles assigned by the game — you can immediately see whether any of them
				// a cell got a different role than we expect, or whether it gets lost somewhere further on.
				try {
					let opis = "";
					let i9 = 0;
					for (const pkt of positions || []) {
						if (!pkt || !Number.isFinite(pkt.x)) continue;
						if (i9 < 24) opis += (i9 ? " " : "") + i9 + ":(" + pkt.x + "," + pkt.y + ")" + (pkt.pipeBuildRole || "-")
							+ (pkt.pipeBridgeAxis ? "/" + pkt.pipeBridgeAxis : "");
						i9++;
					}
					log("DRAG-PROBE: points " + i9 + ", to entry: new " + nowe.length + ", previous "
						+ poprzednie.length + " | " + opis + (i9 > 24 ? " ..." : ""));
				} catch (e) { swallow("drag probe", e); }
			} catch (e) { swallow("pipe drag history", e); }
			const m = { t: "act", k: "pipeRun", s: { x: start.x, y: start.y }, e: { x: end.x, y: end.y } };
			if (ST._placeQ) { (ST._pipeRunQ || (ST._pipeRunQ = [])).push(m); }   // there are pipes in the queue — wait for them
			else net.send(m);                                                    // the drag itself over existing pipes
			if (lim("pipeRunTx", 30)) log("CLIENT pipe drag -> host: (" + start.x + "," + start.y + ") -> ("
				+ end.x + "," + end.y + ")" + (ST._placeQ ? " [waiting for pipe batch]" : " [immediately]"));
		} catch (e) { swallow("client pipe drag", e); }
	};
	function watchPipeData(state) {
		try {
			const host = ST.net.role === "host";
			if (host ? !ST.peers.size : !isClientSync()) { ST._pdSeen = null; return; }
			const now3 = performance.now();
			if (ST._pdT && now3 - ST._pdT < 300) return;
			ST._pdT = now3;
			const L = (state.store && state.store.pipes) || [];
			const cur = new Map();
			const prev = ST._pdSeen;
			const zmiany = [];
			for (let i = 0; i < L.length; i++) {
				const q = L[i]; if (!q) continue;
				const k4 = (q.x | 0) * 8192 + (q.y | 0), sg = pipeDataSig(q);
				cur.set(k4, sg);
				if (prev) {
					const st0 = prev.get(k4);
					// A NEW pipe (no entry) also has to be forwarded, if it already has some connections: building
					// a single pipe on the other side hard-resets the mask, so the "add" packet alone
					// will never carry the shape over. We skip pipes with mask 0 — "add" already covers them.
					if (st0 === undefined ? sg !== 0 : st0 !== sg) zmiany.push({ x: q.x | 0, y: q.y | 0, s: sg });
				}
			}
			ST._pdSeen = cur;
			if (!prev || !zmiany.length) return;     // the first pass only remembers the state
			for (let i = 0; i < zmiany.length; i += 400) txNote("st", 300 * 40), net.send({ t: "st", k: "pd", list: zmiany.slice(i, i + 400) });
			if (lim("pdDiag", 200, 600000)) log((host ? "HOST" : "CLIENT") + ": pipe link change — " + zmiany.length + " pcs. into world");
		} catch (e) { swallow("pipe link observer", e); }
	}
	function pipeAt(state, x, y) {
		const API = ST._pipeApi;
		if (API && typeof API.at === "function") { try { const q = API.at(state, x, y); if (q) return q; } catch (e) { swallow("pipeAt", e); } }
		const L = (state.store && state.store.pipes) || [];
		for (let i = 0; i < L.length; i++) { const q = L[i]; if (q && (q.x | 0) === (x | 0) && (q.y | 0) === (y | 0)) return q; }
		return null;
	}
	function applyPipeData(state, list) {
		if (!Array.isArray(list) || !list.length) return 0;
		const API = ST._pipeApi;
		let n = 0;
		for (const it of list) {
			if (!it || !Number.isFinite(it.x)) continue;
			const q = pipeAt(state, it.x, it.y);
			if (!q) continue;                                   // the pipe hasn't arrived yet — its data will come with it
			const sg = it.s | 0, os = (sg >> 8) & 3;
			const d = q.data || (q.data = {});
			d.pipeConnectionMask = sg & 15;
			d.pipeBridgeConnectionMask = (sg >> 4) & 15;
			d.pipeBridgeAxis = os === OS_POZIOMA ? "horizontal" : os === OS_PIONOWA ? "vertical" : undefined;
			d.disabled = ((sg >> 10) & 1) ? true : undefined;
			d.pipeSpriteIndex = undefined;                      // the game will recalculate the pipe's shape from scratch
			if (API && typeof API.refresh === "function") { try { API.refresh(state, q); } catch (e) { swallow("pipe refresh", e); } }
			// entry into the watcher's own database, so as not to send the same change back
			if (ST._pdSeen) ST._pdSeen.set((it.x | 0) * 8192 + (it.y | 0), sg);
			n++;
		}
		// recalculating the pump and valve graph — this only matters where the simulation is actually running
		if (n && ST.net.role === "host" && API && typeof API.relink === "function") {
			try { API.relink(state); } catch (e) { swallow("pipe graph switch", e); }
		}
		return n;
	}
	// 0.9.250 (ANDREW'S NOTE, fully justified): instead of REPEATING the pipe logic with our own effort, we call
	// the game's functions. In the 0.5.7 bundle, the entire pipe drag ends with a single call:
	//     me(e,t,n,r,o,i) -> cZ(e, i.positions, i.startPosition, i.endPosition, n)
	// where cZ walks the route and decides for itself what connects to what. Before it does that, the route is described by
	// the function k7, which assigns a role to each point:
	//     "new"             - a pipe is created here
	//     "existingEndpoint"- the end of the route hit a pipe that was already standing
	//     "existingPath"    - the route passes through a standing pipe and is meant to CONNECT to it
	//     "bridgeCenter"    - the route passes through a standing pipe and is meant to BYPASS it with a bridge
	//     "blockedOverlap"  - building is not allowed here
	// My version from 0.9.249 only knew "neighbour with neighbour", so a drag through another pipe would always
	// connect, whereas the game makes a bridge in the same spot. Hence the discrepancy you reported.
	// Now the host replays exactly these two calls on its own world. The whole heuristic
	// baggage also disappears: batching packets after a second (rightly pointed out — two pipes placed quickly next to
	// each other could get glued together) and the closing of two-cell gaps.
	// We don't transmit the route: cZ walks a straight line from start to end in grid steps anyway
	// (function V in the game's code), so the host only needs two points and replays it without loss.
	function pipeRunHost(state, poczatek, koniec) {
		// EVERY exit says why. The 0.9.250 regression survived the entire test precisely because these
		// exits were silent: the log showed the client's send and nothing on the host's side.
		const nie = (powod) => { if (lim("pdRunNie:" + powod, 5)) log("HOST: pipe drag skipped — " + powod); return 0; };
		const API = ST._pipeApi;
		if (!API) return nie("brak _pipeApi (hook nie wszedl — przeinstaluj mod)");
		if (typeof API.path !== "function" || typeof API.run !== "function") return nie("stary _pipeApi bez path/run (patches.json nieaktualny)");
		if (!poczatek || !koniec || !Number.isFinite(poczatek.x) || !Number.isFinite(koniec.x)) return nie("brak wspolrzednych trasy");
		const dx = koniec.x - poczatek.x, dy = koniec.y - poczatek.y;
		const kroki = Math.max(Math.abs(dx), Math.abs(dy)) / CELL;
		if (!Number.isInteger(kroki) || kroki < 0 || kroki > 4096) return nie("trasa nie lezy na siatce: " + dx + "x" + dy);
		const sx = Math.sign(dx) * CELL, sy = Math.sign(dy) * CELL;
		const trasa = [];
		for (let i = 0; i <= kroki; i++) trasa.push({ x: poczatek.x + sx * i, y: poczatek.y + sy * i });
		// pipes lying on the route (the ones freshly placed from the placeN batch and the ones that already stood):
		// cZ receives them as "what was created", and for existing roles it compares by reference anyway,
		// so the same list handles both cases
		const naTrasie = [];
		for (const punkt of trasa) { const q = pipeAt(state, punkt.x, punkt.y); if (q) naTrasie.push(q); }
		if (!naTrasie.length) return nie("na trasie nie ma ani jednej rury (" + (kroki + 1) + " punktow) — paczka rur jeszcze nie doszla?");
		let wynik = null, role = "";
		try {
			API.path(state, trasa, poczatek, koniec);              // point roles according to the HOST'S WORLD
			// the role preview is useful both now (you can see whether the game sees the route the same way the client does), and when
			// undoing — the history entry needs exactly the points with the "new" role
			const licznik = {};
			for (const pkt of trasa) { const r = pkt.pipeBuildRole || "brak"; licznik[r] = (licznik[r] || 0) + 1; }
			role = Object.keys(licznik).map((k) => k + " " + licznik[k]).join(", ");
			wynik = API.run(state, trasa, poczatek, koniec, naTrasie);
		} catch (e) { swallow("pipe drag", e); return nie("funkcja gry rzucila: " + ((e && e.message) || e)); }
		if (typeof API.refresh === "function") for (const q of naTrasie) { try { API.refresh(state, q); } catch (e) { swallow("pipe drag", e); } }
		if (typeof API.relink === "function") { try { API.relink(state); } catch (e) { swallow("pipe drag", e); } }
		// we broadcast explicitly: the watcher doesn't know about freshly placed pipes yet, so it
		// wouldn't notice changes to them on its own (it only compares what it already has in its database)
		const paczka = [];
		for (const q of naTrasie) paczka.push({ x: q.x | 0, y: q.y | 0, s: pipeDataSig(q) });
		for (let i = 0; i < paczka.length; i += 400) txNote("st", 300 * 40), net.send({ t: "st", k: "pd", list: paczka.slice(i, i + 400) });
		if (lim("pdRun", 200, 600000)) log("HOST: client pipe drag replayed by game — " + paczka.length
			+ " pipes on route, change: " + (wynik && wynik.changed ? "yes" : "no") + " | role: " + role);
		return paczka.length;
	}
	// ====================================================================
	function hasPipeAt(state, x, y) {
		try { const P = ST.FH && ST.FH.pipes; if (P && typeof P.isAt === "function") return !!P.isAt(state, x, y); } catch (e) {}
		try {
			const L = (state.store && state.store.pipes) || [];
			const bx = Math.floor(x / 4) * 4, by = Math.floor(y / 4) * 4;
			for (let i = 0; i < L.length; i++) { const q = L[i]; if (q && Math.floor(q.x / 4) * 4 === bx && Math.floor(q.y / 4) * 4 === by) return true; }
		} catch (e) {}
		return false;
	}
	// 0.9.252 (CAUSE of "unremovable pipe pieces remain on the client"). The game's function that deletes pipes
	// doesn't look at each pipe individually — it looks at the WHOLE BATCH at once:
	//     ge(e, condition, options): a = pipes matching the condition;  s = me(e, a);
	//     me() picks those among them that are the center of a bridge and whose BOTH bridge neighbours are NOT in "a" —
	//     such pipes get REPLACED instead of deleted.
	// The host deletes with a single rectangle, so the whole group is in "a" and disappears. The client used to receive a list and call
	// _pipeZn separately for EACH pipe, meaning the batch had size 1 — the neighbours always fell outside it
	// and the game dutifully REPLACED the pipe instead of deleting it. A piece was left that nothing could touch anymore:
	// on the next X, the client sends the rectangle to the host, the host has nothing there, so it sends nothing back.
	// The client is a mirror of the host, so it's supposed to delete exactly what it received: we remove the bridge marker
	// (then me() doesn't consider the pipe at all) and we call one, batch, game function on the whole list.
	// We change NOTHING on the HOST — the usual game rules are meant to apply there.
	function usunRuryLustro(state, lista) {
		const cele = [];
		try {
			for (const s of lista || []) {
				if (!s || !Number.isFinite(s.x)) continue;
				const q = pipeAt(state, s.x, s.y);
				if (!q) continue;
				if (q.data) { q.data.pipeBridgeAxis = undefined; q.data.pipeBridgeConnectionMask = 0; }
				cele.push({ x: q.x, y: q.y });
			}
			if (!cele.length) return 0;
			const P = ST.FH && ST.FH.pipes;
			if (P && typeof P.removeAtCells === "function") P.removeAtCells(state, cele, { playSound: false });
			else if (typeof ST._pipeZn === "function") for (const c of cele) ST._pipeZn(state, c, c);
			let zostalo = 0;
			for (const c of cele) if (pipeAt(state, c.x, c.y)) zostalo++;
			if (zostalo && lim("rurDuch", 10)) log("WARNING: after removing pipes, left " + zostalo + " z " + cele.length
				+ " — these are exactly the non-removable pieces, report if it recurs");
		} catch (e) { swallow("removing pipes at client", e); }
		return cele.length;
	}
	const lustroRur = () => { try { return isClientSync() && ST.wsx.paused; } catch (e) { return false; } };
	function removeOne(state, s, opts, bulk) {
		try {
			const __p = ST._rmProf;
			const __t1 = __p ? performance.now() : 0;
			if (isPipe(s, state) && lustroRur()) {
				usunRuryLustro(state, [s]);
			} else if (isPipe(s, state) && typeof ST._pipeZn === "function") {
				ST._pipeZn(state, { x: s.x, y: s.y }, { x: s.x, y: s.y });
			} else {
				const SA = structNs(); if (SA) SA.removeAt(state, s.x, s.y, opts || { removeCells: true });
			}
			const __t2 = __p ? performance.now() : 0;
			// ST-FIX: after removal, a structure must not remain in our caches as "applied" —
			// otherwise the next snapshot will consider it current and won't recreate it, or won't remove the ghost.
			const k = structKey(s);
			if (ST._structSig) ST._structSig.delete(k);
			if (ST._structApplied) ST._structApplied.delete(k);
			// 0.9.220 (QUADRATIC WORK): this filter iterates the WHOLE _snapRest list on EVERY removal.
			// When moving 3000 structures with a non-empty deferred list, that's 3000 full passes.
			// In bulk mode we skip it here and make ONE pass after the loop (dropSnapRest).
			if (!bulk && ST._snapRest && ST._snapRest.length) ST._snapRest = ST._snapRest.filter((q) => structKey(q) !== k);
			if (__p) { __p.api += __t2 - __t1; __p.book += performance.now() - __t2; }
		} catch (e) { log("removeOne error:", e.message); }
	}
	// 0.9.221: BULK REMOVAL GAME FUNCTION. Profiling from 0.9.220 settled the dispute: with 1632 structures
	// removal took 1142 ms, of which OUR bookkeeping was 3 ms, and 1135 ms sat in the game's SA.removeAt.
	// Calling it 1632 times separately means scanning the whole structure list every time (tens of
	// thousands of entries). The game has its own batch function for this — removeAtPositions — the same one used by
	// its own undo. So we don't write any removal logic of our own: we call what the game does anyway,
	// just once instead of a thousand times. When the function is missing (a different build), the old loop remains.
	// Pipes go separately — they have their own demolition procedure in the game (see removeOne).
	function removeMany(state, list) {
		const wynik = { n: 0, hurt: false };
		try {
			const rury = [], zwykle = [];
			for (const s of list || []) { if (!s || !Number.isFinite(s.x)) continue; (isPipe(s, state) ? rury : zwykle).push(s); }
			wynik.n = rury.length + zwykle.length;
			const SA = structNs();
			if (SA && typeof SA.removeAtPositions === "function" && zwykle.length > 8) {
				try {
					SA.removeAtPositions(state, zwykle.map((s) => ({ x: s.x, y: s.y })), { removeCells: true });
					wynik.hurt = true;
				} catch (e) { swallow("removeMany", e); }
			}
			if (!wynik.hurt) for (const s of zwykle) removeOne(state, s, null, true);
			if (rury.length && lustroRur()) usunRuryLustro(state, rury);        // ONE batch, not N individual ones
			else for (const s of rury) removeOne(state, s, null, true);
			// bookkeeping once for the whole batch (during bulk removal, removeOne was not called at all)
			const klucze = new Set();
			for (const s of list || []) {
				if (!s) continue;
				const k = structKey(s); klucze.add(k);
				if (ST._structSig) ST._structSig.delete(k);
				if (ST._structApplied) ST._structApplied.delete(k);
			}
			dropSnapRest(klucze);
		} catch (e) { swallow("removeMany", e); }
		return wynik;
	}
	// 0.9.220: one pass over the list of deferred structures instead of one per removal.
	function dropSnapRest(keys) {
		try {
			if (ST._snapRest && ST._snapRest.length && keys && keys.size)
				ST._snapRest = ST._snapRest.filter((q) => !keys.has(structKey(q)));
		} catch (e) { swallow("dropSnapRest", e); }
	}
	// Resolve the footprint while the structure is still alive. Foundation data has changed shape
	// between game builds, whereas getAtCell is the game's authoritative shape lookup. Walk only
	// cells belonging to this exact structure, then retain their bounding box for orphan cleanup.
	function structureBounds(state, SA, st, seedX, seedY) {
		if (!SA || !st) return null;
		const key = structKey(st), q = [[seedX, seedY]], seen = new Set();
		let x0 = seedX, y0 = seedY, x1 = seedX, y1 = seedY, cells = 0;
		// 0.9.219 (REVISION 2.6): 4096 cells is 256 4x4 blocks — no structure in the game has that many,
		// so the limit is theoretical. But if it were hit, the outline would be TOO SMALL and cleanup of orphaned
		// tiles would leave garbage behind; we prefer to know about it.
		while (q.length && cells < 4096) {
			const [x, y] = q.pop(), ck = x + "," + y;
			if (seen.has(ck)) continue;
			seen.add(ck);
			let at = null; try { at = SA.getAtCell(state, x, y); } catch (e) { swallow("structureBounds", e); }
			if (!at || (at !== st && structKey(at) !== key)) continue;
			cells++;
			if (x < x0) x0 = x; if (x > x1) x1 = x;
			if (y < y0) y0 = y; if (y > y1) y1 = y;
			q.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
		}
		if (cells >= 4096 && lim("sbCap", 3)) log("structure outline: exceeded 4096 cells — outline may be incomplete");
		return cells ? { x0, y0, x1, y1 } : null;
	}
	// ST-FIX (red tiles after Ctrl+Z — THE REAL CAUSE):
	// rebuilding after undo relied on _lastDemolBounds, and that rect is created ONLY on the
	// demolisher path (drag). Removing a single structure (held X, removeAt) does not leave
	// a rect, so after undo the emergency branch fired: a forced FULL snapshot of structures
	// + enqueueFullWorld() — 9216 chunks coming down over ~10 s, and the client saw blocks coming back
	// "in lines". Now we take the rect from what the game JUST reconstructed: the structures:placed event
	// during undo carries exactly those structures.
	function noteUndoRect(arr, force) {
		try {
			// force: call from the deferred rebuild flush — by then isUndoing has already dropped (the game clears it
			// in a setTimeout 0), but the rect is still valid
			if (!force && (!ST._inGameUndo || !ST._inGameUndo())) return;
			const r = ST._undoRect && ST._undoRectT && performance.now() - ST._undoRectT < 1000
				? ST._undoRect
				: (ST._undoRect = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, n: 0 });
			for (const s2 of arr) {
				if (!s2 || !Number.isFinite(s2.x) || !Number.isFinite(s2.y)) continue;
				const x = s2.x | 0, y = s2.y | 0;
				if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x;
				if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
				r.n++;
			}
			ST._undoRectT = performance.now();
			// two passes: the first clears red immediately, the second catches structures that 350 ms
			// earlier were still "queued" at the host (the game only settles this state after a moment)
			ST._undoPass1 = performance.now() + 350;
			ST._undoPass2 = performance.now() + 1400;
		} catch (e) {}
	}
	// all structures from the rectangle straight from the host's store — without probing cell by cell
	// and without the 500 limit, which on a larger demolition left the rest for the full snapshot
	function sendStructsInRect(state, r) {
		try {
			if (!r || !net || !ST.peers.size) return 0;
			const x0 = r.x0 - 4, x1 = r.x1 + 4, y0 = r.y0 - 4, y1 = r.y1 + 4;
			const list = []; let skipped2 = 0;
			for (const src of [state.store.structures || [], state.store.pipes || []]) {
				for (let i = 0; i < src.length; i++) {
					const s2 = src[i];
					if (!s2 || !Number.isFinite(s2.x) || !Number.isFinite(s2.y)) continue;
					if (s2.x < x0 || s2.x > x1 || s2.y < y0 || s2.y > y1) continue;
					const sl2 = slimStruct(s2);
					// we skip what has already been broadcast and hasn't changed since
					try {
						const prev = ST._bcSent && ST._bcSent.get(structKey(sl2));
						if (prev && performance.now() - prev.t < 15000 && prev.s === snapSig(sl2)) { skipped2++; continue; }
					} catch (e) {}
					list.push(sl2);
				}
			}
			// ST-FIX: batches of 300, not one big one. At the client, buildOne on a queued state change calls
			// SA.update, which is O(n) over store.structures — a thousand structures at once causes a freeze of several
			// seconds. Smaller batches spread this across subsequent frames.
			for (let i = 0; i < list.length; i += 300) { txNote("st", 300 * 40); net.send({ t: "st", k: "add", list: list.slice(i, i + 300) }); }
			ST._rectSkipped = skipped2;
			return list.length;
		} catch (e) { log("rect resend error:", e && e.message); return 0; }
	}
	// refreshing the TERRAIN in the rectangle: undo writes don't always set chunkShouldUpdate
	function markRectUrgent(state, r) {
		let marked = 0;
		try {
			// 0.9.219 (REVISION 2.4): here the limit counts CHUNKS (step CHUNK), so the bug from 2.3 doesn't happen — but it was silent.
			for (let yy = r.y0 - CHUNK; yy <= r.y1 + CHUNK && marked < 4000; yy += CHUNK)
				for (let xx = r.x0 - CHUNK; xx <= r.x1 + CHUNK && marked < 4000; xx += CHUNK) { markUrgent(state, xx, yy, 1); marked++; }
			if (marked >= 4000 && lim("rectUrgCap", 3)) log("terrain refresh: rect over 4000 chunks — marked part");
		} catch (e) { swallow("markRectUrgent", e); }
		return marked;
	}
	// ST-FIX (systemic cause): ONE path for broadcasting new structures at the host.
	// The source is now the "building:placed" event, which the game emits on EVERY creation
	// of a structure — including when the game's own code creates it, not the player. Previously we only listened to
	// "structures:placed", and that event is emitted ONLY by the build tool's batch finalizer:
	//     function te(e,t,n,r,o){ t.length>0 && (FH.events.emit(e,"structures:placed",{structures:n}), ...) }
	// Everything created outside the tool was INVISIBLE to the mod:
	//   - undoing a demolition (the "undo" module calls FH.structures.build directly),
	//   - undoing a move (the same path),
	//   - pairing of quantum portals,
	//   - structure transformations in the simulation (copperMold: removeAt + build),
	//   - structures from the game's built-in mods and from prefabs.
	// Hence "I deleted it, undid it, and for the other player it's empty forever".
	ST._addBcast = null;
	function bcastStruct(state, st2) {
		try {
			if (ST.net.role !== "host" || !st2 || !Number.isFinite(st2.x) || !Number.isFinite(st2.y)) return;
			if (ST._inGameUndo && ST._inGameUndo()) ST._undoWasActive = true;
			if (!ST._addBcast) {
				ST._addBcast = new Map();
				setTimeout(() => {
					const m = ST._addBcast; ST._addBcast = null;
					if (!m || !m.size) return;
					const arr = [...m.values()], list = [];
					// we read slimStruct ONLY now: the game settles "queued"/"frame" a moment after the event,
					// and sending a transitional state is exactly what makes red tiles appear on the receiver
					for (const it of arr) { try { list.push(slimStruct(it)); } catch (e) {} }
					try { if (ST.peers.size) for (let i = 0; i < list.length; i += 300) { txNote("st", 300 * 40); net.send({ t: "st", k: "add", list: list.slice(i, i + 300) }); } } catch (e) {}
					// ST-FIX (less traffic): we record a signature of what was sent. Control passes after an undo
					// afterwards sent the WHOLE rectangle two more times — in the client log this shows up as
					// "already had 5396" against 2698 actually built, i.e. double work with no gain.
					try {
						if (!ST._bcSent) ST._bcSent = new Map();
						const tS = performance.now();
						for (const sl of list) ST._bcSent.set(structKey(sl), { s: snapSig(sl), t: tS });
						if (ST._bcSent.size > 20000) for (const [k9, v9] of ST._bcSent) { if (tS - v9.t > 15000) ST._bcSent.delete(k9); }
					} catch (e) {}
					// writing the shape into the terrain doesn't always set chunkShouldUpdate — without it the mirror skips the chunk
					try { for (const it of arr) markUrgent(state, it.x | 0, it.y | 0, 1); } catch (e) {}
					if (ST._undoWasActive) { ST._undoWasActive = false; noteUndoRect(arr, true); log("undo: broadcasting " + list.length + " rebuilt structures"); }
				}, 40);
			}
			ST._addBcast.set(structKey(st2), st2);
		// 0.9.206: when the structure was created — needed so that the finishing pass after demolition doesn't delete
		// something that was placed AFTER it was armed.
		try {
			if (!ST._bornAt) ST._bornAt = new Map();
			ST._bornAt.set(structKey(st2), performance.now());
			if (ST._bornAt.size > 60000) {
				const cut = performance.now() - 30000;
				for (const [k2, v2] of ST._bornAt) if (v2 < cut) ST._bornAt.delete(k2);
			}
		} catch (e) {}
		} catch (e) {}
	}
	// just marking the terrain as urgent, without arming the "finishing pass"
	function markDemolTerrainUrgent(bounds) { armDemolCleanup(bounds, true); }
	function armDemolCleanup(bounds, onlyTerrain) {
		if (!bounds || !bounds.length) return;
		// ST-FIX (red tiles after CLIENT demolition — the actual cause):
		// diagnostics showed that the quick cleanup finds NOTHING ("0 tiles" in every
		// case), yet a second later the client still reports the same blocks as orphaned.
		// Conclusion: at the host the terrain IS already clean — it's the CLIENT'S COPY that's stale. So
		// there's no garbage to clean up here, just a MIRROR DELAY. During host demolition the game
		// marks chunks as dirty by itself, but during client demolition the host executes removeAt inside the
		// ST._applyingNet block and nobody marks those chunks — they wait for the normal change detection.
		// We mark them urgent right away.
		try {
			const state = ST.state;
			if (state && ST.net.role === "host") {
				// ST-FIX: bounds are the rectangles of INDIVIDUAL structures (4x4), and a loop with a CHUNK radius
				// marked 9 chunks for each of them — with 1974 structures that's ~17 thousand passes over
				// the same few dozen chunks, and a hard limit of 6000 (the log shows "6000" over and
				// over, i.e. truncation). We count CHUNK COORDINATES and filter out duplicates.
				const seenC = new Set();
				let n = 0;
				for (const b of bounds) {
					const cx0 = Math.floor((b.x0 - CHUNK) / CHUNK), cx1 = Math.floor((b.x1 + CHUNK) / CHUNK);
					const cy0 = Math.floor((b.y0 - CHUNK) / CHUNK), cy1 = Math.floor((b.y1 + CHUNK) / CHUNK);
					for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
						const k = cy * 100000 + cx;
						if (seenC.has(k)) continue;
						if (seenC.size >= 4000) { n = -1; break; }   // 4000 chunks = 160 thousand cells across; unreachable in practice
						seenC.add(k); markUrgent(state, cx * CHUNK, cy * CHUNK, 0); n++;
					}
					if (n < 0) break;
				}
				if (n < 0) log("demolition: area above 4000 chunks — only part was marked");
				else if (n && lim("demolUrgDiag", 40)) log("demolition: " + n + " terrain chunks marked as urgent");
			}
		} catch (e) {}
		// ST-FIX: on a large demolition the client splits the request into batches of 800 — each one called this function
		// and OVERWROTE the previous rect. Cleanup only got the last piece. Now they accumulate.
		if (onlyTerrain) return;
		const prev = ST._hostDemolRect;
		if (prev && performance.now() - prev.t < 1500 && Array.isArray(prev.bounds)) {
			prev.bounds = prev.bounds.concat(bounds);
			prev.t = performance.now();
			ST._lastDemolBounds = prev.bounds;
			return;
		}
		ST._hostDemolRect = { bounds, t: performance.now(), cleanOrphans: true };
		ST._lastDemolBounds = bounds; // ST-FIX: kept for good — undo rebuilds EXACTLY this area
	}

	function applyNetStructs(msg) {
		const state = ST.state;
		if (!state || !ST.FH || ST._loadingWorld) return;   // ST-FIX: while the world is loading, the store is in flux
		ST._applyingNet = true;
		try {
			// the client renders confirmed structures: force=true (no collision check, no cell writes)
			noteActEcho(msg.k);   // 0.9.216: how long it took from our action to the host's confirmation
			if (msg.k === "add") for (const s of msg.list) { if (buildOne(state, s, true, true)) ST._structApplied.set(structKey(s), performance.now()); }   // ST-FIX: a failed build is NOT "applied"
			else if (msg.k === "rm") for (const s of msg.list) removeOne(state, s);
			else if (msg.k === "pd") applyPipeData(state, msg.list);
			else if (msg.k === "mv") { fixClientMoveUndo(msg); const keep = new Set((msg.to || []).map((q) => (q.x | 0) + "," + (q.y | 0))); for (const s of msg.from) { if (keep.has((s.x | 0) + "," + (s.y | 0))) continue; removeOne(state, s); } for (const s of msg.to) { buildOne(state, s, true, true); ST._structApplied.set(structKey(s), performance.now()); } }
		} finally { ST._applyingNet = false; }
	}

	// 0.9.102: signature of the structure set — if nothing changed, the snapshot is unnecessary
	// (the host saves serializing 90 thousand objects, the client gets no work to do).
	function structuresSignature(state) {
		try {
			const a = state.store.structures || [], b = state.store.pipes || [];
			let h = 2166136261 >>> 0;
			h = (h ^ a.length) >>> 0; h = (h * 16777619) >>> 0;
			h = (h ^ b.length) >>> 0; h = (h * 16777619) >>> 0;
			const step = Math.max(1, Math.floor(a.length / 512)); // we sample; a full hash of 90 thousand would be expensive
			for (let i = 0; i < a.length; i += step) {
				const s = a[i]; if (!s) continue;
				h = (h ^ ((s.x | 0) * 73856093) ^ ((s.y | 0) * 19349663) ^ (typeof s.type === "number" ? s.type : 0) ^ (s.queued ? 0x1000000 : 0) ^ (s.frame ? 0x2000000 : 0)) >>> 0; // 0.9.143: queued→built changes the snapshot too
				h = (h * 16777619) >>> 0;
			}
			return h + ":" + a.length + ":" + b.length;
		} catch (e) { return null; }
	}
	async function sendSnapshotIfDue(state) {
		const now = performance.now();
		// 0.9.154: SLICING. Serializing the whole store (84k structures) in one frame = a ~100 ms stall
		// at the host and ~140 ms at the client. The job does ONE part (4000) per frame; each part is a separate
		// "snapp" packet (idempotent indexes, any order), the last one carries n + wi/dr.
		const job = ST._snapJob;
		if (job) {
			// 0.9.184: PART_N 256 (from the Rexisaurus fork) gives small, reliable messages, but ONE part
			// per frame = with 85k structures, ~332 parts, ~5.5 s for a full snapshot (with 4000 it was ~0.35 s).
			// Rexisaurus paired 256 with his own scheduler, which we're not taking. So: small packets, but
			// as many per frame as fit in the 4 ms budget — message size small, pace as before.
			const tEnd = performance.now() + 4;
			// 0.9.268 (the strongest candidate for the 1-2 s freezes): the world mirror is carefully paced against
			// the measured link, and then the snapshot pump dumped parts into the SAME reliable ordered Steam
			// channel as fast as 4 ms of CPU allowed — hundreds of parts, hundreds of kilobytes, unpaced. Every
			// mirror packet behind them waits, and the client's world stops while its own frame rate and apply
			// queue look perfectly healthy. Which is exactly what both logs show: the client never stalls, yet
			// acks stop arriving for 300-2400 ms at a time.
			// A snapshot is a reconciliation safety net, not something the eye is waiting on, so it now lives on
			// the link's SPARE capacity: it pauses whenever the mirror already has a pipe's worth in flight, and
			// otherwise spends a token bucket worth about a third of the measured goodput.
			const wsx = ST.wsx;
			const gp = (wsx && wsx.goodput) || 200 * 1024;
			if (wsx && wsx.ackSeen && (wsx.inflight || 0) > Math.max(48 * 1024, gp * 0.30)) return;   // mirror first
			const tp = performance.now();
			if (job.tok === undefined) { job.tok = 16 * 1024; job.tokT = tp; }
			job.tok = Math.min(64 * 1024, job.tok + gp * 0.35 * (tp - job.tokT) / 1000);
			job.tokT = tp;
			if (job.tok <= 0) return;
			try {
				const PART_N = 256;
				do {
					const t0 = performance.now();
					const src = job.phase === 0 ? (state.store.structures || []) : (state.store.pipes || []);
					const part = [];
					let i = job.cursor;
					for (; i < src.length && part.length < PART_N; i++) { const s2 = src[i]; if (s2) part.push(slimStruct(s2)); }
					job.cursor = i;
					const donePhase = job.cursor >= src.length;
					const isLast = donePhase && job.phase === 1;
					const body = { sid: job.sid, i: job.sent };
					if (job.phase === 0) body.s = part; else body.p = part;
					if (isLast) { body.last = 1; body.n = job.sent + 1; body.wi = state.store.worldItems || []; body.dr = state.store.drones || []; }
					job.sent++;
					if (donePhase) { job.phase++; job.cursor = 0; }
					if (isLast) ST._snapJob = null;
					ST._profSnapSer = (ST._profSnapSer || 0) + (performance.now() - t0);
					const packed = await deflate(new TextEncoder().encode(JSON.stringify(body)));
					const wire = b64enc(packed);
					job.tok -= wire.length;
					txNote("snapp", wire.length);   // 0.9.269: see txNote
					net.send({ t: "snapp", d: wire });
					if (isLast) break;
				} while (ST._snapJob === job && job.tok > 0 && performance.now() < tEnd);
			} catch (e) { ST._snapJob = null; log("snapshot part error:", e.message); }
			return;
		}
		if (now - ST._lastSnap < 2500) return;
		// 0.9.102: if the structure set hasn't changed, the snapshot is unnecessary — we save serializing
		// 90 thousand objects at the host and all the work at the client (this was causing 157-445 ms stutters).
		const sig = structuresSignature(state);
		if (sig && sig === ST._snapSig && !ST._snapForce) { ST._lastSnap = performance.now(); return; }
		ST._snapSig = sig; ST._snapForce = false;
		ST._lastSnap = now;
		ST._snapJob = { sid: (ST._snapSid = (ST._snapSid || 0) + 1), phase: 0, cursor: 0, sent: 0 };
		// The view can be "torn" between parts (a structure placed during slicing lands in
		// the next snapshot) — reconcile requires 3 CONSECUTIVE absences + 30 s of protection for fresh ones anyway.
	}

	// 0.9.154: applying ONE part of the snapshot — sig/build/defer like in the old applySnapshot, but on
	// <=4000 entries at a time. After all parts of the sid are complete, ST._recJob starts (reconcile
	// with a cursor inside the frame loop — see the frame hook).
	async function applySnapPart(msg) {
		const __t0 = performance.now();
		const state = ST.state;
		if (!state || !ST.FH) return;
		const body = JSON.parse(new TextDecoder().decode(await inflate(b64dec(msg.d))));
		let R = ST._snapRx;
		if (!R || R.sid !== body.sid) R = ST._snapRx = { sid: body.sid, got: 0, n: null, parts: new Set(), seenS: new Set(), seenP: new Set() };
		if (!ST._structSig) ST._structSig = new Map();
		if (!ST._structApplied) ST._structApplied = new Map();
		ST._applyingNet = true;
		try {
			const nowS = performance.now();
			for (const [list, seen, toRury] of [[body.s, R.seenS, false], [body.p, R.seenP, true]]) {
				if (!Array.isArray(list)) continue;
				if (toRury) for (const q of list) if (q) q.__pipe = 1;   // see buildOne: pipes are not a type collision
				const tSlice = performance.now();
				let built = 0;
				for (const s2 of list) {
					const k = structKey(s2);
					seen.add(k);
					const sig = snapSig(s2);
					if (ST._structSig.get(k) === sig) { ST._structApplied.set(k, nowS); continue; }
					if (built > 50 && performance.now() - tSlice > 8) {
						if (!ST._snapRest) ST._snapRest = [];
						ST._snapRest.push(s2);
						continue;
					}
					if (!buildOne(state, s2, true, true)) continue;   // ST-FIX: without this a build refusal was recorded as a success
					ST._structSig.set(k, sig);
					ST._structApplied.set(k, nowS);
					built++;
				}
			}
			// ST-FIX (from the Rexisaurus fork): we counted ACCEPTED PARTS, not DISTINCT ones. A repeated part
			// (retransmission) bumped the counter and the snapshot was considered complete, even though some part
			// was actually missing — after which reconcile deleted "ghosts" that weren't actually missing.
			R.parts.add(body.i | 0); R.got = R.parts.size;
			if (body.last) R.n = body.n;
			if (body.wi) applyWorldItems(state, body.wi);
			if (body.dr) state.store.drones = body.dr;
			if (R.n != null && R.got >= R.n) {
				let complete = true;
				for (let i9 = 0; i9 < R.n; i9++) if (!R.parts.has(i9)) { complete = false; break; }
				if (complete) {
					ST._recJob = { sid: R.sid, seenS: R.seenS, seenP: R.seenP, phase: 0, cursor: 0, removed: 0, absent: 0, sample: null };
					ST._snapRx = null;
				}
			}
		} catch (e) { log("snapp apply error:", e.message); }
		finally {
			ST._applyingNet = false;
			const d = performance.now() - __t0;
			ST.wsx.snapMs = ST.wsx.snapMs ? ST.wsx.snapMs * 0.7 + d * 0.3 : d;
			if (d > (ST.wsx.snapWorst || 0)) ST.wsx.snapWorst = d;
		}
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
			let __faza = 0;
			for (const [hostList, localList] of [[snap.s, state.store.structures || []], [snap.p, state.store.pipes || []]]) {
				const __toRury = __faza++ === 1;   // 0.9.211 (from the author): we do NOT delete pipes positionally
				if (__toRury) for (const q of hostList) if (q) q.__pipe = 1;   // patrz buildOne
				const hostMap = new Map(hostList.map((s) => [structKey(s), s]));
				// STAGED RECONCILE (Knight-HD: additive fix + our safety net):
				// We do NOT delete immediately based on absence from the snapshot (this deleted fresh buildings on
				// a small key mismatch/momentary gap in the host's JSON). BUT pure additive left
				// PERMANENT ghosts (structures removed by the sim / during a disconnection window — without an "st rm" event).
				// Compromise: delete only once a structure is absent from >=3 CONSECUTIVE snapshots (~7.5 s)
				// AND wasn't freshly placed/confirmed (30 s of _structApplied protection).
				if (!ST._absentCount) ST._absentCount = new Map();
				// 0.9.150: ghost storm (client log: 11,055 goldBattery removals in one session) — each
				// removal done synchronously + a separate log line FROZE the renderer. A limit of 50 removals per pass,
				// one aggregated log entry; and when the discrepancy is > 2000 structures, it's not ghosts but a DIFFERENT WORLD STATE —
				// we delete nothing (gen-transfer will bring the correct save shortly anyway).
				let absentNow = 0;
				for (const s of localList) { if (!hostMap.has(structKey(s))) absentNow++; }
				if (absentNow > 2000) {
					if (performance.now() - (ST._recStormT || 0) > 30000) { ST._recStormT = performance.now(); log("RECONCILE: divergence too large (" + absentNow + " local structures unknown to host) — holding off deletion"); }
					askWorldResync(absentNow);   // 0.9.215: and we ACTUALLY request the world, instead of waiting for it
				} else {
					let removed = 0, sampleK = null, potwDawniej = 0;
					for (const s of localList) {
						const k = structKey(s);
						if (hostMap.has(k)) { ST._absentCount.delete(k); continue; }
						const cnt = (ST._absentCount.get(k) || 0) + 1;
						ST._absentCount.set(k, cnt);
						const appliedTs = ST._structApplied.get(k);
						const fresh = appliedTs != null && nowS - appliedTs < 30000;
						if (__toRury && typeof ST._pipeZnRaw !== "function" && typeof ST._pipeZn !== "function") { ST._absentCount.delete(k); continue; }
						if (__toRury) s.__pipe = 1;   // 0.9.212: we delete via the game's path (see removeOne), not positionally
						if (cnt >= 3 && !fresh && removed < 50) {
							if (appliedTs != null) potwDawniej++;   // 0.9.218: the host confirmed it at some point
							removeOne(state, s);
							removed++; if (!sampleK) sampleK = k;
							ST._absentCount.delete(k); ST._structApplied.delete(k); if (ST._structSig) ST._structSig.delete(k);
						}
					}
					// 0.9.218: NOT ALL GHOSTS ARE EQUAL, and until now the log didn't distinguish this. A structure that the host
					// confirmed AT SOME POINT (it's in _structApplied) means "the host deleted it, and we missed
					// st rm" — the fault is on the broadcasting side. A structure the host NEVER confirmed
					// means "the client placed it locally on its own" — the fault is on the local build side.
					// Without this distinction, the report "blocks are stuck on the client that don't exist on the host" doesn't
					// point to which side needs fixing.
					if (removed) log("RECONCILE: removed " + removed + " ghosts (" + potwDawniej + " the host confirmed at some point, "
						+ (removed - potwDawniej) + " never; among them " + sampleK + ")"
						+ (removed >= 50 ? " — limit 50/pass, rest in following" : ""));
				}
				// build/update missing ones (client: force=true — render without collision check/cell writes)
				// 0.9.102: we only rebuild what's new or changed. With 90 thousand structures a full pass
				// cost 157 ms (peak 445 ms) in one frame — while the factory usually stays put.
				if (!ST._structSig) ST._structSig = new Map();
				const tSlice = performance.now();
				let built = 0, skipped = 0, deferred = 0;
				for (const s of hostList) {
					const k = structKey(s);
					// 0.9.142: signature from data+filter (previously from nonexistent fields → constant → host config changes didn't get through)
					const sig = snapSig(s);
					if (ST._structSig.get(k) === sig) { skipped++; ST._structApplied.set(k, nowS); continue; }
					if (built > 50 && performance.now() - tSlice > 8) {
						// 0.9.137: we do NOT abandon the rest — the host might never send another snapshot
						// (it skips sending when the structure set is unchanged), and then those structures would never be created.
						if (!ST._snapRest) ST._snapRest = [];
						ST._snapRest.push(s);
						deferred++; continue;
					}
					buildOne(state, s, true, true);
					ST._structSig.set(k, sig);
					ST._structApplied.set(k, nowS);
					built++;
				}
				if ((built || deferred) && lim("snapDiag", 30)) log("SNAP: rebuilt " + built + ", skipped unchanged " + skipped + (deferred ? ", deferred " + deferred : ""));
			}
			// worldItems: filter out freshly picked-up-locally ones (waiting for host confirmation, TTL 10 s)
			applyWorldItems(state, snap.wi || []);
		} catch (e) { log("reconcile error:", e.message); }
		finally { ST._applyingNet = false; }
	}
	function applyWorldItems(state, list) {
		const now = performance.now();
		for (const [id, ts] of ST._pickedPending) if (now - ts > 10000) ST._pickedPending.delete(id);
		state.store.worldItems = (list || []).filter((i) => !ST._pickedPending.has(i.id));
	}
	// FAST DROPS (G12): a new item on the ground only arrived with the 2.5s snapshot.
	// Host: on every id list CHANGE it sends it immediately (checked at 5 Hz, sent only on change).
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
	// RESOURCES — host → client (1 Hz)
	// ------------------------------------------------------------------
	// 0.9.270: compress a heavy section and send it on its own. deflate() is async and off the hot path, and
	// the receiver merges it through the very same applyResources, so there is one code path for these fields.
	async function wyslijCiezkie(ladunek, key, rawLen) {
		try {
			// once per session, say what is actually inside the big one — a third of a megabyte of JSON every
			// few seconds is worth naming rather than guessing at
			if (!ST._heavyDumped && rawLen > 64 * 1024) {
				ST._heavyDumped = true;
				try {
					const obj = ladunek[key];
					if (obj && typeof obj === "object") {
						const rozmiary = Object.keys(obj).map((k2) => {
							let n2 = 0; try { n2 = JSON.stringify(obj[k2]).length; } catch (e2) {}
							return [k2, n2];
						}).sort((a, b) => b[1] - a[1]).slice(0, 8);
						log("HEAVY \"" + key + "\" is " + Math.round(rawLen / 1024) + " KB; biggest keys: "
							+ rozmiary.map((p) => p[0] + " " + Math.round(p[1] / 1024) + "KB").join(", "));
					}
				} catch (e) {}
			}
			const raw = new TextEncoder().encode(JSON.stringify(ladunek));
			const z = await deflate(raw);
			const wire = b64enc(z);
			txNote("resz", wire.length);
			net.send({ t: "resz", d: wire });
			if (!ST._resZLogged || rawLen > (ST._resZWorst || 0)) {
				ST._resZLogged = true; ST._resZWorst = rawLen;
				log("heavy section \"" + key + "\": " + Math.round(rawLen / 1024) + " KB of JSON -> "
					+ Math.round(wire.length / 1024) + " KB on the wire");
			}
		} catch (e) { swallow("heavy section", e); }
	}
	function sendResourcesIfDue(state) {
		const now = performance.now();
		if (now - ST._lastRes < 1000) return;
		ST._lastRes = now;
		try {
			const sh = state.shared;
			const conv = arr(sh.conveyorBeltsAnimationIndex);
			let sameVer = ST.peers.size > 0;
			for (const pp of ST.peers.values()) if (pp.modVer !== VER) sameVer = false;
			// scalars — cheap, every 1 s as before
			const m = {
				t: "res",
				r: state.store.resources,
				pp: state.store.productionPoints,
				g: arr(sh.gold) ? arr(sh.gold)[0] : null,
				e: arr(sh.energy) ? arr(sh.energy)[0] : null,
				p: arr(sh.productionPoints) ? arr(sh.productionPoints)[0] : null,
				// 0.9.275: this array is a per-belt animation frame, one BYTE each, and it was going out as a
				// JSON list of numbers ("7,3,12,..."), which costs three to four characters per byte. The tally
				// shows the res message at about 30 KB every second, roughly a tenth of what the Steam link
				// carries, for data that is one byte per belt. Base64 is 1.37 characters per byte, so the same
				// content travels at about a third of the size. A peer on an older mod still gets the list.
				c: (conv && !sameVer) ? Array.from(conv) : null,
				cb: (conv && sameVer) ? b64enc(conv instanceof Uint8Array ? conv : new Uint8Array(conv)) : null,
				fp: fpCounters(state),                  // factory process counters (ShakeWetSand etc.) — non-mirrored SAB
				iv: invForNet(state),                   // unlocked items — only when the list changed
				tz: tzForNet(state),                     // teleport zones (the client walks on the host's terrain)
			};
			// 0.9.275: one-off breakdown, the same trick that found the foliage. The 1 Hz message is not supposed
			// to be big; if it still is after the conveyor layer went to base64, this says which field to look at.
			if (!ST._resDumped) {
				try {
					let cal = 0; try { cal = JSON.stringify(m).length; } catch (e2) {}
					if (cal > 8 * 1024) {
						ST._resDumped = true;
						const rozm = Object.keys(m).filter((k2) => k2 !== "t").map((k2) => {
							let n2 = 0; try { n2 = JSON.stringify(m[k2] === undefined ? null : m[k2]).length; } catch (e2) {}
							return [k2, n2];
						}).sort((a, b) => b[1] - a[1]).slice(0, 6);
						log("RES is " + Math.round(cal / 1024) + " KB; biggest fields: "
							+ rozm.map((p2) => p2[0] + " " + Math.round(p2[1] / 1024) + "KB").join(", "));
					}
				} catch (e) {}
			}
			// 0.9.155: the HEAVY sections (upgrade tree, tech, progression, story, gloom, buildings) every 1 s
			// cost 26 ms of frame time (building + IPC clone), even though they change rarely. Now: every 5 s
			// we compute their JSON and send it ONLY when it changed. The client handler gates every field.
			const modsAll = state.store.mods || null;
			let modsCzeste = modsAll;
			if (modsAll && typeof modsAll === "object" && modsAll.foliage !== undefined) {
				modsCzeste = {};
				for (const k2 in modsAll) if (k2 !== "foliage") modsCzeste[k2] = modsAll[k2];
			}
			// 0.9.268 (the 5 s period in the stutter report is this line): the six heavy sections were cached as
			// ONE json. store.mods carries counters that tick constantly, so that one blob compared unequal every
			// single time and all six went out together, every 5 s, into the same reliable ordered Steam channel
			// the world mirror uses. The mirror then waits behind them — which is exactly a freeze followed by a
			// catch-up, every five seconds. Two changes: each section is now cached SEPARATELY, so only what
			// really changed is sent, and at most ONE of them goes per tick, so a burst can never be the sum of
			// all six. They are all idempotent state, the client gates each field, and nothing here is urgent.
			// 0.9.274: a heavy section is one indivisible message in the same reliable ORDERED channel as the
			// mirror, so sending one while the pipe already has a queue puts the whole mirror behind it. The
			// 0.9.271 log shows exactly that pairing: the windows with "hold 1030ms" and "hold 420ms" are the
			// windows that carry resz. Nothing here is urgent, so it simply waits for a quiet moment; the clock
			// is not advanced, so it goes out on one of the next passes instead of being skipped.
			const rura = ST.wsx && ST.wsx.ackSeen ? (ST.wsx.inflight || 0) : 0;
			const rurazajeta = rura > Math.max(24 * 1024, (ST.wsx && ST.wsx.goodput ? ST.wsx.goodput : 0) * 0.08);
			if (!rurazajeta && now - (ST._lastResHeavy || 0) >= 5000) {
				ST._lastResHeavy = now;
				// 0.9.271 (MEASURED, the 0.9.270 breakdown): "HEAVY st is 346 KB; biggest keys: foliage 287KB,
				// prefabData 33KB, map 16KB, ...". Foliage is decorative plant state. It changes all the time, so
				// the whole section compared unequal on every pass and all 346 KB went out with it, several times
				// a minute, on a link that carries about 250 KB/s. Even compressed to 71 KB that is a quarter of a
				// second of the channel, and everything ordered behind it waits.
				// So foliage travels on its own, rarely; the rest of store.mods keeps its old cadence and is now
				// about a sixth of the size. The client merges partial updates (see applyResources).
				const ciezkie = {
					st: modsCzeste,                        // story progress (storyProgression), without foliage
					gl: state.store.gloom || null,          // gloom state
					up: state.store.upgrades || null,       // SHARED pool of upgrades (fix G2)
					th: techFlagsForNet(state), // tech tree (without the junk "undefined" key)
					pg: state.store.progression || null,    // progression (upgradesUnlocked, dungeons)
					bl: (state.store.player && state.store.player.buildings) || null, // unlocked buildings (idea: Cr0ss0vr, PR #13)
				};
				if (!ST._resHeavySig) ST._resHeavySig = {};
				// round-robin, so no single section can be starved by a neighbour that changes more often
				const klucze = ["st", "gl", "up", "th", "pg", "bl"];
				const start = (ST._resHeavyIdx || 0) % klucze.length;
				for (let k = 0; k < klucze.length; k++) {
					const key = klucze[(start + k) % klucze.length];
					let j = null; try { j = JSON.stringify(ciezkie[key]); } catch (e) { continue; }
					if (j === ST._resHeavySig[key]) continue;
					ST._resHeavySig[key] = j;
					ST._resHeavyIdx = (start + k + 1) % klucze.length;
					// 0.9.270 (THE STUTTER, finally measured): the byte tally added in 0.9.269 reported
					// "tx res 346KB", every few seconds, on a link that carries about 300 KB/s. Over a second of
					// solid blockage in the reliable ORDERED channel, every few seconds — and everything behind it
					// waits: the world mirror, weapon effects, structure events. Player positions kept flowing the
					// whole time because those go on the unreliable channel, which is exactly what Andrew
					// described: his movement was fine, the world and the animations froze and then replayed fast.
					// Two things were wrong. It went out UNCOMPRESSED, and it went out as one indivisible message.
					// Compressed it is a fraction of that, and it now travels as its own packet type so it never
					// rides inside the 1 Hz message.
					// a peer on an older mod has no "resz" handler, so for mixed versions we keep the old raw path
					let rownaWersja = ST.peers.size > 0;
					for (const pp of ST.peers.values()) if (pp.modVer !== VER) rownaWersja = false;
					if (rownaWersja && j != null && j.length > 8 * 1024) {
						const ladunek = {}; ladunek[key] = ciezkie[key];
						wyslijCiezkie(ladunek, key, j.length);
					} else {
						m[key] = ciezkie[key];
					}
					break;   // ONE section per tick
				}
			}
			// 0.9.271: foliage on its own clock. Nothing depends on it being fresh, and a new peer gets the
			// current state with the save transfer anyway; this only keeps it from drifting over a long session.
			if (ST.peers.size && modsAll && modsAll.foliage !== undefined && now - (ST._foliageT || 0) >= 60000) {
				ST._foliageT = now;
				let fj = null; try { fj = JSON.stringify(modsAll.foliage); } catch (e) {}
				if (fj != null && fj !== ST._foliageSig) {
					ST._foliageSig = fj;
					let rownaW = ST.peers.size > 0;
					for (const pp of ST.peers.values()) if (pp.modVer !== VER) rownaW = false;
					if (rownaW) wyslijCiezkie({ st: { foliage: modsAll.foliage } }, "foliage", fj.length);
				}
			}
			// a new peer must get the heavy sections right away — reset the cache when the peer count changes
			// 0.9.161: also tz/inv signatures! Without this a fresh client NEVER got the current
			// teleport zones or item list (they were only sent on CHANGE) — measured: client 360 zones vs host 351.
			if (ST.peers.size !== (ST._resPeerN || 0)) { ST._resPeerN = ST.peers.size; ST._resHeavySig = null; ST._lastResHeavy = 0; ST._lastTzSig = null; ST._lastInvSig = null; ST._foliageT = 0; ST._foliageSig = null; }
			try { txNote("res", JSON.stringify(m).length); } catch (e) {}
			net.send(m);
		} catch (e) {}
	}
	// "factory.processing" counters (per-instance SAB, NOT covered by the world mirror!): progress of processes
	// ShakeWetSand/PressBurntResidue/GrowFlowers/CondenseFlorin. Without the stream the client saw 0 progress
	// ("shaking wet sand aint working" — TCentraL: the process WAS running on the host, but the client UI was dead).
	// Subtract the client's purchase costs (shared pool). Sanity: only numbers 0..1e9, clamp to zero.
	// Gold also lives in SAB (shared.gold) — we subtract in both places so the UI matches.
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
	// REAL tech unlocking (fix ЗаКеЛьМан: "my buddy researched the map, I don't have it").
	// Just `tech[id]=true` is NOT enough: the game's unlockTech registers buildings in the menu, creates
	// items in the inventory and emits tech:mapUnlocked (the minimap!). _techMod = the export of
	// module 77135 via the "tech module export" patch.
	//
	// FIX 0.9.71 (Akriz / Cr0ss0vr: "research bricked"): the game's unlockTech RETURNS true/false, and on
	// false it does NOTHING (tech locked, tutorial, unmet requirements, NOT ENOUGH RESOURCES,
	// gold's "cantDeductEvenly"). We ignored the result and set the flag → "Researched" in the tree,
	// but buildings/items unregistered and it CAN'T be researched again. On top of that, the host deducted
	// the client's cost manually BEFORE unlockTech, which itself checks and deducts the cost → the second check
	// failed on insufficient gold (or we paid twice).
	// mode: "pay"  = the host processes the client's purchase: skipCostCheck (the client already checked the cost vs the shared
	//                pool), and we leave the AUTHORITATIVE cost deduction to the game (evenly from collectors etc.);
	//       "free" = unlock FROM THE TEAM (someone else paid): session.cheat.bypassCosts for the duration
	//                of the call = no checking and NO deduction (the client doesn't deduct mirrored gold).
	// Tech definition WITH an id FIELD (fix 0.9.72, e2e): getTechDefinition(id) returns a bare object {cost,unlocks,...}
	// WITHOUT id — the game's UI buys through nodes from getTechNodes() (they have id, numeric type for enums). Passing
	// a def without id to unlockTech => the game saved tech["undefined"]=true (junk in the save), and switch(t.id)
	// (side effects: tutorial step, element discoveries) wasn't hit. Keys from the network come in as
	// strings ("2") — loose matching (==) against the node's id (2).
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
	// Returns: true = full unlock; false = the game REFUSED (do NOT set the flag!); null = no _techMod.
	function techUnlock(state, techId, mode, defOverride) {
		const tm = ST._techMod;
		if (!(tm && tm.unlockTech && tm.getTechDefinition)) return null;
		let def = defOverride || techNode(techId);
		if (!def) { log("techUnlock: unknown tech", techId); return false; }
		const sess = state.session || (state.session = {});
		const prevCheat = sess.cheat;
		try {
			if (mode === "free") sess.cheat = Object.assign({}, prevCheat || {}, { bypassCosts: true });
			const r = tm.unlockTech(state, def, { suppressMusic: true, playSound: false, skipCostCheck: true });
			return r !== false;
		} catch (e) { log("techUnlock error:", techId, e.message); return false; }
		finally { sess.cheat = prevCheat; }
	}
	// The game refused to unlock the team tech (at the client) — don't spam every 1 s: retry every 10 s.
	function techRefusedRecently(id) {
		const m = ST._techRefused || (ST._techRefused = new Map());
		const now = performance.now(), last = m.get(id) || 0;
		if (now - last < 3000) return true; // 3 s (was 10 s): the refusal can be momentary (key order/requirements)
		m.set(id, now);
		return false;
	}
	// REPAIR OF "BRICKED" SAVES (0.9.71): the old bug left tech with the flag true, but without
	// registered buildings (player.buildings) / items (inventory) — "Researched" in the tree, but you can't
	// build, and can't research again either. For every such tech we call the game's unlockTech in "free" mode
	// with the def TRIMMED to the missing unlocks (without item duplicates; `ae` for buildings is idempotent anyway).
	// unlockTech doesn't check the "already researched" flag (only lockedTechs/tutorial/requirements), so it's fine.
	// Idempotent. Host/solo: once per world entry; client: after the mirror starts + throttle in the th stream.
	// A cooldown marker from the FUTURE blocks the tool forever (see 0.9.130). We fix all of them:
	// item abilities, player cooldowns, and ammo reload.
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
			if (n) log("REPAIR: straightened out", n, "cooldowns set in the future (" + why + ") — tools were locked");
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
				if (id === "undefined") { delete pl.tech[id]; log("REPAIR(" + who + "): removed junk key tech[\"undefined\"] (after old bug with def missing id)"); continue; }
				const def = techNode(id);
				if (!def || !def.unlocks) continue;
				const ms = (def.unlocks.structures || []).filter((b) => !blds.includes(b));
				const mi = (def.unlocks.items || []).filter((it) => !inv.some((x) => x && x.id === it));
				if (!ms.length && !mi.length) continue;
				const partial = Object.assign({}, def, { unlocks: Object.assign({}, def.unlocks, { structures: ms, items: mi }) });
				ST._applyingNet = true;
				let r = false;
				try { r = techUnlock(state, id, "free", partial); } finally { ST._applyingNet = false; }
				log("REPAIR(" + who + "): tech", id, "had flag without unlocks — no buildings:", ms.join(",") || "-", "items:", mi.join(",") || "-", "→", r === true ? "REPAIRED" : "game refused (" + r + ")");
				if (r === true) fixed++;
			}
			if (fixed) setStatus(t("tech_repaired", fixed), "#5f5");
		} catch (e) { log("techRepair error:", e.message); }
		return fixed;
	}
	ST.repairTech = () => (ST.state ? techRepair(ST.state, "manual") : 0); // manually from the console: SandTogether.repairTech()
	// The player's item list is sent only when it CHANGED (otherwise a few KB every 2 s for no reason).
	// Teleport zones are sent only when the set changed (identifiers + count).
	function tzForNet(state) {
		try {
			const tz = state.store.world && state.store.world.teleportZones;
			if (!Array.isArray(tz)) return null;
			const sig = tz.length + ":" + tz.map((z) => z && z.id).join(",");
			// 0.9.161: RESEND every 30 s regardless of the signature — the first send after loading the world
			// hit the client BEFORE the mirror started (the everApplied gate rejected it), and the signature was already
			// stable → the client was stuck with its local zones forever (measured: 360 vs 351).
			const nowTz = performance.now();
			if (sig === ST._lastTzSig && nowTz - (ST._lastTzSentT || 0) < 30000) return null;
			ST._lastTzSig = sig; ST._lastTzSentT = nowTz;
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
	function fpArr(state) { // raw SAB array (for writing at the client)
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
			// 0.9.270: != null, not !== null. These now also run for a message that carries only the heavy
			// sections, and `undefined !== null` is TRUE — which would have written undefined into a Uint32Array
			// and zeroed the player's gold.
			if (msg.g != null && arr(sh.gold)) arr(sh.gold)[0] = msg.g;
			if (msg.e != null && arr(sh.energy)) arr(sh.energy)[0] = msg.e;
			if (msg.p != null && arr(sh.productionPoints)) arr(sh.productionPoints)[0] = msg.p;
			// 0.9.268 (REVERTED, and the reason is worth keeping): 0.9.267 took a conveyor-belt smoothing idea
			// from STITCH's AI pass that extrapolated conveyorBeltsAnimationIndex between the 1 Hz packets. It
			// made filter blocks go fully black on the client, on and off. The value is not a continuous
			// quantity — it is a CYCLIC frame index in a Uint8Array, so it wraps (…6, 7, 0, 1…). Measuring a
			// "rate" across that wrap gives a large negative number, the extrapolation then walks the index out
			// of its valid range, the store truncates it, and the game draws a frame that does not exist.
			// Smoothing it correctly would need the cycle length, which we do not know. Not worth a black block.
			// 0.9.275: cb is the same data as c, just as base64 bytes instead of a list of numbers.
			const convSrc = msg.cb ? b64dec(msg.cb) : msg.c;
			if (convSrc && arr(sh.conveyorBeltsAnimationIndex)) { const c = arr(sh.conveyorBeltsAnimationIndex); for (let i = 0; i < Math.min(c.length, convSrc.length); i++) c[i] = convSrc[i]; }
			if (msg.st) {
				// store.mods = story progress/collections (team-wide) BUT ALSO PER-PLAYER preferences.
				// Fix TCentraL: "shake at the client only works when the host has Shaking enabled" — the toggle
				// lives in mods.grabberSizeScroll and was being overwritten by the HOST's state every 1s. We preserve
				// local preferences on overwrite (the list is extensible, in case the game keeps more UI settings here).
				const prevMods = state.store.mods || {};
				// 0.9.159: before swapping the creature list, clear ghosts — objects from the old list absent from the new one
				// must go through _entDrop (sprite+light), because swapping the reference does NOT clean up the renderer.
				try {
					if (ST._entDrop && ST.FH && ST.FH.entities && ST.FH.entities.getAll) {
						const oldList = ST.FH.entities.getAll(state) || [];
						let newIds = null;
						for (const k2 in (msg.st || {})) { const v2 = msg.st[k2]; if (v2 && Array.isArray(v2.list)) { newIds = new Set(v2.list.map((c5) => c5 && c5.id)); break; } }
						if (newIds) for (const c6 of oldList) { if (c6 && c6.id >= 0 && !newIds.has(c6.id)) { if (ST._entCollectFx) { try { ST._entCollectFx(state, c6); } catch (e2) {} } try { ST._entDrop(c6); } catch (e2) {} } }
					}
				} catch (e) {}
				// 0.9.159: creature object IDENTITY when swapping the list — vanilla keeps lightIndex
				// (eternal light, durationMs:-1) and the sprite ON THE OBJECT from spawn to Ip. Swapping the object
				// orphans the light forever (the screen got brighter when pulling in), and the host's lightIndex on the new
				// object caused Ip to extinguish SOMEONE ELSE'S light. We merge data into the old objects; for new ones
				// we clear lightIndex (light+sprite will be assigned to them by _entInit from the fast bus).
				try {
					const EN9 = ST.FH && ST.FH.entities;
					const oldL9 = EN9 && EN9.getAll ? (EN9.getAll(state) || []) : [];
					const oldBy9 = new Map(oldL9.map((c9) => [c9 && c9.id, c9]));
					for (const k9 in (msg.st || {})) {
						const v9 = msg.st[k9];
						if (v9 && Array.isArray(v9.list)) {
							for (let i9 = 0; i9 < v9.list.length; i9++) {
								const nw9 = v9.list[i9];
								if (!nw9) continue;
								const od9 = oldBy9.get(nw9.id);
								if (od9) { for (const f9 in nw9) { if (f9 !== "lightIndex") od9[f9] = nw9[f9]; } v9.list[i9] = od9; }
								else nw9.lightIndex = undefined;
							}
							// we move release echoes (id<0) to the new list (young) or extinguish them (old) —
							// without this, swapping the list would orphan their lights.
							const nowG9 = performance.now();
							for (const og9 of oldL9) {
								if (og9 && og9.id < 0) {
									if (og9.__stGhostT && nowG9 - og9.__stGhostT <= 600) v9.list.push(og9);
									else { try { ST._entDrop(og9); } catch (e2) {} }
								}
							}
							break;
						}
					}
				} catch (e) {}
				// 0.9.271: MERGE, not replace. The host no longer sends the whole of store.mods every time: the
				// breakdown showed 287 of its 346 KB is "foliage", decorative plant state that changes constantly
				// and was dragging the rest of the section along with it every few seconds. Keys the host leaves
				// out of a partial update keep their current value here.
				state.store.mods = Object.assign({}, state.store.mods || {}, msg.st);
				// 0.9.226 (REPORT "client color is always the same as the host's"): FH.storage.ensure(e,key)
				// it's simply state.store.mods[key] (verified in bundle.js), and the color choice sits under
				// "foundationColorPicker". Since the whole store.mods comes from the host, the client's choice was
				// overwritten several times a minute — the palette in the UI still showed his color, but the game
				// was already placing with the host's color. These are PLAYER preferences, not shared state.
				for (const k of ["grabberSizeScroll"]) if (prevMods[k] !== undefined) state.store.mods[k] = prevMods[k];
				try {
					for (const k of Object.keys(prevMods)) {
						if (/colorpicker$/i.test(k) && prevMods[k] !== undefined) {
							state.store.mods[k] = prevMods[k];
							if (lim("modsKeepColor", 3)) log("host stream: keeping own " + k + " (player preference)");
						}
					}
				} catch (e) { swallow("modsStream", e); }
				// AUGMENTS (fix TCentraL: client stuck in the selection screen): the client's fresh local CHOICE
				// (act:aug in transit) can't be overwritten by the stream — a 5s protection window; outside it, the host rules.
				if (ST._augEditT && performance.now() - ST._augEditT < 5000 && prevMods.augments !== undefined) state.store.mods.augments = prevMods.augments;
				// 0.9.159 (report from MaxMasterB): pendingChoice/viewMode are PLAYER UI flags in the shared
				// object. When the SECOND player has already closed their popup (locally false), while the one taking the orb still
				// is choosing (true on the host), the stream restored their input lock → STUCK. pendingChoice=true
				// we only take over on the EDGE false→true on the host (new orb); we ignore holding it.
				try {
					const aug9 = state.store.mods.augments, pAug9 = prevMods.augments;
					if (aug9 && pAug9) {
						const hostPend9 = !!aug9.pendingChoice;
						const edge9 = hostPend9 && ST._augHostPend === false;
						if (hostPend9 && !edge9 && !pAug9.pendingChoice) aug9.pendingChoice = false;
						if (pAug9.viewMode !== undefined) aug9.viewMode = pAug9.viewMode;
						ST._augHostPend = hostPend9;
					} else if (aug9) ST._augHostPend = !!aug9.pendingChoice;
				} catch (e) {}
				try { ST._augLast = JSON.stringify(state.store.mods.augments || null); } catch (e) {}
				// 0.9.159 (darkalien: teleporter/anomaly only after restart): story steps were arriving
				// SILENTLY in st — the client's game wasn't firing their handling (rewards, teleport waypoints "Void",
				// unlocks). We emit story:stepCompleted for NEW steps (like tech-sync since 0.9.89);
				// _applyingNet blocks sending it back to the host.
				try {
					const spN = state.store.mods && state.store.mods.storyProgression;
					const arrN = (spN && spN.completedSteps) || [];
					const prevSteps = ST._storySeen || null;
					if (prevSteps) {
						for (const stp of arrN) {
							if (!prevSteps.has(stp)) {
								ST._applyingNet = true;
								try { ST.FH.events.emit(state, "story:stepCompleted", { stepId: stp }); } catch (e2) {} finally { ST._applyingNet = false; }
								log("SYNC: story step from team replayed locally:", stp);
							}
						}
					}
					ST._storySeen = new Set(arrN);
				} catch (e) {}
			}
			if (msg.gl) state.store.gloom = msg.gl;
			if (msg.fp) { const a = fpArr(state); if (a) { const src = msg.fp; for (let i = 0; i < Math.min(a.length, src.length); i++) { try { Atomics.store(a, i, src[i]); } catch (e) { a[i] = src[i]; } } } }
			// shared pool of upgrades/tech (fix G2): merge levels (NOT object replacement — the game holds references)
			if (msg.up && state.store.upgrades) {
				for (const it of Object.keys(msg.up)) {
					const src = msg.up[it], dst = state.store.upgrades[it];
					if (!src || !dst) continue;
					for (const ug of Object.keys(src)) {
						const s = src[ug], d = dst[ug];
						// only UPWARD: a fresh client purchase must not flicker down before the host processes the act (upgrades don't drop)
						if (s && d && typeof s.level === "number" && s.level > (d.level || 0)) { d.level = s.level; d.availableLevel = Math.max(d.availableLevel || 0, s.availableLevel != null ? s.availableLevel : s.level); }
					}
				}
			}
			// progression BEFORE tech: the tech-tree row gate in unlockTech (factory tier) reads progression —
			// with the reverse order the first unlock attempt would sometimes get rejected (fix 0.9.72, e2e)
			if (msg.pg && state.store.progression) Object.assign(state.store.progression, msg.pg);
			// tech from the host ONLY when the client is in a world with a working mirror (0.9.72): in the menu/during load
			// the game's unlockTech refuses (tutorial/scene), and after a reload everything is lost anyway -> a storm of refusals in the log
			// TELEPORTATION ZONES (0.9.140): the client renders the host's world, so the transitions must be the host's too.
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
					if (przed !== msg.tz.length) log("ZONES: I had", przed, "-> from host", msg.tz.length, "(transitions consistent with his world)");
				} catch (e) { log("teleport zone sync error:", e.message); }
			}
			// PROGRESS FROM THE HOST (0.9.134): unlocked buildings and items belong to the session, not to the local
			// client save. Merging the building list — idea by Cr0ss0vr (PR #13).
			if ((msg.bl || msg.iv) && ST.wsx.everApplied && !ST._loadingWorld && state.store.scene && state.store.scene.active !== 1 && state.store.player) {
				try {
					const pl = state.store.player;
					if (msg.bl && Array.isArray(pl.buildings)) {
						let dodane = 0;
						for (const b of msg.bl) if (!pl.buildings.includes(b)) { pl.buildings.push(b); dodane++; }
						if (dodane) log("PROGRESS: gained", dodane, "buildings unlocked from host");
					}
					if (msg.iv && Array.isArray(pl.inventory)) {
						const mam = new Set(pl.inventory.map((i) => i && i.id));
						const uHosta = new Set(msg.iv.map((i) => i && i.id));
						let dodane = 0, usuniete = 0;
						for (const it of msg.iv) {
							if (mam.has(it && it.id)) continue;   // we have — we do NOT overwrite (grabber tank, ammo are local)
							const kopia = JSON.parse(JSON.stringify(it));
							for (const ab of kopia.abilities || []) { if (ab.cooldown) ab.cooldown.last = 0; if (ab.ammo && ab.ammo.reload) ab.ammo.reload.last = 0; }
							if (kopia.data && kopia.data.cooldown) kopia.data.cooldown.last = 0;
							pl.inventory.push(kopia); dodane++;
						}
						for (let i = pl.inventory.length - 1; i >= 0; i--) {
							const it = pl.inventory[i];
							if (it && !uHosta.has(it.id)) { pl.inventory.splice(i, 1); usuniete++; }
						}
						if (dodane || usuniete) log("PROGRESS: items aligned to host — added", dodane, "removed", usuniete);
					}
				} catch (e) { log("progress sync error:", e.message); }
			}
			if (msg.th && ST.wsx.everApplied && !ST._loadingWorld && state.store.scene && state.store.scene.active !== 1 && state.store.player && state.store.player.tech) {
				// DEPENDENCY ORDER (0.9.89): the tree has prerequisites, and the object's keys arrive
				// in arbitrary order — a "child" attempt before the "parent" is rejected by the game.
				// We repeat the pass as long as anything is unlocking (fixed point, max 6 rounds).
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
							if (realU === true) { state.store.player.tech[k] = true; progress = true; log("SYNC: tech from team unlocked:", k, "(REAL)"); }
							else if (realU === null) { state.store.player.tech[k] = true; progress = true; try { ST.FH.events.emit(state, "tech:unlocked", { techId: k, suppressMusic: true }); } catch (e) {} log("SYNC: tech from team:", k, "(FALLBACK flag — patch _techMod does not match this game build!)"); }
							else stillTodo.push(k);
						} finally { ST._applyingNet = false; }
					}
					todo = stillTodo;
					if (!progress) break; // nothing moved — further rounds won't help, we'll try again in 3s
				}
				if (todo.length && !ST._techPendLogged) { ST._techPendLogged = true; log("SYNC: " + todo.length + " tech from team waiting for requirements (" + todo.join(",") + ") — will retry"); }
			}
			// auto-repair (0.9.71) only when the client IS in a world with a working mirror (not in the menu / not during load)
			if (ST.wsx.everApplied && !ST._loadingWorld && performance.now() - (ST._techRepairT || 0) > 20000) { ST._techRepairT = performance.now(); techRepair(state, "client"); }
				ST._resSnapshot = Object.assign({}, state.store.resources); // re-baseline for client increments (dotNine)
		} catch (e) {}
	}

	// ------------------------------------------------------------------
	// ENTITIES (projectiles/drones/creatures) — host → client 10 Hz; projectiles as ghosts
	// ------------------------------------------------------------------
	// client: every ~1s sends the host ONLY the deltas of its own resources (gained) — the host adds them to
	// its own persistent counters. Without this the client's earnings are lost on disconnect. (dotNine)
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

	// 0.9.238 (REPORT: "a projectile on the other player's side is a yellow pixel, without light"): the whole time
	// we drew EVERY other player's projectile as a little yellow 4x4 square — hence both the wrong gun color and the lack
	// of rocket glow. The packet only carried x/y/type, so the receiver had nothing to reconstruct the appearance from.
	// We take what the game itself assigned to the projectile: the color of its sprite (pixi.sprites.projectiles[id].tint)
	// and the size and brightness of the tracer light (session.lights[tracerLightIndex]).
	const slimProj = (p) => {
		// 0.9.239: the identifier is crucial — without it the receiver doesn't know that it's the SAME projectile as the frame
		// before, and has to create the light anew (hence the flicker). With the id we create the light ONCE and move it,
		// exactly the way the game does it: session.lights[tracerLightIndex].x = t.x.
		const o = { i: p.id, x: p.x, y: p.y, type: p.type };
		try {
			const st = ST.state, se = st && st.session;
			if (!se) return o;
			const sp = se.rendering && se.rendering.pixi && se.rendering.pixi.sprites && se.rendering.pixi.sprites.projectiles;
			const spr = sp && p.id != null ? sp[p.id] : null;
			if (spr && typeof spr.tint === "number" && spr.tint !== 0xffffff) o.t = spr.tint;
			// is it fire? We don't guess the number from the enum — the game itself gives such a projectile a counter
			// for fire emission renewal (attributes.cooldowns.emitFire), and only to it.
			try { if (p.attributes && p.attributes.cooldowns && p.attributes.cooldowns.emitFire !== undefined) o.f = 1; } catch (e2) { swallow("slimProj", e2); }
			if (p.tracerLightIndex !== undefined && se.lights) {
				const L = se.lights[p.tracerLightIndex];
				if (L) {
					o.ls = Math.round(L.size || 0);
					// 0.9.240: brightness also changes in flight (a flare pulses, a flare grows), so it's not enough
					// to take it once at the start — it goes in every packet together with the size.
					o.lb = Math.round((L.brightness != null ? L.brightness : 1) * 100);
					if (Array.isArray(L.color)) o.lc = [Math.round(L.color[0] * 255), Math.round(L.color[1] * 255), Math.round(L.color[2] * 255)];
				}
			}
		} catch (e) { swallow("slimProj", e); }
		return o;
	};
	// 0.9.242 (WHY FIRE ON THE CLIENT LOOKS PALE — found in the bundle, not guessed):
	// the main fire light does NOT come from projectiles, but from BURNING CELLS. The simulation thread
	// reports them to the main thread with FlameBurn / FlameBurnBatch messages, and the latter creates for each one
	// a zone light with options { brightness: 1, duration: 100, useLightZones: true }. Because on the client
	// the simulation is stopped, these messages don't exist at all — all that was left was what we drew ourselves for
	// projectiles, i.e. a fraction of it. In the capture you can see it literally: the same number of particles, no glow.
	// The host intercepts these reports (new hook) and forwards them to the clients, and they call EXACTLY the same thing,
	// that the game calls. Positions are in cells, so a pair of numbers per cell; merging into zones is already done by the game.
	// 0.9.244 (THE PROBE SETTLED IT): with the same number of fire projectiles the host had ~90 light sources
	// and a total size sum of ~17000, while the client had 12 sources and ~2400. So it wasn't brightness or size that was missing,
	// only the SOURCES THEMSELVES — about eight for every one of ours. I found their channel: the simulation thread reports
	// lights to the main thread with AddLight / AddLightBatch messages, where the third element is the full set of
	// options. On the client the simulation is stopped, so this channel is empty — and it's this one that provides most of the glow
	// (among others, flashes of size 300, which show up in the measurement as "largest 300").
	// The host forwards these reports onward, the client replays them ONE TO ONE. Options repeat,
	// so they go as a dictionary, not with every position.
	ST._alQ = null; ST._alDict = null; ST._alMap = null;
	// 0.9.245 (PROBE): channel counters — how many reports came in, how many the queue limit rejected, how many the
	// of the options dictionary, how many actually went into the batch and how many the client replayed. Without these five numbers
	// there's no way to distinguish "the host isn't collecting" from "doesn't fit in the batch" from "the client isn't replaying".
	ST._alStat = { push: 0, dropQ: 0, dropD: 0, sent: 0, rx: 0 };
	function alPush(x, y, opts) {
		try {
			if (ST.net.role !== "host" || !ST.peers.size) return;
			ST._alStat.push++;
			if (!ST._alQ) { ST._alQ = []; ST._alDict = []; ST._alMap = new Map(); }
			if (ST._alQ.length >= 1800) { ST._alStat.dropQ++; return; }   // 600 sources per batch is enough with a margin
			let k;
			try { k = JSON.stringify(opts || null); } catch (e) { k = "null"; }
			let oi = ST._alMap.get(k);
			if (oi === undefined) {
				if (ST._alDict.length >= 32) { ST._alStat.dropD++; return; }   // absurdly many different options = something's wrong, we don't push it
				oi = ST._alDict.length; ST._alDict.push(opts || null); ST._alMap.set(k, oi);
			}
			ST._alQ.push(Math.round(x), Math.round(y), oi);
		} catch (e) { swallow("simulation light", e); }
	}
	ST._addLight = (x, y, opts) => alPush(x, y, opts);
	ST._addLightB = (arr) => { if (!arr) return; for (let i = 0; i + 2 < arr.length; i += 3) alPush(arr[i], arr[i + 1], arr[i + 2]); };
	// client: exactly the same call that the game makes
	function applySimLights(state, pack) {
		try {
			const FX = ST.FH && ST.FH.effects;
			if (!FX || !pack || !Array.isArray(pack.p) || !Array.isArray(pack.o)) return;
			const p = pack.p;
			ST._alStat.rx += (p.length / 3) | 0;
			for (let i = 0; i + 2 < p.length; i += 3) {
				const o = pack.o[p[i + 2]] || {};
				// NOTE: the game's internal function has a default color of [1, .5, 0, 1], while the public createLight
				// substitutes [1, 0, 0, 1]. Without this the replayed lights would be red — I already fell for this once.
				const opt = Object.assign({ noopIfFull: true }, o);
				if (opt.color === undefined) opt.color = [1, 0.5, 0, 1];
				FX.createLight(state, p[i], p[i + 1], opt);
			}
		} catch (e) { swallow("simulation lights", e); }
	}
	ST._flameQ = null;
	ST._flame = (x, y) => {
		if (ST.net.role !== "host" || !ST.peers.size) return;
		if (!ST._flameQ) ST._flameQ = [];
		if (ST._flameQ.length < 4000) ST._flameQ.push(x | 0, y | 0);
	};
	ST._flameB = (arr) => {
		if (ST.net.role !== "host" || !ST.peers.size || !arr) return;
		if (!ST._flameQ) ST._flameQ = [];
		for (let i = 0; i + 1 < arr.length && ST._flameQ.length < 4000; i += 2) ST._flameQ.push(arr[i] | 0, arr[i + 1] | 0);
	};
	// client: the same calls that the game makes on the host
	function applyFlame(state, flat) {
		try {
			const FX = ST.FH && ST.FH.effects;
			if (!FX || !flat || !flat.length) return;
			for (let i = 0; i + 1 < flat.length; i += 2) {
				FX.createLight(state, flat[i] * CELL, flat[i + 1] * CELL,
					{ brightness: 1, duration: 100, useLightZones: true, noopIfFull: true });
			}
		} catch (e) { swallow("flame light", e); }
	}
	// 0.9.243 (PROBE, not a fix): twice in a row I pointed at the wrong source of the fire glow — first
	// the emission frequency on projectiles, then the light of burning cells (and during the test nothing was
	// burning). Instead of guessing a third time, we'll compare NUMBERS on both sides: how many light sources really
	// exist on the shooter's side, and how many on the observer's side, what brightness and size they are, and how many light zones are
	// active. The difference in these numbers will show what's missing: the sources themselves, their brightness, or their size.
	// The probe wakes up BY ITSELF when there are fire projectiles nearby, and writes at most two lines per second.
	function probeSwiatla(state) {
		try {
			if (!isClientSync() && !(ST.net.role === "host" && ST.peers.size)) return;
			const mojePr = (state.store.projectiles || []);
			let ogienMoj = 0;
			for (const p of mojePr) { try { if (p && p.attributes && p.attributes.cooldowns && p.attributes.cooldowns.emitFire !== undefined) ogienMoj++; } catch (e) {} }
			let ogienCudzy = 0;
			const licz = (l) => { if (l) for (const q of l) if (q && q.f) ogienCudzy++; };
			licz(ST.remoteProjectiles);
			for (const p of ST.peers.values()) licz(p.projectiles);
			const ogien = ogienMoj || ogienCudzy;
			const now = performance.now();
			// every 500 ms with fire, every 3s without fire — the BASELINE is just as important here as the measurement during
			// the shot: without it there's no way to know whether the 90 to 5 difference comes from the thrower, or whether it exists
			// all the time (e.g. constant lights that the client doesn't set up at all).
			// 0.9.287: 30 s when nothing is burning, was 3. The baseline still gets recorded, just not
			// eleven hundred times an hour; with fire the 500 ms cadence is unchanged, and that is the one
			// that mattered when we were chasing the flamethrower's light sources.
			if (ST._swProbeT && now - ST._swProbeT < (ogien ? 500 : 30000)) return;
			const dt = ST._swProbeT ? (now - ST._swProbeT) / 1000 : 1;
			ST._swProbeT = now;
			const L = (state.session && state.session.lights) || [];
			let n = 0, suma = 0, jasne = 0, maxS = 0, stale = 0;
			const naj = [];
			for (let i = 0; i < L.length; i++) {
				const l = L[i]; if (!l) continue;
				n++; suma += l.size || 0;
				if ((l.brightness || 0) >= 0.7) jasne++;
				if ((l.size || 0) > maxS) maxS = l.size || 0;
				if (l.durationMs === -1) stale++;
				naj.push(l);
			}
			naj.sort((a, b) => (b.size || 0) - (a.size || 0));
			let opis = "";
			for (let i = 0; i < Math.min(3, naj.length); i++) {
				const l = naj[i];
				opis += (i ? " " : "") + "[size " + Math.round(l.size || 0) + " j" + (Math.round((l.brightness || 0) * 10) / 10)
					+ " dur" + (l.durationMs === -1 ? "stale" : Math.round(l.durationMs || 0))
					+ (l.dedupKey ? " " + l.dedupKey : "") + "]";
			}
			let stref = 0;
			try {
				const Z = (state.session && state.session.lightZones) || [];
				for (const rz of Z) if (rz) for (const z of rz) if (z && z.amount) stref++;
			} catch (e) {}
			const st = ST._alStat, na1s = (v) => Math.round(v / Math.max(0.1, dt));
			log("LIGHTS [" + ST.net.role + (ogien ? " FIRE" : " idle") + "]: sources " + n + "/" + L.length
				+ " (permanent " + stale + ", bright " + jasne + ", total size " + Math.round(suma)
				+ ", largest " + Math.round(maxS) + "), zones " + stref
				+ " | al/s: collected " + na1s(st.push) + ", queue reject " + na1s(st.dropQ) + ", dict reject " + na1s(st.dropD)
				+ ", sent " + na1s(st.sent) + ", replayed " + na1s(st.rx)
				+ " | fire projectiles: mine " + ogienMoj + ", others " + ogienCudzy
				+ (opis ? " | largest: " + opis : ""));
			st.push = st.dropQ = st.dropD = st.sent = st.rx = 0;
		} catch (e) { swallow("light probe", e); }
	}
	function sendEntitiesIfDue(state) {
		const now = performance.now();
		if (now - ST._lastEnt < 100) return;
		ST._lastEnt = now;
		try {
			net.send({
				t: "ent",
				pr: (state.store.projectiles || []).map(slimProj),
				fl: (function () { const q = ST._flameQ; ST._flameQ = null; return q && q.length ? q : undefined; })(),
				al: (function () {
					const q = ST._alQ, dd = ST._alDict;
					ST._alQ = null; ST._alDict = null; ST._alMap = null;
					if (!q || !q.length) return undefined;
					ST._alStat.sent += (q.length / 3) | 0;
					return { p: q, o: dd };
				})(),
				dr: state.store.drones || [],
				cr: state.store.creatures || {},
				// 0.9.159: POSITIONS of living creatures 10x/s — the full list (store.mods) goes out only every 5s
				// (the res section got heavy after 0.9.155), so the client was aiming the Herder at positions from 5s ago.
				// r[4]=type: the client immediately creates unknown creatures from it (100 ms), instead of waiting ~5s for res.st.
			// r[5],r[6]=vx,vy: the client integrates local physics between packets (flight, bounces off walls —
			// previously we zeroed the velocities and the creatures jumped every 100 ms without animation).
			en: (function () { try { const a = ST.FH.entities && ST.FH.entities.getAll ? ST.FH.entities.getAll(state) : null; return a ? a.map((c) => [c.id, Math.round(c.x), Math.round(c.y), c.capturing ? 1 : 0, c.type, Math.round((c.vx || 0) * 10) / 10, Math.round((c.vy || 0) * 10) / 10]) : undefined; } catch (e) { return undefined; } })(),
			});
		} catch (e) {}
	}
	function applyEntities(msg) {
		const state = ST.state;
		if (!state) return;
		try {
			ST.remoteProjectiles = msg.pr || []; // ghost render — NOT into the store (no double simulation)
			if (msg.dr) state.store.drones = msg.dr;
			// 0.9.159: buckets IN-PLACE, not object replacement — the Herder's HUD holds a reference to
			// the old collections and after replacement the counter "wouldn't refresh" despite fresh data every 100 ms.
			// On top of that overlays.update("hotbar") — VANILLA refreshes the HUD only with this call (it makes it on
			// release/type change); on the client the counters are changed by SYNC, so we call it ourselves (throttle 300 ms).
			if (msg.cr) {
				const tgtCr = (state.store.creatures = state.store.creatures || {});
				let crZmiana = false;
				for (const k5 in msg.cr) {
					const s5 = msg.cr[k5], d5 = (tgtCr[k5] = tgtCr[k5] || {});
					for (const f5 in s5) { if (d5[f5] !== s5[f5]) crZmiana = true; d5[f5] = s5[f5]; }
				}
				if (crZmiana) {
					const nowCr = performance.now();
					if (nowCr - (ST._crHudT || 0) > 300) {
						ST._crHudT = nowCr;
						try { ST.FH.ui && ST.FH.ui.overlays && ST.FH.ui.overlays.update && ST.FH.ui.overlays.update(state, "hotbar"); } catch (e) {}
					}
				}
			}
			// 0.9.159: creature positions from the host (10 Hz) into a local list by id — the Herder aims at the TRUTH,
			// and the creatures don't jump every 5s. We skip unknown ids (they'll arrive with the full list in res.st).
			if (msg.en) {
				try {
					const all3 = ST.FH.entities && ST.FH.entities.getAll ? ST.FH.entities.getAll(state) : null;
					if (all3) {
						const byId = new Map(msg.en.map((r) => [r[0], r]));
						for (const c of all3) {
							const r = byId.get(c.id);
							// 0.9.159: capturing COMES BACK from the host — vanilla's cone skips those being caught ("if(i.capturing)
							// continue"); without the flag the client spammed entCap every frame for every creature.
							// Double counting is prevented by a gate in the bundle patch: on the client the tick does NOT call Dp
							// (no available++/entity:collected) — only the host finalizes it, we just animate.
							// Velocities from the host (r[5],r[6]) — local physics integrates flight and bounces between
							// packets. A CREATURE IN FLIGHT (|v|>20, not being caught) is NOT pinned to the host's
							// position every 100 ms (this killed visible bounces off walls) — we only correct the position
							// on drift >48 px; caught and settled ones we snap normally (convergence).
							if (r) {
								c.capturing = !!r[3]; if (!r[3]) c.captureProgress = 0;
								const hvx = r[5] !== undefined ? r[5] : 0, hvy = r[6] !== undefined ? r[6] : 0;
								c.vx = hvx; c.vy = hvy;
								const dx8 = r[1] - c.x, dy8 = r[2] - c.y;
								const wLocie = !c.capturing && Math.abs(hvx) + Math.abs(hvy) > 20;
								if (!wLocie || dx8 * dx8 + dy8 * dy8 > 2304) { c.x = r[1]; c.y = r[2]; }
							}
							// 0.9.159: a creature from sync has NO sprite (Rp only fires on spawn and save loading)
							// = invisible forever (released by the client, natural host spawns).
							// _entInit (patch bundle) does onInit+sprite+light for a single creature.
							if (ST._entInit && ST.FH.entities.getSprite && !ST.FH.entities.getSprite(state, c.id)) {
								try { ST._entInit(c); } catch (e2) {}
							}
						}
						// 0.9.159: creatures UNKNOWN to the client (freshly released/wild spawns) we create IMMEDIATELY
						// from the fast lane (r[4]=type) — previously they waited ~5s for the full list in res.st and the user
						// saw "I release it, and it only appears after a while".
						try {
							const have = new Set(all3.map((c7) => c7 && c7.id));
							for (const r7 of msg.en) {
								if (!have.has(r7[0]) && typeof r7[4] === "string") {
									const nc = { id: r7[0], type: r7[4], x: r7[1], y: r7[2], vx: 0, vy: 0, capturing: false, captureProgress: 0 };
									all3.push(nc);
									if (ST._entInit) { try { ST._entInit(nc); } catch (e2) {} }
								}
							}
						} catch (e2) {}
						// GHOSTS: a local creature ABSENT from the host's list (caught/despawned) must go through
						// full removal (_entDrop = Ip: sprite + light + entry), otherwise its image stays
						// on screen FOREVER — that was the "duplication" the user saw (list 7, screen 99).
						if (ST._entDrop) {
							const nowG = performance.now();
							for (let i3 = all3.length - 1; i3 >= 0; i3--) {
								const c4 = all3[i3];
								if (!c4) continue;
								// release echo (id<0): lives at most 600 ms — until the real one arrives from the host
								if (c4.id < 0) { if (c4.__stGhostT && nowG - c4.__stGhostT > 600) { try { ST._entDrop(c4); } catch (e2) {} } continue; }
								if (!byId.has(c4.id)) {
									if (ST._entCollectFx) { try { ST._entCollectFx(state, c4); } catch (e2) {} }
									try { ST._entDrop(c4); } catch (e2) {}
								}
							}
							// GATEKEEPER (0.9.159): the en(100 ms)/st(5 s) race can leave a sprite without a creature
							// (stuck graphics hanging in the air). We sweep the registry: a sprite without a live entry
							// in the list = immediate destruction via Ip with a placeholder object.
							try {
								const sprMap = state.session.rendering.pixi.sprites.entities;
								if (sprMap) {
									const zywe = new Set();
									for (const cz of ST.FH.entities.getAll(state) || []) if (cz) zywe.add(String(cz.id));
									for (const kS in sprMap) {
										if (!zywe.has(String(kS))) { try { ST._entDrop({ id: isNaN(Number(kS)) ? kS : Number(kS), lightIndex: undefined }); } catch (e2) {} }
									}
								}
							} catch (e2) {}
						}
					}
				} catch (e) {}
			}
		} catch (e) {}
	}
	// client sends its own projectiles (host draws them as ghosts)
	function sendMyProjectilesIfDue(state) {
		const now = performance.now();
		if (now - ST._lastMyProj < 100) return;
		ST._lastMyProj = now;
		const list = (state.store.projectiles || []).map(slimProj);
		if (list.length || ST._hadProj) { try { net.send({ t: "myproj", list }); } catch (e) {} }
		ST._hadProj = list.length > 0;
	}

	// ------------------------------------------------------------------
	// WORLD EVENT SOUNDS — a tap on the host's worker messages (PlaySound=41)
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
				if (sndBudget++ > 20) return; // limit of 20 sounds/s
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
	// VACUUM — client sends the intent, host collects the elements, types go back to the containers
	// ------------------------------------------------------------------
	// POUR from the tank (right button; vanilla: function P). On the client vanilla removed i.amount BEFORE
	// the Lu queue, and Lu gets dropped — the tank emptied out, elements weren't created (Maelle, 0.9.149).
	// The client calculates projectiles like vanilla (target 6 cells from the player toward the cursor, 20 px spread,
	// speed 240*(0.8..1.2) at an angle of ±0.3) and sends vacrel; the host creates them, refusals come back as vacrelres.
	ST._vacRel = (state, tool) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline: vanilla does its own thing
		try {
			const d = tool && tool.data;
			const tanks = d && d.tanks;
			if (!Array.isArray(tanks) || !tanks.length) return true;
			const tank = tanks[Math.min(Math.max(0, d.activeTankIdx | 0), tanks.length - 1)];
			if (!tank || tank.amount <= 0 || !tank.elementType) return true;
			const now = performance.now();
			if (now - (ST._lastVacRel || 0) < 50) return true; // vanilla sprayCooldown time:20 — 50 ms over the network gives a similar cadence
			ST._lastVacRel = now;
			const pl = state.store.player;
			const mo = state.session.input.mouse.worldPosition;
			const cx = pl.x + pl.width / 2, cy = pl.y + pl.height / 2;
			const u = Math.atan2(mo.y - cy, mo.x - cx);
			const bx = cx + Math.cos(u) * 6 * 4, by = cy + Math.sin(u) * 6 * 4; // 6 cells (of 4 px each) from the player
			const k = tank.elementType;
			const quads = [];
			const p = Math.min(tank.amount, 11);
			for (let t = 0; t < p && tank.amount > 0; t++) {
				const tx = bx + 20 * (Math.random() - 0.5), ty = by + 20 * (Math.random() - 0.5);
				const ang = u + 0.6 * (Math.random() - 0.5), spd = 240 * (0.8 + 0.4 * Math.random());
				tank.amount--;
				quads.push(Math.floor(tx / 4), Math.floor(ty / 4), Math.round(Math.cos(ang) * spd), Math.round(Math.sin(ang) * spd));
			}
			if (tank.amount <= 0) { tank.elementType = 0; tank.amount = 0; }
			if (quads.length) {
				try { net.send({ t: "act", k: "vacrel", et: k, c: quads }); } catch (e) {}
				try { ST.FH.ui.overlays.update(state, "hotbar"); } catch (e) {}
			}
		} catch (e) { log("vacRel error:", e && e.message); }
		return true; // the client NEVER pours locally (Lu is dropped — the tank would empty into nothing)
	};
	ST._vac = (state, item, cell, vel) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/outside the mirror: normally
		const now = performance.now();
		if (now - ST._lastVac > 60) { // 0.9.155: 120 ms gave ~83 items/s — the vacuum "sucked through a straw" (user)
			ST._lastVac = now;
			const f = item && item.data && item.data.filter ? item.data.filter.elementType : null;
			// 0.9.156: the BLOWBACK vector (4th argument of the patch, ignored until now) — the game calculates it as
			// 120 * -suction direction; the host will use it for elements that don't fit in the tanks.
			const bv = vel && typeof vel.x === "number" ? [Math.round(vel.x), Math.round(vel.y)] : null;
			try {
				const m = { t: "act", k: "vac", x: cell.x, y: cell.y, f };
				if (bv) m.bv = bv;
				// 0.9.149: tank state — the host finds a slot BEFORE removing the element (like vanilla) and does not
				// suck up anything that doesn't fit. Without this the excess disappeared from the world (Maelle, continued).
				const d = item && item.data;
				if (d && Array.isArray(d.tanks)) {
					m.tk = d.tanks.map((k) => [k.elementType | 0, k.amount | 0]);
					m.ti = d.activeTankIdx | 0;
					if (d.onlyFillActiveTank === true) m.to = 1;
					let lvl = 0; try { lvl = (ST.FH.upgrades.getLevel(state, "vacuum", "capacity") | 0) || 0; } catch (e) {}
					m.cap = VACUUM_CAPS[lvl] || VACUUM_CAPS[0];
				}
				net.send(m);
			} catch (e) {}
		}
		return true; // skip the local tick (it reads stale cellIds)
	};

	// GRABBER host-side (vacuum model, v1): on PICK (empty tank) the client does NOT collect locally — it only forwards
	// WIZ (mouse.cellPosition), the host collects authoritatively (getInfoAtPos+isGrabbable+removeAt) and sends back the types,
	// the client fills the tank. This bypasses the whole sentinel/mirror race under load (1024 cells). PLACE (tank>0)
	// stays as before (return false → local placing works, host createAt confirms).
	ST._grab = (state, tool) => {
		// ST-FEAT: we remember the grabber tank REGARDLESS of role — we take the counter for the preview on others from it.
		try { if (tool && tool.data && tool.data.matrix) { ST._grabTool = tool; ST._grabToolT = performance.now(); } } catch (e) {}
		try {
			if (!isClientSync() || !ST.wsx.paused) return false; // host/offline or client outside the host's world
			const B = tool && tool.data && tool.data.matrix;
			// SHAKING (0.9.128): in the game it comes BEFORE collecting and has priority — it's what turns
			// wet sand into gold (in the tank, locally) and throws waste out into the world (forward via _shakeRes).
			// Us intercepting it meant that shaking did nothing on the client.
			try {
				const mouse = state.session && state.session.input && state.session.input.mouse;
				if (mouse && mouse.shaken) {
					let on = true;
					try { const st = ST.FH && ST.FH.storage && ST.FH.storage.ensure ? ST.FH.storage.ensure(state, "grabberSizeScroll") : null; if (st && st.shakingEnabled === false) on = false; } catch (e) {}
					if (on) return false; // hand control back to the game — it will do this correctly
				}
			} catch (e) {}
			if (!B) return false;
			// 0.9.121: the tank's contents do NOT end the collecting. In the game only holding the button counts
			// (action.state[Active]) — we keep adding to free slots until full. The earlier shortcut
			// "tank non-empty = placing mode" stopped the client after the first caught element.
			const size = tankSize(tool, B);              // HOW MANY slots are active (player setting)
			const tankCount = syncTankHeader(B, size);   // header consistent with the game (like z() + check in H())
			const tankFull = tankCount >= size;
			if (tankFull) return false; // full tank → we won't collect anything, hand control back to the game (placing)
			// KEY: collect ONLY when the player is actively grabbing (holding the button) → action.state[qy.Active=2].
			// Without this we forwarded in a loop and the grabber "took" without clicking (the element fell right away). (fix user)
			const ast = state.session && state.session.action && state.session.action.state;
			if (!ast || !ast[2]) return false; // no action → let z() do the hover (without picking up)
			const now = performance.now();
			// one request at a time: until the host responds, our map of free slots is out of date,
			// and the host would collect into slots that are already occupied — and material would be lost.
			// ST-FIX: 500 ms was a REGULAR brake, because the host wasn't responding to empty collections. Now
			// it always responds, so this is now just a safety net against a lost packet — 250 ms is enough.
			if (ST._grabInFlight && now - (ST._grabInFlightT || 0) < 250) return true;
			if (now - (ST._lastGrabH || 0) > 33) { // the game collects every frame — 10 pulses/s was too slow during dragging
				ST._lastGrabH = now;
				const m = state.session && state.session.input && state.session.input.mouse;
				const cp = m && m.cellPosition;
				if (cp && cp.x >= 0 && cp.y >= 0) {
					// count the FREE tank slots and send them to the host — the host will collect at most that many
					// (without this the host destroyed up to 48 elements, and the excess beyond the tank's capacity WAS LOST)
					let free = 0;
					const slots = size; // only the active slots — the rest of the array is allocation, the game doesn't see it
					const mask = new Uint8Array((slots + 7) >> 3);
					for (let i = 0; i < slots; i++) if (B[i + 2] === 0) { free++; mask[i >> 3] |= 1 << (i & 7); }
					if (free > 0) {
						ST._grabTool = tool; // remember it to fill the tank after the host's response
						try { net.send({ t: "act", k: "grabH", x: cp.x | 0, y: cp.y | 0, f: free, lt: B[0] || 0, n: Math.round(Math.sqrt(slots)), fm: b64enc(mask) }); ST._grabInFlight = true; ST._grabInFlightT = now; if (ST._grabStat) ST._grabStat.prosby++; else ST._grabStat = { przyslane: 0, wTanku: 0, oddane: 0, przepadle: 0, prosby: 1 }; } catch (e) {} // n = side of the tank grid, fm = map of free slots
						if (lim("grabHDiag", 40)) log("CLIENT grabH forward @", cp.x | 0, cp.y | 0, "free=" + free, "lock=" + (B[0] || 0));
					}
				}
			}
			return true; // skip local collecting (the host will do it authoritatively)
		} catch (e) { return false; }
	};
	// HOST: collect grabbable elements in a radius around (x,y), remove them, send the types back to the client (like vacuum).
	// Merged particle: elementType only says "this is a particle", the material is under linkedElementIndex.
	// Without this the client's tank got a technical type instead of e.g. gold (user: "it doesn't merge correctly").
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
	// 0.9.164 (Maelle): CLAIMING the cell + removal with VERIFICATION — parity with vanilla (dt/cV/Lu).
	// Without this the same element (a voidbloom/petal particle) fell into the tank several times: removeAt is sometimes
	// deferred, and the client requests collection every 33 ms — subsequent requests still saw it on the map.
	const GRAB_CLAIM_MS = 400;
	function grabClaimed(now, x, y) {
		if (!ST._grabClaim) ST._grabClaim = new Map();
		const t = ST._grabClaim.get(x + "," + y);
		return t !== undefined && now - t < GRAB_CLAIM_MS;
	}
	function grabClaim(now, x, y) {
		if (!ST._grabClaim) ST._grabClaim = new Map();
		ST._grabClaim.set(x + "," + y, now);
		if (ST._grabClaim.size > 4000) { for (const [k, t] of ST._grabClaim) if (now - t >= GRAB_CLAIM_MS) ST._grabClaim.delete(k); }
	}
	// Remove and CONFIRM that the element actually disappeared. When the removal lost the race (particle),
	// we do NOT hand the type back to the client — otherwise the material stays in the world AND ends up in the tank (duplicate).
	function grabRemoveConfirmed(state, el, x, y, ety, now) {
		try {
			el.removeAt(state, x, y);
			const po = el.getResolvedTypeAtPos ? el.getResolvedTypeAtPos(state, x, y) : null;
			if (po === ety) { ST._grabRaceN = (ST._grabRaceN || 0) + 1; grabClaim(now, x, y); return false; } // survived → mark it, don't hand it back
			return true;
		} catch (e) { return false; }
	}
	function hostHarvestGrab(msg, fromId) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		// rate-limit per player (the client itself limits to 100ms, but the host can't trust the client)
		if (!ST._grabHLast) ST._grabHLast = new Map();
		const tNow = performance.now();
		if (tNow - (ST._grabHLast.get(fromId) || 0) < 25) return; // like in the game: every frame, not every 80 ms
		ST._grabHLast.set(fromId, tNow);
		const el = ST.FH.elements || {};
		const getInfo = el.getInfoAtPos;
		const removeAt = el.removeAt;
		if (!getInfo || !removeAt) { if (!ST._grabApiWarned) { ST._grabApiWarned = true; log("ERROR grabH: missing getInfoAtPos/removeAt — el:", Object.keys(el).join(",")); } return; }
		const types = [], offs = [], sl = [];
		// The client's tank grid: side n, center mid. An element from position (col,row) can ONLY end up
		// in the slot with the same number — exactly like in the game. Without a map of free slots (old client)
		// the old behaviour stays: radius 4 and a cautious limit.
		const gridN = typeof msg.n === "number" && msg.n > 0 ? msg.n | 0 : 0;
		let freeMask = null;
		if (gridN && msg.fm) { try { freeMask = b64dec(msg.fm); } catch (e) { freeMask = null; } }
		const cap = Math.max(1, Math.min(gridN ? gridN * gridN : 48, typeof msg.f === "number" ? msg.f : 8));
		// RESEARCH GATE (fix derErste67: the client collected water without the research): vanilla grabber requires
		// the grabber.waterGrab upgrade for LIQUIDS — host-side harvest must enforce this the same way.
		// we determine the matterType "Liquid" dynamically from the water config (RJ.Water=3) — without hardcoding the enum.
		if (ST._mtLiquid === undefined) { try { const wc = el.getConfig && el.getConfig(3); ST._mtLiquid = wc && wc.matterType != null ? wc.matterType : null; } catch (e) { ST._mtLiquid = null; } }
		const wg = state.store.upgrades && state.store.upgrades.grabber && state.store.upgrades.grabber.waterGrab;
		const canLiquid = !!(wg && wg.level);
		let gateSkipped = 0;
		// ONE TYPE PER TANK (fix derErste67 #2: "grabbing dirt also grabs stone and gold"): vanilla
		// locks the tank to the FIRST caught type (T[0]; `if(L&&U!==L)continue`). The client can send
		// the tank's locked type (msg.lt); with an empty tank the first collected element defines the lock.
		let lockType = (typeof msg.lt === "number" && msg.lt > 0) ? msg.lt : 0;
		let taken = 0;
		if (freeMask) {
			// order from the cursor outward — if the tank fills up along the way, what's closest stays
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
				if (!(freeMask[idx >> 3] & (1 << (idx & 7)))) continue; // slot occupied — the game wouldn't take it here either
				const x = msg.x + col - mid, y = msg.y + row - mid;
				try {
					const info = getInfo(state, x, y);
					if (!info || !info.elementType) continue;
					if (info.isGrabbable === false) continue;
					const ety = resolveGrabType(state, info); // a merged particle -> the real material
					if (!ety) continue;
					const cfg = el.getConfig ? el.getConfig(ety) : null;
					if (cfg && cfg.isGrabbable === false) continue;
					if (ST._mtLiquid !== null && cfg && cfg.matterType === ST._mtLiquid && !canLiquid) { gateSkipped++; continue; }
					if (lockType && ety !== lockType) continue; // the tank accepts one type — we compare the RESOLVED type
					if (grabClaimed(tNow, x, y)) continue; // already taken (removal in progress) — like vanilla dt/cV
					if (!grabRemoveConfirmed(state, el, x, y, ety, tNow)) continue; // didn't disappear → we don't hand it to the tank
					if (!lockType) lockType = ety;
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
					if (info.isGrabbable === false) continue; // respect the flag when present; when absent — take it (the client aimed)
					const ety = resolveGrabType(state, info); // a merged particle -> the real material
					if (!ety) continue;
					const cfg = el.getConfig ? el.getConfig(ety) : null;
					if (cfg && cfg.isGrabbable === false) continue;
					if (ST._mtLiquid !== null && cfg && cfg.matterType === ST._mtLiquid && !canLiquid) { gateSkipped++; continue; } // liquid without the waterGrab research
					if (lockType && ety !== lockType) continue; // the tank accepts only ONE type (like vanilla)
					if (grabClaimed(tNow, x, y)) continue;
					if (!grabRemoveConfirmed(state, el, x, y, ety, tNow)) continue;
					if (!lockType) lockType = ety;
					markCellDirty(state, x, y);
					types.push(ety);
					offs.push(dx, dy); // position relative to the cursor → the client maps it to the correct tank grid slot
					taken++;
				} catch (e) {}
			}
		}
		// ST-FIX (the grabber "stutters" on the client): we always respond, even with an empty list. The client holds
		// the "one request at a time" rule and only removes the lock after the response. When the host stayed silent
		// (cursor over emptiness — and during dragging that's MOST of the frames), the client stood on the emergency
		// limit of 500 ms. Hence "you have to hold the cursor on the particle": the log shows an even rhythm
		// 500 ms between requests instead of the link's own pace.
		net.send({ t: "grabres", types, offs, sl, bx: msg.x, by: msg.y }, fromId);
		if (types.length && lim("grabHostDiag", 40)) log("HOST grabH @", msg.x, msg.y, "→ collected", types.length, "elements" + (gateSkipped ? " (skipped " + gateSkipped + " fluids — missing waterGrab)" : ""));
		else if (!types.length && gateSkipped && lim("grabGateDiag", 10)) log("HOST grabH: 0 collected,", gateSkipped, "fluids blocked (missing waterGrab check)");
	}
	// CLIENT: fill the grabber tank (matrix) with types collected by the host. B[0]=locked type, B[1]=count, B[2..]=slots.
	// The tank invariant per the game: T[1] = number of full slots, T[0] = lock type (0 when empty).
	// We recompute instead of counting incrementally — the incremental counter drifted apart from the game and the grabber
	// looked empty despite full slots.
	// The ACTIVE tank slots = tool.data.size (the matrix can be larger — allocated for the maximum upgrade).
	function tankSize(tool, B) {
		const d = tool && tool.data;
		const n = d && typeof d.size === "number" && d.size > 0 ? d.size | 0 : 0;
		return n && n <= B.length - 2 ? n : B.length - 2;
	}
	// Terrain types that are created EXCLUSIVELY under structures — only those are allowed to be cleaned up.
	const TEREN_STRUKTUR = new Set([15, 16, 17, 18, 19, 20, 21, 22, 24, 26]);
	function syncTankHeader(B, size) {
		const act = size && size > 0 ? size : B.length - 2;
		let n = 0, first = 0;
		for (let i = 2; i < act + 2; i++) if (B[i] !== 0) { n++; if (!first) first = B[i]; }
		// outside the active window the game doesn't see anything — we don't leave content there (otherwise it "comes back"
		// after enlarging the grid, or hangs around as invisible material).
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
		// SLOT BY POSITION (fix TCentraL: items were landing in the top-left corner of the picker): the tank grid is
		// spatial — the slot corresponds to the cell's position relative to the cursor (vanilla: A = w + t*v). Host
		// sends offsets (dx,dy); slot = (dx+mid) + (dy+mid)*v. Occupied/outside the grid → first free one.
		const v = Math.max(1, Math.round(Math.sqrt(size)));
		const mid = v >> 1;
		let filledAny = false;
		for (let ti2 = 0; ti2 < types.length; ti2++) {
			const ty = types[ti2];
			let filled = false;
			// the host sent the slot number computed on the same grid — we place it exactly there
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
				// tank full or slot occupied — the element has ALREADY been removed at the host, so it must go back onto the map,
				// otherwise the material simply disappears (user report).
				let back = false;
				if (typeof bx === "number" && typeof by === "number" && offs && offs.length >= (ti2 + 1) * 2) {
					try { net.send({ t: "act", k: "grabPlace", x: bx + offs[ti2 * 2], y: by + offs[ti2 * 2 + 1], et: ty }); back = true; ST._grabStat.oddane++; } catch (e) {}
				}
				if (!back) ST._grabStat.przepadle++;
				if (lim("grabBackDiag", 20)) log("GRAB: no room in tank for type", ty, back ? "— handing back to the map" : "— NO position, piece lost");
			}
		}
		const tankN = syncTankHeader(B, size); // header consistent with the game: counter = actual content
		if (filledAny) ST._grabStat.wTanku = (ST._grabStat.wTanku || 0) + 0; // (statistics below, after the recount)
		if (filledAny && lim("grabFillDiag", 20)) log("CLIENT grabber tank:", types.length, "sent, now in tank " + tankN + " / " + size + " slots (grid " + v + "x" + v + ")");
	}

	// Flamethrower/cryoblaster: we queue cells (a lot per tick) and send them in batches every ~60ms — we don't flood the network.
	// The client skips the local one (it's deferred anyway → no-op when paused); the host replays it authoritatively.
	ST._fireQ = []; ST._cryoQ = [];
	// Condition ST.wsx.paused: the hook is active ONLY when the mirror is working (client on the host's world).
	// Client connected, but on their own/another world → the weapon works normally locally and we forward NOTHING
	// (its coordinates don't make sense in the host's world).
	// 0.9.158: o = flame intensity/distance (the patch had been passing it ALL ALONG — we were ignoring it);
	// vanilla scales the fire's lifetime by it: base*max(.25, 1-o/.64). Triples [x,y,o*1000|0].
	ST._fire = (state, x, y, o) => { if (!isClientSync() || !ST.wsx.paused) return false; if (ST._fireQ.length < 3000) ST._fireQ.push(x, y, Math.max(0, Math.min(1000, ((o || 0) * 1000) | 0))); return true; };
	// 0.9.150: quadruple [x,y,vx,vy] — vanilla gives the particle a velocity (createAt with particle.velocity =
	// live particle; without velocity the entry goes straight into the grid and can lose the race with the simulation worker).
	ST._cryo = (state, x, y, vel) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._cryoQ.length < 4000) ST._cryoQ.push(x, y, vel ? Math.round(vel.x) : 0, vel ? Math.round(vel.y) : 0); };
	// volcanizer (lava) + caulkBlaster (spray/removing caulk): the same pattern as cryo — sequence
	// before Lu (the local Lu is dropped at the client anyway), batch every 60ms, the host replays it with guards.
	ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = [];
	// manual SHAKE of the grabber (fix TCentraL: "gold appears, residue disappears"): the tank mutates locally
	// (gold in the tank ✓), but the residue flies OUT INTO THE WORLD via Lu (dropped at the client) + recordProcess
	// only bumps the local counter. Forward per processed slot → the host creates the residue and counts the process.
	ST._shakeRes = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._shakeQ.length < 2000) ST._shakeQ.push(x, y); };
	// 0.9.158: quadruple with velocity (vanilla: {particle:{velocity}}) — same as cryo in 0.9.150
	ST._volc = (state, x, y, vel) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._volcQ.length < 4000) ST._volcQ.push(x, y, vel ? Math.round(vel.x) : 0, vel ? Math.round(vel.y) : 0); };
	ST._caulk = (state, x, y, vel) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._caulkQ.length < 4000) ST._caulkQ.push(x, y, vel ? Math.round(vel.x) : 0, vel ? Math.round(vel.y) : 0); };
	ST._caulkRm = (state, x, y) => { if (!isClientSync() || !ST.wsx.paused) return; if (ST._caulkRmQ.length < 2000) ST._caulkRmQ.push(x, y); };

	function hostHarvestVacuum(msg, fromId) {
		const state = ST.state;
		if (!state || !ST.FH) return;
		const el = ST.FH.elements || {};
		const getInfo = el.getInfoAtPos;
		const removeAt = el.removeAtDeferred || el.removeAt;
		if (!getInfo || !removeAt) { log("ERROR vacuum: missing API elements.getInfoAtPos/removeAt — available:", Object.keys(el).join(",")); return; }
		// Client's virtual tanks: we simulate filling within this batch, so we remove from the world
		// ONLY what fits (vanilla: slot before removal). Old client without tk → like 0.9.148.
		const cap = (msg.cap | 0) > 0 ? (msg.cap | 0) : VACUUM_CAPS[0];
		const tanks = Array.isArray(msg.tk) ? msg.tk.map((p) => ({ elementType: p[0] | 0, amount: p[1] | 0 })) : null;
		const canGrab = ST.FH.authorization && ST.FH.authorization.canGrab;
		const types = [];
		const R = 4;
		let taken = 0, fullT = 0, blown = 0;
		for (let dy = -R; dy <= R && taken < 24; dy++)
			for (let dx = -R; dx <= R && taken < 24; dx++) {
				if (dx * dx + dy * dy > R * R) continue;
				const x = msg.x + dx, y = msg.y + dy;
				try {
					if (canGrab && !canGrab(state, x, y)) continue; // authorization zones (vanilla checks them too)
					const info = getInfo(state, x, y);
					if (!info || !info.elementType) continue;
					const ety = resolveGrabType(state, info); // a merged particle -> the real material
					if (!ety) continue;
					// vanilla: liquids, gases, statics and non-transportables are NOT sucked in
					const cfg = el.getConfig ? el.getConfig(ety) : null;
					if (cfg && (cfg.matterType === MT_LIQUID || cfg.matterType === MT_GAS || cfg.matterType === MT_STATIC)) continue;
					if (cfg && cfg.isTransportable === false) continue;
					if (msg.f !== null && msg.f !== undefined && ety !== msg.f) continue;
					if (tanks) {
						const slot = vacSlotFor(tanks, ety, cap, msg.ti, msg.to === 1);
						if (!slot) {
							if (!fullT) fullT = ety;
							// 0.9.156: vanilla BLOWS AWAY non-matching elements (vector from the inlet) — without this
							// it looked as if the vacuum with a full tank "did nothing" (user, live).
							// The same when-idle path as cryo/spill: remove + createAt with velocity. The material
							// doesn't disappear — it just flies off. Limit of 6/tick, so it doesn't keep grinding the same pile over and over.
							if (msg.bv && blown < 6) {
								blown++;
								const bx2 = x, by2 = y, vv = { x: msg.bv[0], y: msg.bv[1] };
								// 0.9.157 HOTFIX: the removeAt alias prefers the DEFERRED variant — the removal went into a queue
							// for later, createAt fired at once on a still-occupied cell and quietly failed, and the late
							// removal DELETED the material ("everything vanishes into the ether" — user, live). In the idle callback
							// it must be a SYNCHRONOUS el.removeAt + createAt in one step (the cell is already empty, so create will go through).
							const mkB = (st2) => { try { const i2 = getInfo(st2, bx2, by2); if (i2 && resolveGrabType(st2, i2) === ety) { el.removeAt(st2, bx2, by2); el.createAt(st2, bx2, by2, ety, { particle: { velocity: vv } }); } } catch (e) {} };
								try { const mut2 = ST.FH.world && ST.FH.world.mutateCellWhenIdle; if (mut2) mut2(state, bx2, by2, mkB); else mkB(state); } catch (e) {}
								markCellDirty(state, bx2, by2);
							}
							continue;
						}
						if (slot.elementType === 0) slot.elementType = ety;
						slot.amount++;
					}
					removeAt(state, x, y);
					markCellDirty(state, x, y); // force sending via the mirror (the sucked-in element disappears at the client)
					types.push(ety);
					taken++;
				} catch (e) {}
			}
		if (types.length || fullT) net.send({ t: "vacres", types, fullT: fullT || undefined }, fromId);
	}

	// Equivalent of j() from the game: slot for element ety in the tanks array [{elementType,amount}] with capacity cap.
	// onlyActive limits it to the active tank (vanilla: t.data.onlyFillActiveTank). Returns the tank or null.
	function vacSlotFor(tanks, ety, cap, ti, onlyActive) {
		if (!Array.isArray(tanks) || !tanks.length) return null;
		if (onlyActive) {
			const t = tanks[Math.min(Math.max(0, ti | 0), tanks.length - 1)];
			if (!t) return null;
			if (t.elementType === ety && t.amount < cap) return t;
			if (t.elementType === 0 && t.amount === 0) return t;
			return null;
		}
		for (const t of tanks) if (t.elementType === ety && t.amount < cap) return t;
		for (const t of tanks) if (t.elementType === 0 && t.amount === 0) return t;
		return null;
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
			const CAP = VACUUM_CAPS[lvl] || VACUUM_CAPS[0]; // the real capacity table from the game's code
			// The same slot logic as at the host (vacSlotFor) — the host only removes what fits, so
			// every type from vacres HAS a slot; a mismatch (editing the tank on the fly) ends in being skipped, not a new loss.
			for (const ty of types) {
				const tank = vacSlotFor(tanks, ty, CAP, vac.data.activeTankIdx | 0, vac.data.onlyFillActiveTank === true);
				if (!tank) continue;
				if (tank.elementType === 0) tank.elementType = ty;
				tank.amount++;
			}
			// 0.9.155 (user, live test): the tanks in the UI weren't refreshing after topping up — the hotbar bar
			// needs to be pushed manually, exactly as the grabber path does.
			try { ST.FH.ui.overlays.update(state, "hotbar"); } catch (e) {}
		} catch (e) { log("fillTanks error:", e.message); }
	}

	// ------------------------------------------------------------------
	// ACTIONS — hooks from the bundle.js patches
	// ------------------------------------------------------------------
	// _dig: we forward ONLY the player's digging (flag _pd from patch I) and hits
	// of the client's OWN projectiles (flag _projCtx; remote projectiles don't reach the store).
	// DN triggered by creatures/drones is NOT forwarded (the host counts them itself).
	// 0.9.142: the dig profile (fromDrill/fromRocketExplosion/...) decides the material TIER — without it the host replayed
	// every client dig as a SHOVEL, so the client's laser/drill/void gun didn't move hard materials.
	const DIG_OPT_KEYS = ["fromGun", "fromRocketExplosion", "fromDrill", "useLiteralOutVelocity", "destroyNonDestructible", "forceRemoveAll", "drillTierDamage"];
	function digOptsForNet(opts) {
		if (!opts || typeof opts !== "object") return null;
		let o = null;
		for (const k of DIG_OPT_KEYS) { const v = opts[k]; if (v === true || (k === "drillTierDamage" && typeof v === "number")) { if (!o) o = {}; o[k] = v; } }
		return o;
	}
	ST._dig = (state, x, y, mask, vel, dmg, opts) => {
		// ST-FEAT preview: we remember the SIZE of the dig pattern (only here does the game reveal it). We send it
		// on in "pos", so the other player sees the area that's about to be dug, not just the cursor.
		try {
			if (Array.isArray(mask) && mask.length && Array.isArray(mask[0]) && mask.length <= 64) {
				ST._digW = mask[0].length; ST._digH = mask.length;
				const rows = [];
				for (let ry = 0; ry < mask.length; ry++) {
					let line = "";
					for (let rx = 0; rx < mask[ry].length; rx++) line += mask[ry][rx] ? "1" : "0";
					rows.push(line);
				}
				const sig = rows.join("|");
				if (sig !== ST._digSig) { ST._digSig = sig; ST._digMask = rows; }
				// ST-FIX: the dig LOCATION. The shovel works AT THE PLAYER, not under the cursor — drawing the mask
				// at the cursor showed the area in a completely different place than the actual dig.
				ST._digAtX = x | 0; ST._digAtY = y | 0; ST._digAtT = performance.now();
			}
		} catch (e) {}
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/outside the mirror: dig normally
		// Projectiles are simulated AUTHORITATIVELY on the host side (see ST._proj) → we do NOT forward digs
		// from the projectile context (_projCtx), otherwise double holes (client's projectile + host's projectile).
		if (ST._projCtx) return true; // skip: the host's projectile will make the explosion/hole
		try {
			const m = { t: "act", k: "dig", x, y, m: mask, v: vel, d: dmg };
			const o = digOptsForNet(opts); if (o) m.o = o;
			if (ST._pendEn > 0) { m.en = ST._pendEn; ST._pendEn = 0; } // energy used by the tool in this frame (laser/drill) — the host will subtract it authoritatively
			net.send(m);
			if (!ST._digFwdLogged) { ST._digFwdLogged = true; log("DIG: first forward to host @", x, y, "(host should log 'first client dig replayed')"); }
		} catch (e) {}
		return true; // skip local execution (it's paused anyway)
	};
	// _drone (patch bundle on E=deploy): the client deploys the drone LOCALLY → the host's sync overwrites store.drones →
	// the drone disappears. We forward the drone to the host, the host adds it authoritatively (its sim "brings it to life").
	ST._drone = (state, drone) => {
		if (!isClientSync() || !ST.wsx.paused || ST._applyingNet) return;
		try { net.send({ t: "act", k: "drone", d: drone }); if (lim("drDiag", 20)) { let _dd = ""; try { _dd = JSON.stringify(drone && drone.data).slice(0, 300); } catch (e) {} log("CLIENT forward drone:", drone && drone.type, "@", drone && drone.x, drone && drone.y, "data=", _dd); } } catch (e) {}
	};
	// _proj (patch bundle on projectiles.push): the client fires the weapon → local projectile (sim paused = dead,
	// the explosion doesn't work). We forward the projectile to the host; the host puts it into store.projectiles → its sim
	// simulates the flight+explosion+damage authoritatively, the result comes back via the mirror/entity stream. (rocket/fusil)
	ST._proj = (state, proj) => {
		if (!isClientSync() || !ST.wsx.paused || ST._applyingNet) return;
		if (!ST._projSent || !ST._projSent.set) ST._projSent = new Map(); // 0.9.98: position -> time (3 s window)
		// 0.9.97: the same projectile could fly multiple times (host log: the same position x10) — we send it ONCE.
		try {
			const pk = proj && (proj.id != null ? "id" + proj.id : Math.round(proj.x) + "," + Math.round(proj.y) + "," + (proj.type != null ? proj.type : "?"));
			if (pk) { const nowP = performance.now(); const last = ST._projSent.get ? ST._projSent.get(pk) : 0; if (last && nowP - last < 3000) return; if (!ST._projSent.set) ST._projSent = new Map(); ST._projSent.set(pk, nowP); if (ST._projSent.size > 400) ST._projSent.clear(); }
		} catch (e) {}
		try { net.send({ t: "act", k: "proj", p: proj }); if (lim("prDiag", 20)) log("CLIENT forward proj:", proj && proj.type, "@", proj && Math.round(proj.x), proj && Math.round(proj.y)); } catch (e) {}
	};
	// _setCell (patch B/Gz): the CLIENT never writes cells locally (host-authoritative).
	// - while applying a structure from the network (_applyingNet): skip the write (the terrain will show the host's mapData mirror)
	// - player spray (_sprayCtx): send the intent to the host
	// - in every case skip the local write
	ST._setCell = (state, x, y, cellId, opts) => {
		if (!isClientSync()) return false; // host/offline: normally
				if (!ST._applyingNet && ST._sprayCtx) {
			// 0.9.100: for the element we do NOT send just the cellId (that's a slot number, it means something else at the host) —
			// we add the TYPE, so the host can create its own, live element.
			let ty = 0;
			try {
				if (cellId >= ELEMENTS_MIN && cellId <= ELEMENTS_MAX) {
					const ed = state.shared && state.shared.sim && state.shared.sim.elementData;
					if (ed && ed.type) ty = ed.type[cellId - ELEMENTS_MIN] | 0;
				}
			} catch (e) {}
			try { net.send({ t: "act", k: "set", x, y, c: cellId, ty }); } catch (e) {}
		}
		return true; // the client NEVER writes cells locally
	};
	// _dropLu: when the client is paused the mutation queue never drains — don't let it grow
	ST._dropLu = () => isClientSync() && ST.wsx.paused;
	// 0.9.159: the client does NOT spawn creatures via any path (prefab spawner, cellRevealed, debug) —
	// the only source is the host (sync st/en). Local spawns via the internal _p collided ids
	// with the host and stayed around as fakes ("they duplicate slightly").
	ST._entNoSpawn = () => isClientSync() && ST.wsx.paused;
	// 0.9.159: CATCH effects at the client. Dp (sound+flash+confetti) is done only by the host — at the client
	// the creature disappeared WITHOUT ANYTHING ("it's not the same as what the host has"). When picking up a caught creature
	// we replay the Dp cosmetics locally (without counters!): collection sound, flash, particles.
	ST._entCollectFx = (state, c) => {
		try {
			if (!c || !c.capturing) return;
			const td = ST.FH.entities && ST.FH.entities.getTypeDef && ST.FH.entities.getTypeDef(c.type);
			if (!td) return;
			if (td.collectSound && ST.FH.sound && ST.FH.sound.playLayers) {
				ST.FH.sound.playLayers(state, td.collectSound, { position: { x: c.x, y: c.y }, rateLimitKey: "entity:collect:" + c.type, rateLimitMs: 40 });
			}
			const col = td.collectLightColor || (td.lightOptions && td.lightOptions.color);
			if (col && ST.FH.effects && ST.FH.effects.createLight) {
				ST.FH.effects.createLight(state, c.x, c.y, { brightness: 1.2, durationMs: 400, size: 70, color: [col[0], col[1], col[2], col[3] != null ? col[3] : 1], decay: "linear" });
			}
			if (td.captureColors && td.captureColors.length && ST.FH.effects && ST.FH.effects.createParticles) {
				ST.FH.effects.createParticles(state, c.x, c.y, { count: 8, minSpeed: 50, maxSpeed: 200, color: td.captureColors[0], minLifetime: 0.3, maxLifetime: 0.9 });
			}
		} catch (e) {}
	};
	// _place (patch bundle, at the SOURCE of the placement action — before runInterceptorsSafe("building:place")):
	// the CLIENT sends the intent to the host and CANCELS the local placement (return true → the game does return null,
	// zero cell writes). The host places it authoritatively in replayAction("place") and sends back "st add" (mirror).
	// Host/offline: return false → normal local placement. buildOne/SA.build does NOT go through this
	// hook (it's a lower-level API), so applying structures from the network and the host's building don't loop back on each other.
	ST._place = (state, structureType, x, y, data, clearance, copied) => {
		if (!isClientSync() || !ST.wsx.paused) return false; // host/offline/outside the mirror: place normally
		// KEY: when the MOD itself places a structure from the network (applyNetStructs/applySnapshot → buildOne → SA.build,
		// which DOES go through building:place!), do NOT intercept — otherwise we cancel our own render of the confirmed
		// structure and the client SEES NO building AT ALL (neither their own nor the host's). (regression when moving to patch bundle)
		if (ST._applyingNet) return false;
		if (structureType == null) return false; // no type → don't block the game
		// KEY FIX (0.5.4): we forward EVERY type (string AND NUMERIC = enum ev). Previously the block
		// typeof==="string" rejected numeric types (most buildings!) → NOTHING got forwarded at the host.
		// Anti-flood guard: while LOADING the world the game fires building:place for many structures at once
		// (reconstruction). We don't forward for ~3s after a scene change — otherwise the host gets hundreds of positions from the save.
		if (ST._loadGuardUntil && performance.now() < ST._loadGuardUntil) return false; // load → allow the local reconstruction, don't forward
		if (lim("plDiag2", 300)) log("CLIENT forward place:", structureType, "@", x, y, "(typeof " + typeof structureType + ")", data ? "z data" : "no data");
		// KEY (fix "foundations can't be removed"): we also forward the structure's DATA. Foundations
		// (box/slopes/color) carry their definition in data — without it the host built a DEGENERATE version, whose
		// foundation-removal path (drag) couldn't match → unremovable even for the host.
		let d = null;
		try { if (data != null) d = JSON.parse(JSON.stringify(data)); } catch (e) {} // only serializable fields
		// 0.9.143: clearance from the client's validation (3/4 = above terrain/to be replaced → "queued" at the host too, the terrain stays)
		try {
			const m = { t: "act", k: "place", type: structureType, x, y, data: d };
			if (clearance === 3 || clearance === 4) m.cl = clearance;
			// 0.9.225 (REPORT: "colors don't sync" and "undo paints with the new color"):
			// the game takes the foundation's color from FH.foundationColorPicker.getColor(state) and assigns it in the event
			// "building:placed". This event fires AT THE HOST, so the client's block was getting the HOST's color.
			// We take exactly the same source as the game uses at the placer, and send it together with the position.
			// When UNDOING a demolition the color must be the one FROM BEFORE the removal, not the current one from the palette — we have it
			// saved at the moment of demolition (_colByPos), because the history entry carries it anyway.
			try {
				// 0.9.226 (verified in bundle.js): when UNDOING and when pasting the game builds like this:
				//   build(e, {x,y}, type, { copiedStructure: { data, filter, color } })
				// meaning it passes the original's color, filter AND data in the options — and our hook wasn't getting them,
				// because the patch only supplied (state, type, x, y, data, clearance). Now it also supplies
				// copiedStructure, so we take EXACTLY what the game would use to recreate the structure.
				// Order of sources: the game's options -> the color remembered from before demolition -> the current palette.
				let kol;
				if (copied && copied.color != null) kol = copied.color;
				if (kol === undefined && ST._inGameUndo && ST._inGameUndo() && ST._colByPos) kol = ST._colByPos.get(x + "," + y);
				if (kol === undefined) {
					const CP = ST.FH && ST.FH.foundationColorPicker;
					if (CP && typeof CP.getColor === "function") kol = CP.getColor(state);
				}
				// 0.9.228 (THE LOG SHOWED THE CAUSE): the "col" field was only added WHEN the color was non-empty.
				// A missing field meant "decide for yourself" to the host, and the host decided using its own palette. Meanwhile
				// "a block with no color" is a FULLY VALID answer from the game: getColor returns null when the player hasn't chosen
				// a color (in the bundle: defaultColor: null). So we always send the decision — null means
				// "no color", not "do whatever you want".
				m.col = (kol === undefined || kol === null) ? null : kol;
				// 0.9.228: the host has its own memory of the colors of what it removed itself (see below). It's allowed to use it
				// ONLY when replaying from Ctrl+Z — with a normal placement "no color" means
				// truly no color and nothing has the right to overwrite that.
				if (ST._inGameUndo && ST._inGameUndo()) m.u = 1;
				if (lim("colTxDiag", 40, 60000)) log("CLIENT colour -> " + JSON.stringify(m.col)
					+ " [copied=" + (copied ? JSON.stringify(copied.color) : "missing")
					+ ", remembered=" + JSON.stringify(ST._colByPos && ST._colByPos.get(x + "," + y))
					+ ", undo=" + ((ST._inGameUndo && ST._inGameUndo()) ? 1 : 0) + "]");
				// with copiedStructure the game does NOT compute the default data (m = void 0), so without this
				// undoing a demolition lost the machine's configuration
				if (copied && copied.data != null && m.data == null) { try { m.data = JSON.parse(JSON.stringify(copied.data)); } catch (e2) { swallow("_place", e2); } }
				if (copied && copied.filter != null) { try { m.fl = JSON.parse(JSON.stringify(copied.filter)); m.flc = 1; } catch (e2) { swallow("_place", e2); } }
			} catch (e) { swallow("_place", e); }
			// 0.9.146: THE PLACER'S FILTER. The game assigns a filter to the fresh structure in building:placed from
			// e.store.options.defaultFilter — and this fires AT THE HOST, so the client was getting the host's
			// configuration regardless of its own (Maelle: "gets placed in the config the host currently has").
			// Copy-paste: the core takes the filter from session.copiedStructure, which the host doesn't have in its own session.
			// We send the filter on EVERY placement (the host applies it only to filter structures — see the handler).
			try {
				const cd = state.session && state.session.action && state.session.action.customData;
				const cs = cd && cd.copiedStructure;
				if (cs && cs.filter != null) { m.fl = JSON.parse(JSON.stringify(cs.filter)); m.flc = 1; } // flc: the filter from the copied structure (not from defaultFilter)
				else if (state.store.options && state.store.options.defaultFilter != null) m.fl = JSON.parse(JSON.stringify(state.store.options.defaultFilter));
			} catch (e) {}
			// ST-FIX (throughput): we do NOT send them individually. Dragging a foundation is hundreds
			// of placements; each as a separate packet was clogging the link and the host (in the log: 300 packets in 2 s,
			// and just as many broadcasts back). We collect them and send them as one "placeN" packet.
			queuePlace(m);
			// ST-FEAT undo: at the client the game does NOT perform this build locally (we intercept it above),
			// so no entry is created in the Ctrl+Z history. We append it ourselves — otherwise the client has nothing to undo.
			// 0.9.254 (REPORT "the second-to-last undo needs two presses"): PIPES are an exception here.
			// One pipe drag produced TWO entries: the regular "build" one (one per pipe placed)
			// and our "pipeBuild" from _pipeRun. The first Ctrl+Z removed pipeBuild and actually undid
			// the action, while the second one hit the orphaned "build" entry, whose undo calls removeAtPositions
			// on STRUCTURES — and a pipe is not a structure (it sits in store.pipes), so nothing happened.
			// From the outside it looked exactly like this: every older action requires two presses.
			// Pipes have their own entry and only that one.
			{
				let __rura = false;
				try { __rura = structureType === 23 || isPipeType(state, structureType) || String(structureType).toLowerCase().indexOf("pipe") >= 0; } catch (e2) { swallow("_place", e2); }
				if (!__rura) ST._undoPushBuild(x, y);
			}
		} catch (e) {}
		return true; // cancel the local placement — the client writes nothing to the world
	};

	// The client's Demolisher (hook _demol from the tool's tick, the End-of-drag branch).
	// Problem: the local demolition at the client does NOT execute to completion (part of it goes through the deferred
	// queues/workers of the paused sim) → only a red mark, the structures:removed event doesn't fire,
	// we forward nothing ("recolors them red, and thats it" — TCentraL). Fix: intercept the INTENT:
	// find structures in the selected rect via the MIRROR (getAtCell on the rect's cells — the same accuracy as
	// the game, it accounts for shape) and send it through the existing act demolish channel. The host removes it, st rm confirms.
	ST._demol = (state, start, end) => {
		try {
			// HOST/SOLO: we do NOT intercept (the game demolishes normally), but we remember the rect — 250ms later
			// we finish off the LEFTOVERS via SA.removeAt. Reason: building tiles from the client's replay can
			// get stuck in the QUEUED state (block-access), and the game's demolition SKIPS such tiles → "red
			// blocks that even the host can't remove". SA.removeAt takes a different path and removes them.
			// NOTE: this also works SOLO/offline (stuck blocks remain in the save and need to be cleanable without a session).
			if (!isClientSync() || !ST.wsx.paused) {
				// PIPE MODE (report from TCentraL "removes pipe and blocks"): removing PIPES deliberately leaves
				// structures/blocks in the rect — the finisher would mistake them for stuck QUEUED leftovers and remove them.
				// In pipe mode we do NOT arm the finisher (the game removes pipes itself, correctly).
				try {
					const sel = ST.FH.action && ST.FH.action.getSelected && ST.FH.action.getSelected(state);
					// ST-FIX (report from the Rexisaurus fork, confirmed in bundle 0.5.6: e[e.Pipe=23]="Pipe"):
					// the selected pipe can have a NUMERIC id of 23, not a string — a plain test for the word "pipe" was letting it through.
					if (sel && (isPipeType(state, sel.id) || sel.id === 23 || String(sel.id).toLowerCase().indexOf("pipe") >= 0)) return false;
				} catch (e) { swallow("_demol", e); }
				// Capture each selected structure's real footprint BEFORE the game removes it. The drag
				// rectangle only selects structures; it does not describe their foundation geometry.
				try {
					const SA = structNs();
					const x0 = Math.floor(Math.min(start.x, end.x)), y0 = Math.floor(Math.min(start.y, end.y));
					const x1 = Math.ceil(Math.max(start.x, end.x)), y1 = Math.ceil(Math.max(start.y, end.y));
					const found = new Map(), bounds = [];
					// ST-FIX: step of CELL, not 1. getAtCell rounds the coordinates to the grid of 4 anyway
					// (in the game's code: Math.floor(t/cellSize)*cellSize), so checking each of the 16 cells
					// of the block gave exactly the same result at 16x the cost. Thanks to this the area limit
					// can be high enough to be unreachable in practice.
					const gx0 = Math.floor(x0 / CELL) * CELL, gy0 = Math.floor(y0 / CELL) * CELL;
					if (SA && (x1 - x0 + 1) * (y1 - y0 + 1) <= 4000000) {
						for (let y = gy0; y <= y1; y += CELL) for (let x = gx0; x <= x1; x += CELL) {
							let st = null; try { st = SA.getAtCell(state, x, y); } catch (e) { swallow("_demol", e); }
							if (!st || found.has(structKey(st))) continue;
							found.set(structKey(st), st);
							const b = structureBounds(state, SA, st, x, y); if (b) bounds.push(b);
						}
					} else log("demolish bounds: rect " + ((x1 - x0 + 1) * (y1 - y0 + 1)) + " cells — above the 4000000 limit");
					// FALLBACK (review PR #11): dragging over ONLY old red tiles (without a live structure)
					// produced empty bounds = no cleanup. We preserve the players' workflow: empty rect → clean up orphaned
					// tiles in the rect (isOrphanTile per cell protects healthy, painted foundations).
					if (!bounds.length && (x1 - x0 + 1) * (y1 - y0 + 1) <= 4000000) bounds.push({ x0, y0, x1, y1 });
					armDemolCleanup(bounds);
				} catch (e) { log("demolish bounds error:", e.message); }
				return false; // the game demolishes normally; we just clean up after it
			}
			// pipes (Pipe): a separate path in the game (Zn) — we forward the rect, the host calls _pipeZn (exported from the patch)
			try {
				const sel = ST.FH.action && ST.FH.action.getSelected && ST.FH.action.getSelected(state);
				if (sel && (isPipeType(state, sel.id) || sel.id === 23 || String(sel.id).toLowerCase().indexOf("pipe") >= 0)) {   // 0.9.231: the game's answer first, 23 as a fallback
					const rx0 = Math.floor(Math.min(start.x, end.x)), ry0 = Math.floor(Math.min(start.y, end.y));
					const rx1 = Math.ceil(Math.max(start.x, end.x)), ry1 = Math.ceil(Math.max(start.y, end.y));
					// snapshots WITHOUT changes after them — they must be created before the host removes anything
					try {
						const mig = migawkiRurWRecie(state, rx0, ry0, rx1, ry1);
						if (mig.length) ST._undoPush({ type: "pipeRemove", snapshots: mig, timestamp: Date.now() });
					} catch (e2) { swallow("pipe demolition history", e2); }
					net.send({ t: "act", k: "pipeRm", x0: rx0, y0: ry0, x1: rx1, y1: ry1 });
					log("CLIENT pipeRm rect");
					return true; // skip the local one (the host will execute it, the mirror + snap will confirm)
				}
			} catch (e) { swallow("_demol", e); }
			const SA = structNs(); if (!SA) { log("_demol: missing structures API"); return false; }
			// NOTE: H(e) returns the rect ALREADY IN CELLS (it divides by cellSize internally — snappedMinX/cellSize).
			// Bug 0.9.28: we were dividing by 4 a SECOND time → scanning an area 4x smaller near the origin → always
			// empty → a silent no-op with no log ("just nothing happens, no log" — TCentraL).
			const x0 = Math.floor(Math.min(start.x, end.x)), x1 = Math.ceil(Math.max(start.x, end.x));
			const y0 = Math.floor(Math.min(start.y, end.y)), y1 = Math.ceil(Math.max(start.y, end.y));
			// ST-FIX: it used to be 40000 cells (200x200) and with a bigger drag the client would SILENTLY hand
			// the demolition back to the game — and at the client the local demolition doesn't work, so nothing happened. The CELL step
			// (getAtCell rounds to the grid of 4) makes it 16x cheaper, so the limit can be very high.
			if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000000) { log("_demol: rect too large", x0, y0, x1, y1); return false; }
			const found = new Map(); // structKey -> slim
			const undoFound = new Map(); // ST-FEAT undo: the full fields that the game's Ctrl+Z rebuild requires
			const gx1 = Math.floor(x0 / CELL) * CELL, gy1 = Math.floor(y0 / CELL) * CELL;
			for (let y = gy1; y <= y1; y += CELL) for (let x = gx1; x <= x1; x += CELL) {
				try {
					const st = SA.getAtCell(state, x, y);
					if (!st) continue;
					const k = structKey(st);
					if (found.has(k)) continue;
					found.set(k, slimStruct(st));
					undoFound.set(k, { type: st.type, x: st.x, y: st.y, data: st.data, filter: st.filter, color: st.color });
					// 0.9.225: the color from before the demolition — needed for Ctrl+Z (see _place)
					try {
						if (!ST._colByPos) ST._colByPos = new Map();
						if (st.color != null) ST._colByPos.set((st.x | 0) + "," + (st.y | 0), st.color);
						if (ST._colByPos.size > 300000) ST._colByPos.clear();
					} catch (e2) { swallow("_demol", e2); }
				} catch (e) { swallow("_demol", e); }
			}
			if (!found.size) { log("_demol: empty rect [" + x0 + "," + y0 + " → " + x1 + "," + y1 + "] — nothing to demolish"); return true; }
			const list = [...found.values()];
			// 0.9.217: THIS is where the client actually sends the demolition (the event path at the paused client
			// doesn't fire), so the measurement timestamp has to be here too — in 0.9.216 it stood in that other, dead spot.
			try { net.send({ t: "act", k: "demolish", list, rect: { x0, y0, x1, y1 } }); stampAct("demolish", list.length); } catch (e) { log("demolish send error:", e && e.message); }
			// ST-FEAT undo: as above — the client's demolition doesn't go through the game, so we create the entry ourselves.
			if (undoFound.size) ST._undoPush({ type: "remove", structures: [...undoFound.values()], timestamp: Date.now() });
			log("CLIENT demolish rect →", list.length, "structures");
			return true; // skip the local (non-functional) demolition — confirmation will come via st rm
		} catch (e) { return false; }
	};

	// ST-FIX (throughput): one placement = one network packet. When dragging
	// a foundation the client used to send hundreds of them, and the host sent back just as many "st add" broadcasts —
	// hence the feeling of "2G internet" while building. The body is factored out so that the same
	// authoritative path also handles the batched "placeN" packet.
	function hostPlaceOne(state, msg, fromId) {
		// the client requested a placement — the host places it AUTHORITATIVELY. force=true: we trust
		// the client's validation (the collision check passed at their end), so we skip the host's check by supplying
		// clearance=Available (see CLEARANCE_AVAILABLE) — otherwise a minimal state difference → build null → "auto-delete".
		if (lim("plRxDiag", 300)) log("HOST RX place:", msg.type, "@", msg.x, msg.y, "od", fromId);
		ST._applyingNet = true;
		let built = null;
		let nowaStruktura = false;
		try {
			built = buildOne(state, { type: msg.type, x: msg.x, y: msg.y, data: msg.data || undefined, cl: msg.cl }, true);
			nowaStruktura = !!ST._bldNew;   // 0.9.230: buildOne also returns an EXISTING structure — see below
		} finally { ST._applyingNet = false; }
		// 0.9.208: hostPlaceOne places under _applyingNet, so the subscription to "building:placed" (and with it
		// bcastStruct and the _bornAt marker) does NOT fire. Without the marker the "freshly placed" safety catch
		// in the finisher never worked for structures placed on a client's request — which is exactly where,
		// where it was needed. We stamp it here.
		try {
			if (built) {
				if (!ST._bornAt) ST._bornAt = new Map();
				ST._bornAt.set(structKey(built), performance.now());
				if (ST._bornAt.size > 60000) { const cut = performance.now() - 30000; for (const [k3, v3] of ST._bornAt) if (v3 < cut) ST._bornAt.delete(k3); }
			}
		} catch (e) { swallow("hostPlaceOne", e); }
		if (built) {
			// 0.9.146: building:placed already fired ON THE HOST and wrote in the host's defaultFilter —
			// we overwrite with the PLACER's config. Only filter structures (built.filter != null;
			// the game marks them itself). Pass-through types (filter wall, pass-through conveyor) have
			// affectsLiquid/affectsGas FORCED by the game — we keep these flags from the host's version.
			// 0.9.225: same thing as what we do below with the filter — "building:placed" on the host wrote ITS color,
			// so we overwrite it with the placer's color (or the pre-demolition color when undoing).
			// 0.9.228: "col" present (even if null) = the placer's decision, and it wins over the host's color,
			// which the "building:placed" event wrote in. null = the block is meant to have no color.
			// 0.9.228: replaying from Ctrl+Z, and the placer doesn't know the color — we reach into the host's own memory
			if (msg.u && (msg.col === null || msg.col === undefined) && ST._hostColMem) {
				try {
					const zap = ST._hostColMem.get((msg.x | 0) + "," + (msg.y | 0));
					if (zap && performance.now() - zap.t < 120000) {
						msg = Object.assign({}, msg, { col: zap.c });
						if (lim("colMemDiag", 40, 60000)) log("HOST: colour from the demolition memory " + JSON.stringify(zap.c) + " @" + msg.x + "," + msg.y);
					}
				} catch (e) { swallow("hostPlaceOne", e); }
			}
			// 0.9.230 (BUG REPORT "moving onto an occupied area repaints the blocks already there"): when the cell
			// already held the same structure, buildOne placed NOTHING and gave back THAT ONE instead. Overwriting its color
			// (and also its filter) meant changing someone else's untouched block. So we only apply the sender's settings
			// to the structure that actually got created.
			if (!nowaStruktura && (msg.col !== undefined || msg.fl !== undefined)) {
				if (lim("colSkipDiag", 20, 60000)) log("HOST: @" + msg.x + "," + msg.y + " same structure already stood there — keeping its color and filter");
			} else if (msg.col !== undefined) {
				if (msg.col === null) { try { delete built.color; } catch (e) { swallow("hostPlaceOne", e); } }
				else built.color = msg.col;
				if (lim("colDiag", 40, 60000)) log("HOST colour of the placing player " + JSON.stringify(msg.col) + " @" + built.x + "," + built.y);
			} else if (lim("colBrakDiag", 20, 60000)) log("HOST: packet WITHOUT color field @" + msg.x + "," + msg.y + " (old client?) — host color stays");
			if (nowaStruktura && msg.fl !== undefined) {
				// 0.9.147: ONLY types with a configurable filter are taken — structures with a FIXED filter
				// (GloomEmitter density:1e4, critterFence mode:"allow") are assigned by the game independently of
				// defaultFilter, and overwriting would break them. The game marks filter types in the config:
				// tooltipHover.type === "filter". Copy-paste (flc) = the filter of a structure of the SAME type,
				// so we assign it directly — including to shakers/growers, which have no filter right after being built.
				if (msg.flc) {
					built.filter = Object.assign({}, built.filter || {}, msg.fl);
					if (lim("flDiag", 40)) log("HOST: filter from client copy-paste @", built.x, built.y);
				} else if (built.filter != null) {
					// 0.9.151 (diagnosis+fix: darkalien / undeadalien1, issue #18): the gate on
					// getConfig().tooltipHover failed for numeric types (vanilla Filter L/R) —
					// the overwrite didn't work on regular placement, only on copy-paste. built.filter
					// != null already proves it is a filter type; the exceptions (a FIXED filter) are recognised by name
					// from the config and by the density key (only GloomEmitter has it — the player's filter doesn't carry it).
					let fixedFilter = built.type === "critterFence";
					try { const cfg = ST.FH.structures.getConfig(built.type); const nm = String((cfg && (cfg.nameKey || cfg.id)) || ""); if (nm.indexOf("gloomEmitter") >= 0 || nm.indexOf("critterFence") >= 0) fixedFilter = true; } catch (e) { swallow("hostPlaceOne", e); }
					if (!fixedFilter && built.filter.density !== undefined && (msg.fl == null || msg.fl.density === undefined)) fixedFilter = true;
					// 0.9.159 (darkalien: client's planter box blocks gold): the PLACER's defaultFilter may
					// only be applied onto a filter that COMES FROM defaultFilter (filter structures). Grower and similar
					// get a SPECIFIC filter from the game (e.g. [7,18,30] = let gold/seeds through) — overwriting
					// it with the client's generic default (sand+water) blocked gold. We compare against the host's
					// default after sorting the keys; different = specific filter = we don't touch it.
					if (!fixedFilter) {
						try {
							// affectsLiquid/affectsGas is FORCED by the game on Mk2 types regardless of the default —
							// we exclude it from the comparison, so the Mk2 filter isn't mistaken for "specific".
							const norm = (o) => { if (!o || typeof o !== "object") return JSON.stringify(o); const c8 = {}; for (const k8 of Object.keys(o).sort()) { if (k8 !== "affectsLiquid" && k8 !== "affectsGas") c8[k8] = o[k8]; } return JSON.stringify(c8); };
							const hostDef = state.store.options && state.store.options.defaultFilter;
							if (hostDef != null && norm(built.filter) !== norm(hostDef)) {
								fixedFilter = true;
								if (lim("flSpec", 20)) log("HOST: structure-specific filter kept (type " + built.type + ")");
							}
						} catch (e) { swallow("hostPlaceOne", e); }
					}
					if (!fixedFilter) {
						const base = built.filter;
						const merged = Object.assign({}, base, msg.fl);
						// Mk2/pass-through: the game FORCES action on liquids and gases — the client's defaultFilter
						// doesn't have these keys, so without this the merge would lose them
						if (base.affectsLiquid === true) merged.affectsLiquid = true;
						if (base.affectsGas === true) merged.affectsGas = true;
						built.filter = merged;
						if (lim("flDiag", 40)) log("HOST: filter of the placing player applied @", built.x, built.y);
					}
				}
				// 0.9.151 (diagnosis: darkalien) — the filter DISPLAYED correctly, but ACTED like the host's
				// last filter: the overwrite of built.filter after building stayed in the main thread, while the SIM filters
				// in the workers, which got the host's defaultFilter at build time. Propagate it as in the sdata path
				// (that one has worked for players since 0.9.142).
				try { const SAf = structNs(); if (SAf && SAf.update) SAf.update(state, built, { propagateToWorkers: true }); } catch (e) { swallow("hostPlaceOne", e); }
			}
			const inStore = (state.store.structures || []).indexOf(built) >= 0;
			if (ST._addQ) ST._addQ.push(slimStruct(built)); else net.send({ t: "st", k: "add", list: [slimStruct(built)] });
			if (lim("plDiagH", 300)) log("HOST: placed", msg.type, "@", built.x, built.y, "(request", msg.x, msg.y + ")", inStore ? "[w store]" : "[!! NOT in store.structures]", "-> broadcast");
		}
		else if (lim("plDiagHE", 300)) log("HOST: NOT placed", msg.type, "@", msg.x, msg.y, "(build returned null — wrong type name / collision at host?)");
		return built;
	}

	function replayAction(msg, fromId) {
		const state = ST.state;
		if (!state) return;
		try {
			if (msg.k === "dig") {
				const ex = findApi("excavate", ["excavation", "patterns"]); // the ns name differs between builds (current=excavation, 0.5.3=patterns)
				if (msg.en > 0) {
					// 0.9.142: power is authoritative on the host (client's laser/drill) — no power = no excavation
					let got = msg.en;
					try { if (ST.FH.energy && typeof ST.FH.energy.consume === "function") got = ST.FH.energy.consume(state, msg.en, { allOrNothing: true }); } catch (e) { got = msg.en; }
					if (!(got >= msg.en)) { if (lim("enDenyN", 5)) log("HOST: client dig rejected — no energy (" + msg.en + ")"); return; }
				}
				if (ex) { ex(state, msg.x, msg.y, msg.m, msg.v, msg.d, msg.o || {}); markUrgent(state, msg.x, msg.y, 1); if (!ST._digLogged) { ST._digLogged = true; log("HOST: first client dig replayed @", msg.x, msg.y); } }
				else if (!ST._digErrLogged) { ST._digErrLogged = true; log("ERROR: missing API excavate — FH keys:", Object.keys(ST.FH || {}).join(",")); }
			} else if (msg.k === "set") {
				const isElem = msg.c >= ELEMENTS_MIN && msg.c <= ELEMENTS_MAX;
				if (isElem) {
					// 0.9.100: we NEVER write someone else's slot number — we create our own element from the type.
					const ty = msg.ty | 0;
					if (ty > 0) {
						try { if (ST.FH.world.isCellEmpty(state, msg.x, msg.y)) ST.FH.elements.createAt(state, msg.x, msg.y, ty); } catch (e) { log("set(elem) error:", e.message); } markUrgent(state, msg.x, msg.y, 0);
					} else if (lim("setNoTy", 5)) log("set: element without type (old client?) — skipping to avoid creating a dead cell");
				} else {
					const sc = findApi("setCellId");
					if (sc) { sc(state, msg.x, msg.y, msg.c); markUrgent(state, msg.x, msg.y, 0); }
					else log("ERROR: missing API setCellId");
				}
			} else if (msg.k === "place") {
				hostPlaceOne(state, msg, fromId);
			} else if (msg.k === "placeN") {
				// batch packet from a client drag — the same authoritative path as above
				const arr = Array.isArray(msg.l) ? msg.l : [];
				ST._addQ = [];
				ST._bldBatch = [];   // 0.9.231: one updateMany for the whole batch instead of N calls
				try {
					for (const it of arr) hostPlaceOne(state, { k: "place", type: it.t, x: it.x, y: it.y, data: it.d, cl: it.c, fl: it.f, flc: it.fc, col: it.cr === undefined ? undefined : (it.cr === 0 ? null : it.cr), u: it.u }, fromId);
				} finally {
					flushBuildBatch(state);
					const q = ST._addQ; ST._addQ = null;
					if (q && q.length) for (let i = 0; i < q.length; i += 300) net.send({ t: "st", k: "add", list: q.slice(i, i + 300) });
				}
				if (lim("plRxDiagN", 60)) log("HOST RX placeN: " + arr.length + " pcs. from " + fromId);
			} else if (msg.k === "pipeDel") {
				// client pipe undo: remove exactly these cells (game's function, one batch)
				try {
					const P = ST.FH && ST.FH.pipes;
					if (P && typeof P.removeAtCells === "function" && msg.c && msg.c.length) {
						let przed = 0;
						for (const c of msg.c) if (pipeAt(state, c.x, c.y)) przed++;
						P.removeAtCells(state, msg.c, { playSound: false });
						let zostalo = 0, gdzie = "";
						for (const c of msg.c) if (pipeAt(state, c.x, c.y)) { zostalo++; if (zostalo <= 6) gdzie += " " + c.x + "," + c.y; }
						log("HOST: pipe undo from client — requested " + msg.c.length + ", found " + przed
							+ ", left after removal " + zostalo + (zostalo ? " [" + gdzie.trim() + "]" : ""));
					} else log("HOST: missing FH.pipes.removeAtCells — pipe undo not handled");
				} catch (e) { swallow("pipe undo at host", e); }
			} else if (msg.k === "pipeRestore") {
				// client pipe undo: restore snapshots (the game's function recreates the pipes and connections itself)
				try {
					const P = ST.FH && ST.FH.pipes;
					if (P && typeof P.restoreSnapshots === "function" && msg.s && msg.s.length) {
						P.restoreSnapshots(state, msg.s);
						if (lim("pipeRestRx", 200, 600000)) log("HOST: pipe undo from client — restoring " + msg.s.length);
					} else log("HOST: missing FH.pipes.restoreSnapshots — pipe restore not handled");
				} catch (e) { swallow("pipe restore at host", e); }
			} else if (msg.k === "delSel") {
				// We replay BOTH game calls, in the same order. We don't set _applyingNet:
				// removal broadcasting sits on the "structures:removed" event, and pipes are caught by a watcher
				// — both paths must fire normally, as if the host itself were removing them.
				let nR = 0, nS = 0;
				try {
					const P = ST.FH && ST.FH.pipes;
					if (msg.p && msg.p.length && P && typeof P.removeAtCells === "function") { P.removeAtCells(state, msg.p, { playSound: false }); nR = msg.p.length; }
					else if (msg.p && msg.p.length) log("HOST: missing FH.pipes.removeAtCells — pipes from Backspace not removed");
				} catch (e) { swallow("Backspace pipes", e); }
				try {
					if (msg.s && msg.s.length && msg.a && msg.b && typeof ST._areaL === "function") {
						ST._areaL(state, msg.a, msg.b, { removeCells: true, playSound: false, onlyPositions: msg.s });
						nS = msg.s.length;
					} else if (msg.s && msg.s.length) log("HOST: missing _areaL or selection bounds — structures from Backspace not removed");
				} catch (e) { swallow("Backspace structures", e); }
				if (lim("delSelRx", 30)) log("HOST Backspace od " + fromId + ": pipes " + nR + ", structures " + nS);
			} else if (msg.k === "pipeRun") {
				// client pipe drag — we replay it with the game's functions AFTER the placeN batch
				// has placed the pipes themselves (the channel is ordered, so they're already here)
				ST._applyingNet = true;
				try { pipeRunHost(state, msg.s, msg.e); } finally { ST._applyingNet = false; }
			} else if (msg.k === "pd") {
				// client pipe connections: we apply them locally, and our own watcher broadcasts them further
				ST._applyingNet = true;
				let n = 0;
				try { n = applyPipeData(state, msg.list); } finally { ST._applyingNet = false; }
				// we broadcast further: the other players need to see the same thing, while the packet's author will get
				// their own values back and nothing will change for them (the watcher's base already has them)
				if (n) net.send({ t: "st", k: "pd", list: msg.list });
				if (n && lim("pdRx", 20)) log("HOST: pipe links from client — " + n + " pcs.");
			} else if (msg.k === "build") {
				ST._applyingNet = true;
				try { for (const s of msg.list) buildOne(state, s); } finally { ST._applyingNet = false; }
				net.send({ t: "st", k: "add", list: msg.list }); // confirm to the remaining clients
			} else if (msg.k === "orphanQ") {
				// ST-FIX: client reports red foundation tiles with no structure. We check locally:
				// there is a structure -> send it over (their copy got lost), there isn't -> let them clean up the tile.
				const cells = Array.isArray(msg.cells) ? msg.cells.slice(0, 2000) : [];   // ST-FIX: it used to be 500 — with a bigger area the convergence took forever
				const SAo = structNs();
				const addList = [], clean = [], seenK = new Set();
				let pipeSkip = 0;
				for (const c of cells) {
					if (!Array.isArray(c)) continue;
					const cx = c[0] | 0, cy = c[1] | 0;
					if (hasPipeAt(state, cx, cy)) { pipeSkip++; continue; }   // PIPE present here — we do NOT allow cleanup
					let st2 = null; try { st2 = SAo && SAo.getAtCell ? SAo.getAtCell(state, cx, cy) : null; } catch (e) { swallow("act:" + msg.k, e); }
					if (st2) { const k2 = structKey(st2); if (!seenK.has(k2)) { seenK.add(k2); addList.push(slimStruct(st2)); } }
					else clean.push([cx, cy]);
				}
				if (addList.length) net.send({ t: "st", k: "add", list: addList }, fromId);
				if (clean.length) {
					net.send({ t: "orphanClean", cells: clean }, fromId);
					// ST-FIX: since I ALSO don't have a structure there, my own foundation tile is junk.
					// Previously the host only gave permission, but kept the red block locally — and the mirror
					// restored it to the client right after they cleaned it up. We clean up authoritatively.
					try {
						const TRh = ST.FH && ST.FH.terrains;
						if (TRh && TRh.removeAt) {
							ST._applyingNet = true;
							try {
								for (const c of clean) {
									for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) TRh.removeAt(state, c[0] + dx, c[1] + dy);
								}
							} finally { ST._applyingNet = false; }
							for (const c of clean) markUrgent(state, c[0] | 0, c[1] | 0, 0);
							log("HOST: cleaning up on my side " + clean.length + " orphaned foundation blocks");
						}
					} catch (e) { log("cleanup at host error:", e && e.message); }
				}
				log("ORPHAN-Q od " + fromId + ": " + cells.length + " cells — my structures: " + addList.length + ", to clean up: " + clean.length + (pipeSkip ? ", skipped PIPES: " + pipeSkip : ""));
			} else if (msg.k === "demolish") {
				// Resolve the client's targets on the host and snapshot their true occupied bounds before
				// removeAt destroys the shape information needed to clean orphan foundation terrain.
				const SA = structNs(), actual = [], bounds = [], seen = new Set();
				for (const s of (Array.isArray(msg.list) ? msg.list : [])) {
					if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
					let st = null; try { st = SA && SA.getAtCell(state, s.x, s.y); } catch (e) { swallow("act:" + msg.k, e); }
					if (!st || seen.has(structKey(st))) continue;
					seen.add(structKey(st)); actual.push(slimStruct(st));
					const b = structureBounds(state, SA, st, s.x, s.y); if (b) bounds.push(b);
				}
				// 0.9.228: THE HOST ALSO REMEMBERS COLORS. The client replays after Ctrl+Z from its OWN mirror, and there
				// the structure may not have a color (colors have only traveled over the network since 0.9.225, so older
				// blocks in the world don't have them). The host, however, knows the color for certain — it's the one that held it.
				// We remember it before removal and hand it back when replaying from an undo.
				try {
					if (!ST._hostColMem) ST._hostColMem = new Map();
					const tKol = performance.now();
					for (const a2 of actual) if (a2 && a2.c != null) ST._hostColMem.set((a2.x | 0) + "," + (a2.y | 0), { c: a2.c, t: tKol });
					if (ST._hostColMem.size > 400000) ST._hostColMem.clear();
				} catch (e) { swallow("act:demolish", e); }
				log("HOST demolish: request for " + ((msg.list||[]).length) + " structures, found locally " + actual.length + (actual.length ? "" : " — NOTHING to remove (coordinates not matching?)"));
				ST._applyingNet = true;
				// 0.9.221: the same path as when moving — one game call instead of N.
				const __tdem = performance.now();
				let __demHurt = false;
				try { __demHurt = removeMany(state, actual).hurt; } finally { ST._applyingNet = false; }
				if (actual.length > 200) log("HOST demolish: taken down " + actual.length + " w " + Math.round(performance.now() - __tdem)
					+ " ms (" + (__demHurt ? "in bulk" : "one by one") + ")");
				// ST-FIX: in batches of 300 — 2000 removals in one message froze the client's frame
				for (let i = 0; i < actual.length; i += 300) net.send({ t: "st", k: "rm", list: actual.slice(i, i + 300) });
				// 0.9.208: the "finisher" after demolition deletes EVERY live structure in the demolished rectangle, because
				// it treats it as a leftover. On undo right after removals, REBUILDS come in over the
				// same area — and it was deleting those (in the log: "game skipped 1117 structures" right after placeN).
				// Undo sends the EXACT list of positions, not a rectangle, so there's nothing for the finisher to catch there.
				if (msg.u) { markDemolTerrainUrgent(bounds); log("HOST demolish (undo): terrain urgent, WITHOUT finishing"); }
				else armDemolCleanup(bounds);
			} else if (msg.k === "upg") {
				// client upgrade purchase (shared pool): set the level + deduct the cost authoritatively
				ST._applyingNet = true;
				try {
					const u = state.store.upgrades && state.store.upgrades[msg.it] && state.store.upgrades[msg.it][msg.ug];
					if (u) {
						if (typeof msg.lv === "number" && msg.lv > (u.level || 0)) { u.availableLevel = msg.lv; u.level = msg.lv; }
						deductCosts(state, msg.cost);
						try { ST.FH.events.emit(state, "upgrade:purchased", { itemId: msg.it, upgradeId: msg.ug, level: msg.lv }); } catch (e) { swallow("act:" + msg.k, e); }
						log("HOST: client upgrade", msg.it + "." + msg.ug, "→ lvl", msg.lv);
					} else log("HOST: client upgrade UNKNOWN:", msg.it, msg.ug);
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "tech") {
				ST._applyingNet = true;
				try {
					if (state.store.player && state.store.player.tech && !state.store.player.tech[msg.id]) {
						// FULL "pay" unlock: the game itself checks the requirements and AUTHORITATIVELY deducts the cost from
						// the shared pool (without our own deductCosts — a double charge/missing gold = refusal, fix 0.9.71).
						const real = techUnlock(state, msg.id, "pay");
						if (real === true) {
							state.store.player.tech[msg.id] = true; // unlockTech doesn't set the node's flag → the tech tree showed "not purchased" (Warlow: double purchase)
							log("HOST: client tech unlocked:", msg.id, "(REAL unlockTech, cost deducted by game)");
						} else if (real === null) {
							deductCosts(state, msg.cost);
							state.store.player.tech[msg.id] = true;
							try { ST.FH.events.emit(state, "tech:unlocked", { techId: msg.id, suppressMusic: true }); } catch (e) { swallow("act:" + msg.k, e); }
							log("HOST: client tech:", msg.id, "(FALLBACK flag — patch _techMod does not match this game build!)");
						} else {
							// the game refused (requirements/tutorial/missing resources): we do NOT set the flag (otherwise "researched, but
							// can't build" forever) and we send the client a NAK → it reverts its own local flag and can try again.
							log("HOST: game REFUSED client tech:", msg.id, "→ NAK to", fromId); // fix 0.9.72: it used to be `from` (ReferenceError → the NAK never went out)
							try { net.send({ t: "tech-nak", id: msg.id }, fromId); } catch (e) { swallow("act:" + msg.k, e); }
						}
					} else if (state.store.player && state.store.player.tech && state.store.player.tech[msg.id]) {
						log("HOST: client tech already unlocked (ignoring):", msg.id);
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "story") {
				// client story step: append to storyProgression.completedSteps (idempotently) + re-emit
				ST._applyingNet = true;
				try {
					const ens = (ST.FH.storage && ST.FH.storage.ensure) || findApi("ensure", ["storage"]);
					if (ens) {
						const sp = ens(state, "storyProgression");
						const arrS = sp.completedSteps || [];
						if (!arrS.includes(msg.id)) {
							arrS.push(msg.id); sp.completedSteps = arrS;
							try { ST.FH.events.emit(state, "story:stepCompleted", { stepId: msg.id }); } catch (e) { swallow("act:" + msg.k, e); }
							log("HOST: client story step:", msg.id);
						}
					} else log("ERROR story: missing FH.storage.ensure");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "collect") {
				// client critter collection: found/available + tickets for the FIRST catch (same as in the game)
				ST._applyingNet = true;
				try {
					// 0.9.159: a creature caught by the Herder (capturing via entCap) already closes the host's OWN tick
					// (Dp: available/found) — a collect from the client would be a SECOND count. We ignore it.
					try {
						const EN0 = ST.FH.entities;
						if (msg.eid != null && EN0 && EN0.getAll) {
							const ce0 = (EN0.getAll(state) || []).find((en0) => en0 && en0.id === msg.eid);
							if (ce0 && ce0.capturing) { log("HOST: collect ignored (id " + msg.eid + " caught by Wrangler)"); ST._applyingNet = false; return; }
						}
					} catch (e0) {}
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
					try { ST.FH.events.emit(state, "entity:collected", { typeId: msg.ty }); } catch (e) { swallow("act:" + msg.k, e); }
					// remove the entity from the host's map (no official remove — emulated: splice from the LIVE getAll list
					// + hide the sprite via getSprite + turn off the light). Without this the critter hung around until the 2nd collection.
					try {
						const EN = ST.FH.entities;
						if (msg.eid != null && EN && EN.getAll) {
							const listE = EN.getAll(state);
							const idxE = listE.findIndex((en) => en && en.id === msg.eid);
							if (idxE >= 0) {
								const en = listE[idxE];
								try { if (en.lightIndex !== undefined && ST.FH.effects && ST.FH.effects.removeLight) { ST.FH.effects.removeLight(state, en.lightIndex); en.lightIndex = undefined; } } catch (e) { swallow("act:" + msg.k, e); }
								try { const spr = EN.getSprite && EN.getSprite(state, en.id); if (spr) { spr.renderable = false; spr.visible = false; } } catch (e) { swallow("act:" + msg.k, e); }
								listE.splice(idxE, 1);
							}
						}
					} catch (e) { swallow("act:" + msg.k, e); }
					log("HOST: client critter collected:", msg.ty, first ? "(FIRST — tickets!)" : "");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "sig") {
				// client signal changes: carry them out via FH.signals.link/unlink (authoritatively)
				ST._applyingNet = true;
				try {
					const SG = ST.FH.signals;
					if (SG && SG.link && SG.unlink) {
						for (const c of msg.ch || []) {
							try { if (c.a === "link") SG.link(state, c.f, c.t); else if (c.a === "unlink") SG.unlink(state, c.f, c.t); } catch (e) { swallow("act:" + msg.k, e); }
						}
						try { ST.FH.events.emit(state, "signals:userChanged", { changes: (msg.ch || []).map((c) => ({ action: c.a, from: c.f, to: c.t })) }); } catch (e) { swallow("act:" + msg.k, e); }
						log("HOST: client signals:", (msg.ch || []).length, "changes");
					} else log("ERROR sig: missing FH.signals.link/unlink — keys:", SG ? Object.keys(SG).join(",") : "missing ns");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "sbtn") {
				ST._applyingNet = true;
				try {
					const SA2 = structNs();
					const stc = SA2 && SA2.getAtCell(state, msg.x, msg.y);
					if (stc) {
						stc.data = Object.assign({}, stc.data || {}, { on: !!msg.on });
						try { if (ST.FH.signals && ST.FH.signals.setAll) ST.FH.signals.setAll(state, { x: msg.x, y: msg.y }, !!msg.on); } catch (e) { swallow("act:" + msg.k, e); }
						try { ST.FH.events.emit(state, "signalButton:pressed", { structure: stc }); } catch (e) { swallow("act:" + msg.k, e); }
						log("HOST: client signal button @", msg.x, msg.y, "→", msg.on);
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "paste") {
				// client blueprint paste: build everything authoritatively + replay signal links
				ST._applyingNet = true;
				try {
					let ok = 0;
					for (const s of msg.list || []) if (buildOne(state, s, true, true)) ok++;
					if (msg.links && ST.FH.signals && ST.FH.signals.link) {
						for (const l of msg.links) { try { if (l && l.from && l.to) ST.FH.signals.link(state, l.from, l.to); } catch (e) { swallow("act:" + msg.k, e); } }
					}
					net.send({ t: "st", k: "add", list: msg.list });
					log("HOST: client paste —", ok + "/" + (msg.list || []).length, "structures");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "sdata") {
				// machine configuration changed by the client (filters/priorities/UI settings)
				ST._applyingNet = true;
				try {
					const SA3 = structNs();
					const ex = SA3 && SA3.getAtCell(state, msg.x, msg.y);
					if (ex && ex.type === msg.type) {
						ex.data = msg.data;
						if (msg.f !== undefined) ex.filter = msg.f; // 0.9.142: client's filter
						if (SA3.update) SA3.update(state, ex, { propagateToWorkers: true });
						try { dataSeenSet(structKey(ex), ex); } catch (e) { swallow("act:" + msg.k, e); }
						try { if (ST.peers.size > 1) net.send({ t: "st", k: "add", list: [slimStruct(ex)] }); } catch (e) { swallow("act:" + msg.k, e); } // the remaining clients immediately
						log("HOST: machine config from client:", msg.type, "@", msg.x, msg.y, msg.f !== undefined ? "(+filter)" : "");
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "aug") {
				// augment choice by the client: the host takes over the whole object (nodes/pendingChoice/sockets);
				// stream mods will spread the state to everyone (also closes the overlay on the client's side)
				ST._applyingNet = true;
				try {
					if (msg.a && typeof msg.a === "object") {
						state.store.mods = state.store.mods || {};
						// 0.9.159 (MaxMasterB): we do NOT take over the object as a whole. When both players have the
						// choice screen open (a shared pendingChoice), a full assign wiped out the host's open popup
						// (pendingChoice=false from the client) and reverted the host's freshly chosen nodes with the client's old copy.
						// Merge: nodes/disabledNodes = union, levels = max, booleans = OR, pendingChoice
						// the host's only turns off locally (the host's choice); from the outside it can only be TURNED ON.
						const ha = (state.store.mods.augments = state.store.mods.augments || {});
						for (const k6 in msg.a) {
							const v6 = msg.a[k6];
							if (k6 === "nodes" || k6 === "disabledNodes") { ha[k6] = Object.assign({}, ha[k6] || {}, v6 || {}); }
							else if (k6 === "pendingChoice") { ha.pendingChoice = !!ha.pendingChoice || !!v6; }
							else if (k6 === "viewMode") { /* player UI flag — we don't touch the host */ }
							else if (typeof v6 === "number" && typeof ha[k6] === "number") { ha[k6] = Math.max(ha[k6], v6); }
							else if (typeof v6 === "boolean") { ha[k6] = !!ha[k6] || v6; }
							else ha[k6] = v6;
						}
						try { ST.FH.ui && ST.FH.ui.overlays && ST.FH.ui.overlays.update && ST.FH.ui.overlays.update(state, "global"); } catch (e) { swallow("act:" + msg.k, e); }
						log("HOST: client augments merged (selection from augments screen)");
					}
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "pipeRm") {
				// client pipe demolition: we call the game's REAL function (Zn from the demolish module, exported by the patch)
				ST._applyingNet = true;
				try {
					if (typeof ST._pipeZn === "function") { ST._pipeZn(state, { x: msg.x0, y: msg.y0 }, { x: msg.x1, y: msg.y1 }); log("HOST: client pipes demolished during retry"); }
					else log("ERROR pipeRm: missing _pipeZn (patch 'demolish module exports' not applied?)");
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "vac") {
				hostHarvestVacuum(msg, fromId);
			} else if (msg.k === "entCap") {
				// client Herder: catching is authoritative on the host (ids match — the creature list flows
				// from the host in res.st). Finalization will count it in the SHARED collection (store.creatures — synced).
				ST._applyingNet = true;
				try {
					if (ST.FH.entities && ST.FH.entities.startCapture) ST.FH.entities.startCapture(state, msg.id);
					// the attraction target = the PAWN's position doing the catching (the patch bundle reads __capX/__capY) —
					// without this a creature caught by the client visually flew to the HOST.
					const pr2 = ST.peers.get(fromId);   // 0.9.218: it used to be "from" — a variable that does NOT EXIST in this function
					if (pr2 && ST.FH.entities && ST.FH.entities.getAll) {
						for (const c3 of (ST.FH.entities.getAll(state) || [])) if (c3 && c3.id === msg.id) { c3.__capX = pr2.x; c3.__capY = pr2.y; break; }
					}
				} catch (e) { swallow("act:" + msg.k, e); }
				ST._applyingNet = false;
				if (lim("capDiag", 20)) log("HOST: client entCap, id=" + msg.id);
			} else if (msg.k === "entSp") {
				// client releasing a creature: spawn + playerReleased + decrementing the SHARED
				// collection's counter (authoritatively; the client already decremented it cosmetically on its side — the st sync will reconcile it).
				ST._applyingNet = true;
				ST._spN = (ST._spN || 0) + 1; // EVERY entry into entSp (diagnosing vanishing releases)
				try {
					if (ST.FH.entities && ST.FH.entities.spawn) {
						const sp2 = ST.FH.entities.spawn(state, msg.ty, msg.x, msg.y);
						if (!sp2) ST._spNull = (ST._spNull || 0) + 1; // spawn was refused — counter NOT decremented
						if (sp2) {
							sp2.playerReleased = true;
							const col = state.store.creatures && state.store.creatures[msg.ty];
							if (col && typeof col.available === "number") col.available = Math.max(0, col.available - 1);
							if (!ST._lastEntSp) ST._lastEntSp = new Map();
							ST._lastEntSp.set(fromId, sp2);   // 0.9.218: patrz wyzej
							if (lim("spDiag", 20)) log("HOST: client entSp, type=" + msg.ty + " id=" + sp2.id);
						}
					}
				} catch (e) { swallow("act:" + msg.k, e); }
				ST._applyingNet = false;
			} else if (msg.k === "entLn") {
				ST._applyingNet = true;
				try {
					const ents2 = ST.FH.entities;
					if (ents2 && ents2.launch) {
						let cel = null;
						// 0.9.218: it used to be "from" — a variable that does NOT EXIST in this function (the parameter is named fromId)
						if (msg.id === -1 && ST._lastEntSp) { cel = ST._lastEntSp.get(fromId) || null; ST._lastEntSp.delete(fromId); }
						if (!cel && ents2.getAll) { const all2 = ents2.getAll(state) || []; for (const cr2 of all2) if (cr2 && cr2.id === msg.id) { cel = cr2; break; } }
						if (cel) ents2.launch(state, cel, msg.a, msg.sp);
					}
				} catch (e) { swallow("act:" + msg.k, e); }
				ST._applyingNet = false;
			} else if (msg.k === "vacrel") {
				// client tank overflow: creation as in vanilla — via the idle queue, with velocity.
				// Refusals (outside the world / no zone authorization) come back as vacrelres and the client returns them to the tank.
				const el = ST.FH.elements, c = msg.c || [], k = msg.et | 0;
				const mut = ST.FH.world && ST.FH.world.mutateCellWhenIdle;
				const W = state.store.world.size.width, H = state.store.world.size.height;
				const canGrab = ST.FH.authorization && ST.FH.authorization.canGrab;
				let refused = 0;
				ST._applyingNet = true;
				try {
					for (let i = 0; i + 3 < c.length; i += 4) {
						const x = c[i], y = c[i + 1], v = { x: c[i + 2], y: c[i + 3] };
						if (!(k > 0) || !(x >= 0 && y >= 0 && x < W && y < H)) { refused++; continue; }
						try { if (canGrab && !canGrab(state, x, y)) { refused++; continue; } } catch (e) { swallow("act:" + msg.k, e); }
						const mk = (st) => { try { if (el && el.createAt) el.createAt(st, x, y, k, { particle: { velocity: v } }); } catch (e) { swallow("act:" + msg.k, e); } };
						try { if (mut) mut(state, x, y, mk); else mk(state); } catch (e) { swallow("act:" + msg.k, e); }
						markCellDirty(state, x, y);
					}
				} finally { ST._applyingNet = false; }
				if (refused) { try { net.send({ t: "vacrelres", et: k, n: refused }, fromId); } catch (e) { swallow("act:" + msg.k, e); } }
				if (!ST._vacRelLogged) { ST._vacRelLogged = true; log("HOST: client vacuum spill,", c.length / 4, "pcs., denials:", refused); }
			} else if (msg.k === "grabH") {
				hostHarvestGrab(msg, fromId);
			} else if (msg.k === "drone") {
				// client deployed a drone → add it authoritatively to the host's store.drones (its sim will handle it)
				const d = msg.d;
				if (d && d.id != null) {
					const arr = state.store.drones || (state.store.drones = []);
					// id collision (the client and host each have their OWN nextId counters!) → assign a free id instead of silently dropping it
					if (arr.some((x) => x && x.id === d.id)) {
						let mx = 0; for (const x of arr) if (x && x.id > mx) mx = x.id;
						d.id = mx + 1;
					}
					arr.push(d);
					if (lim("drHDiag", 20)) log("HOST: client drone added", d.type, "@", d.x, d.y, "id=" + d.id, "(drones=" + arr.length + ")");
				}
			} else if (msg.k === "proj") {
				// client fired a weapon → add the projectile to the host's store.projectiles → its sim simulates the flight+explosion
				const p = msg.p;
				if (p) { const arr = state.store.projectiles || (state.store.projectiles = []); arr.push(p); if (lim("prHDiag", 20)) log("HOST: client projectile added", p.type, "@", Math.round(p.x), Math.round(p.y), "(proj=" + arr.length + ")"); }
			} else if (msg.k === "move") {
				// 0.9.202 (CAUSE of "the client has red copies that the host doesn't have"): the client doesn't know which
				// structures fit at the target — it builds the request from ALL selected ones. The host was sending
				// back that same msg.to, so the client would also rebuild locally the ones the host
				// FAILED TO PLACE (spot occupied). This created ghosts: red (QUEUED) structures on the client
				// with no counterpart on the host — which could then be selected and moved further.
				// So we only broadcast what actually got placed.
				const built = [];
				const __tmv = performance.now();   // 0.9.218: BEFORE the try — otherwise it isn't visible in the log below
				let __tzdj = __tmv, __prof = { api: 0, book: 0 }, __hurt = false, __bprof = { build: 0, update: 0 };
				ST._applyingNet = true;
				try {
					// 0.9.220: hurt — deletion without the square filter, cleaning up the deferred list just once.
					// The profile (ST._rmProf) tells how much of this is the GAME CALL itself, and how much is our own
					// bookkeeping; without this distinction there's no way to know if there's anything to optimize on our side.
					ST._rmProf = { api: 0, book: 0 };
					__hurt = removeMany(state, msg.from).hurt;
					__prof = ST._rmProf || __prof; ST._rmProf = null;
					__tzdj = performance.now();   // 0.9.219: where the time really goes — into removal or into placement
					// 0.9.216 (CAUSE of "undo cuts out blocks nobody touched"): buildOne returning
					// something does NOT mean "I placed it". When a structure of the same type is ALREADY standing in the cell, buildOne
					// hands it back without placing anything — and when moving onto an occupied area this is the
					// most common case (a player moves a piece of wall onto another wall made of the same blocks). The host
					// then reported it as placed, the client logged it in history as MOVED,
					// and Ctrl+Z did removeAtPositions at its position — that is, it deleted someone else's untouched block.
					// So we ask the game whether the cell was occupied BEFORE we started placing (the sources are already removed).
					ST._bldProf = { build: 0, update: 0 };
					ST._bldBatch = [];
					try {
						for (const s of msg.to) { if (buildOne(state, s) && ST._bldNew) built.push(s); }
					} finally {
						const __tf = performance.now();
						flushBuildBatch(state);
						if (ST._bldProf) ST._bldProf.update += performance.now() - __tf;
					}
					__bprof = ST._bldProf || __bprof; ST._bldProf = null;
				} finally { ST._applyingNet = false; }
				net.send({ t: "st", k: "mv", from: msg.from, to: built });
				markMoveUrgent(state, msg.from, built);
				if (lim("mvHDiag", 20))
					log("HOST: transfer from client — " + msg.from.length + " taken down, " + built.length + " placed"
						+ (built.length < (msg.to || []).length ? " (" + ((msg.to || []).length - built.length) + " did not fit into target)" : "")
						+ " [" + Math.round(performance.now() - __tmv) + " ms at host: removing "
						+ Math.round(__tzdj - __tmv) + " ms (" + (__hurt ? "in bulk" : "one by one: game " + Math.round(__prof.api)
						+ " ms, bookkeeping " + Math.round(__prof.book) + " ms") + "), placing "
						+ Math.round(performance.now() - __tzdj) + " ms (build " + Math.round(__bprof.build)
						+ " ms, update " + Math.round(__bprof.update) + " ms)]");
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
				if (lim("grabPickHostDiag", 60))
					((ST._pickMiss=(ST._pickMiss||0)+1)<=5) && log("HOST grabPick @", msg.x, msg.y, "before=" + gbefore, "after=" + gafter, gbefore >= ELEMENTS_MIN && gafter === 0 ? "[OK removed]" : gafter === gbefore ? "[!! removeAt REMOVED NOTHING]" : "[after=" + gafter + "]");
			} else if (msg.k === "grabPlace") {
				if (!validElement(msg.et)) return; // protection against an old client (≤0.9.8) sending et=null → createAt crash
				ST._applyingNet = true;
				try {
					const { sim, W, H } = worldBuffers(state);
					const sim32 = sim && W ? new Uint32Array(sim.buffer, sim.byteOffset, W * H) : null;
					const inb = sim32 && msg.x >= 0 && msg.y >= 0 && msg.x < W && msg.y < H;
					const before = inb ? sim32[msg.x + msg.y * W] : -1;
					if (ST.FH.elements && ST.FH.elements.createAt) ST.FH.elements.createAt(state, msg.x, msg.y, msg.et);
					markCellDirty(state, msg.x, msg.y); // force-send the chunk via the mirror → the client gets the deferred element back (re-grab)
					const after = inb ? sim32[msg.x + msg.y * W] : -1;
					// DIAG: did createAt really place an element (after∈[MIN,MAX])? if not, we'll know why the re-grab fails
					if (lim("grabPlaceHostDiag", 60))
						log("HOST grabPlace @", msg.x, msg.y, "et=" + msg.et, "before=" + before, "after=" + after, (after >= ELEMENTS_MIN && after <= ELEMENTS_MAX) ? "[OK placé]" : "[!! nothing after createAt — lost/occupied]");
					// REFUND (closing out R5): vanilla returns the element to the tank when the cell turned out to be occupied —
					// on the client the refund callback (Lu) never fires, so the host sends the refund explicitly.
					const placed = after >= ELEMENTS_MIN && after <= ELEMENTS_MAX && after !== before;
					if (!placed) try { net.send({ t: "grabRef", et: msg.et }, fromId); } catch (e) { swallow("act:" + msg.k, e); }
				} finally { ST._applyingNet = false; }
			} else if (msg.k === "fireB") {
				// MITIGATION (Knight-HD: "client's flamethrower punches holes in foundations/the pyramid"):
				// the old replay burned EVERY cell (burnElementAt+createAt) without the vanilla guards,
				// destroying TERRAIN. Now: terrain (cellId 1..1000) = UNTOUCHABLE; empty (0) = only the flame;
				// element = only burnElementAt (ignites flammables). Knight is working on a full fix — welcome.
				const el = ST.FH.elements, fi = ST.FH.fire, c = msg.c || [];
				const shF = state.shared, simF = shF && shF.sim && shF.sim.cellIds;
				const simF32 = simF ? new Uint32Array(simF.buffer, simF.byteOffset, simF.length) : null;
				const WF = (shF && shF.mapData && shF.mapData.width) || 0;
				ST._applyingNet = true;
				try {
					// 0.9.158: q=1 → triples [x,y,o*1000]; vanilla scales the flame's lifetime: base*max(.25, 1-o/.64)
					const strideF = msg.q ? 3 : 2;
					const mutF = ST.FH.world && ST.FH.world.mutateCellWhenIdle;
					let baseDur = 0.28; try { const cf = el.getConfig && el.getConfig(RJ_FIRE); if (cf && typeof cf.duration === "number") baseDur = cf.duration; } catch (e) { swallow("act:" + msg.k, e); }
					for (let i = 0; i + strideF - 1 < c.length; i += strideF) {
						const x = c[i], y = c[i + 1];
						const oI = strideF === 3 ? (c[i + 2] | 0) / 1000 : 0;
						const cid = simF32 && WF ? simF32[x + y * WF] : 0;
						if (cid > 0 && cid < ELEMENTS_MIN) continue; // TERRAIN (foundations, rocks, the pyramid) — we don't touch it
						if (cid === 0) {
							const dur = baseDur * Math.max(0.25, 1 - oI / 0.64);
							const mk = (st2) => { try { if (el && el.createAt) el.createAt(st2, x, y, RJ_FIRE, { duration: dur }); } catch (e) { swallow("act:" + msg.k, e); } };
							try { if (mutF) mutF(state, x, y, mk); else mk(state); } catch (e) { swallow("act:" + msg.k, e); }
						}
						else { try { if (fi && fi.burnElementAt) fi.burnElementAt(state, x, y); } catch (e) { swallow("act:" + msg.k, e); } } // element → ignite (flammables catch fire, the rest stays)
					}
				} finally { ST._applyingNet = false; }
				if (!ST._fireLogged) { ST._fireLogged = true; log("HOST: client fire replayed (with terrain protection),", c.length / 2, "cells"); }
			} else if (msg.k === "shakeB") {
				// client shake: residue goes to the world (empty cells only) + the ShakeWetSand process counter
				const elS = ST.FH.elements, cS = msg.c || [];
				const mutS = ST.FH.world && ST.FH.world.mutateCellWhenIdle;
				ST._applyingNet = true;
				try {
					for (let i = 0; i + 1 < cS.length; i += 2) {
						try { if (ST.FH.factory && ST.FH.factory.recordProcess) ST.FH.factory.recordProcess(state, 0 /* ShakeWetSand */); } catch (e) {}
						// 0.9.161: via the when-idle queue like lava/ice, a bare createAt in the middle of a frame can
						// lose the race with the simulation worker (bug class fixed for cryo in 0.9.150).
						const xS = cS[i], yS = cS[i + 1];
						const mkS = (st2) => { try { if (ST.FH.world.isCellEmpty(st2, xS, yS) && elS && elS.createAt) elS.createAt(st2, xS, yS, 6 /* RJ.Residue */); } catch (e) {} };
						try { if (mutS) mutS(state, xS, yS, mkS); else mkS(state); } catch (e) {}
					}
				} finally { ST._applyingNet = false; }
				if (!ST._shakeLogged) { ST._shakeLogged = true; log("HOST: client shake replayed (residue+process),", cS.length / 2, "slots"); }
			} else if (msg.k === "volcB") {
				// 0.9.158: like vanilla — idle queue + VELOCITY ({particle:{velocity}}); a bare createAt in the middle
				// of a frame wrote the lava straight into the grid (a race with the worker, zero splash) — user: "LavaGun".
				const elV = ST.FH.elements, cV = msg.c || [];
				const mutV = ST.FH.world && ST.FH.world.mutateCellWhenIdle;
				const strideV = msg.q ? 4 : 2;
				ST._applyingNet = true;
				try {
					for (let i = 0; i + strideV - 1 < cV.length; i += strideV) {
						const x = cV[i], y = cV[i + 1];
						const v = strideV === 4 && (cV[i + 2] || cV[i + 3]) ? { x: cV[i + 2], y: cV[i + 3] } : null;
						const mk = (st2) => { try { if (ST.FH.world.isCellEmpty(st2, x, y) && elV && elV.createAt) elV.createAt(st2, x, y, 19 /* RJ.Lava */, v ? { particle: { velocity: v } } : undefined); } catch (e) {} };
						try { if (mutV) mutV(state, x, y, mk); else mk(state); } catch (e) {}
					}
				} finally { ST._applyingNet = false; }
				if (!ST._volcLogged) { ST._volcLogged = true; log("HOST: client lava replayed,", cV.length / strideV, "cells" + (msg.q ? " (idle+velocity)" : "")); }
			} else if (msg.k === "caulkB") {
				// caulk spray: element type resolved dynamically (mod-element, runtime id); empty cells only
				const elC = ST.FH.elements, cC = msg.c || [];
				let caulkTy = null;
				try { caulkTy = elC && elC.getElementTypeFromId && elC.getElementTypeFromId(state, "caulk"); } catch (e) {}
				const mutC = ST.FH.world && ST.FH.world.mutateCellWhenIdle;
				const strideC = msg.q ? 4 : 2;
				ST._applyingNet = true;
				try {
					if (caulkTy != null) for (let i = 0; i + strideC - 1 < cC.length; i += strideC) {
						const x = cC[i], y = cC[i + 1];
						const v = strideC === 4 && (cC[i + 2] || cC[i + 3]) ? { x: cC[i + 2], y: cC[i + 3] } : null;
						const mk = (st2) => { try { if (ST.FH.world.isCellEmpty(st2, x, y) && elC.createAt) elC.createAt(st2, x, y, caulkTy, v ? { particle: { velocity: v } } : undefined); } catch (e) {} };
						try { if (mutC) mutC(state, x, y, mk); else mk(state); } catch (e) {}
					}
				} finally { ST._applyingNet = false; }
				if (!ST._caulkLogged) { ST._caulkLogged = true; log("HOST: client caulk replayed,", cC.length / strideC, "cells (type=" + caulkTy + (msg.q ? ", idle+velocity" : "") + ")"); }
			} else if (msg.k === "caulkRmB") {
				// removing caulk: 1:1 with the game's logic — caulk element → elements.removeAt; terrain ONLY when
				// isPosTerrainId is 'solidite' → terrains.removeAt. No other terrain is touched.
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
				if (!ST._caulkRmLogged) { ST._caulkRmLogged = true; log("HOST: client caulk removal replayed,", cR.length / 2, "cells"); }
			} else if (msg.k === "cryoB") {
				// 0.9.150: like vanilla — via the idle queue (mutateCellWhenIdle) and WITH VELOCITY. A bare createAt
				// in the middle of a frame wrote to the grid in a race with the simulation worker: the granule vanished right after
				// creation ("despawns shortly after" — Moonbugy). q=1 → quadruples [x,y,vx,vy].
				const el = ST.FH.elements, c = msg.c || [];
				const mut = ST.FH.world && ST.FH.world.mutateCellWhenIdle;
				const stride = msg.q ? 4 : 2;
				ST._applyingNet = true;
				try {
					for (let i = 0; i + stride - 1 < c.length; i += stride) {
						const x = c[i], y = c[i + 1];
						const v = stride === 4 && (c[i + 2] || c[i + 3]) ? { x: c[i + 2], y: c[i + 3] } : null;
						const mk = (st) => { try { if (el && el.createAt) el.createAt(st, x, y, RJ_FREEZINGICE, v ? { particle: { velocity: v } } : undefined); } catch (e) {} };
						try { if (mut) mut(state, x, y, mk); else mk(state); } catch (e) {}
					}
				} finally { ST._applyingNet = false; }
				if (!ST._cryoLogged) { ST._cryoLogged = true; log("HOST: client ice replayed,", c.length / stride, "cells" + (msg.q ? " (with velocity)" : "")); }
			}
		} catch (e) { log("replay error:", msg.k, e.message); }
	}

	// looks for a nested namespace in FH (e.g. world.items) by function name
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
		// STREAMER-SAFE (MFeltmann): the ID is masked on screen — a click copies the FULL id to the clipboard
		// without displaying it (stream viewers won't be able to join the lobby from the preview).
		if (ST.net.lobbyId) { el.textContent = "Lobby ID: ●●●●●●…" + String(ST.net.lobbyId).slice(-3) + " 📋 (click = copy)"; el.style.display = "block"; }
		else el.style.display = "none";
	}
	// Local/VPN vs public address — only for the transport label in the HUD and lobby. Besides RFC1918 we also catch
	// CGNAT 100.64/10 (Tailscale) and Hamachi 25/8 and Radmin 26/8, since those are virtual networks, not the internet.
	function isLocalAddr(h) {
		const a = String(h || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
		if (!a || a === "localhost" || a.endsWith(".local") || a === "::1" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
		const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
		if (!m) return false;   // a DNS name (e.g. DuckDNS) = we treat it as internet
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
		// Relay Valve: when a packet's round trip is measured in SECONDS, that's not a "weak connection" but a throttled relay —
		// player actions sit in the same queue as world transfer, so nothing happens in the world.
		try {
			if (ST.net.transport === "steam" && ST.net.role !== "idle") {
				let worst = 0;
				for (const p of ST.peers.values()) if (p.ping != null && p.ping > worst) worst = p.ping;
				if (worst > 5000 && performance.now() - (ST._relayWarnT || 0) > 20000) {
					ST._relayWarnT = performance.now();
					setStatus(t("relay_slow", Math.round(worst / 1000)), "#f66");
					log("RELAY: RTT", Math.round(worst), "ms via Steam — Host recommended (Internet — direct)");
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
			// collapsed panel = a small "ST ●" pill with a dot colored by state (feedback from TCentraL: "wish I could hide it")
			'<span id="st-title-mini" style="display:none;font-weight:bold;color:#ffb454">ST <span id="st-mini-dot" style="color:#f66">●</span></span>' +
			'<span id="st-collapse" style="color:#888;font-size:14px;line-height:1">▾</span>' +
			"</div>" +
			'<div id="st-body">' +
			// ROLE BADGE: always visible, colored "am I hosting / am I connected" (user feedback:
			// "it doesn't say there whether it's hosting the game or not")
			'<div id="st-badge" style="margin:4px 0 2px;font-weight:bold;font-size:12px;color:#f66">' + t("badge_offline") + "</div>" +
			'<div id="st-status" style="margin:2px 0;color:#aaa">' + t("offline") + "</div>" +
			'<div id="st-sync" style="margin:2px 0;color:#7af;font-size:10px"></div>' +
			'<div id="st-ping" style="margin:2px 0;color:#fc7;font-size:10px"></div>' +
			'<div id="st-lobbyid" style="margin:2px 0;color:#9f9;font-size:10px;display:none"></div>' +
			// PLAYER LIST: who is in the session (nickname + mod version compatibility)
			'<div id="st-players" style="margin:3px 0;display:none;font-size:11px;line-height:1.5"></div>' +
			// CONTEXTUAL buttons — updatePanel() shows only what makes sense for the current role
			'<div id="st-buttons" style="display:flex;flex-wrap:wrap;gap:1px">' +
			'<button id="st-host">' + t("btn_host") + "</button>" +
			'<button id="st-invite" style="display:none">' + t("btn_invite") + "</button>" +
			'<button id="st-host-lan">' + t("btn_host_lan") + "</button>" +
			'<button id="st-join-lan">' + t("btn_join_lan") + "</button>" +
			'<button id="st-stop">' + t("btn_stop") + "</button>" +
			'<button id="st-send-world">' + t("btn_send_world") + "</button>" +
			'<button id="st-resync">' + t("btn_resync") + "</button>" +
			'<button id="st-join-id">' + t("btn_join_id") + "</button>" +
			// A row with an IP field for Join LAN — Electron/Chromium does NOT support window.prompt(),
			// so the address is entered here, in the panel (not via a browser dialog).
			// separate IP and PORT fields (QoL — TCentraL)
			'<div id="st-lan-row" style="display:none;margin-top:4px">' +
			'<input id="st-lan-addr" placeholder="IP" value="127.0.0.1" spellcheck="false" ' +
			'style="width:104px;background:#111;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;padding:2px 4px">' +
			'<input id="st-lan-port" placeholder="port" value="27777" spellcheck="false" maxlength="5" ' +
			'style="width:44px;margin-left:2px;background:#111;color:#ddd;border:1px solid #555;border-radius:3px;font:11px monospace;padding:2px 4px"> ' +
			'<button id="st-lan-go">' + t("btn_connect") + "</button>" +
			"</div>" +
			// team chat (the host relays between clients)
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
		updatePanel(); setInterval(updatePanel, 1000); // badge/buttons/players always up to date
		// ROLE GUARD (0.9.91): the renderer takes its role from events, so a lost/late event
		// (page reload, a race during reconnect) can leave the game convinced
		// that it's the host, even though the network knows it's the client. Effect: the gate silently drops
		// EVERY player action (grabber doesn't pick up, can't build). The network process is the source of truth — we ask it.
		setInterval(() => {
			try {
				net.status().then((st) => {
					if (!st || !st.role || st.role === ST.net.role) return;
					log("ROLE CORRECTION: game had \"" + ST.net.role + "\", network has \"" + st.role + "\" — correcting");
					ST.net.role = st.role; ST.net.transport = st.transport || ST.net.transport;
					if (st.role !== "client") { ST.wsx.everApplied = false; setClientPaused(false); }
					updatePanel(); if (ST._lobbyOpen) renderLobby(true);
				}).catch(() => {});
			} catch (e) {}
		}, 3000);
		hud.querySelector("#st-host").onclick = async () => { setStatus(t("creating_lobby")); const r = await net.hostSteam(); if (!r.ok) setStatus(t("error", r.error), "#f66"); };
		hud.querySelector("#st-invite").onclick = () => net.invite();
		hud.querySelector("#st-host-lan").onclick = async () => { const r = await net.hostWs(27777); if (!r.ok) setStatus(t("error", r.error), "#f66"); };
		// Join LAN: separate IP and PORT fields (QoL — TCentraL); window.prompt doesn't work in Electron
		const lanRow = hud.querySelector("#st-lan-row");
		const lanInput = hud.querySelector("#st-lan-addr");
		const lanPort = hud.querySelector("#st-lan-port");
		async function doJoinLan() {
			let h = (lanInput.value || "").trim();
			let p = (lanPort.value || "").trim();
			// convenience: pasting "ip:port" into the IP field splits itself automatically
			if (h.indexOf(":") >= 0) { const parts = h.split(":"); h = parts[0]; if (parts[1]) { p = parts[1]; lanPort.value = p; } lanInput.value = h; }
			if (!h) { lanInput.focus(); return; }
			const port = parseInt(p || "27777", 10);
			if (!(port > 0 && port < 65536)) { setStatus(t("error", "port?"), "#f66"); lanPort.focus(); lanPort.select(); return; }
			setStatus(t("creating_lobby"));
			const r = await net.joinWs(h, port);
			if (!r.ok) setStatus(t("error", r.error), "#f66");
			else { lanRow.style.display = "none"; lanInput.blur(); lanPort.blur(); } // hand the keyboard back to the game
		}
		// Keys typed into the fields must not reach the game (the game's keyup does NOT filter INPUT elements;
		// they bubble up to window — stopPropagation on the inputs cuts off this whole class of problem)
		for (const el2 of [lanInput, lanPort]) {
			el2.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); doJoinLan(); } });
			el2.addEventListener("keyup", (e) => e.stopPropagation());
		}
		hud.querySelector("#st-join-lan").onclick = () => {
			const showing = lanRow.style.display !== "none";
			if (!showing) { lanRow.style.display = "block"; lanInput.focus(); lanInput.select(); }
			else doJoinLan(); // second click = connect to the entered address
		};
		hud.querySelector("#st-lan-go").onclick = doJoinLan;
		// CHAT: sent via Enter/button; keys don't leak through to the game (like the LAN field)
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
		// Joining via Lobby ID from the clipboard (bypasses Steam invites — contributed by dotNine)
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
		// Collapse/expand by clicking the header — WITHOUT game keys (F9 collided with quick-load!)
		let collapsed = false;
		const body = hud.querySelector("#st-body");
		const arrow = hud.querySelector("#st-collapse");
		const setCollapsed = (c) => {
			collapsed = c; body.style.display = c ? "none" : "block"; arrow.textContent = c ? "▸" : "▾";
			// mini-pill: the collapsed panel takes up ~40px instead of the header's full width
			const full = hud.querySelector("#st-title-full"), mini = hud.querySelector("#st-title-mini");
			if (full) full.style.display = c ? "none" : "";
			if (mini) mini.style.display = c ? "" : "none";
			hud.style.minWidth = c ? "0" : "210px";
			hud.style.padding = c ? "3px 8px" : "8px 10px";
		};
		hud.querySelector("#st-head").onclick = () => setCollapsed(!collapsed);
		// Safe shortcut Ctrl+Shift+H, captured (capture) and blocked, so it does NOT reach the game
		window.addEventListener("keydown", (e) => {
			if (e.ctrlKey && e.shiftKey && e.code === "KeyH") { e.preventDefault(); e.stopImmediatePropagation(); setCollapsed(!collapsed); }
			// 0.9.193: A/B TEST WITHOUT THE CONSOLE. Ctrl+Shift+O cycles the mod overlay in a loop:
			//   0 = everything, 1 = without block highlighting, 2 = without the WHOLE mod overlay.
			// If FPS doesn't come back at 2, then the mod isn't drawing too much — and we look elsewhere.
			// 0.9.194: Ctrl+Shift+P — cycles the selection preview simplification threshold (A/B test without console)
			if (e.ctrlKey && e.shiftKey && e.code === "KeyP") {
				e.preventDefault(); e.stopImmediatePropagation();
				const seq = [500, 0, 5000];
				ST._prevThrI = ((ST._prevThrI == null ? -1 : ST._prevThrI) + 1) % seq.length;
				ST._prevThr = seq[ST._prevThrI];
				applyPreviewThreshold("klawisz");
				setStatus("Selection preview threshold: " + ST._prevThr + (ST._prevThr === 5000 ? " (game default)" : ST._prevThr === 0 ? " (always simplified)" : ""), "#fd5");
			}
		}, true);
		ST._hud = hud;
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildHud);
	else buildHud();

	// Backstop: if after 12 s the game state still hasn't been captured,
	// it means the critical hook (frame:update) didn't work → unsupported game version.
	setTimeout(() => {
		if (!ST.state) {
			log("BACKSTOP: no game state after 12s — frame hook not working (unsupported version?)");
			if (ST._hud) { setStatus(t("unsupported"), "#f66"); }
		}
	}, 12000);

	// ------------------------------------------------------------------
	// Save transfer (shared starting map)
	// ------------------------------------------------------------------
	async function sendWorld() {
		// ST-FIX (game 0.5.6, restart loop): transfer preparation is ASYNCHRONOUS
		// (FH.game.save + up to 10s waiting until the file appears on disk). Without this flag, parallel
		// calls (world-req + resync + hello within a few seconds) kept incrementing tid, while the client
		// stayed on the old one — hence the flood of "world-need for old transfer". The check MUST be
		// OUTSIDE the try/finally, otherwise a rejected call would clear the flag of the transfer in progress.
		if (ST._wtxPreparing) { log("sendWorld SKIPPED — transfer already preparing"); return; }
		try {
			if (ST.net.role === "idle") { setStatus(t("connect_first"), "#f66"); return; }
			// HOST IN MENU (report from TCentraL: Steam-join before the host loaded the map → the client loaded
			// a speculative "last save" over and over): we only send the world once the host is ACTUALLY in it —
			// auto-send will fire on its own when entering. The client gets world-wait instead of burning through the world-req limit.
			// DO NOT start a new transfer while the previous one is still pumping — interleaving packets of two
			// transfers = corrupted save on the client (fix derErste67)
			if (ST._wtx && ST._wtx.queue && ST._wtx.queue.length) {
				log("sendWorld SKIPPED — previous transfer in progress (" + ST._wtx.queue.length + " packets in the queue)");
				return;
			}
			const hostScene = ST.state && ST.state.store && ST.state.store.scene && ST.state.store.scene.active;
			if (hostScene === 1) {
				setStatus(t("host_enter_world_first"), "#fd5");
				log("sendWorld paused — host in menu; sending world-wait");
				try { net.send({ t: "world-wait" }); } catch (e) {}
				return;
			}
			ST._wtxPreparing = true; // ST-FIX: this is where the asynchronous transfer preparation begins
			const saves = await window.electron.getSaveFiles();
			if (!saves || !saves.length) { setStatus(t("no_saves"), "#f66"); return; }
			const ts = (s) => s.timestamp || s.updatedAt || s.savedAt || s.time || s.date || 0;
			saves.sort((a, b) => (ts(a) > ts(b) ? 1 : -1));
			// PROBLEM #1: the newest file on disk is NOT the world the host is playing in (an older save / a different
			// world / an autosave from hours ago). Order: (1) save the CURRENT state to a NEW file,
			// (2) the newest save of THIS worldId, (3) the old behaviour + an explicit log line.
			let save = null, tmpId = null;
			const myWidTx = ST.state && ST.state.store.meta && ST.state.store.meta.worldId;
			try {
				if (ST.FH && ST.FH.game && typeof ST.FH.game.save === "function" && ST.state) {
					tmpId = ST.FH.game.save(ST.state, "SandTogether transfer", undefined);
					for (let w = 0; tmpId && w < 40 && !save; w++) {  // wait for the file (max ~10 s)
						await new Promise((r) => setTimeout(r, 250));
						const cur = await window.electron.getSaveFiles();
						save = (cur || []).find((s2) => s2 && s2.id === tmpId) || null;
					}
					if (tmpId && !save) log("sendWorld: live-save did not appear on disk after 10 s — fallback");
				}
			} catch (e) { log("sendWorld: live-save failed (" + (e && e.message) + ") — fallback"); }
			if (!save && myWidTx) {
				const mine = saves.filter((s2) => s2 && s2.worldId === myWidTx);
				if (mine.length) { save = mine[mine.length - 1]; log("sendWorld: fallback — latest save of current world: " + save.id); }
			}
			if (!save) { save = saves[saves.length - 1]; log("sendWorld: WARNING — no save matches the current world (" + myWidTx + "), sending newest file: " + save.id); }
			setStatus(t("exporting", save.name || save.id), "#ff5");
			const t0 = performance.now();
			const res = await window.electron.exportSave(save.id);
			if (!res || !res.success) { setStatus(t("export_err", res && res.error), "#f66"); log("sendWorld: exportSave FAILED:", res && res.error); return; }
			log("sendWorld: export", save.name || save.id, "w", Math.round(performance.now() - t0), "ms");
			const bytes = new Uint8Array(res.data.data || res.data);
			if (tmpId && save.id === tmpId) { try { window.electron.deleteSave(tmpId); } catch (e) {} } // tidiness: the transfer save doesn't clutter Load Game
			const b64 = b64enc(bytes);
			const CH = 49152; // 48 KB/packet — safely under the Steam P2P limits
			const total = Math.ceil(b64.length / CH);
			const parts = new Array(total);
			for (let i = 0; i < total; i++) parts[i] = b64.substr(i * CH, CH);
			// send queue spread out over time (not a blast) + remembered for retry.
			// tid = transfer identifier (fix derErste67 "yellow half of the world"): packets of TWO transfers
			// interleaved in one reception → the client stitched together a save from two versions of the world (the host's
			// autosave between sends!) and loaded a CORRUPTED world. Now the client only accepts packets
			// of the current tid, and the host doesn't start a new transfer while the previous one is in progress (guard above).
			ST._wtxSeq = (ST._wtxSeq || 0) + 1;
			ST._wtx = { tid: ST._wtxSeq, name: save.name || save.id, parts, total, queue: [], sent: 0, sizeKB: Math.round(bytes.length / 1024) };
			for (let i = 0; i < total; i++) ST._wtx.queue.push(i);
			ST._wtxActiveT = performance.now();
			ST._wtxHold = performance.now() + 30000; // mirror silence window; it will be lifted by "resync" from the client
			net.send({ t: "world-begin", tid: ST._wtx.tid, name: ST._wtx.name, size: bytes.length, chunks: total, gen: ST._worldGen || null });
			setStatus(t("world_sent", ST._wtx.sizeKB, total), "#5f5");
			pumpWtx();
		} catch (e) { setStatus(t("export_err", e.message), "#f66"); log("sendWorld error:", e); }
		finally { ST._wtxPreparing = false; } // ST-FIX
	}

	// sends chunks in small batches, with pauses — Steam P2P doesn't drop packets when the buffer isn't clogged
	function pumpWtx() {
		const w = ST._wtx;
		if (!w) return;
		if (ST._wtxTimer) return; // already pumping
		const step = () => {
			if (!ST._wtx) { ST._wtxTimer = null; return; }
			const w = ST._wtx;
			let n = 0;
			// ST-FIX (CAUSE of the endless "Receiving world"): 4 packets every 25 ms is ~160 packets/s.
			// With 19 packets of ~36 KB each, the entire save (675 KB) was being pushed into the Steam socket in ~120 ms,
			// i.e. at a speed of ~5.7 MB/s — dozens of times faster than this link can carry
			// (measured mirror maximum: ~150 KB/s). The Steam buffer swelled, packets reached the client
			// tens of seconds late or were lost, the client would ask for the save AGAIN after 15s, the host would make a NEW
			// export with a new tid and wiped out the client's progress. Five exports in 45s, zero completed.
			// Now ONE packet per tick every 150 ms = ~240 KB/s: the whole save goes through in ~3s without clogging.
			while (w.queue.length && n < 1) {
				const i = w.queue.shift();
				net.send({ t: "world-chunk", tid: w.tid, i, data: w.parts[i] });
				w.sent++; n++;
			}
			if (n) ST._wtxActiveT = performance.now(); // ST-FIX: the mirror stays silent while the save is in flight
			if (w.queue.length) { ST._wtxTimer = setTimeout(step, 150); }
			else {
				net.send({ t: "world-end", tid: w.tid }); ST._wtxTimer = null;
				// 0.9.185 (CAUSE of the 30s dead mirror): _wtxHold only lifted "resync" from the client,
				// but the client only sends it after auto-load. When auto-load is skipped ("mirror works /
				// already auto-loaded in this session"), resync NEVER arrives and the mirror stays silent for a full 30s —
				// in the log the transfer finished at 15:42:12, yet "mirror SUSPENDED (queue 9006)" kept coming until 15:42:36.
				// After world-end we only leave a short grace period for the client's import; resync will lift it earlier anyway.
				if (ST._wtxHold && ST._wtxHold > performance.now() + 8000) ST._wtxHold = performance.now() + 8000;
			}
		};
		ST._wtxTimer = setTimeout(step, 0);
	}

	// ------------------------------------------------------------------
	// Panel: role badge + contextual buttons + player list.
	// Session state must be visible AT A GLANCE (user feedback: "the overlay doesn't show
	// any information, it doesn't say whether I'm hosting").
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
		if (miniDot) miniDot.style.color = roleColor; // status dot also on the collapsed mini-pill
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
	// Main menu: MULTIPLAYER button + fullscreen lobby.
	// The game menu is React+Tailwind in the DOM — we DO NOT touch its tree (React would
	// throw us out on re-render); our button is a separate fixed element
	// positioned via getBoundingClientRect of the real buttons.
	// ------------------------------------------------------------------
	// texts in multiple game languages (PL/EN/DE/FR/ES) — anchor for the Multiplayer button position
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
		// element found, but invisible/zero-sized (the sub-screen renders something else) = no anchor
		if (anchor) {
			const ar = (anchor.closest("button") || anchor.parentElement || anchor).getBoundingClientRect();
			if (ar.width < 5 || ar.height < 5) anchor = null;
		}
		if (anchor) ST._menuAnchorSeen = true;
		// SUBMENU (Load/Options/Mods...) — the main menu buttons DISAPPEAR from the DOM, and the fallback used to show
		// our button over the sub-screen (report from Psychospark89). If we've ever seen the anchor before,
		// its absence = submenu → we hide it. The fallback remains ONLY for unknown languages (anchor never found).
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
		// connection state visible WITHOUT opening the lobby (feedback from TCentraL: "no real way to know if
		// you're connected") — green dot and border when you're hosting / connected
		const conn = ST.net.role !== "idle";
		btn.textContent = t("mp_btn") + (conn ? "  ●" : "");
		btn.style.borderColor = conn ? "#4c8" : "rgba(255,255,255,.14)";
		btn.style.color = conn ? "#aef5c8" : "#fff";
		if (anchor) {
			const src = anchor.closest("button") || anchor.parentElement || anchor;
			const cs = getComputedStyle(src);
			ST._gameFont = cs.fontFamily || ST._gameFont; // the game's font — the lobby uses it too
			// fixed, LARGE size (user feedback: "very small, barely visible" — the Mods/Maps size was too small)
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
		i.addEventListener("keydown", (e) => e.stopPropagation()); // keystrokes don't leak through to the game
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
			log("lobby: loading last save:", save.name || save.id);
			const lr = await ST.FH.game.load(ST.state, save.id);
			if (lr && lr.success === false) throw new Error(lr.error || "load failed");
			// auto-sending the save to players will be done by the host's frame hook (auto-send when the host is in the world)
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
			// header + close
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
				// player nickname (feedback from TCentraL: on LAN everyone is "Player") — stored in localStorage,
				// broadcast via the hello protocol on join / to new peers
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
				// 0.9.79: DIRECT hosting — bypasses the Steam relay (which throttles bandwidth, ping up to seconds).
				const bDir = lbBtn(t("btn_host_direct"), t("lb_host_direct_d"), true);
				bDir.onclick = async () => {
					setStatus(t("creating_lobby"));
					try {
						ST._directMode = true;
						if (typeof net.hostDirect !== "function") { ST._directMode = false; setStatus(t("bridge_old"), "#f66"); log("hostDirect: missing in preload bridge (old installation) — auto-update/patch.js will replace the bridge"); renderLobby(true); return; }
						const r = await net.hostDirect(27777);
						if (!r || !r.ok) setStatus(t("error", (r && r.error) || "?"), "#f66");
						else {
							ST._directAddr = (r.publicIp ? r.publicIp : null); ST._directPort = r.port || 27777; ST._directUpnp = !!r.upnp;
							ST._directShown = false;
							setStatus(r.upnp ? t("direct_ready") : t("direct_no_upnp", ST._directPort), r.upnp ? "#5f5" : "#fd5");
							log("HOST DIRECT: upnp=" + r.upnp + " port=" + r.port + " ip=" + (r.publicIp ? "(hidden)" : "unknown") + (r.error ? " err=" + r.error : ""));
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
				// Join LAN: button + address fields
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
				// LOBBY: role badge + status + lobby id + invite + player list + world + disconnect
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
				// direct host address — MASKED BY DEFAULT (stream-safe), copyable without revealing it
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
					// choosing a SPECIFIC save (feedback from TCentraL: "maybe do: New map option, load map option")
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
										log("lobby: loading selected save:", sv.name || sv.id);
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
		// dynamic refresh (without a rebuild — inputs don't lose focus)
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
		// ST-FIX: the overlay canvas had the size of the game's canvas buffer, but was stretched across the whole screen —
		// on 4K (devicePixelRatio 1.75) that gave a 1.75x scale and blurry, "pixelated" text,
		// while the game's UI (DOM) was sharp. We keep the buffer at the device's FULL resolution,
		// and leave the coordinate system the same as in the game — via a context scale (_ghostScale).
		const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
		const bw = Math.max(1, Math.round(r.width * dpr)), bh = Math.max(1, Math.round(r.height * dpr));
		if (gc.width !== bw || gc.height !== bh) { gc.width = bw; gc.height = bh; }
		gc.style.left = r.left + "px"; gc.style.top = r.top + "px";
		gc.style.width = r.width + "px"; gc.style.height = r.height + "px";
		ST._ghostScale = game.width ? bw / game.width : dpr;
		return gc;
	}

	// --- per-player colors + arrow to an off-screen player (contribution by dotNine) ---
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

	// --- Player models: real sprites cloned from the game engine (contribution by dotNine) ---
	const NAMETAG_OFFSET_PX = 26; // ST-FIX: it was 46 — the nickname hung almost two character heights above the head
	const PUPPET_ANCHOR_DX = 6, PUPPET_ANCHOR_DY = 13; // anchoring correction relative to store.player.x/y (for tuning)
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
	// Cursor position in the world (the same space as player.x/y → works with worldToScreen).
	function getMouseWorld(state) {
		try { const m = state.session.input && state.session.input.mouse; const w = m && m.worldPosition; return w && typeof w.x === "number" ? { x: Math.round(w.x), y: Math.round(w.y) } : null; } catch (e) { return null; }
	}
	// ST-FIX: cursor IN CELLS. The game's tools (grabber, shovel, placing) work and draw themselves
	// on the cell grid, but we were drawing the preview around the continuous mouse position — hence the outline being "off to the side"
	// and the impression that it's bigger than it really is.
	function getMouseCell(state) {
		try { const m = state.session.input && state.session.input.mouse; const c = m && m.cellPosition; return c && typeof c.x === "number" ? { x: c.x | 0, y: c.y | 0 } : null; } catch (e) { return null; }
	}
	// ST-FEAT preview: the grabber tank's CONTENTS — not just the counter, but the actual slot layout.
	// The tank grid is spatial: v = round(sqrt(size)), mid = v>>1, index = 2 + (dx+mid) + (dy+mid)*v
	// (the same math as in clientFillGrabTank). Thanks to this, on the other player's screen the material sits
	// EXACTLY where it is for the carrier, and in the color of its own type, not the cursor's.
	function getGrabTank() {
		try {
			if (!ST._grabToolT || performance.now() - ST._grabToolT > 1000) return null;
			const tool = ST._grabTool;
			const B = tool && tool.data && tool.data.matrix;
			if (!B) return null;
			const size = tankSize(tool, B);
			const v = Math.max(1, Math.round(Math.sqrt(size))), mid = v >> 1;
			const slots = [];
			for (let i = 0; i < size && slots.length < 128; i++) {
				const ty = B[i + 2];
				if (!ty) continue;
				slots.push([(i % v) - mid, ((i / v) | 0) - mid, ty]);
			}
			return slots;
		} catch (e) { return null; }
	}
	// ST-FIX: we take the element's color FROM THE SAME PLACE THE GAME TAKES IT — session.colors.scheme.element[type].variants
	// (an [r,g,b,a] array). metaColor from the config is the color on the map/icon, not the color of the rendered cell,
	// which is why gold was coming out orange. The middle variant = the representative shade of the material.
	const ELEM_COLOR = new Map();
	function elemColor(state, ty) {
		if (ELEM_COLOR.has(ty)) return ELEM_COLOR.get(ty);
		let c = null;
		try {
			const sch = state && state.session && state.session.colors && state.session.colors.scheme;
			const def = sch && sch.element && sch.element[ty];
			const vs = def && def.variants;
			if (Array.isArray(vs) && vs.length) {
				// the game draws the grabber's contents with variant [0] — we take exactly the same one
				const v = vs[0];
				if (Array.isArray(v) && v.length >= 3) c = "rgb(" + (v[0] | 0) + "," + (v[1] | 0) + "," + (v[2] | 0) + ")";
			}
			if (!c) {
				const cfg = ST.FH && ST.FH.elements && ST.FH.elements.getConfig ? ST.FH.elements.getConfig(ty) : null;
				if (cfg && typeof cfg.metaColor === "number") c = "#" + ((cfg.metaColor >>> 0) & 0xffffff).toString(16).padStart(6, "0");
			}
			if (c) ELEM_COLOR.set(ty, c);
		} catch (e) {}
		return c;
	}
	// ST-FEAT: material/building name in the GAME'S LANGUAGE (FH.i18n.t + nameKey from the config).
	const NAME_CACHE = new Map();
	// ST-FIX: only the BASE type sits in the config table, and the flipped variants (e.g. a conveyor facing left)
	// are in it as a `variants: [{ id, angles }]` field and have NO config of their own. getConfig(variant)
	// was returning undefined, so the label fell back to the bare enum number ("1"). We build a variant -> base map.
	let VARIANT_BASE = null;
	function baseStructId(id) {
		try {
			const SA = ST.FH && ST.FH.structures;
			if (!SA || !SA.getConfig) return id;
			const c = SA.getConfig(id);
			if (c && (c.nameKey || c.displayNameKey)) return id;
			if (!VARIANT_BASE && ST.state && SA.getUnlockedTypes) {
				VARIANT_BASE = new Map();
				try {
					const types = SA.getUnlockedTypes(ST.state);
					if (types) for (const t of types) {
						const cc = SA.getConfig(t);
						if (cc && Array.isArray(cc.variants)) for (const v of cc.variants) if (v && v.id != null && v.id !== t) VARIANT_BASE.set(v.id, t);
					}
				} catch (e) {}
			}
			const b = VARIANT_BASE && VARIANT_BASE.get(id);
			return b != null ? b : id;
		} catch (e) { return id; }
	}
	function locName(kind, id) {
		const key = kind + ":" + id;
		if (NAME_CACHE.has(key)) return NAME_CACHE.get(key);
		let nm = null;
		try {
			const ns = kind === "e" ? (ST.FH && ST.FH.elements) : (ST.FH && ST.FH.structures);
			const lookId = kind === "e" ? id : baseStructId(id);
			const cfg = ns && ns.getConfig ? ns.getConfig(lookId) : null;
			const nk = cfg && (cfg.nameKey || cfg.displayNameKey);
			if (nk && ST.FH.i18n && ST.FH.i18n.t) { const v = ST.FH.i18n.t(nk); if (v && v !== nk) nm = v; }
			if (!nm && cfg && cfg.id) nm = String(cfg.id);
		} catch (e) {}
		if (nm) NAME_CACHE.set(key, nm);
		return nm;  // a miss does NOT get cached — the variant map may not be built yet
	}
	// ST-FEAT: building SHAPE from the config — both sides have the same game, so there's no point sending
	// the grid over the network: an id is enough. We draw the real outline (e.g. a conveyor isn't a square), not
	// the rectangle circumscribed on it. Offsets are computed relative to the centre of the shape, in cells.
	const SHAPE_CACHE = new Map();
	function structCells(bt) {
		if (SHAPE_CACHE.has(bt)) return SHAPE_CACHE.get(bt);
		let cells = null;
		try {
			const cfg = ST.FH && ST.FH.structures && ST.FH.structures.getConfig ? ST.FH.structures.getConfig(bt) : null;
			const sh = cfg && cfg.shape;
			if (Array.isArray(sh) && sh.length && Array.isArray(sh[0])) {
				const out = [];
				for (let y = 0; y < sh.length; y++) for (let x = 0; x < sh[y].length; x++) if (sh[y][x]) out.push([x, y]);
				if (out.length) cells = out;
			}
			// ST-FIX: most buildings DON'T HAVE their own "shape" — the game then substitutes a 4x4 cell grid
			// (w bundlu: `if (!n) { const t = vZ.Block; return { shape: [[t,t,t,t],[t,t,t,t],[t,t,t,t],[t,t,t,t]] } }`).
			// That's why the Accumulator was showing up as a single tile instead of a full block.
			if (!cells && cfg) { cells = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) cells.push([x, y]); }
		} catch (e) {}
		if (ST.FH) SHAPE_CACHE.set(bt, cells);
		return cells;
	}
	// ST-FIX: drawing using ABSOLUTE cell coordinates — exactly as the game does it
	// (getDrawPos(state, x*cellSize, y*cellSize), then a rectangle one cell wide).
	// Previously I was computing offsets relative to the "cursor center", which for every shape gave
	// a half-cell offset and drifted away from what the cursor's owner sees.
	const CELL = 4; // A.cellSize in this build
	function drawCellRects(state, ctx, ppc, cx, cy, cells, color, fillA, strokeA) {
		if (!cells || !cells.length) return null;
		let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
		ctx.save();
		ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
		for (const c of cells) {
			const gx = cx + c[0], gy = cy + c[1];
			const p0 = w2s(state, gx * CELL, gy * CELL);
			const px = Math.round(p0.x), py = Math.round(p0.y);
			const w2 = Math.max(1, Math.round(ppc)), h2 = Math.max(1, Math.round(ppc));
			if (px < minX) minX = px; if (py < minY) minY = py;
			if (px + w2 > maxX) maxX = px + w2; if (py + h2 > maxY) maxY = py + h2;
			if (fillA > 0) { ctx.globalAlpha = fillA; ctx.fillRect(px, py, w2, h2); }
			if (strokeA > 0 && w2 > 3) { ctx.globalAlpha = strokeA; ctx.strokeRect(px + 0.75, py + 0.75, w2 - 1.5, h2 - 1.5); }
		}
		ctx.restore();
		return { minX, minY, maxX, maxY };
	}
	// the outline of a rectangular area given in cells
	// 0.9.189: WHICH blocks the selection/demolition covers is computed ON THE RECEIVER's side, from their own copy of the world.
	// Previously the positions were sent over the network (hook _bpPos), which caused three problems at once: the 3000/4000 position limit
	// (with a large selection, some blocks on the other player's side would disappear), a growing packet at 30 Hz, and the cost
	// on the SELECTING player's side (the hook allocated an object per structure on EVERY frame — hence the FPS drop
	// only for them). The world is mirrored, so the receiver can answer "what's in this rectangle" themselves,
	// without any network traffic and without a limit.
	// foundation size in cells (from the shape in the config), cached per type
	const BOX_CACHE = new Map();
	function structBox(ty) {
		if (BOX_CACHE.has(ty)) return BOX_CACHE.get(ty);
		let box = { w: 4, h: 4 };
		try {
			const cfg = ST.FH && ST.FH.structures && ST.FH.structures.getConfig ? ST.FH.structures.getConfig(baseStructId(ty)) : null;
			const sh = cfg && cfg.shape;
			if (Array.isArray(sh) && sh.length && Array.isArray(sh[0])) box = { w: sh[0].length, h: sh.length };
		} catch (e) {}
		BOX_CACHE.set(ty, box);
		return box;
	}
	// 0.9.190: PATH BUILT ONCE, in world coordinates. getDrawPos is a pure translation
	// (in the bundle: Math.round(wx - camera.x)), so the same path works for every frame —
	// just translate by the camera. Previously every frame ran ctx.rect() on EVERY cell of every
	// block (16 per block): with 2000 blocks that's ~1.9 million calls per second. Hence <10 FPS for the observer
	// and a "grid of tiny squares" instead of the block's outline.
	const PIPE_BOX = { w: 4, h: 4 }; // 0.9.213: a pipe occupies one cell of the snap grid (4x4)
	function structsInRect(state, p, x0, y0, x1, y1, vw, vh, pm) {
		const tN = performance.now();
		let cx = 0, cy = 0;
		try { const cam = state.session && state.session.camera; if (cam) { cx = Math.round(cam.x); cy = Math.round(cam.y); } } catch (e) {}
		// 0.9.191: CLIPPING TO VIEW. The path in world space can't contain the whole selection,
		// because the canvas processes every rectangle anyway, even off-screen. So we only build what's visible
		// + a margin of one screen, and only rebuild once the camera moves past that margin.
		const mgX = vw || 1920, mgY = vh || 1080;
		const vx0 = Math.floor((cx - mgX) / CELL), vx1 = Math.ceil((cx + 2 * mgX) / CELL);
		const vy0 = Math.floor((cy - mgY) / CELL), vy1 = Math.ceil((cy + 2 * mgY) / CELL);
		const key = x0 + "," + y0 + "," + x1 + "," + y1 + "," + (pm ? "P" : "S");
		const inBuilt = p._rsView && cx >= p._rsView[0] && cx <= p._rsView[1] && cy >= p._rsView[2] && cy <= p._rsView[3];
		if (p._rsKey === key && p._rsPath !== undefined && inBuilt) return p._rsPath;
		if (p._rsT && tN - p._rsT < 80 && p._rsPath !== undefined) return p._rsPath;
		p._rsT = tN; p._rsKey = key;
		p._rsView = [cx - mgX / 2, cx + mgX / 2, cy - mgY / 2, cy + mgY / 2]; // rebuild after half a screen of movement
		let path = null, n = 0;
		try {
			path = new Path2D();
			// 0.9.213: in pipe mode we take store.pipes — a pipe is NOT a structure and it's not
			// in store.structures, so the observer saw regular blocks highlighted (whose being dragged
			// by their teammate wouldn't affect) and not a single pipe.
			const arr = pm ? ((state.store && state.store.pipes) || []) : (state.store.structures || []);
			const ax0 = Math.max(x0, vx0), ax1 = Math.min(x1, vx1);
			const ay0 = Math.max(y0, vy0), ay1 = Math.min(y1, vy1);
			for (let i = 0; i < arr.length; i++) {
				const s2 = arr[i]; if (!s2) continue;
				const sx = s2.x | 0, sy = s2.y | 0;
				if (sx < ax0 || sx >= ax1 || sy < ay0 || sy >= ay1) continue;
				const b = pm ? PIPE_BOX : structBox(s2.type);
				path.rect(sx * CELL, sy * CELL, b.w * CELL, b.h * CELL); // JEDEN prostokat na blok
				n++;
			}
		} catch (e) { path = null; }
		p._rsPath = n ? path : null;
		p._rsN = n;
		return p._rsPath;
	}
	// 0.9.195 (CAUSE of the FPS drop FOR THE OBSERVER — and the reason the measurement DIDN'T see it):
	// ctx.fill(path)/ctx.stroke(path) only QUEUE the work. Rasterizing a thousand rectangles happens
	// later, during frame compositing, OUTSIDE our performance.now() — hence the "overlay 0.2 ms/frame"
	// while FPS is actually tanked. The user's symptom closes the case: when the selection switches to "moving" mode,
	// we stop receiving the frame (the _bpSelRect hook sits in the mode===Selected branch), we stop drawing
	// the highlight — and FPS comes back, even though the area is the same.
	// Solution: we rasterize the highlight ONCE into our own bitmap and every frame we just redraw it.
	// The bitmap covers the view + a margin; a rebuild happens only when the camera moves past the margin or
	// the set of blocks changes. Cost per frame: one drawImage, regardless of the number of blocks.
	const SEL_MARGIN = 256;
	function drawStructPath(state, ctx, p, path, fillCol, strokeCol, vw, vh) {
		if (!path) return;
		let cx = 0, cy = 0;
		try { const cam = state.session && state.session.camera; if (cam) { cx = Math.round(cam.x); cy = Math.round(cam.y); } } catch (e) {}
		const kSc = ST._ghostScale || 1;
		const W = Math.max(64, Math.ceil(vw) + 2 * SEL_MARGIN), H = Math.max(64, Math.ceil(vh) + 2 * SEL_MARGIN);
		const needNew = !p._selCv || p._selCvW !== W || p._selCvH !== H || p._selKsc !== kSc;
		const outside = !p._selOrg || cx < p._selOrg[0] || cy < p._selOrg[1]
			|| cx > p._selOrg[0] + 2 * SEL_MARGIN || cy > p._selOrg[1] + 2 * SEL_MARGIN;
		if (needNew || p._selPath !== path || p._selCol !== strokeCol || outside) {
			try {
				if (needNew) {
					p._selCv = document.createElement("canvas");
					p._selCv.width = Math.ceil(W * kSc); p._selCv.height = Math.ceil(H * kSc);
					p._selCvW = W; p._selCvH = H; p._selKsc = kSc;
				}
				const oX = cx - SEL_MARGIN, oY = cy - SEL_MARGIN;
				const c2 = p._selCv.getContext("2d");
				c2.setTransform(1, 0, 0, 1, 0, 0);
				c2.clearRect(0, 0, p._selCv.width, p._selCv.height);
				c2.setTransform(kSc, 0, 0, kSc, 0, 0);
				c2.translate(-oX, -oY);
				c2.globalAlpha = 0.18; c2.fillStyle = fillCol; c2.fill(path);
				c2.globalAlpha = 0.95; c2.lineWidth = 1; c2.strokeStyle = strokeCol; c2.stroke(path);
				p._selPath = path; p._selCol = strokeCol; p._selOrg = [oX, oY];
				p._selBuilds = (p._selBuilds || 0) + 1;
			} catch (e) { p._selCv = null; return; }
		}
		if (!p._selCv || !p._selOrg) return;
		ctx.drawImage(p._selCv, p._selOrg[0] - cx, p._selOrg[1] - cy, p._selCvW, p._selCvH);
	}
	// release the bitmap once the highlight is no longer being drawn (we don't hold onto a dozen-plus MB unnecessarily)
	function dropSelBitmap(p) { if (p && p._selCv) { p._selCv = null; p._selPath = null; p._selOrg = null; p._selCvW = 0; } }
	function drawCellBox(state, ctx, ppc, cx, cy, w, h, color, alpha, dash) {
		const p0 = w2s(state, cx * CELL, cy * CELL);
		ctx.save();
		ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = alpha;
		if (dash) ctx.setLineDash(dash);
		ctx.strokeRect(Math.round(p0.x), Math.round(p0.y), Math.round(w * ppc), Math.round(h * ppc));
		ctx.setLineDash([]); ctx.restore();
		return { minX: p0.x, minY: p0.y, maxX: p0.x + w * ppc, maxY: p0.y + h * ppc };
	}
	// label above the area: white text with a black outline, so it's readable on any background
	function drawLabel(ctx, x, y, text) {
		if (!text) return;
		ctx.save();
		ctx.globalAlpha = 1; ctx.font = "bold 11px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
		ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.strokeText(text, x, y);
		ctx.fillStyle = "#fff"; ctx.fillText(text, x, y);
		ctx.restore();
	}
	// ST-FIX: WHAT THE PLAYER IS HOLDING. The previous version guessed the type from the hotbar slot and took `item.type`,
	// i.e. the CATEGORY (X2: 1=Weapon, 2=Building, 3=Tool, 4=Mod), not the structure id — which is why the "phantom"
	// was always on and always wrong (log PREVIEW-DIAG: bt=1 with the shovel, bt=3 with the grabber).
	// The game has its own source for this: FH.action.getSelected -> { type, id }, with the same order
	// (activeStructureType -> player.action -> hotbar slot) that the rest of the UI uses.
	function getBuildIntent(state) {
		try {
			// 0.9.190 (CAUSE of "a grid of pale squares + a Foundation label for the observer"):
			// with the Copier/Demolition tool active, getSelected can fall back to the hotbar slot and return
			// the LAST BUILDING. The game itself doesn't do this — its function h3 checks construction first:
			//   marqueeActive || customData.marqueeSelected -> Copier;  demolisherActive -> Demolisher
			// We do the same: while selecting or demolishing is in progress, there's no building intent.
			const cn0 = state.session && state.session.construction;
			const cd0 = state.session && state.session.action && state.session.action.customData;
			if (cn0 && (cn0.marqueeActive || cn0.demolisherActive)) return null;
			if (cd0 && cd0.marqueeSelected) return null;
			const sel = ST.FH && ST.FH.action && ST.FH.action.getSelected ? ST.FH.action.getSelected(state) : null;
			if (!sel || sel.type == null) return null;
			const out = { k: sel.type | 0, id: sel.id, bw: 1, bh: 1, offs: null };
			if (out.k === 2) { // X2.Building — only NOW is id the structure type
				try {
					const cfg = ST.FH.structures && ST.FH.structures.getConfig ? ST.FH.structures.getConfig(sel.id) : null;
					const sh = cfg && cfg.shape;
					if (Array.isArray(sh) && sh.length) { out.bh = sh.length; out.bw = Array.isArray(sh[0]) ? sh[0].length : 1; }
				} catch (e) {}
				// 0.9.190: we used to put customData.selectedStructures here. Those values have DIFFERENT
				// units depending on the mode (clipboard: world coordinates, marquee: offsets relative to the
				// start), while the receiver multiplied them by SNAP. We now draw the selection from the frame, and pasting
				// from the game's preview (_bpPos), so this path is redundant and was only causing harm.
				out.offs = [[0, 0]];
				if (!ST._biOk) { ST._biOk = true; log("GHOST OK: selected building id=" + JSON.stringify(sel.id) + " " + out.bw + "x" + out.bh); }
			}
			return out;
		} catch (e) { return null; }
	}
	// 0.9.198 (CAUSE of "ghosts remain in the old spot for larger structures"): a move is
	// a PAIR of events — "structures:removed" with a byMove flag (old positions) and "structures:moved" (new ones).
	// We were taking them in a FIXED order: removed first, then moved. But the game only removes structures
	// synchronously up to 50 units:
	//   if (context !== Main || d.length <= 50) { ...; return void D(e,t,n,c); }   // emit immediately
	//   const m = {..., removedPositions:[], removedStructures:[], next:null}; B ? B.next = m : j = m, B = m;
	// Above 50, the removal goes into a queue and "structures:removed" arrives AFTER "structures:moved".
	// In that case the stack of old positions was empty, the `!from.length` condition ended the handling, and the "mv" message
	// WASN'T SENT AT ALL. The new blocks still arrived via a separate path ("building:placed" -> "st add"), but the old ones
	// never disappeared. Hence the dependence on size: small moves worked, larger ones didn't.
	// Now the order doesn't matter — the pair is joined from both sides, whichever arrives second is the one that sends.
	function setMoveHalf(which, list) {
		try {
			const now2 = performance.now();
			if (ST._mvPairT && now2 - ST._mvPairT > 4000) { ST._mvHalfFrom = null; ST._mvHalfTo = null; } // porzucona polowka
			if (which === "from") ST._mvHalfFrom = list; else ST._mvHalfTo = list;
			ST._mvPairT = now2;
			const from = ST._mvHalfFrom, to = ST._mvHalfTo;
			if (!from || !to || !from.length) return;          // "to" can be empty — see below
			ST._mvHalfFrom = null; ST._mvHalfTo = null; ST._mvPairT = 0;
			if (!to.length) {
				// nothing fit — that's just a plain removal from the old spots
				if (ST.net.role === "host") { net.send({ t: "st", k: "rm", list: from }); markMoveUrgent(ST.state, from, from); }
				else net.send({ t: "act", k: "demolish", list: from });
				log("transfer: nothing fit into target — sending as deletion " + from.length + " structures");
				return;
			}
			if (ST.net.role === "host") { net.send({ t: "st", k: "mv", from, to }); markMoveUrgent(ST.state, from, to); }
			else net.send({ t: "act", k: "move", from, to });
			if (lim("mvPairDiag", 30))
				log("move: pair completed (" + from.length + " old -> " + to.length + " new), the first half to arrive was \"" + (which === "from" ? "to" : "from") + "\"");
		} catch (e) { log("setMoveHalf error:", e && e.message); }
	}
	// 0.9.197 (CAUSE of "the client moves things, and the blocks go back to their old spot"): confirming a move
	// is pushed by the game into the DEFERRED MUTATION QUEUE when multithreading is enabled:
	//   if (r.A.useMultithreading) { ...; A.action.customData = null;
	//       return void (0,U.a6)(r => { ...; (0,u.Cj)(r, e.start, e.end, {removeCells:1, byMove:1, ...}); M(...) }); }
	// FOR A PAUSED CLIENT this queue isn't executed (the same problem as with the manual drill),
	// so neither "structures:removed" nor "structures:moved" gets created — and nobody tells the host that
	// anything moved. So we assemble the report ourselves, but WITHOUT computing anything with our own formulas:
	//   source = selectedStructures[i].originalPos (written by the game when entering move mode)
	//   target = _bpPos[i] — the positions the game JUST computed and drew (the same order)
	// 0.9.203: the host knows which structures actually ended up placed — and only sends those back in "st mv". We carry this
	// knowledge into our undo history entry, splitting it exactly the way the game splits it:
	//   moved         -> have "to"; undo will TAKE them off the target and rebuild them in the old spot,
	//   failedToPlace -> only have "from", undo will ONLY rebuild it in the old spot.
	// 0.9.216: MEASUREMENT, not guessing. The report "action results arrive more slowly" can't be
	// confirmed from the existing logs — they have the mirror's throughput and backlog, but not the time from
	// a player's action to its confirmation. So we timestamp our own requests and measure how many ms it takes for
	// the matching echo from the host to come back. We match by KIND (move->mv, demolish->rm, placeN->add), so that
	// we don't count changes made by someone else toward our own timing.
	const ECHO_OF = { move: "mv", demolish: "rm", placeN: "add" };
	// 0.9.217 (REVISION 4): LOG COUNTER WITH A TIME WINDOW. The pattern used so far read
	// "lim("xxx", 20)": after the twentieth time the log went silent UNTIL THE END OF THE SESSION.
	// We were seeing the symptom the whole time — a problem that surfaced in the second hour of play left no
	// not a trace in the log, because the limit was used up in the first minutes and another test had to be requested.
	// Now the limit resets every window (5 minutes by default), and the suppressed entries are counted.
	const LIMW = new Map();
	function lim(tag, n, windowMs) {
		try {
			const now6 = performance.now(), w = windowMs || 300000;
			let s = LIMW.get(tag);
			if (!s || now6 - s.t0 >= w) {
				if (s && s.skipped) log("(" + tag + ": suppressed " + s.skipped + " similar entries in previous window)");
				s = { t0: now6, used: 0, skipped: 0 }; LIMW.set(tag, s);
			}
			if (s.used < (n || 10)) { s.used++; return true; }
			s.skipped++; return false;
		} catch (e) { return true; }
	}
	// 0.9.219 (REVISION 3.2): an EMPTY catch ON AN ACTION PATH is the most expensive kind of silence in this mod.
	// Within a single day it swallowed three bugs in a row for me: a ReferenceError in the measurement timestamp, the same bug
	// in the host's time intent, and four references to a non-existent "from" in the creature handling (this last
	// pair had been sitting here for a long time and nobody had seen it). I'm not reworking all 272 empty catches —
	// only the ones on the paths of building, demolition, moving, and undo, i.e. where silence costs
	// the player data. The log is limited by a window (lim), so the loop won't flood the file.
	function swallow(tag, e) {
		try { if (lim("swallow:" + tag, 3)) log("ERROR (" + tag + "): " + ((e && e.message) || e)); } catch (e2) {}
	}
	function stampAct(k, n) {
		try {
			if (ST.net.role !== "client") return;
			if (!ST._rttQ) ST._rttQ = [];
			ST._rttQ.push({ k: k, n: n | 0, t: performance.now() });
			while (ST._rttQ.length > 8) ST._rttQ.shift();
		} catch (e) { swallow("setMoveHalf", e); }
	}
	function noteActEcho(kind) {
		try {
			if (ST.net.role !== "client" || !ST._rttQ || !ST._rttQ.length) return;
			const now5 = performance.now();
			while (ST._rttQ.length && now5 - ST._rttQ[0].t > 5000) ST._rttQ.shift();   // too old — not ours
			const i = ST._rttQ.findIndex((a) => ECHO_OF[a.k] === kind);
			if (i < 0) return;
			const a = ST._rttQ.splice(i, 1)[0];
			const ms = Math.round(now5 - a.t);
			ST._rttSum = (ST._rttSum || 0) + ms; ST._rttN = (ST._rttN || 0) + 1;
			if (ms > (ST._rttWorst || 0)) ST._rttWorst = ms;
			if (lim("rttDiag", 60))
				log("ECHO: " + a.k + " x" + a.n + " confirmed after " + ms + " ms (average "
					+ Math.round(ST._rttSum / ST._rttN) + " ms z " + ST._rttN + ", worst " + ST._rttWorst + " ms)");
		} catch (e) {}
	}
	function fixClientMoveUndo(msg) {
		try {
			const P = ST._mvUndoPend;
			if (!P || !P.entry || performance.now() - P.t > 5000) { ST._mvUndoPend = null; return; }
			ST._mvUndoPend = null;
			const okSet = new Set((msg.to || []).map((q) => (q.x | 0) + "," + (q.y | 0)));
			const moved = [], failed = [];
			for (const pr of P.pairs) {
				if (okSet.has((pr.to.x | 0) + "," + (pr.to.y | 0))) moved.push(pr);
				else failed.push({ from: { x: pr.from.x, y: pr.from.y }, type: pr.type, data: pr.data, filter: pr.filter, color: pr.color });
			}
			P.entry.moved = moved;
			if (failed.length) P.entry.failedToPlace = failed; else delete P.entry.failedToPlace;
			if (failed.length && lim("mvUndoDiag", 20))
				log("undo history corrected: " + moved.length + " moved, " + failed.length + " did not fit into target");
		} catch (e) { swallow("fixClientMoveUndo", e); }
	}
	function watchClientMove(state) {
		try {
			if (!isClientSync() || !ST.wsx.paused) return;
			const cd = state.session && state.session.action && state.session.action.customData;
			// 0.9.235: EVERY selection mode change in one place. The yellow frame is drawn exclusively
			// when mode===3 (Moving), so this log will show whether, after confirming a move, the game
			// returns to this mode (and when), or stays in it permanently. Without this it would still be guesswork.
			try {
				const md = cd ? cd.mode : null;
				const nz = cd && Array.isArray(cd.selectedStructures) ? cd.selectedStructures.length : 0;
				if (md !== ST._lastSelMode || (md === 3 && nz !== ST._lastSelN)) {
					if (lim("trybZazn", 40, 60000))
						log("SELECTION MODE: " + ST._lastSelMode + " -> " + md + " (selected " + nz + ")");
					ST._lastSelMode = md; ST._lastSelN = nz;
				}
			} catch (e) { swallow("watchClientMove", e); }
			const sel = cd && Array.isArray(cd.selectedStructures) ? cd.selectedStructures : null;
			const moving = !!(sel && sel.length && sel[0] && sel[0].originalPos);
			if (moving) {
				const bp = (ST._bpT && performance.now() - ST._bpT < 300 && Array.isArray(ST._bpPos)) ? ST._bpPos : null;
				if (bp && bp.length === sel.length) {
					const from = [], to = [];
					for (let i = 0; i < bp.length; i++) {
						const os = sel[i] && sel[i].originalPos, np = bp[i];
						if (!os || !np) { from.length = 0; break; }
						from.push({ type: sel[i].type, x: os.x | 0, y: os.y | 0 });
						// we carry the structure data (filters etc.) forward — otherwise after a move they would come back empty
						const t2 = slimStruct(sel[i]); t2.x = np.x | 0; t2.y = np.y | 0;
						if (np.structureType != null) t2.type = np.structureType;
						to.push(t2);
					}
					// 0.9.232 (REPORT "Ctrl+C on the client behaves like Ctrl+X"): the game keeps the mode in
					// customData.mode (enum z bundle: Unselected=0, Selected=1, Copying=2, Moving=3).
					// The guard only checked for the presence of originalPos, which COPYING also sets — so
					// copying was sent to the host as a MOVE and the originals disappeared.
					if (from.length) { ST._mvPend = { from, to }; ST._mvPendT = performance.now(); ST._mvMode = cd.mode; }
				} else if (bp && bp.length !== sel.length && !ST._mvLenLogged) {
					ST._mvLenLogged = true;
					log("transfer: positions from game " + bp.length + ", selected " + sel.length + " — not sending (mismatched count)");
				}
				return;
			}
			// customData disappeared, and a move was in progress a moment ago = the game just confirmed it
			if (ST._mvPend && ST._mvPendT && performance.now() - ST._mvPendT < 1500) {
				const mv = ST._mvPend; ST._mvPend = null; ST._mvPendT = 0;
				const tryb = ST._mvMode; ST._mvMode = undefined;
				if (tryb === 2) {   // Copying — the originals STAY in place
					try { net.send({ t: "act", k: "paste", list: mv.to, links: null }); stampAct("placeN", mv.to.length); } catch (e) { swallow("watchClientMove", e); }
					try { for (const q of mv.to) noteLocalDirty(q.x | 0, q.y | 0); } catch (e) { swallow("watchClientMove", e); }
					// undo history: copying is a PLACEMENT, so Ctrl+Z should only remove the copy
					try {
						if (ST._undoPush) {
							ST._undoPush({ type: "build", positions: mv.to.map((q) => ({ x: q.x, y: q.y })), timestamp: Date.now(), __st: 1 });
							ST._undoSeal("kopiowanie");
						}
					} catch (e) { swallow("watchClientMove", e); }
					log("CLIENT copy -> host: " + mv.to.length + " structures (originals remain)");
					return;
				}
				ST._mvSentT = performance.now();
				try { net.send({ t: "act", k: "move", from: mv.from, to: mv.to }); stampAct("move", mv.from.length); } catch (e) { swallow("watchClientMove", e); }
				try { for (const q of mv.from) noteLocalDirty(q.x | 0, q.y | 0); for (const q of mv.to) noteLocalDirty(q.x | 0, q.y | 0); } catch (e) { swallow("watchClientMove", e); }
				// 0.9.200: the game's undo history records a move in response to "structures:moved".
				// For a paused client this event never fires (deferred mutation queue), so
				// Ctrl+Z had NOTHING to undo — building and removing worked, because those events exist there.
				// We append an entry in the game's format: moved[i] = { from:{x,y}, to:{x,y}, type, data, filter }.
				try {
					const pairs = [];
					for (let i = 0; i < mv.from.length && i < mv.to.length; i++) {
						const f2 = mv.from[i], t2 = mv.to[i];
						// 0.9.226: color too — when undoing a move, the game rebuilds via
						// build(..., { copiedStructure: { data, filter, color } }) and takes it from THIS entry
						pairs.push({ from: { x: f2.x, y: f2.y }, to: { x: t2.x, y: t2.y }, type: t2.type, data: t2.data, filter: t2.f, color: t2.c });
					}
					if (pairs.length && ST._undoPush) {
						// 0.9.203: We PRELIMINARILY assume everything got placed, but we remember the entry — when the host
						// sends back "st mv" with what was actually placed, we correct it (see fixClientMoveUndo).
						// Without this, undo on the client deleted the target ENTIRELY, even where nothing had been placed:
						// the game in the "move" branch does removeAtPositions(moved.map(e => e.to)), and failedToPlace
						// only REBUILDS at the old positions, it doesn't delete anything at the target.
						const entry = { type: "move", moved: pairs.slice(), timestamp: Date.now(), __st: 1 };
						ST._undoPush(entry);
						ST._mvUndoPend = { entry: entry, pairs: pairs, t: performance.now() };
					}
				} catch (e) { swallow("watchClientMove", e); }
				log("CLIENT move -> host: " + mv.from.length + " structures");
			} else if (ST._mvPend && ST._mvPendT && performance.now() - ST._mvPendT >= 1500) { ST._mvPend = null; ST._mvPendT = 0; }
		} catch (e) { swallow("watchClientMove", e); }
	}
	// 0.9.196: which of the two "building" tools the player is holding. Since getBuildIntent for them returns
	// null (because getSelected could return the last building from the hotbar), the receiver had NOTHING to draw
	// and the player's cursor simply disappeared, until they started dragging. We take it from where the game takes it:
	// session.construction.demolisherActive / marqueeActive.
	function getConstructTool(state) {
		try {
			const cn = state.session && state.session.construction;
			if (cn && cn.demolisherActive) return 1;
			const cd = state.session && state.session.action && state.session.action.customData;
			if ((cn && cn.marqueeActive) || (cd && cd.marqueeSelected)) return 2;
		} catch (e) { swallow("watchClientMove", e); }
		return 0;
	}
	// 0.9.188: the drag rectangle of the Select tool (Copier, id 7) and Demolish (Demolisher, id 3).
	// The game draws it from session.action.customData.pos = {start,end} (WORLD coordinates, not cell) —
	// module 33418: function m() for demolition takes exactly this object. We don't calculate anything here ourselves.
	function getDragRect(state) {
		try {
			const cd = state.session && state.session.action && state.session.action.customData;
			const ps = cd && cd.pos;
			if (!ps || !ps.start || !ps.end) return null;
			if (!Number.isFinite(ps.start.x) || !Number.isFinite(ps.end.x)) return null;
			// WHICH tool — we take it directly from the game state, not from getSelected (there the tool id depends
			// on which branch of function h3/oM fires). 1 = demolition (red), 2 = selection (blue).
			const cn = state.session && state.session.construction;
			const kind = cn && cn.demolisherActive ? 1 : (cn && (cn.marqueeActive || cd.marqueeSelected) ? 2 : 0);
			if (!kind) return null;
			return [Math.round(ps.start.x), Math.round(ps.start.y), Math.round(ps.end.x), Math.round(ps.end.y), kind];
		} catch (e) { return null; }
	}
	// 0.9.194: SELECTION PREVIEW SIMPLIFICATION THRESHOLD — the GAME's own knob, not our invention.
	// In the module that draws the selection, the game does this for EVERY selected structure and on EVERY frame:
	//   Ae(...)                     — visibility test (off-screen ends immediately, so it's cheap)
	//   (0,x.Ic)(t.type)            — the structure's config
	//   (0,x.b8)(e,c.x,c.y,u,{...}) — CHECK whether something can be placed at this spot (a world query)
	//   (0,i.gJ)(...)               — draws the structure's sprite          [SKIPPED above the threshold]
	//   drawImage(build_flash4,...) — an 18x18 frame around the block          [always]
	// The threshold reads like this: selectedStructures.length > FH.config("preview:simplifyThreshold", 5000).
	// The default 5000 is too high: with 1500 blocks that's already 1500 sprites per frame. We're lowering it.
	function applyPreviewThreshold(tag) {
		try {
			const C = ST.FH && ST.FH.config;
			if (!C || typeof C.set !== "function") { log("preview threshold: FH.config.set unavailable — skipping"); return; }
			const want = ST._prevThr == null ? 500 : ST._prevThr;
			const had = (typeof C === "function") ? C("preview:simplifyThreshold", 5000) : "?";
			C.set("preview:simplifyThreshold", want);
			const now2 = (typeof C === "function") ? C("preview:simplifyThreshold", 5000) : "?";
			log("selection preview threshold (" + tag + "): was " + had + " -> setting " + want + ", read " + now2);
		} catch (e) { log("preview threshold error:", e && e.message); }
	}
	// the grid side of the grabber's tank (v x v cells) — for drawing the tool outline on another player's screen
	function grabGrid() {
		try {
			if (!ST._grabToolT || performance.now() - ST._grabToolT > 1000) return 0;
			const tool = ST._grabTool;
			const d = tool && tool.data;
			if (!d || !d.matrix) return 0;
			// ST-FIX: EXACTLY the game's pattern (function O in the grabber module):
			//   n = typeof tool.data.size === "number" ? tool.data.size : 25
			//   Array.from({ length: Math.sqrt(n) })  -> the grid side; the array length truncates to an integer
			// Previously I took tankSize(), which when data.size is missing returns the ARRAY LENGTH (allocation
			// for the maximum upgrade), so the outline came out bigger than the real tool.
			const size = (typeof d.size === "number" && d.size > 0) ? d.size : 25;
			const v = Math.floor(Math.sqrt(size));
			if (!ST._grabVLogged) {
				ST._grabVLogged = true;
				log("GRAB-DIAG: data.size=" + d.size + " matrix.len=" + d.matrix.length + " tankSize=" + tankSize(tool, d.matrix) + " -> v=" + v);
			}
			return Math.max(1, v);
		} catch (e) { return 0; }
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
	// ST-FIX (ROOT CAUSE OF WRONG SIZES): FH.rendering.getDrawPos returns a SHARED, MUTABLE object
	// (in the bundle: `ke=(e,t,n)=>(we.x=Math.round(t-cam.x),we.y=Math.round(n-cam.y),we)`), not a new point.
	// The preview code did: cur = worldToScreen(a); s1 = worldToScreen(a + 1 cell); ppc = |s1.x-cur.x|
	// — after the second call cur and s1 are the SAME object, so the difference is always 0 and ppc fell back to the emergency 6
	// instead of the real 4 px. That is why every outline was ~1.5x too large (confirmed in the log: drawPosPerCell=0).
	function w2s(state, wx, wy) { const p = worldToScreen(state, wx, wy); return { x: p.x, y: p.y }; }
	// pixels per cell: cellSize * view zoom — exactly at this scale the game draws its own overlays
	function cellPx(state) {
		let z = 1;
		try { const v = state.session && state.session.view && state.session.view.zoom; if (typeof v === "number" && v > 0) z = v; } catch (e) {}
		return CELL * z;
	}
	function peerProjectileCount(id, p) { return ST.net.role === "client" ? (ST.remoteProjectiles || []).length : (p.projectiles || []).length; }

	// ST-FEAT: our own preview — the material label in the grabber and (temporarily) a WHITE dashed outline
	// drawn with EXACTLY the same code that other players see you with. If it lines up with the game's yellow cursor,
	// the preview's geometry is correct; if not — you can see by how much and in which direction it's off.
	function drawOwnGrabLabel(state, ctx, gc) {
		try {
			if (!ctx || !gc) return;
			const mc = getMouseCell(state);
			if (!mc) return;
			const a0 = w2s(state, mc.x * CELL, mc.y * CELL);
			const ppc = cellPx(state);
			// ST-FIX: the white grabber outline was ONLY for comparison with the game's yellow outline (a diagnostic
			// for the size). The game draws its own, so ours was duplicating it.
			// ST-FEAT: the name above OUR OWN building preview — exactly as other players see it.
			// We take the positions from the same hook (_bpPos), so the label's frame sits exactly where
			// the building will actually end up, not above the cursor.
			try {
				if (ST._bpT && performance.now() - ST._bpT < 300 && Array.isArray(ST._bpPos) && ST._bpPos.length) {
					let mnX = 1e9, mxX = -1e9, mnY = 1e9, ty = null;
					for (const q5 of ST._bpPos) {
						if (!q5) continue;
						const pt5 = w2s(state, (q5.x | 0) * CELL, (q5.y | 0) * CELL);
						if (pt5.x < mnX) mnX = pt5.x;
						if (pt5.x + 4 * ppc > mxX) mxX = pt5.x + 4 * ppc;
						if (pt5.y < mnY) mnY = pt5.y;
						if (ty == null) ty = q5.structureType;
					}
					if (mnX < 1e9 && ty != null) drawLabel(ctx, (mnX + mxX) / 2, mnY - 3, locName("s", ty) || String(ty));
				}
			} catch (e) {}
			const tk = getGrabTank();
			if (!tk || !tk.length) return;
			let minY = 0; for (const q of tk) if ((q[1] | 0) < minY) minY = q[1] | 0;
			const top = w2s(state, mc.x * CELL, (mc.y + minY) * CELL);
			const nm = locName("e", tk[0][2]);
			if (nm) drawLabel(ctx, a0.x + ppc / 2, top.y - 3, nm + " ×" + tk.length);
		} catch (e) {}
	}
	function drawGhosts(state) {
		const gc = ensureGhostCanvas();
		const ctx = gc && gc.getContext("2d");
		// ST-FIX: we ALWAYS clear the canvas, even when the player list is empty. Previously the function returned
		// before clearRect, so the last drawn frame (nickname + cursor) stayed on screen forever —
		// hence the "floating in mid-air" nickname of a player who quit via alt+F4.
		const kSc = ST._ghostScale || 1;
		// ST-DIAG: a one-off dump of every number needed to settle the overlay's size
		if (!ST._scaleLogged && ST.FH && gc) {
			ST._scaleLogged = true;
			try {
				const g0 = w2s(state, 0, 0), g1 = w2s(state, CELL, 0);
				const cv = document.getElementById("canvas");
				const rr = cv ? cv.getBoundingClientRect() : null;
				log("SCALE-DIAG: drawPosPerCell=" + Math.abs(g1.x - g0.x)
					+ " zoom=" + JSON.stringify(state.session && state.session.view && state.session.view.zoom)
					+ " canvas.w=" + (cv && cv.width) + " canvas.cssW=" + (rr && Math.round(rr.width))
					+ " ghost.w=" + gc.width + " kSc=" + kSc + " dpr=" + window.devicePixelRatio);
			} catch (e) { log("SCALE-DIAG err:", e && e.message); }
		}
		// view in the GAME's COORDINATE SYSTEM (canvas pixels / scale) — for "is it on screen" tests
		const vw = gc ? gc.width / kSc : 0, vh = gc ? gc.height / kSc : 0;
		const vbox = { width: vw, height: vh };
		// 0.9.280 VIEW-DIAG (measurement only, nothing here changes what is sent).
		// The question is whether the fast lane can follow the CAMERA instead of a fixed radius around the
		// player. Everything needed is already here, but one thing was not obvious: where the zoom is applied.
		// cellPx() computes CELL * zoom, while worldToScreen returns a plain (wx - camera.x) with no zoom in
		// it, and those two cannot both be right. Rather than pick one and hope, this measures the scale
		// EMPIRICALLY: ask the game where world (0,0) lands and where one cell further lands, and the
		// difference IS the pixels per cell, whatever the renderer does internally. The same two points give
		// the camera origin by inversion, so the rectangle below holds at any zoom without assuming anything.
		if (gc && ST.FH) {
			try {
				const g0 = w2s(state, 0, 0), g1 = w2s(state, CELL, 0), g2 = w2s(state, 0, CELL);
				const ppcX = Math.abs(g1.x - g0.x), ppcY = Math.abs(g2.y - g0.y);
				if (ppcX > 0.01 && ppcY > 0.01) {
					// cell coordinate sitting at overlay pixel (0,0), and the size of the view in cells
					const c0x = -g0.x / ppcX, c0y = -g0.y / ppcY;
					const cw2 = vw / ppcX, ch2 = vh / ppcY;
					// 0.9.281: this is what the player can actually see, in cells, and it is what gets reported
					// to the host in the pos message. Measured every frame, logged rarely.
					ST._viewRect = [Math.floor(c0x), Math.floor(c0y), Math.ceil(c0x + cw2), Math.ceil(c0y + ch2)];
					ST._viewRectT = performance.now();
					// 0.9.287: the printout is gone, the rectangle stays - it is what the fast lane follows now.
					// What it said, once, is worth keeping: px/cell 4 at every zoom level (the game does NOT
					// report zoom in session.view.zoom, it resizes the overlay instead, which is why the scale is
					// measured here and not read from a field), the player at 954,529 of 1920x1088 i.e. dead
					// centre, and a screen covering 104 chunks against the 1152 of the old radius.
					if (!ST._viewOnce) {
						ST._viewOnce = true;
						log("VIEWPORT: " + Math.round(cw2) + "x" + Math.round(ch2) + " cells ("
							+ Math.round(ppcX) + " px/cell), fast lane follows it");
					}
				}
			} catch (e) { swallow("view diag", e); }
		}
		if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, gc.width, gc.height); ctx.setTransform(kSc, 0, 0, kSc, 0, 0); }
		// ST-FIX: a player who left without a clean disconnect (crash, process kill, a broken Steam session),
		// doesn't generate a "peer-disconnected" event and would hang around in ST.peers until the end of the session.
		try {
			const tNow2 = performance.now();
			for (const [id2, p2] of [...ST.peers]) {
				const last2 = Math.max(p2.lastNet || 0, p2.lastSeen || 0);
				if (last2 && tNow2 - last2 > 45000) {
					ST.peers.delete(id2); removePeerPuppet(id2); ST._greeted.delete(id2);
					log("peer " + (p2.nick || id2) + " silent for 45 s — removing from preview");
				}
			}
		} catch (e) {}
		if (!ST.peers.size) { if (ST.peerPuppets.size) removeAllPeerPuppets(); drawOwnGrabLabel(state, ctx, gc); return; }
		const now = performance.now();
		// 0.9.267: one exponential-decay alpha per rendered frame, from the REAL dt (see the puppet note below)
		const rdt = Math.min(Math.max((now - (ST._lastGhostFrameT || now)) / 1000, 0), 0.25);
		ST._lastGhostFrameT = now;
		const smoothAlpha = 1 - Math.exp(-12 * rdt);   // 12 1/s reproduces the old 0.35 per 33 ms frame
		for (const [id, p] of ST.peers) {
			const dtSince = Math.min(now - (p.tUpdate || now), 250);
			const predX = p.tx + (p.vx || 0) * dtSince, predY = p.ty + (p.vy || 0) * dtSince;
			// 0.9.267 (from STITCH's AI pass, and it is right): the pull was a fixed fraction PER FRAME, so at
			// 160 FPS the puppet crawled and after any frame hitch the next big dt yanked it across the screen.
			// The same feel, expressed as exponential decay over the REAL render dt, behaves identically at any
			// frame rate. PUPPET_SMOOTH_RATE 12 reproduces the old 0.35-per-33ms.
			p.x += (predX - p.x) * smoothAlpha; p.y += (predY - p.y) * smoothAlpha;
			const stale = now - p.lastSeen > 3000;
			const speed = Math.hypot(p.vx || 0, p.vy || 0);
			if (speed > 0.02 && p.syncedFacing == null) p.facing = (p.vx || 0) < 0 ? -1 : 1;
			const facing = (p.syncedFacing === 1 || p.syncedFacing === -1) ? p.syncedFacing : (p.facing || 1);
			const screen = w2s(state, p.x + PUPPET_ANCHOR_DX, p.y + PUPPET_ANCHOR_DY); // ST-FIX: a copy, see w2s
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
			const onScreen = gc && screen.x > -20 && screen.y > -20 && screen.x < vw + 20 && screen.y < vh + 20;
			if (ctx && gc && onScreen) {
				ctx.globalAlpha = stale ? 0.4 : 1;
				ctx.font = "10px monospace"; ctx.textAlign = "center";
				ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = 3;
				ctx.strokeText(p.nick, screen.x, screen.y - NAMETAG_OFFSET_PX);
				ctx.fillText(p.nick, screen.x, screen.y - NAMETAG_OFFSET_PX);
				ctx.globalAlpha = 1;
			} else if (ctx && gc && !stale) {
				if (!p.color) p.color = peerColor(id);
				ctx.globalAlpha = 0.85; drawOffscreenIndicator(ctx, vbox, screen, p.color, p.nick); ctx.globalAlpha = 1;
			}
		}
		if (ctx && gc) {
			// 0.9.239 (AFTER REPORT: flickering + pistol still yellow + no fire light):
			//   * flickering — the light was being recreated from scratch for every NEW position (key made from x,y), i.e.
			//     practically every frame. Now the key is the projectile's id: the light is created once and is
			//     MOVED, just like the game moves its session.lights[tracerLightIndex].
			//   * pistol — its projectile has no tint (the game draws the "bullet" texture), so there was no colour
			//     to take it from. Instead of guessing the colour, we create the game's REAL sprite on the receiver's side: the patch
			//     now exports its sprite add/remove functions and the type->sprite name map.
			//   * fire — fire projectiles have no tracer light; the game emits light for them IN FLIGHT, by calling
			//     createLight(..., {brightness:.8, duration:150, size:200, useLightZones:true}). Odtwarzamy
			//     the same call with the same cadence.
			const projKolor = (pr) => {
				if (typeof pr.t !== "number") return "#ffd54f";
				const h = (pr.t & 0xffffff).toString(16);
				return "#" + "000000".slice(h.length) + h;
			};
			const nowProj = performance.now();
			if (!ST._projLive) ST._projLive = new Map();   // klucz -> { light, spr, seen, ogienT }
			const widziane = new Set();
			let zapalone = 0;
			const FX = ST.FH && ST.FH.effects;
			const drawProj = (list, zrodlo) => {
				if (!list) return;
				for (let i = 0; i < list.length; i++) {
					const pr = list[i];
					const kl = zrodlo + ":" + (pr.i != null ? pr.i : "n" + i);
					widziane.add(kl);
					let rec = ST._projLive.get(kl);
					if (!rec) { rec = { light: null, spr: null, ogienT: 0 }; ST._projLive.set(kl, rec); }

					// 1) the game's REAL SPRITE — if the patch gave us its functions
					try {
						// 0.9.242: the sprite functions are now exported by a separate hook that fires on the startup
						// of the game module — previously they sat in the shot hook, so they only appeared after
						// their FIRST own shot, and until then other players' projectiles were a little yellow square.
						if (!rec.spr && ST._sprAdd && ST._projSprite) {
							const nazwa = ST._projSprite(pr.type);
							if (nazwa) { ST._sprAdd(state, "projectiles", nazwa, kl, pr.x, pr.y); rec.spr = 1; }
						}
						if (rec.spr) {
							// 0.9.241 (ROOT CAUSE OF "the pistol's projectile isn't visible at all"): the game's sprites live in
							// THE SCREEN. It shows both in its creating function (d.x = a - camera.x) and in its loop
							// the refresh coordinate system (r.x = n.x - camera.x). I was setting WORLD coordinates, so the sprite
							// was landing thousands of pixels off-screen — and the fallback square was no longer being drawn,
							// because the sprite formally existed. Hence "it vanished completely" instead of the old yellow pixel.
							// The game only refreshes the sprites of projectiles from ITS OWN store.projectiles, so ours
							// we have to move ourselves — exactly the same way it does.
							const sp = state.session.rendering.pixi.sprites.projectiles;
							const s2 = sp && sp[kl];
							const cam = state.session.camera;
							if (s2 && cam) { s2.x = pr.x - cam.x; s2.y = pr.y - cam.y; if (typeof pr.t === "number") s2.tint = pr.t; }
						}
					} catch (e) { swallow("projectile sprite", e); }

					// 2) a fallback square only when there is no sprite
					if (!rec.spr) {
						const s = worldToScreen(state, pr.x, pr.y);
						if (!(s.x < -20 || s.y < -20 || s.x > vw + 20 || s.y > vh + 20)) {
							ctx.fillStyle = projKolor(pr);
							ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
						}
					}

					if (!FX) continue;
					// 3) TRACER LIGHT — we create it once and move it (the same thing the game does)
					if (pr.ls) {
						try {
							if (rec.light == null && zapalone < 40) {
								const c = pr.lc;
								const r2 = FX.createLight(state, pr.x, pr.y, {
									brightness: 1, size: pr.ls, duration: -1, skipDedup: true, noopIfFull: true,
									color: c ? [c[0] / 255, c[1] / 255, c[2] / 255, 1] : [1, 0.5, 0, 1],
								});
								if (r2 && r2.index != null) { rec.light = r2.index; zapalone++; }
							} else if (rec.light != null) {
								const L = state.session.lights && state.session.lights[rec.light];
								// 0.9.240 (REPORT "the rocket's light radius is too small"): the tracer light does NOT have
								// a fixed size — the game enlarges it in flight (in the code: tracerLightGrowth
								// stretches size up to 800, and flare reflections set it to 200+25*n). On our side
								// we were creating it once, with the size from the FIRST packet, and it stayed small.
								// In 0.9.238 it looked fine precisely because the light was being recreated from scratch
								// every 50 ms — at the cost of flickering. Now there's one light, but it's updated:
								// we move it and give it the current size and brightness, just as the game does.
								if (L) {
									L.x = pr.x; L.y = pr.y;
									if (pr.ls) L.size = pr.ls;
									if (pr.lb) L.brightness = pr.lb / 100;
									L.startTimeMs = state.store.meta.time;   // we don't let it go out earlier
								}
							}
						} catch (e) { swallow("trail light", e); }
					}
					// 4) FIRE — the game emits light in flight, it doesn't keep it attached to the projectile
					// 0.9.246 (THE PROBE SETTLED IT, after three wrong guesses in a row). Measured on the shooter's
					// side and on the observer's side at the same moment:
					//     shooter:   sources 78/100, all of them [size 200, brightness 0.8, dur 2500 ms]
					//     observer:  sources  5/100, the same [size 200 ... 205], zones 5
					// So both sides call the EXACT SAME light, and yet it comes out as 78 separate sources on one side
					// and 5 on the other. The difference is made by the useLightZones flag: when a zone is occupied, the game doesn't create
					// a new source, it just tops up the existing one a little at a time (size += amount/20000 — hence
					// the crawl of 200, 201, 202, 205 in the observer's measurement). A zone is only freed when
					// ANY light standing in its place GOES OUT. For the shooter there are a lot of lights
					// and one is constantly going out, so zones keep freeing up nonstop and every emission starts a new
					// source; for the observer there are only a few lights, zones almost never free up, and the whole
					// stream of fire tops up the same five points. This isn't a matter of brightness or
					// the size of a single light, it's about THEIR NUMBER — and that's why boosting the brightness doesn't
					// dawalo.
					// So we reproduce the result, not the call: no zones and no merging by distance, meaning
					// every emission is a separate source — exactly what the measurement sees on the shooter's side.
					// noopIfFull stays, so that once the hundred fills up the game doesn't evict the player's OWN lights
					// (for the shooter it evicts its own, for us that would be robbing the observer of their
					// latarki i smug).
					if (pr.f && nowProj - rec.ogienT > 16) {
						rec.ogienT = nowProj;
						// 0.9.240 (REPORT "fire on the host's side looks dark red"): the game calls its
						// internal light function WITHOUT passing a colour, and its default colour is [1, .5, 0, 1],
						// i.e. a warm orange. The public FH.effects.createLight, however, has its OWN default
						// colour [1, 0, 0, 1] — red — and always passes it down. That's why our fire was
						// red and dark. So we now explicitly pass the colour that the game actually gets.
						// (When the client fires the fire weapon, the host sees the correct colour, because on their side the projectile flies
						// for real and the light is created by the game itself — that matches the observation.)
						try { FX.createLight(state, pr.x, pr.y, { brightness: 0.8, duration: 150, size: 200, skipDedup: true, noopIfFull: true, color: [1, 0.5, 0, 1] }); } catch (e) { swallow("fire light", e); }
					}
				}
			};
			drawProj(ST.remoteProjectiles, "r");
			for (const [pid, p] of ST.peers) drawProj(p.projectiles, "p" + pid);
			// the projectile disappeared on the sender's side -> we extinguish its light and remove the sprite (the game does the same in h(e,t))
			for (const [kl, rec] of ST._projLive) {
				if (widziane.has(kl)) continue;
				try { if (rec.light != null && FX && FX.removeLight) FX.removeLight(state, rec.light); } catch (e) { swallow("extinguishing light", e); }
				try { if (rec.spr && ST._sprDel) ST._sprDel(state, "projectiles", kl); } catch (e) { swallow("sprite removal", e); }
				ST._projLive.delete(kl);
			}
			drawOwnGrabLabel(state, ctx, gc); // ST-FEAT: our own label also for other players
		}
		// --- Action preview: what the player is about to place / where they're digging / what they're carrying ---
		// ST-FIX: everything computed in ABSOLUTE cells (mcx/mcy), just as the game does.
		if (ctx && gc) {
			const SNAP = 4; // A.snapGridCellSize — buildings snap to a grid every 4 cells
			for (const [id, p] of ST.peers) {
				if (p.mcx == null || p.mcy == null || now - p.lastSeen > 3000) continue;
				if (!p.color) p.color = peerColor(id);
				const cur = w2s(state, p.mcx * CELL, p.mcy * CELL);
				if (cur.x < -160 || cur.y < -160 || cur.x > vw + 160 || cur.y > vh + 160) continue;
				const ppc = cellPx(state);

				if (p._selCv && p._selUsed && performance.now() - p._selUsed > 3000) dropSelBitmap(p);
				const selBuilding = p.sk === 2;
				const selGrabber = p.sk === 3 && p.sid === 2;
				const selShovel = !selBuilding && !selGrabber && (p.tools || []).some((n2) => String(n2).toLowerCase().indexOf("shovel") >= 0);

				// 0.9.187 (ROOT CAUSE OF "the selection shows up somewhere else"): the preview from the game (p.bprev) was being drawn
				// ONLY under the condition "building selected" (sk===2 and bt!=null). The Select/Copy tool is
				// a TOOL (sk===3, bt===null), so the condition didn't pass and the fallback path remained
				// p.boffs, which has different units: the sender puts the structures' WORLD COORDINATES there from
				// customData.selectedStructures, and the receiver treats them as grid indices and multiplies by SNAP
				// (a2[0] + (off[0]-base[0])*SNAP). That is why the shape spread over the whole screen into a regular grid.
				// Now: when we have fresh positions STRAIGHT FROM THE GAME, we always draw them — with no guessing of units.
				const hasBprev = Array.isArray(p.bprev) && p.bprev.length && p.bprevT && performance.now() - p.bprevT < 2500;
				// 0.9.188: dragging. Exactly the game's pattern (module 5251, function Ee/$5):
				//   a = snapGridCellSize * cellSize; min = floor(min/a)*a; max = (floor(max/a)+1)*a
				// Colours also from the game (module 33418): demolition "red", selection "rgb(0, 204, 255)".
				if (Array.isArray(p.drag) && p.dragT && performance.now() - p.dragT < 400) {
					const isDem = p.drag[4] === 1, isCop = p.drag[4] === 2;
					if (isDem || isCop) {
						const A2 = SNAP * CELL;
						const i0 = Math.floor(p.drag[0] / A2), l0 = Math.floor(p.drag[2] / A2);
						const s0 = Math.floor(p.drag[1] / A2), c0 = Math.floor(p.drag[3] / A2);
						const mnx = Math.min(i0, l0) * SNAP, mxx = (Math.max(i0, l0) + 1) * SNAP;
						const mny = Math.min(s0, c0) * SNAP, mxy = (Math.max(s0, c0) + 1) * SNAP;
						const q0 = w2s(state, mnx * CELL, mny * CELL), q1 = w2s(state, mxx * CELL, mxy * CELL);
						const col = isDem ? "red" : "rgb(0, 204, 255)";
						const wdt = q1.x - q0.x, hgt = q1.y - q0.y;
						ctx.save();
						ctx.fillStyle = isDem ? "rgba(255,0,0,0.10)" : "rgba(0,204,255,0.10)";
						ctx.fillRect(q0.x, q0.y, wdt, hgt);
						ctx.lineWidth = 2; ctx.strokeStyle = col;
						// corners just like on the owner's side (the game draws exactly these while dragging)
						const kk = Math.round(0.3 * SNAP * ppc);
						ctx.beginPath();
						ctx.moveTo(q0.x, q0.y + kk); ctx.lineTo(q0.x, q0.y); ctx.lineTo(q0.x + kk, q0.y);
						ctx.moveTo(q1.x - kk, q0.y); ctx.lineTo(q1.x, q0.y); ctx.lineTo(q1.x, q0.y + kk);
						ctx.moveTo(q1.x, q1.y - kk); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q1.x - kk, q1.y);
						ctx.moveTo(q0.x + kk, q1.y); ctx.lineTo(q0.x, q1.y); ctx.lineTo(q0.x, q1.y - kk);
						ctx.stroke();
						ctx.globalAlpha = 0.5; ctx.strokeRect(q0.x, q0.y, wdt, hgt);
						ctx.restore();
						// 0.9.189: the blocks that fall within this drag — computed locally, with no limit
						drawStructPath(state, ctx, p, structsInRect(state, p, mnx, mny, mxx, mxy, vw, vh, p.pm),
							isDem ? "rgb(255,60,60)" : "rgb(0,204,255)", col, vw, vh);
						p._selUsed = performance.now();
						// without a label — the game doesn't draw one while dragging either
					}
				}
				if (Array.isArray(p.srect) && p.srectT && performance.now() - p.srectT < 500) {
					const s0 = w2s(state, (p.srect[0] | 0) * CELL, (p.srect[1] | 0) * CELL);
					const s1 = w2s(state, (p.srect[2] | 0) * CELL, (p.srect[3] | 0) * CELL);
					ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = "rgb(0, 204, 255)"; ctx.setLineDash([6, 4]);
					ctx.strokeRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y); ctx.setLineDash([]); ctx.restore();
					// 0.9.189: selected blocks — also computed locally from the frame, instead of a list of positions over the network
					drawStructPath(state, ctx, p, structsInRect(state, p, p.srect[0] | 0, p.srect[1] | 0, p.srect[2] | 0, p.srect[3] | 0, vw, vh, p.pm),
						"rgb(0,204,255)", "rgb(0, 204, 255)", vw, vh);
					p._selUsed = performance.now();
				}
				if ((selBuilding && p.bt != null && p.btT && performance.now() - p.btT < 2000) || hasBprev) {
					const cells = p.bt != null ? structCells(p.bt) : null;
					const bx = Math.floor(p.mcx / SNAP) * SNAP, by = Math.floor(p.mcy / SNAP) * SNAP;
					const offs = (Array.isArray(p.boffs) && p.boffs.length) ? p.boffs : [[0, 0]];
					const base = offs[0];
					// ST-FEAT: DRAG LINE — while dragging, the game places a row of buildings from
					// session.building.start to the cursor, every grid step. We reproduce the same thing.
					// ST-FEAT: if we have positions straight from the game — we draw exactly those (steps, variants, angles)
					if (hasBprev) {
						let bx0 = 1e9, by0 = 1e9, bx1 = -1e9;
						for (const q3 of p.bprev) {
							const gx = q3[0] | 0, gy = q3[1] | 0;
							const pt = w2s(state, gx * CELL, gy * CELL);
							if (pt.x < bx0) bx0 = pt.x; if (pt.y < by0) by0 = pt.y;
							if (pt.x + SNAP * ppc > bx1) bx1 = pt.x + SNAP * ppc;
							let drawn = false;
							// ST-FEAT: the building's REAL GRAPHICS — the game's drawing function, caught by the same
							// hook. It only works once YOU yourself have opened the building mode at least once (that's when the game
							// calls it and the hook remembers it); until then a coloured silhouette is shown instead.
							// BRIDGE: the game draws it with its own function (export _drawBridge), not with a pipe sprite
							if (q3[5] && ST._drawBridge) {
								try {
									ctx.save(); ctx.globalAlpha = 0.75;
									ST._drawBridge(state, gx, gy, q3[5] === 1 ? "horizontal" : "vertical", { ctx: ctx });
									ctx.restore(); drawn = true;
								} catch (e) { ST._drawBridge = null; try { ctx.restore(); } catch (e2) {} }
							}
							if (!drawn && ST._drawStruct && p.bprev.length <= 600) {
								try {
									ctx.save(); ctx.globalAlpha = 0.75;
									// 0.9.216: we pass the colour the same way the game does in its own gJ call.
									const so = { type: q3[2], x: gx, y: gy };
									if (q3[3]) so.color = q3[3];
									// pipe shape: the sprite number is computed by the game's function (export _pipeApi.sprite),
									// so as not to reimplement its mask -> graphic variant array ourselves
									if (q3[4] !== undefined && q3[4] !== null) {
										const API6 = ST._pipeApi;
										if (API6 && typeof API6.sprite === "function") {
											try { so.data = { pipeSpriteIndex: API6.sprite(q3[4] | 0) }; } catch (e6) { swallow("pipe preview", e6); }
										}
									}
									ST._drawStruct(state, so, { ctx: ctx, placing: true });
									ctx.restore(); drawn = true;
								} catch (e) { ST._drawStruct = null; }
							}
							if (!drawn) drawCellBox(state, ctx, ppc, gx, gy, SNAP, SNAP, p.color.body, 0.9, null);
							else drawCellBox(state, ctx, ppc, gx, gy, SNAP, SNAP, p.color.body, 0.55, null);
						}
						// ST-FIX: we draw the arrow ONLY when the game also draws it on the owner's side. The game does this
						// for conveyors and related ones (conveyorRight / conveyorRightMk2 / clearingFrameRight /
						// burnerBeltRight, conditionally filterRight) — not for every building. We take the positions and angle
						// straight from it (hook _bpArw), so guessing the direction from the drag is unnecessary.
						if (Array.isArray(p.arw) && p.arw.length === 3) {
							const side = SNAP * ppc, half = side / 2;
							const e0 = w2s(state, (p.arw[0] | 0) * CELL, (p.arw[1] | 0) * CELL);
							const ex = e0.x + half, ey = e0.y + half;          // game: endPosition + o/2
							const ang = ((p.arw[2] | 0) * Math.PI) / 180;      // game: rotation (angle+90), vertex along the angle
							const r2 = Math.max(6, half * 1.15);
							ctx.save();
							ctx.translate(ex, ey); ctx.rotate(ang);
							ctx.beginPath(); ctx.moveTo(r2, 0); ctx.lineTo(-r2 * 0.55, r2 * 0.8); ctx.lineTo(-r2 * 0.55, -r2 * 0.8); ctx.closePath();
							ctx.globalAlpha = 1; ctx.fillStyle = "#0dd30d";    // the same colour as on the owner's side
							ctx.fill();
							ctx.lineWidth = Math.max(1.5, r2 * 0.16); ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.stroke();
							ctx.restore();
						}
						const lblT = p.bt != null ? p.bt : (p.bprev[0] && p.bprev[0][2]);
						if (bx0 < 1e9 && lblT != null) drawLabel(ctx, (bx0 + bx1) / 2, by0 - 3, locName("s", lblT) || String(lblT));
						continue;
					}
					if (p.bt == null) continue; // 0.9.187: without a preview from the game and without a selected building, there's nothing to draw
					const anchors = [];
					const isRect = p.bm && (p.bm.indexOf("rectangle") === 0 || p.bm.indexOf("launcherRect") === 0);
					const isSingle = p.bm && p.bm.indexOf("single") === 0;
					if (!isSingle && p.bsx != null && p.bsy != null && (p.bsx !== bx || p.bsy !== by)) {
						const sx = Math.floor(p.bsx / SNAP) * SNAP, sy = Math.floor(p.bsy / SNAP) * SNAP;
						if (isRect) {
							// ST-FEAT: "Rectangle" mode — we fill the whole area, not just the outline
							const x0 = Math.min(sx, bx), x1 = Math.max(sx, bx);
							const y0 = Math.min(sy, by), y1 = Math.max(sy, by);
							for (let yy = y0; yy <= y1 && anchors.length < 400; yy += SNAP)
								for (let xx = x0; xx <= x1 && anchors.length < 400; xx += SNAP) anchors.push([xx, yy]);
						} else {
							const dX = bx - sx, dY = by - sy;
							if (Math.abs(dX) >= Math.abs(dY)) {
								const st = dX >= 0 ? SNAP : -SNAP, n2 = Math.min(128, Math.abs(dX) / SNAP);
								for (let i2 = 0; i2 <= n2; i2++) anchors.push([sx + i2 * st, sy]);
							} else {
								const st = dY >= 0 ? SNAP : -SNAP, n2 = Math.min(128, Math.abs(dY) / SNAP);
								for (let i2 = 0; i2 <= n2; i2++) anchors.push([sx, sy + i2 * st]);
							}
						}
					} else anchors.push([bx, by]);
					let box = null;
					for (const a2 of anchors) for (const off of offs) {
						const ox = a2[0] + (((off && off[0]) | 0) - (base[0] | 0)) * SNAP;
						const oy = a2[1] + (((off && off[1]) | 0) - (base[1] | 0)) * SNAP;
						// ST-FIX: a full, solid patch instead of a grid of empty squares — on the owner's side
						// the game shows a filled block, so an outline per cell was just confusing
						const b = cells
							? drawCellRects(state, ctx, ppc, ox, oy, cells, p.color.body, 0.55, 0)
							: drawCellBox(state, ctx, ppc, ox, oy, SNAP, SNAP, p.color.body, 0.9, null);
						if (b) { if (!box || b.minY < box.minY) box = b; drawCellBox(state, ctx, ppc, ox, oy, SNAP, SNAP, p.color.body, 0.95, null); }
					}
					if (box) drawLabel(ctx, (box.minX + box.maxX) / 2, box.minY - 3, locName("s", p.bt) || String(p.bt));
				} else if (selGrabber && p.gv > 0) {
					const v = Math.min(32, p.gv | 0), mid = Math.floor(v / 2);
					const box = drawCellBox(state, ctx, ppc, p.mcx - mid, p.mcy - mid, v, v, p.color.body, 0.85, null);
					if (Array.isArray(p.gslots) && p.gslots.length) {
						for (const q of p.gslots) {
							if (!q) continue;
							drawCellRects(state, ctx, ppc, p.mcx + (q[0] | 0), p.mcy + (q[1] | 0), [[0, 0]], elemColor(state, q[2]) || p.color.body, 0.95, 0);
						}
						const nmE = locName("e", p.gslots[0][2]);
						if (nmE && box) drawLabel(ctx, (box.minX + box.maxX) / 2, box.minY - 3, nmE + " ×" + p.gslots.length);
					}
				} else if (selShovel) {
					// ST-FIX: the anchor from the sender's session.action.point — the same spot that the game highlights
					// for the sender themselves, so the area is visible BEFORE they dig
					if (p.dax != null && p.daT && performance.now() - p.daT < 1500) {
						if (p.dcells) {
							// ST-FIX: the game only highlights the pattern's cells where there IS something to dig —
							// an empty circle pattern over air is not highlighted. We have the same world,
							// so we filter it on our side via FH.world.isCellEmpty.
							let solid = p.dcells;
							try {
								const W = ST.FH && ST.FH.world;
								if (W && typeof W.isCellEmpty === "function") {
									solid = [];
									for (const c2 of p.dcells) if (!W.isCellEmpty(state, p.dax + c2[0], p.day + c2[1])) solid.push(c2);
								}
							} catch (e) { solid = p.dcells; }
							if (solid.length) drawCellRects(state, ctx, ppc, p.dax, p.day, solid, p.color.body, 0.45, 0);
						}
						else if (p.dw > 0) drawCellBox(state, ctx, ppc, p.dax - (p.dw >> 1), p.day - (p.dh >> 1), p.dw, p.dh, p.color.body, 0.85, [4, 3]);
					}
				} else if (p.ct) {
					// 0.9.196: the tool cursor. The game draws exactly the corners of a single grid cell
					// (module 33418: c(e,x,y,x,y,palette,true)), red for demolition, blue for selection.
					const isD = p.ct === 1;
					const bx2 = Math.floor(p.mcx / SNAP) * SNAP, by2 = Math.floor(p.mcy / SNAP) * SNAP;
					const a0 = w2s(state, bx2 * CELL, by2 * CELL);
					const side = SNAP * ppc, kk = Math.max(3, Math.round(0.3 * side));
					ctx.save();
					ctx.lineWidth = 2; ctx.strokeStyle = isD ? "red" : "rgb(0, 204, 255)"; ctx.globalAlpha = 0.95;
					const x2 = a0.x, y2 = a0.y, x3 = a0.x + side, y3 = a0.y + side;
					ctx.beginPath();
					ctx.moveTo(x2, y2 + kk); ctx.lineTo(x2, y2); ctx.lineTo(x2 + kk, y2);
					ctx.moveTo(x3 - kk, y2); ctx.lineTo(x3, y2); ctx.lineTo(x3, y2 + kk);
					ctx.moveTo(x3, y3 - kk); ctx.lineTo(x3, y3); ctx.lineTo(x3 - kk, y3);
					ctx.moveTo(x2 + kk, y3); ctx.lineTo(x2, y3); ctx.lineTo(x2, y3 - kk);
					ctx.stroke();
					ctx.restore();
				} else if ((p.tools || []).indexOf("vacuum") >= 0) {
					const r = Math.max(10, ppc * 4);
					ctx.save();
					ctx.strokeStyle = p.color.body; ctx.lineWidth = 2;
					ctx.globalAlpha = 0.9; ctx.setLineDash([5, 4]);
					ctx.beginPath(); ctx.arc(cur.x + ppc / 2, cur.y + ppc / 2, r, 0, Math.PI * 2); ctx.stroke();
					ctx.setLineDash([]); ctx.restore();
				}
			}
			ctx.globalAlpha = 1;
		}
	}

	// ------------------------------------------------------------------
	// Hook per-frame (patch w bundle.js)
	// ------------------------------------------------------------------
	// 0.9.142: hooks on the shared FH object (the same one for the whole bundle) — client tools that bypass the DN hook:
	//  - energy.consume: during an ACTIVE tool action on the mirror-client we don't count from the local (sometimes stale) copy
	//    of the battery → false "Not enough power"; we collect the amount and attach it to the dig request (the host subtracts it authoritatively),
	//  - world.excavate: the hand drill digs through the Lu mutation queue (dropped on the client) → forward it as a 1x1 dig.
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
			// ST-FEAT undo: undoing a BUILD calls FH.structures.removeAt / removeAtPositions. On the client this
			// path wasn't being intercepted anywhere (the _demol hook sits on the area demolisher), so
			// the removal never reached the host and the mirror immediately reverted it. We forward it as "demolish".
			// The gate is NARROW: only when it's the game performing its own undo — normal removal and applying
			// of the network still goes the old way (otherwise the client's reconcile would delete structures on the host).
			try {
				const SA2 = FH.structures;
				if (SA2 && typeof SA2.removeAt === "function" && !SA2.removeAt._st) {
					const oRm = SA2.removeAt;
					const wRm = function (state, x, y, opts) {
						try {
							if (isClientSync() && ST.wsx.paused && ST._inGameUndo()) {
								let st2 = null; try { st2 = SA2.getAtCell ? SA2.getAtCell(state, x, y) : null; } catch (e) {}
								queueUndoRemoval([st2 ? slimStruct(st2) : { x: x, y: y }]);
								return;
							}
						} catch (e) {}
						return oRm.apply(this, arguments);
					};
					wRm._st = true; SA2.removeAt = wRm;
				}
				if (SA2 && typeof SA2.removeAtPositions === "function" && !SA2.removeAtPositions._st) {
					const oRmP = SA2.removeAtPositions;
					const wRmP = function (state, positions, opts) {
						try {
							if (isClientSync() && ST.wsx.paused && ST._inGameUndo() && Array.isArray(positions) && positions.length) {
								const list2 = [];
								for (const q of positions) {
									if (!q) continue;
									let st2 = null; try { st2 = SA2.getAtCell ? SA2.getAtCell(state, q.x, q.y) : null; } catch (e) {}
									list2.push(st2 ? slimStruct(st2) : { x: q.x, y: q.y });
								}
								queueUndoRemoval(list2);
								return;
							}
						} catch (e) {}
						return oRmP.apply(this, arguments);
					};
					wRmP._st = true; SA2.removeAtPositions = wRmP;
				}
			} catch (e) { log("removeAt hook error:", e && e.message); }
			// ST-FIX (ROOT CAUSE OF "red/disappearing blocks" after Ctrl+Z):
			// the game's "undo" module reverts a DEMOLITION like this:
			//     FH.structures.build(e, {x, y}, typ, {copiedStructure:{data, filter, color}})
			// that is, DIRECTLY through the build API, which does NOT emit a "structures:placed" event.
			// Our structure replication hangs exactly off this event, so the rebuild after an undo
			// was NEVER broadcast: the host replayed it quietly on its own side, the client was left with
			// the removed fragment — and no mirror fixed this, because the mirror sends terrain, not
			// structures. (Undoing a BUILD worked, because it goes through removeAt → "structures:removed".)
			// It was visible in the logs: the client kept reporting the same orphaned tiles over and over, the host kept
			// replying "here structures: 152" — and nothing changes.
			try {
				const SA3 = FH.structures;
				if (SA3 && typeof SA3.build === "function" && !SA3.build._st) {
					const oB = SA3.build;
					const wB = function (state, pos, type, opts) {
						let inUndo = false;
						try { inUndo = !ST._applyingNet && !!(ST._inGameUndo && ST._inGameUndo()) && pos && Number.isFinite(pos.x); } catch (e) {}
						if (inUndo) {
							const cs = (opts && opts.copiedStructure) || null;
							if (isClientSync() && ST.wsx.paused) {
								// the client doesn't write to the shared world — the request goes to the host, the confirmation comes back via "st add"
								const m3 = { t: "act", k: "place", type: type, x: pos.x | 0, y: pos.y | 0 };
								try { if (cs && cs.data != null) m3.data = JSON.parse(JSON.stringify(cs.data)); } catch (e) { swallow("undoBuild", e); }
								try { if (cs && cs.filter != null) { m3.fl = JSON.parse(JSON.stringify(cs.filter)); m3.flc = 1; } } catch (e) { swallow("undoBuild", e); }
								// 0.9.229 (THE REAL CAUSE OF "undo paints with the host's colour"): replaying after Ctrl+Z
								// does NOT go through the _place hook — it goes through THIS path, wrapped by SA.build, which itself
								// assembles the message. So I was adding the colour at a place that this replay doesn't touch
								// at all. It was plain to see in the log: the host wrote "packet WITHOUT a colour field", and the client
								// at the same coordinates wrote NOTHING — because _place wasn't firing.
								// We take the colour from the same copiedStructure that we take the data and filter from.
								try {
									let kol3;
									if (cs && cs.color != null) kol3 = cs.color;
									if (kol3 === undefined && ST._colByPos) kol3 = ST._colByPos.get(m3.x + "," + m3.y);
									m3.col = (kol3 === undefined || kol3 === null) ? null : kol3;
								} catch (e) { m3.col = null; swallow("undoBuild", e); }
								m3.u = 1;   // the host is allowed to reach into its own colour memory (see hostPlaceOne)
								queuePlace(m3);
								if (lim("ubDiagC", 40, 60000)) log("CLIENT demolition undo → host @" + m3.x + "," + m3.y
									+ " colour=" + JSON.stringify(m3.col) + (cs ? "" : " (missing copiedStructure)"));
								return null;
							}
							const res = oB.apply(this, arguments);
							// host: we don't queue anything here — the broadcast goes one way, via "building:placed"
							return res;
						}
						return oB.apply(this, arguments);
					};
					wB._st = true; SA3.build = wB;
					log("FH hook: structures.build (broadcasting the rebuild after Ctrl+Z)");
				}
			} catch (e) { log("build hook error:", e && e.message); }
			// ST-FIX (the same class of bug as with structures): the "undo" module restores SIGNAL CONNECTIONS
			// directly through qu.Q.link / qu.Q.set and does NOT emit "signals:userChanged" — that event is only emitted
			// by the "signal linker" item, i.e. a player action. Without this, after Ctrl+Z the wiring drifts apart
			// between players. So we intercept the signals module itself for the duration of the undo.
			try {
				const SG2 = FH.signals;
				if (SG2 && typeof SG2.link === "function" && !SG2.link._st) {
					const mkSig = (name, orig) => {
						const w = function (state, from, to) {
							const res = orig.apply(this, arguments);
							try {
								if (!ST._applyingNet && ST.net.role === "host" && ST.peers.size
									&& ST._inGameUndo && ST._inGameUndo() && from && to) {
									net.send({ t: "act", k: "sig", ch: [{ a: name, f: { x: from.x | 0, y: from.y | 0 }, t: { x: to.x | 0, y: to.y | 0 } }] });
								}
							} catch (e) {}
							return res;
						};
						w._st = true; return w;
					};
					SG2.link = mkSig("link", SG2.link);
					if (typeof SG2.unlink === "function" && !SG2.unlink._st) SG2.unlink = mkSig("unlink", SG2.unlink);
					log("FH hook: signals.link/unlink (rebuilding links after Ctrl+Z)");
				}
			} catch (e) { log("signals hook error:", e && e.message); }
			// 0.9.159: HERDER — creature entities live in store.mods (the host overwrites the client every 1 s via res.st),
			// so a local capture attempt on the client was reverted by the sync (a swarm at the weapon, capture without end).
			// Capturing/spawning/releasing go to the host; the result comes back via the existing st sync.
			try {
				const ents = FH.entities;
				if (ents && ents.startCapture && !ents.__stWrapped) {
					ents.__stWrapped = 1;
					const oCap = ents.startCapture, oSp = ents.spawn, oLn = ents.launch;
					ents.startCapture = (st2, id) => {
						if (isClientSync() && ST.wsx.paused) {
							// 0.9.159: dedup — before the host confirms capturing (~100 ms), the cone manages to call
							// startCapture several frames in a row for the same id. We don't resend within <1 s.
							const now2 = performance.now();
							if (!ST._capReq) ST._capReq = new Map();
							const last2 = ST._capReq.get(id);
							if (last2 !== undefined && now2 - last2 < 1000) return;
							ST._capReq.set(id, now2);
							if (ST._capReq.size > 400) { for (const [k2, t2] of ST._capReq) if (now2 - t2 > 5000) ST._capReq.delete(k2); }
							try { net.send({ t: "act", k: "entCap", id: id }); } catch (e) {}
							return;
						}
						return oCap(st2, id);
					};
					ents.spawn = (st2, ty, x, y) => {
						// A DUMMY instead of null: the game's release does if(!f)return BEFORE available-- and launch — with null
						// the client wasn't decrementing the counter, and the host was spawning for free ("it sucks in, but doesn't release").
						if (isClientSync() && ST.wsx.paused) {
							try { net.send({ t: "act", k: "entSp", ty: ty, x: x, y: y }); } catch (e) {}
							// 0.9.159: VISUAL ECHO — the real creature comes back from the host after ~200 ms, so on the client
							// the SHOT from the barrel wasn't visible ("there's no release animation"). We create immediately
							// a temporary creature (negative id, TTL 600 ms in applyEntities) with full local physics.
							try {
								const list0 = ents.getAll ? ents.getAll(st2) : null;
								if (list0) {
									const ghost = { id: (ST._relGhostId = (ST._relGhostId || -500000) - 1), type: ty, x: x, y: y, vx: 0, vy: 0, capturing: false, captureProgress: 0, playerReleased: true, __stGhostT: performance.now() };
									list0.push(ghost);
									if (ST._entInit) { try { ST._entInit(ghost); } catch (e2) {} }
									return ghost;
								}
							} catch (e) {}
							return { id: -1, type: ty, x: x, y: y, vx: 0, vy: 0 };
						}
						return oSp(st2, ty, x, y);
					};
					ents.launch = (st2, cr, a, sp) => {
						if (isClientSync() && ST.wsx.paused) {
							// an echo (id<0): the host gets -1 (= release the most recently spawned one), and the echo runs a LOCAL
							// vanilla physics — the shot and the bounces are visible right away.
							if (cr && cr.id != null) { try { net.send({ t: "act", k: "entLn", id: cr.id < 0 ? -1 : cr.id, a: a, sp: sp }); } catch (e) {} }
							if (cr && cr.id < 0 && cr.__stGhostT) { try { oLn(st2, cr, a, sp); } catch (e) {} }
							return;
						}
						return oLn(st2, cr, a, sp);
					};
					log("FH hooks: entities.startCapture/spawn/launch (Wrangler -> host)");
				}
			} catch (e) { log("hook entities error:", e && e.message); }
			log("FH hooks: energy.consume=" + !!(FH.energy && FH.energy.consume && FH.energy.consume._st) + " world.excavate=" + !!(FH.world && FH.world.excavate && FH.world.excavate._st));
		} catch (e) { log("installFhHooks error:", e.message); }
	}
	// 0.9.161: ARMOR — our frame hook runs INSIDE the game's frame:update emit; an uncaught exception
	// would bubble up into the game's rAF loop and KILL IT PERMANENTLY (a static screen, the mirror kept alive in the background by the watchdog —
	// observed live: frame:update dead for 130+ s). We log every error (the first 10 with a stack trace)
	// and SWALLOW it — the game has to keep running.
	ST._frame = (state, FH) => {
		try { return ST.__frameInner(state, FH); }
		catch (e) {
			if (lim("frameErrN", 10))
				log("ERROR frame hook (swallowed, game keeps running):", e && e.message, String(e && e.stack || "").split("\n").slice(0, 4).join(" | "));
		}
	};
	ST.__frameInner = (state, FH) => {
		ST._pendEn = 0; // tool energy counted per frame (see installFhHooks)
		if (FH && !ST._fhHooked) installFhHooks(FH);
		if (!ST.state) {
			ST.state = state;
			if (FH) ST.FH = FH;
			try { przechwycCofanieRur(); } catch (e) {}
			// 0.9.150: world session token — a new one on EVERY state capture (= every load/scene).
			// It travels with the save transfer and comes back in the hello: worldId alone doesn't distinguish the current state from
			// an old copy of the same world on the client (PROBLEM #1).
			ST._worldGen = Math.random().toString(36).slice(2, 10);
			applyPreviewThreshold("przechwycenie stanu");
			installPipeHook();   // 0.9.212: broadcasting demolished pipes
			log("Game state captured! scene:", state.store && state.store.scene && state.store.scene.active,
				"worldId:", state.store && state.store.meta && state.store.meta.worldId,
				"FH:", FH ? Object.keys(FH).slice(0, 25).join(",") : "NONE");
		}
		if (FH && !ST.FH) ST.FH = FH;
		try { przechwycCofanieRur(); } catch (e) {}
		// detecting a scene/world change (state reload)
		if (ST.state !== state) { ST.state = state; ST.wsx.paused = false; log("New state object (scene change?)"); }
		// Anti-flood guard for placements: when entering a world (scene.active change) the game reconstructs structures
		// by firing building:place → don't forward them for 3s (see ST._place).
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
					"manager:", managerWorker(state) ? "OK" : "NONE");
			} catch (e) { log("dump error:", e.message); }
		}
		const now = performance.now();
		// ST-FIX (red tiles on the client after Ctrl+Z on the host): undoing a DEMOLITION rebuilds structures
		// via the normal FH.structures.build, and the game initially marks them as "queued" (red),
		// before the simulation resolves it. The "st add" broadcast fires IMMEDIATELY, so the client gets
		// this transient state and stays with it: the next snapshot skips the structure, because its signature
		// (_structSig) hasn't changed. So after every local undo we force a full snapshot with
		// a delay — the host then sends back the already-settled state and the client corrects itself.
		try {
			if (ST.net.role === "host" && (ST._undoPass1 || ST._undoPass2)) {
				const pass = (ST._undoPass1 && now > ST._undoPass1) ? 1 : (ST._undoPass2 && now > ST._undoPass2) ? 2 : 0;
				if (pass) {
					if (pass === 1) ST._undoPass1 = 0; else ST._undoPass2 = 0;
					// rectangle from the undo itself; _lastDemolBounds only as a supplement (demolition tool)
					let r = null;
					if (ST._undoRect && ST._undoRect.n) r = { x0: ST._undoRect.x0, y0: ST._undoRect.y0, x1: ST._undoRect.x1, y1: ST._undoRect.y1 };
					try {
						const bs2 = ST._lastDemolBounds;
						if (bs2 && bs2.length) for (const b of bs2) {
							if (!r) r = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
							else { if (b.x0 < r.x0) r.x0 = b.x0; if (b.y0 < r.y0) r.y0 = b.y0; if (b.x1 > r.x1) r.x1 = b.x1; if (b.y1 > r.y1) r.y1 = b.y1; }
						}
					} catch (e) {}
					if (r) {
						const marked = markRectUrgent(state, r);
						const sent = sendStructsInRect(state, r);
						// ST-FIX: since the area went out addressed, a FULL snapshot (20+ parts of 4000 structures each,
						// applied on the client in 8 ms slices) is unnecessary — it was the one costing those 10 seconds.
						log("after undo (pass " + pass + "): " + sent + " structures (skipped unchanged: " + (ST._rectSkipped || 0) + ") from rect ["
							+ r.x0 + "," + r.y0 + " - " + r.x1 + "," + r.y1 + "], terrain: " + marked + " points");
						if (pass === 2) { ST._undoRect = null; ST._undoRectT = 0; }
					} else if (pass === 2) {
						// as a fallback, when we don't know WHAT was rebuilt
						ST._snapForce = true; ST._lastSnap = 0; enqueueFullWorld();
						log("after undo: no rect — structures snapshot + full world");
					}
				}
			}
		} catch (e) {}
		if (net && ST.net.role !== "idle" && state.store && state.store.player && now - ST._lastPosSend > 33) {
			ST._lastPosSend = now;
			const pl = state.store.player;
			const bi = getBuildIntent(state);
			// ST-FEAT: during a drag the game keeps the starting cell in session.building.start
			let bs = null, bmode = null, bdirs = null;
			try {
				const bst = state.session && state.session.building && state.session.building.start;
				if (bst && typeof bst.x === "number" && state.session.building.placing) bs = { x: bst.x | 0, y: bst.y | 0 };
				// ST-FEAT: CURRENT BUILD MODE. The game selects it like this:
				//   cfg.buildModes[(store.options.buildModeIndices[String(typ)] ?? 0) % cfg.buildModes.length].type
				// typy: single | singleDirectional | line | rectangle | rectangleDirectional | launcherRect*
				if (bi && bi.k === 2) {
					const cfg2 = ST.FH.structures && ST.FH.structures.getConfig ? ST.FH.structures.getConfig(bi.id) : null;
					const modes = cfg2 && cfg2.buildModes;
					if (Array.isArray(modes) && modes.length) {
						const idxs = state.store.options && state.store.options.buildModeIndices;
						const ix = (idxs && idxs[String(bi.id)]) || 0;
						const md = modes[ix % modes.length];
						bmode = md && md.type ? String(md.type) : null;
						// ST-FIX: allowed build axes. The conveyor has directions:["horizontal"], so
						// the arrow should never point up/down, even when the drag was vertical.
						if (md && Array.isArray(md.directions) && md.directions.length) bdirs = md.directions.join(",");
					}
				}
			} catch (e) {}
			watchClientMove(state); // 0.9.197: the client reports the move itself (the game on his side won't execute it)
			installUndoBoundary(state);   // 0.9.225: action boundaries for the undo history (game event + mouseup)
			installYellowProbe(state);    // 0.9.234: yellow-frame probe (stays silent until there is an anomaly)
			probeSwiatla(state);          // 0.9.243: comparison of light sources on the shooter's and observer's sides
			sprzatnijPodgladyPrzeniesienia(state);   // 0.9.237: removes the stuck yellow frame
			const mw = getMouseWorld(state);
			const mc = getMouseCell(state);
			// ST-FIX: the game computes the shovel preview from session.action.point (not from the cursor) — the same point
			// it shows in its drawing code: Math.floor(session.action.point.x / cellSize). Thanks to that
			// the area shows up BEFORE the player digs, not after the fact.
			let dax = null, day = null;
			try {
				const ap = state.session && state.session.action && state.session.action.point;
				if (ap && typeof ap.x === "number") { dax = Math.floor(ap.x / 4); day = Math.floor(ap.y / 4); }
			} catch (e) {}
			if (bi && bi.k === 2 && !ST._biLogged) { ST._biLogged = true; log("Pose intent detected (phantom at the other player): id=" + JSON.stringify(bi.id) + " " + bi.bw + "x" + bi.bh); }
			net.send({ t: "pos", x: Math.round(pl.x * 10) / 10, y: Math.round(pl.y * 10) / 10, tools: getVisibleTools(state), facing: getFacing(state), aim: getAimAngle(state), trail: getTrailAlpha(state),
				mwx: mw ? mw.x : null, mwy: mw ? mw.y : null,           // cursor in the world (action preview)
				mcx: mc ? mc.x : null, mcy: mc ? mc.y : null,           // ST-FIX: cursor in cells (tool outlines)
				sk: bi ? bi.k : 0, sid: bi ? bi.id : null,              // ST-FIX: category (2=building, 3=tool) + id of the selected one
				bt: bi && bi.k === 2 ? bi.id : null, boffs: bi ? bi.offs : null,
				bw: bi ? bi.bw : 1, bh: bi ? bi.bh : 1,                 // foundation size in cells
				dw: ST._digW || 0, dh: ST._digH || 0,                   // size of the shovel area
				dax: dax, day: day,                                     // ST-FIX: where the dig will land (game's prediction)
				bsx: bs ? bs.x : null, bsy: bs ? bs.y : null,           // ST-FEAT: start of the build drag
				bm: bmode,                                              // ST-FEAT: build mode (line/rectangle/single)
				bd: bdirs,                                              // ST-FIX: allowed axes (horizontal/vertical)
				ct: getConstructTool(state),                            // 0.9.196: 1=demolition, 2=selection (cursor on other players)
				pm: isPipeMode(state) ? 1 : 0,                           // 0.9.213: pipe mode (highlight on other players)
				dr: getDragRect(state),                                 // 0.9.188: a drag of the copier/demolisher
				sr: (ST._bpSelRect && ST._bpSelRect.t && now - ST._bpSelRect.t < 250)
					? [ST._bpSelRect.x0 | 0, ST._bpSelRect.y0 | 0, ST._bpSelRect.x1 | 0, ST._bpSelRect.y1 | 0] : null, // 0.9.187: ramka zaznaczenia
				vr: (ST._viewRect && now - (ST._viewRectT || 0) < 1000) ? ST._viewRect : null, // 0.9.281: what I can see, in cells
				gv: grabGrid() });                                      // side of the grabber grid
			// ST-FEAT: grabber tank contents separately and ONLY on change — 30 Hz with a slot list is too much.
			try {
				const tk = getGrabTank();
				const sig = tk && tk.length ? tk.map((q) => q.join(",")).join(";") : "";
				if (sig !== (ST._tankSig || "") && now - (ST._tankSentT || 0) > 100) {
					ST._tankSig = sig; ST._tankSentT = now;
					net.send({ t: "gtank", s: tk || [] });
				}
				// ST-FIX: shovel mask — also only on change (it only changes on upgrade)
				if (ST._digSig && ST._digSig !== ST._digSentSig) { ST._digSentSig = ST._digSig; net.send({ t: "dmask", m: ST._digMask }); }
				// ST-FEAT: EXACT build-preview positions straight from the game (hook bundle "_bpPos"). Reconstructing
				// the line/rectangle on our side didn't reproduce the steps when building at an angle —
				// the game has its own rasterization (locked angle, spanTiles, left/right variants per position).
				const bp = (ST._bpT && now - ST._bpT < 300 && Array.isArray(ST._bpPos)) ? ST._bpPos : null;
				// ST-FIX: direction arrow — we take it from the game (hook _bpArw sits exactly where the game
				// computes the angle and decides whether to draw the arrow AT ALL). Previously we drew our own on
				// EVERY build and guessed the direction from the drag.
				const aw = (ST._bpArw && ST._bpArw.t && now - ST._bpArw.t < 250)
					? [ST._bpArw.x | 0, ST._bpArw.y | 0, Math.round(ST._bpArw.a) | 0] : null;
				let bpsig = "";
				let kolorPalety = null;
				try {
					const CP = ST.FH && ST.FH.foundationColorPicker;
					if (CP && typeof CP.getColor === "function") kolorPalety = CP.getColor(state);
				} catch (e) { swallow("bprev", e); }
				if (bp && bp.length) {
					// ST-FIX: the 200-position limit cut off the tail of the list — on the receiver's side a rectangle bigger than ~200
					// blocks lost part of its shape. Now the packet is compact (base + type dictionary +
					// flat offset list), so the whole area fits.
					// 0.9.215 (REVISION 2.1): it used to be 4000 — and SILENTLY, with no trace in the log.
					// NOTE: this limit CANNOT be raised as high as in _bpPos (200,000). That packet
					// fires ONCE, on confirming the move; this one fires every 80-500 ms the whole time
					// the player holds the build preview. Each position is 3 numbers, so 200,000 positions is several MB
					// several times a second — we would clog the link instead of fixing the highlight.
					// Compromise: 20,000 (five times more than before, ~240 KB in the worst case), a less frequent
					// send for a large area (see "floor" below), and a log entry when the limit actually kicked in.
					const LIM_BP = 20000;
					const lim = Math.min(bp.length, LIM_BP);
					if (bp.length > LIM_BP && lim("bpCapN", 5))
						log("build preview: " + bp.length + " positions, sending " + LIM_BP + " (limit)");
					let bx0 = 1 << 30, by0 = 1 << 30, cnt = 0;
					for (let i3 = 0; i3 < lim; i3++) { const q3 = bp[i3]; if (!q3) continue; if ((q3.x | 0) < bx0) bx0 = q3.x | 0; if ((q3.y | 0) < by0) by0 = q3.y | 0; cnt++; }
					if (!cnt) { if (ST._bpSig) { ST._bpSig = ""; net.send({ t: "bprev", p: [] }); } }
					else {
						const tys = [], tmap = new Map(), flat = [];
						// 0.9.216: COLOR ALSO FROM THE GAME. The game's drawing function (the same one we hook) reads
						// the "color" field from the structure — you can see it in its own call when placing a single
						// building: gJ(e, { type, x, y, color: u }, { ctx, placing: true }). We only supplied
						// type/x/y, so the observer always saw the default color, not the one the player
						// actually painted his blocks with. We build the color dictionary like the type dictionary;
						// when there is one color (the usual case), the index list is unnecessary.
						const cls = [], cmap = new Map(), cidx = [];
						// 0.9.257 (REPORT: "observer sees pipe fragments instead of a continuous pipe"). The game draws
						// the pipe preview differently than any other building — verified in its own code:
						//     if ("bridgeCenter" !== n.pipeBuildRole) {
						//         const t = { type: l, x: n.x, y: n.y, color: f };
						//         l === Pipe && (t.data = { pipeSpriteIndex: uV(n.pipePreviewConnectionMask ?? 0) });
						//         gJ(e, t, { ctx: p, placing: true });
						//     }
						// So the shape of each segment comes from the connection mask, which the game computes for the whole
						// route. We only passed the type, position and color, so on the observer's side each pipe
						// got sprite number 0, i.e. a lone piece. So we now send the mask too (field "pm"),
						// and we skip points with the "bridgeCenter" role exactly the way the game skips them.
						const pm = [], br = [];
						let sarury = false, samostki = false;
						let f3 = null, l3 = null;
						for (let i3 = 0; i3 < lim; i3++) {
							const q3 = bp[i3]; if (!q3) continue;
							const t3 = q3.structureType;
							let ti = tmap.get(t3);
							if (ti === undefined) { ti = tys.length; tys.push(t3); tmap.set(t3, ti); }
							// 0.9.224: the preview of the HELD building has its color in a separate game variable (hook _bpColor),
							// because the positions from c.positions don't carry it with them.
							// 0.9.225: we take the preview color from the SAME source as the game: right before drawing
							// it does u = FH.foundationColorPicker.getColor(e). No hook in the bundle is needed
							// for this — it's enough to ask the same function (the _bpColor patch stays as a fallback).
							const c3 = q3.color != null ? String(q3.color)
								: (kolorPalety != null ? String(kolorPalety)
									: (ST._bpColor != null ? String(ST._bpColor) : ""));
							let ci = cmap.get(c3);
							if (ci === undefined) { ci = cls.length; cls.push(c3); cmap.set(c3, ci); }
							cidx.push(ci);
							const dx3 = (q3.x | 0) - bx0, dy3 = (q3.y | 0) - by0;
							flat.push(dx3, dy3, ti);
							const mk = q3.pipePreviewConnectionMask;
							if (mk !== undefined) sarury = true;
							pm.push((mk | 0) & 15);
							// 0.9.258 (REPORT: "when routing a pipe THROUGH another pipe, the middle tile disappears
							// for the observer"). In 0.9.257 I skipped points with the "bridgeCenter" role, because the game doesn't
							// draw a regular pipe there. I read its preview function all the way through and that was a mistake:
							// for such a point the game draws an availability marker just like for any other, and then in
							// the SECOND loop adds the bridge graphic to it:
							//     if ("bridgeCenter" !== n.pipeBuildRole || !n.pipeBridgeAxis) continue;
							//     ... ky(e, n.x, n.y, n.pipeBridgeAxis, { ctx: p });  + obrazek build_flash
							// So the tile doesn't disappear — it gets DIFFERENT graphics. So we send the bridge axis as a separate
							// field, and the same game function will handle the drawing on the other side.
							let os3 = 0;
							if (q3.pipeBuildRole === "bridgeCenter" && q3.pipeBridgeAxis)
								os3 = q3.pipeBridgeAxis === "horizontal" ? 1 : 2;
							if (os3) samostki = true;
							br.push(os3);
							if (f3 === null) f3 = dx3 + "," + dy3;
							l3 = dx3 + "," + dy3;
						}
						const jedenKolor = cls.length <= 1;
						bpsig = cnt + "@" + bx0 + "," + by0 + ":" + f3 + ":" + l3 + ":" + tys.join("|")
							+ ":" + cls.join("|") + (aw ? ":" + aw.join(",") : "")
							+ (sarury ? ":" + pm.join("") : "")    // a change to the shape alone must also break through the signature
							+ (samostki ? ":" + br.join("") : "");
						// ST-FIX: we resend the same list every 700 ms. Without this, with the mouse still, the signature wouldn't
						// change, nothing was sent, the entry on the receiver's side "expired" and the textures disappeared,
						// coming back only once the mouse moved.
						// ST-FIX: for a large area, a less frequent floor — the packet is then thicker.
						const floor = flat.length > 30000 ? 500 : (flat.length > 900 ? 200 : 80);
						if (bpsig !== (ST._bpSig || "") || now - (ST._bpSentT || 0) > 700) {
							if (now - (ST._bpSentT || 0) > floor) {
								ST._bpSig = bpsig; ST._bpSentT = now;
								net.send({ t: "bprev", b: [bx0, by0], ty: tys, p: flat, a: aw,
									cl: cls, ci: jedenKolor ? null : cidx, pm: sarury ? pm : undefined,
									br: samostki ? br : undefined });
							}
						}
					}
				} else if (ST._bpSig) { ST._bpSig = ""; net.send({ t: "bprev", p: [] }); }
			} catch (e) {}
		}
		// ping/pong (RTT) — sent every 1s, HUD refresh every 0.5s (contribution by dotNine)
		if (net && ST.net.role !== "idle" && ST.peers.size && now - (ST._lastPingSent || 0) > 1000) {
			ST._lastPingSent = now;
			for (const id of ST.peers.keys()) { try { net.send({ t: "ping", ts: now }, id); } catch (e) {} }
		}
		if (now - (ST._lastPingUi || 0) > 500) { ST._lastPingUi = now; updatePingDisplay(); }
		// world sync + struktury + zasoby + encje
		subscribeGameEvents(state);
		ensureMenuUi(state); // MULTIPLAYER button in the main menu + lobby (500 ms throttle inside)
		// host: auto-send save when he's in a world with players and hasn't sent THIS world yet (key: worldId).
		// We check the state CONTINUOUSLY (not the menu->world edge, which is easy to miss when sampling). (contribution by dotNine)
		if (ST.net.role === "host" && ST.peers.size && state.store && state.store.scene && state.store.scene.active !== 1) {
			const wid = (state.store.meta && state.store.meta.worldId) || "unknown";
			if (ST._autoSentWid !== wid) { ST._autoSentWid = wid; sendWorld(); }
		}
		// auto-repair of bricked research (0.9.71): host/solo once per world, 3 s after entering (after load)
		if (ST.net.role !== "client" && state.store && state.store.scene && state.store.scene.active !== 1 && state.store.player && now > (ST._loadGuardUntil || 0)) {
			const wid = (state.store.meta && state.store.meta.worldId) || "unknown";
			if (ST._techRepairWid !== wid) { ST._techRepairWid = wid; techRepair(state, ST.net.role === "host" ? "host" : "solo"); }
		}
		// HOST IN MENU DOESN'T STREAM (fix for "instant kick" — Akriz + derErste67): in the menu the world buffers
		// belong to the MENU SCENE; streaming them to the client painted garbage and triggered on his side
		// an auto-exit to the menu (everApplied in the menu) = the client got kicked a second after joining.
		// ORPHANED TILES (0.9.136): a foundation tile (terrain Block 15..18) without a live structure is garbage,
		// which renders red and which the game won't remove by itself. We clean up around the players every 5 s,
		// with confirmation on a second pass (a tile being placed can be momentarily "without a structure").
		// ST-FIX (red tiles after the host's Ctrl+Z): the orphaned-tile cleaner was DISABLED for the client
		// (`role !== "client"`), and it is precisely on the client that red foundations without a structure are left behind.
		// The client can't delete them himself though — the host might have a live building there. So: the client only
		// ASKS the host about those cells, and the host responds either with the structure (st add) or approval to clean up.
		if (isClientSync() && ST.wsx.paused && state.store.scene && state.store.scene.active !== 1 && now - (ST._orphanAskT || 0) > 1500) {
			ST._orphanAskT = now;
			try {
				const sim = state.shared.sim, W = sim.width;
				const ids = new Uint32Array(sim.cellIds.buffer, sim.cellIds.byteOffset, sim.cellIds.length);
				const tt = sim.terrainType, SA = structNs();
				if (ids && tt && SA && SA.getAtCell) {
					if (!ST._orphanCliSeen) ST._orphanCliSeen = new Map();
					const spots = [{ x: state.store.player.x / 4, y: state.store.player.y / 4 }];
					for (const pp2 of ST.peers.values()) spots.push({ x: pp2.tx / 4, y: pp2.ty / 4 });
					// ST-FIX: we report the ANCHORS of 4x4 blocks, not each cell separately. One structure is
					// 16 cells, so the 80-cell limit meant ~5 structures per round — hence the delayed "speaking up"
					// one line every few seconds. After collapsing to the grid of 4, the limit is 400 STRUCTURES.
					const ask = [], widz = new Set(), askKey = new Set();
					for (const sp of spots) {
						const cx = sp.x | 0, cy = sp.y | 0;
						if (!(cx > 0 && cy > 0 && cx < W)) continue;
						const x0 = Math.max(1, cx - 160), x1 = Math.min(W - 2, cx + 160);
						const y0 = Math.max(1, cy - 120), y1 = Math.min(sim.height - 2, cy + 120);
						for (let y = y0; y <= y1 && ask.length < 2000; y++) for (let x = x0; x <= x1 && ask.length < 2000; x++) {
							const i = x + y * W, id = ids[i];
							if (id <= 0 || id > 1000) continue;
							if (!TEREN_STRUKTUR.has(tt[id])) continue;
							try { if (SA.getAtCell(state, x, y)) continue; } catch (e) { continue; }
							if (hasPipeAt(state, x, y)) continue;   // 0.9.211 (from the author): a PIPE runs under the tile — this is not an orphan
							widz.add(i);
							const od = ST._orphanCliSeen.get(i);
							if (!od) { ST._orphanCliSeen.set(i, now); continue; } // the first time — it may be coming into existence right now
							if (now - od < 1500) continue;   // ST-FIX: it used to be 5 s — too slow when rebuilding with Ctrl+Z
							const bxk = Math.floor(x / 4) * 4, byk = Math.floor(y / 4) * 4;
							const kk = bxk + "," + byk;
							if (askKey.has(kk)) continue;    // ST-FIX: one entry per BLOCK, not per cell
							askKey.add(kk);
							ask.push([bxk, byk]);
						}
					}
					for (const k of ST._orphanCliSeen.keys()) if (!widz.has(k)) ST._orphanCliSeen.delete(k);
					if (ask.length) {
						net.send({ t: "act", k: "orphanQ", cells: ask });
						diagToHost("osierocone kafle (czerwone) u mnie: " + ask.length + " np. " + ask[0][0] + "," + ask[0][1]);
					}
				}
			} catch (e) { if (!ST._orphanCliErr) { ST._orphanCliErr = true; log("orphan scan at client error:", e.message); } }
		}
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
							if (!TEREN_STRUKTUR.has(ty)) continue;      // structure tiles: foundations, conveyors, shakers...
							try { if (SA.getAtCell(state, x, y)) continue; } catch (e) { continue; }
							if (hasPipeAt(state, x, y)) continue;   // 0.9.211 (from the author): PIPE — the tile is needed
							widziane.add(i);
							const od = ST._orphanSeen.get(i);
							if (!od) { ST._orphanSeen.set(i, now); continue; }   // first time — give it a chance
							if (now - od < 6000) continue;
							try { TR.removeAt(state, x, y); markCellDirty(state, x, y); usuniete++; ST._orphanSeen.delete(i); } catch (e) {}
						}
					}
					for (const k of ST._orphanSeen.keys()) if (!widziane.has(k)) ST._orphanSeen.delete(k); // no longer orphaned
					if (usuniete) log("CLEANUP: removed", usuniete, "orphaned foundation tiles (red blocks without a structure)");
				}
			} catch (e) { if (!ST._orphanErrLogged) { ST._orphanErrLogged = true; log("orphan tile cleanup error:", e.message); } }
		}
		// CLEANING UP DEAD CELLS (0.9.100): the cell points to an element that isn't in the array
		// (type = 0) => nothing stands behind it: it renders red, can't be removed or picked up.
		// We scan a window around the players, not the whole map.
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
							if ((ety[cid - ELEMENTS_MIN] | 0) !== 0) continue;   // the element is alive — leave it
							ids[x + y * W] = 0; dead++;                          // dead slot — cell to be deleted
						}
					}
					if (dead) { log("CLEANUP: removed " + dead + " dead cells (element without entry in array)"); enqueueAround(state, spots); }
				}
			} catch (e) { if (!ST._deadErrLogged) { ST._deadErrLogged = true; log("dead cell cleanup error:", e.message); } }
		}
		const __hb0 = performance.now();
		if (isHostSync() && state.store.scene && state.store.scene.active !== 1) {
			// 0.9.155: per-subsystem profiler — max ms of each call (so that "host block 43 ms" has a name)
			const PS = ST._profSub || (ST._profSub = {});
			const T = (nm, fn) => { const t0 = performance.now(); fn(); const d = performance.now() - t0; if (d > (PS[nm] || 0)) PS[nm] = d; };
			if (!ST._pipeZnWrapped) installPipeHook();   // 0.9.212: the demolition module's patch may come up after us
			T("pipes", () => watchHostPipes(state));      // 0.9.213: rozglaszanie zmian w store.pipes
			T("pipeLinks", () => watchPipeData(state));   // 0.9.248: only CONNECTIONS, on both sides
			T("scan", () => scanDirty(state));
			T("batch", () => maybeSendBatch(state));
			T("snap", () => sendSnapshotIfDue(state));
			T("dataEd", () => scanDataEditsIfDue(state)); // 0.9.142: host: filter change at the player → immediately to the clients
			T("res", () => sendResourcesIfDue(state));
			T("ent", () => sendEntitiesIfDue(state));
			T("wi", () => sendWorldItemsIfChanged(state)); // szybkie dropy (G12)
		}
		// FRAME PROFILER (0.9.154, permanent): one "MOD-FRAME" line every 10 s, ONLY when there are spikes —
		// "FPS drops" reports now come in with data (how many frames > 25 ms and whose cost it is).
		{
			const nowT = performance.now();
			const hb = nowT - __hb0;
			if (hb > (ST._profHostMax || 0)) ST._profHostMax = hb;
			const dtF = ST._lastFrameT ? nowT - ST._lastFrameT : 16;
			ST._lastFrameT = nowT;
			if (dtF > 25 && ST.net.role !== "idle") ST._profSpikes = (ST._profSpikes || 0) + 1;
			// 0.9.192: the ">25 ms" counter has a blind spot — a drop from 160 to 60 FPS is 16 ms and didn't count
			// AT ALL, and it was exactly such drops that were being reported. So we now compute the average and the worst frame.
			if (dtF > 0 && dtF < 2000) { ST._profN = (ST._profN || 0) + 1; ST._profSum = (ST._profSum || 0) + dtF; if (dtF > (ST._profWorst || 0)) ST._profWorst = dtF; }
			if (!ST._profT0) ST._profT0 = nowT;
			if (nowT - ST._profT0 > 10000) {
				const __avg = (ST._profN || 0) ? (ST._profSum || 0) / ST._profN : 0;
				if (ST.net.role !== "idle")
					{
					let sub = "";
					try { const PS = ST._profSub || {}; sub = Object.keys(PS).map((k) => k + " " + Math.round(PS[k]) + "ms").join(" "); ST._profSub = {}; } catch (e) {}
					let selInfo = "";
					try {
						let nMax = 0; for (const pp of ST.peers.values()) if ((pp._rsN | 0) > nMax) nMax = pp._rsN | 0;
						selInfo = "; klatka sr " + (Math.round(__avg * 10) / 10) + " ms (" + Math.round(1000 / Math.max(0.1, __avg)) + " FPS)"
							+ ", najgorsza " + Math.round(ST._profWorst || 0) + " ms"
							+ "; nakladka " + Math.round(ST._profGhost || 0) + " ms/10s"
							+ (nMax ? " (podswietlonych blokow " + nMax + ")" : "")
							+ (() => { let b = 0; for (const pp of ST.peers.values()) b += (pp._selBuilds | 0); for (const pp of ST.peers.values()) pp._selBuilds = 0; return b ? " bitmap rebuilds " + b : ""; })()
							;
						// 0.9.193: the state of OUR OWN selection — we check whether the hook really skips collecting
						// positions in "Selected" mode. If bpPos grows while a selection is active, that means
						// that _bpSelSkip isn't working and the cost is on our side, not in the game.
						const cdD = ST.state && ST.state.session && ST.state.session.action && ST.state.session.action.customData;
						const nSel = cdD && Array.isArray(cdD.selectedStructures) ? cdD.selectedStructures.length : 0;
						if (nSel || ST._bpSelSkip !== undefined) {
							selInfo += "; wybor: mode=" + (cdD ? cdD.mode : "-")
								+ " zaznaczonych=" + nSel
								+ " pomijam=" + (ST._bpSelSkip ? 1 : 0)
								+ " bpPos=" + (Array.isArray(ST._bpPos) ? ST._bpPos.length : -1)
								+ " bpT=" + (ST._bpT ? Math.round(nowT - ST._bpT) + "ms temu" : "brak");
						}
					} catch (e) {}
					ST._profGhost = 0;
					log("MOD-FRAME: " + ST._profSpikes + " frames >25ms/10s; host block max " + Math.round(ST._profHostMax || 0) + " ms [" + sub + "]; snapSer " + Math.round(ST._profSnapSer || 0) + " ms/10s; client snapMs " + Math.round(ST.wsx.snapMs || 0) + " ms" + selInfo);
				}
				ST._profT0 = nowT; ST._profSpikes = 0; ST._profHostMax = 0; ST._profSnapSer = 0; ST._profGhost = 0;
				ST._profN = 0; ST._profSum = 0; ST._profWorst = 0;
			}
		}
		// Follow-up sweep after demolition (see _demol): 250ms after the drag, check whether the reticle still has
		// structures skipped by the game (tiles stuck in QUEUED) and remove them via SA.removeAt.
		// Works for HOST AND SOLO (stuck blocks sit in the save — they must be cleanable without a session).
		{
			// ST-FIX: no AREA LIMIT. Previously this whole step was skipped when the demolition area
			// exceeded the threshold (40k cells, i.e. already ~2500 structures) — and it was precisely large demolitions
			// that left red blocks behind. The threshold didn't protect correctness, only the FRAME: the loop walked
			// every cell at once. Instead of a threshold: (1) we walk over 4x4 BLOCKS, since getAtCell rounds anyway
			// the coordinates to the grid of 4 — that is 16x fewer calls; (2) the work runs with a CURSOR on a 4 ms budget per
			// the frame, so an arbitrarily large area simply takes a few frames instead of freezing the game.
			const hd = ST._hostDemolRect;
			if (hd && !ST._demolJob && performance.now() - hd.t > 400) {
				ST._hostDemolRect = null;
				try {
					const blocks = [], seenB = new Set();
					for (const b of (Array.isArray(hd.bounds) ? hd.bounds : [])) {
						const bx0 = Math.floor(b.x0 / CELL) * CELL, by0 = Math.floor(b.y0 / CELL) * CELL;
						for (let y = by0; y <= b.y1; y += CELL) for (let x = bx0; x <= b.x1; x += CELL) {
							const k = x + "," + y;
							if (seenB.has(k)) continue;
							seenB.add(k); blocks.push(x, y);
						}
					}
					if (blocks.length) {
						ST._demolJob = { blocks, i: 0, leftovers: new Map(), cleaned: 0, orph: !!hd.cleanOrphans, bounds: hd.bounds, retry: hd.retry || 0, skipped: 0, armT: hd.t || 0, fresh: 0 };
						if (lim("djDiag", 40)) log("demolish-finish START: " + (blocks.length / 2) + " blocks, orph=" + (hd.cleanOrphans ? 1 : 0));
					} else if (lim("djDiag2", 20)) log("demolish-finish: no blocks to check (bounds=" + ((hd.bounds || []).length) + ")");
				} catch (e) { log("demolish-finish: preparation error:", e && e.message); }
			}
			const J2 = ST._demolJob;
			if (J2) {
				const t0d = performance.now();
				try {
					const SA = structNs();
					const sh = state.shared || {};
					const simc = sh.sim && sh.sim.cellIds, tt = sh.sim && sh.sim.terrainType;
					const TR = ST.FH && ST.FH.terrains;
					const wb = worldBuffers(state), W = wb && wb.W;
					const sim = (simc && W) ? new Uint32Array(simc.buffer, simc.byteOffset, simc.length) : null;
					while (SA && J2.i < J2.blocks.length && performance.now() - t0d < 4) {
						const x = J2.blocks[J2.i], y = J2.blocks[J2.i + 1];
						J2.i += 2;
						let st = null; try { st = SA.getAtCell(state, x, y); } catch (e) {}
						if (st) {
							// 0.9.206: a structure placed AFTER the follow-up sweep was armed is not a leftover —
							// this is a new build (e.g. a rebuild from an undo) and deleting it would be a mistake.
							const bt = ST._bornAt && ST._bornAt.get(structKey(st));
							if (bt && bt >= (J2.armT || 0)) { J2.fresh = (J2.fresh || 0) + 1; continue; }
							J2.leftovers.set(structKey(st), st); continue;   // the structure is alive — we don't touch its tiles
						}
						// the structure doesn't exist: the foundation cells in this block are garbage
						if (!J2.orph || !sim || !tt || !TR || !TR.removeAt) { J2.noBuf = !sim || !tt || !TR || !TR.removeAt; continue; }
						// ST-FIX (reverting the change from 0.9.174): the condition "all 16 cells are Block", taken
						// from the game (removeOrphanBlocks) is TOO AGGRESSIVE here. The game uses it to clean up blocks that no one
						// touched — but after our demolition PARTIAL remnants are left: removeCells cleans up cells
						// that belong to the structure, and the rest of the block stays. The log from the local test shows it
						// directly: "0 tiles (782 blocks ... incomplete blocks 782)" — EVERYTHING was rejected,
						// and the red squares disappeared only 1.5 s later, through the slower ORPHAN-Q path.
						// We go back to the per-cell criterion; we already checked the block without a structure above.
						for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) {
							const n = sim[(x + dx) + (y + dy) * W];
							if (n <= 0 || n > 1000 || !TEREN_STRUKTUR.has(tt[n])) continue;
							try { TR.removeAt(state, x + dx, y + dy); J2.cleaned++; } catch (e) {}
						}
					}
					if (!SA || J2.i >= J2.blocks.length) {
						ST._demolJob = null;
						if (J2.leftovers.size) {
							log("demolish-finish: game skipped " + J2.leftovers.size + " structures (tiles QUEUED?) — removing via removeAt"
								+ (J2.fresh ? "; " + J2.fresh + " skipped as FRESHLY PLACED" : ""));
							for (const st2 of J2.leftovers.values()) { try { SA.removeAt(state, st2.x, st2.y, { removeCells: true }); } catch (e) {} }
							if (ST.net.role === "host" && ST.peers.size) {
								const rmList = [...J2.leftovers.values()].map(slimStruct);
								try { for (let i = 0; i < rmList.length; i += 300) net.send({ t: "st", k: "rm", list: rmList.slice(i, i + 300) }); } catch (e) {}
							}
							// removeAt can be deferred — we come back again once the registry empties out
							if (J2.retry < 6) ST._hostDemolRect = { bounds: J2.bounds, t: performance.now(), cleanOrphans: J2.orph, retry: J2.retry + 1 };
						}
						if (J2.cleaned) {
							log("demolish-finish: removed " + J2.cleaned + " ORPHANED tiles (" + (J2.blocks.length / 2) + " blocks)");
							try { for (let i = 0; i < J2.blocks.length; i += 2) markUrgent(state, J2.blocks[i], J2.blocks[i + 1], 0); } catch (e) {}
						} else if (lim("djDiag3", 40)) {
							// ST-DIAG: we want to know WHY nothing got cleaned up — whether the buffers were available,
							// or there simply was nothing to clean up (and the client reported red tiles afterward).
							log("demolish-finisher: 0 tiles (" + (J2.blocks.length / 2) + " blocks, live structures " + J2.leftovers.size
								+ ", orph=" + (J2.orph ? 1 : 0)  + ", buffers=" + (J2.noBuf ? "NONE" : "ok") + ")");
						}
					}
				} catch (e) { ST._demolJob = null; log("demolish-finisher error:", e && e.message); }
			}
		}
		// 0.9.130: cooldown markers can end up "in the future" after every world/profile import
		if (now - (ST._cdFixT || 0) > 5000) { ST._cdFixT = now; fixFutureCooldowns(state, "periodic check"); }
		// 0.9.137: finish rebuilding the structures deferred by the work slicing (see above).
		// 0.9.154: ghost reconcile with a CURSOR (4 ms/frame budget) — scanning 84k local structures in one
		// frame is a dozen or so ms of stutter. Limits from 0.9.150/153: max 50 removals per pass, a drift
		// > 2000 unknown to the host = pause the deletion (that's a different world state, not ghosts).
		if (isClientSync() && ST._recJob && !ST._loadingWorld) {
			// 0.9.207: reconcile deletes "ghosts" via removeOne -> FH.structures.removeAt, and that one is
			// WRAPPED on our side: while an undo is in progress, instead of deleting locally, it redirects the request to the host.
			// Reconcile didn't set _applyingNet, so if it happened to fall within the undo window, its
			// deletions turned into requests to the host to delete something the host DOESN'T HAVE.
			// You can see it directly in the log: "RECONCILE: deleted 50 ghosts" and right after, 50x "HOST demolish:
			// request for 1 structure, found 0 locally". The ghosts stayed on the client.
			ST._applyingNet = true;
			try {
				const J = ST._recJob;
				if (!ST._absentCount) ST._absentCount = new Map();
				if (!ST._structApplied) ST._structApplied = new Map();
				const t0r = performance.now();
				const list = J.phase === 0 ? (ST.state.store.structures || []) : (ST.state.store.pipes || []);
				const seen = J.phase === 0 ? J.seenS : J.seenP;
				while (J.cursor < list.length && performance.now() - t0r < 4) {
					const s3 = list[J.cursor++];
					if (!s3) continue;
					const k = structKey(s3);
					if (seen.has(k)) { ST._absentCount.delete(k); continue; }
					J.absent++;
					const cnt = (ST._absentCount.get(k) || 0) + 1;
					ST._absentCount.set(k, cnt);
					const ts = ST._structApplied.get(k);
					const fresh = ts != null && performance.now() - ts < 30000;
					// 0.9.211 (from the author's 0.9.166): pipes can't be deleted BY POSITION — removeOne would remove
					// a pump or a valve standing on that cell. That's why the author skips them entirely.
					// 0.9.212: our removeOne has a separate branch for pipes (calls the game function _pipeZn), so
					// we can clean them up correctly. We only skip them when that function doesn't exist.
					if (J.phase === 1 && typeof ST._pipeZnRaw !== "function" && typeof ST._pipeZn !== "function") { ST._absentCount.delete(k); continue; }
					if (J.phase === 1) s3.__pipe = 1;
					if (cnt >= 3 && !fresh && J.removed < 50 && J.absent <= 2000) {
						removeOne(ST.state, s3);
						J.removed++; if (!J.sample) J.sample = k;
						ST._absentCount.delete(k); ST._structApplied.delete(k); if (ST._structSig) ST._structSig.delete(k);
					}
				}
				if (J.cursor >= list.length) {
					if (J.phase === 0) { J.phase = 1; J.cursor = 0; }
					else {
						if (J.removed) log("RECONCILE: removed " + J.removed + " ghosts (among them " + J.sample + ")");
						if (J.absent > 2000) {
							if (performance.now() - (ST._recStormT || 0) > 30000) { ST._recStormT = performance.now(); log("RECONCILE: divergence too large (" + J.absent + ") — deletion suspended"); }
							askWorldResync(J.absent);   // 0.9.215: patrz askWorldResync
						}
						ST._recJob = null;
					}
				}
			} catch (e) { ST._recJob = null; }
			finally { ST._applyingNet = false; }
		}
		if (isClientSync() && ST._snapRest && ST._snapRest.length && !ST._loadingWorld) {
			// 0.9.211 (from the author's 0.9.166): the guard MUST be enabled — buildOne can be the reason the GAME removes
			// a colliding structure (pipe vs. pump/valve on the same cell), and without it the handler
			// "structures:removed" sends the host a REAL demolition and wipes his base.
			ST._applyingNet = true;
			try {
				const t0 = performance.now();
				let n = 0;
				while (ST._snapRest.length && performance.now() - t0 < 6) {
					const s2 = ST._snapRest.pop();
					if (!s2) continue;
					const k2 = structKey(s2);
					const sig2 = snapSig(s2); // 0.9.143: the same pattern as in the snapshot loop
					if (ST._structSig && ST._structSig.get(k2) === sig2) continue;
					buildOne(state, s2, true, true);
					if (ST._structSig) ST._structSig.set(k2, sig2);
					if (ST._structApplied) ST._structApplied.set(k2, Date.now());
					n++;
				}
				if (n && lim("restDiag", 20)) log("SNAP: finished", n, "deferred structures, remaining", ST._snapRest.length);
			} catch (e) { if (!ST._restErr) { ST._restErr = 1; log("structure completion error:", e.message); } }
			finally { ST._applyingNet = false; }
		}
		if (isClientSync()) {
			// Re-pause heartbeat (fix G1): the game's ESC menu sends its own SetPaused(false) on close and silently
			// resumed the client's simulation (our flag still true → setClientPaused didn't re-pause) →
			// double simulation fought with the mirror = massive desync. We send [54,true] every 2s — idempotent.
			// GAME SAVE (0.9.127): the game pauses the simulation thread during the save and RESUMES it afterward.
			// Waiting for the heartbeat would mean up to 2 s of the client's own simulation = a lasting desync.
			try {
				const saving = !!(state.session && state.session.saving);
				if (saving) {
					ST._wasSaving = true;
					const mgr = managerWorker(state);
					if (mgr) try { mgr.postMessage([68, 0]); } catch (e) {}   // hold the pause for the whole save
				} else if (ST._wasSaving) {
					ST._wasSaving = false;
					const mgr = managerWorker(state);
					if (mgr) try { mgr.postMessage([68, 0]); } catch (e) {}   // the game just resumed — pause immediately
					// and ask the host to refresh EXACTLY the chunks our simulation might have touched
					try {
						const flags = state.shared.sim && state.shared.sim.chunkShouldUpdate;
						if (flags && flags.length) {
							const m = new Uint8Array((flags.length + 7) >> 3);
							let n = 0;
							for (let i = 0; i < flags.length; i++) if (flags[i]) { m[i >> 3] |= 1 << (i & 7); n++; }
							if (n) { net.send({ t: "redirty", m: b64enc(m), n: flags.length }); log("After game save: requesting host to refresh", n, "chunks that my simulation moved"); }
						}
					} catch (e) {}
				}
			} catch (e) {}
			if (ST.wsx.paused && now - (ST._rePauseT || 0) > 2000) {
				ST._rePauseT = now;
				const mgr = managerWorker(state);
				if (mgr) try { mgr.postMessage([68, 0]); } catch (e) {}
			}
			// Mirror ack, originally at 10 Hz to match the host's batch rate. The host derives its lag from
			// this and throttles itself. Cheap (~20 B) and sent unordered, so it never queues behind world
			// packets. A slower ack (2 Hz say) would add ~5 batches of its own age to the measurement and the
			// controller would throttle a perfectly healthy link.
		// 0.9.278 (MEASURED, three sessions on one map, one spot, one build, 16.09):
		//     STEAM  #1  upload 163 KB/s  1326 chunk/s  gp246  in-flight 41 KB  tok 7 KB   holds in 59% of windows
		//     RADMIN     upload 237 KB/s  1938 chunk/s  gp425  in-flight 39 KB  tok 30 KB  holds in  2% of windows
		//     STEAM  #2  upload 207 KB/s  1878 chunk/s  gp311  in-flight 45 KB  tok 14 KB  holds in 41% of windows
		// In-flight is the same 40 KB on all three, because that is the floor of the in-flight gate. The gate
		// is a WINDOW, and a window divided by the round trip is a throughput ceiling. The round trip here is
		// not just the ping: a packet counts as unacknowledged until the client's next ack TICK after it
		// arrives, plus the way back. At 10 Hz that tick adds a flat 100 ms to EVERY packet, which on a fast
		// link is most of the round trip. So the same window carries much less over a relay than over a VPN,
		// and that is the whole of the Steam vs Radmin difference: the link was never the problem.
		// An offline run of this controller with the ack tick modelled, 500 KB/s link, host wanting 900:
		//     ping  15 ms:  10 Hz -> 464 KB/s   25 Hz -> 476 KB/s
		//     ping  45 ms:  10 Hz -> 465 KB/s   25 Hz -> 477 KB/s
		//     ping  90 ms:  10 Hz -> 284 KB/s   25 Hz -> 473 KB/s
		//     ping 200 ms:  10 Hz -> 166 KB/s   25 Hz -> 222 KB/s
		//     narrow 200 KB/s link: 199 both, and a quiet world 80 both — it cannot overshoot a real limit.
		// Acking two and a half times as often also measures the backlog two and a half times more finely, so
		// the controller stops reacting to its own measurement granularity. The ack is ~20 B on the unreliable
		// channel, so 25 of them a second is nothing next to a 200 KB/s stream.
			if (ST._lastAppliedSq != null && now - (ST._lastAckT || 0) > 40) {
				ST._lastAckT = now;
				try { net.send({ t: "wcack", sq: ST._lastAppliedSq, qd: (ST._applyQ || []).length }); } catch (e) {} // qd = how many packets are waiting on my side to be applied
			}
			sendMyProjectilesIfDue(state);
			sendResourceDeltaIfDue(state); // send the host the client's resource deltas (dotNine)
			// flush the fire/ice batches every ~60 ms
			if (ST._fireQ.length && now - (ST._lastFireB || 0) > 60) { ST._lastFireB = now; try { net.send({ t: "act", k: "fireB", c: ST._fireQ, q: 1 }); } catch (e) {} ST._fireQ = []; }
			if (ST._cryoQ.length && now - (ST._lastCryoB || 0) > 60) { ST._lastCryoB = now; try { net.send({ t: "act", k: "cryoB", c: ST._cryoQ, q: 1 }); } catch (e) {} ST._cryoQ = []; }
			if (ST._volcQ.length && now - (ST._lastVolcB || 0) > 60) { ST._lastVolcB = now; try { net.send({ t: "act", k: "volcB", c: ST._volcQ, q: 1 }); } catch (e) {} ST._volcQ = []; }
			if (ST._caulkQ.length && now - (ST._lastCaulkB || 0) > 60) { ST._lastCaulkB = now; try { net.send({ t: "act", k: "caulkB", c: ST._caulkQ, q: 1 }); } catch (e) {} ST._caulkQ = []; }
			if (ST._caulkRmQ.length && now - (ST._lastCaulkRmB || 0) > 60) { ST._lastCaulkRmB = now; try { net.send({ t: "act", k: "caulkRmB", c: ST._caulkRmQ }); } catch (e) {} ST._caulkRmQ = []; }
			if (ST._shakeQ.length && now - (ST._lastShakeB || 0) > 60) { ST._lastShakeB = now; try { net.send({ t: "act", k: "shakeB", c: ST._shakeQ }); } catch (e) {} ST._shakeQ = []; }
			// Hint: connected, but the host hasn't sent the world yet (no packets to discard = the player sees "nothing")
			if (!ST.wsx.everApplied && !ST.wsx.mismatchLogged && ST.peers.size > 0 && now - (ST._waitHintT || 0) > 3000) {
				ST._waitHintT = now;
				if (!ST._worldRx) setStatus(t("waiting_world"), "#fd5"); // don't overwrite "Receiving world x/y"
			}
			// SELF-HEALING (fix for TCentraL's reconnect on a large map): no world-begin despite being connected
			// (the host's auto-send didn't work / was lost) → the client asks for a save every 15 s, MAX 4 times per session,
			// and NEVER after successfully receiving the world (_worldRxDone) — otherwise a loop of transfers/reloads (0.9.58!).
			// ...and ONLY while we're sitting in the MENU (0.9.73). A save request WHILE IN THE WORLD = another auto-load =
			// a PAGE RELOAD = a loop every ~10-15 s (ZeroHazard, J.Slayer, Akriz).
			if (!ST._worldRxDone && !ST._gotHostWorld && !ST._worldRx && !ST.wsx.everApplied && ST.peers.size > 0 &&
				state.store.scene && state.store.scene.active === 1 &&
				(ST._worldReqN || 0) < 4 && now - (ST._worldReqT || 0) > 15000) {
				ST._worldReqT = now; ST._worldReqN = (ST._worldReqN || 0) + 1;
				try { net.send({ t: "world-req" }); log("world-req " + ST._worldReqN + "/4: did not get world-begin — requesting save from host"); } catch (e) {}
			}
			// MIRROR-KICK (0.9.73 — CAUSE of "client can't dig / digs only locally", reproduced end-to-end):
			// auto-load ends with a RELOAD OF THE RENDERER PAGE. The mod comes up from scratch (everApplied=false,
			// sim is NOT paused), but the network is alive in the main process — the host does NOT get a new peer-hello,
			// so it NEVER calls enqueueFullWorld. Effect: the client stands in the host's world with a dead mirror
			// and plays locally (digging doesn't go to the host, the host doesn't see him). We ask for a STREAM (resync),
			// not a save — nothing gets reloaded, so there's nothing to turn into a loop.
			if (!ST.wsx.everApplied && !ST._loadingWorld && ST.peers.size > 0 &&
				state.store.scene && state.store.scene.active !== 1 &&
				(ST._mirrorKickN || 0) < 6 && now - (ST._mirrorKickT || 0) > 6000) {
				ST._mirrorKickT = now; ST._mirrorKickN = (ST._mirrorKickN || 0) + 1;
				try { net.send({ t: "resync" }); log("mirror-kick " + ST._mirrorKickN + "/6: I'm in the world, mirror not starting — requesting full world from host"); } catch (e) {}
			}
			// the client was ACTUALLY in the world during this session — the auto-exit condition (belt and suspenders after
			// the instant-kick incident: everApplied set in the menu must not cause a disconnect)
			if (state.store.scene && state.store.scene.active !== 1) ST.wsx.wasInWorld = true;
			// RETURN TO TITLE MENU = leaving the session (suggestion by tony.s.jennette): once the mirror
			// had already worked (everApplied) AND the client was in the world, scene 1 means a deliberate exit —
			// we disconnect cleanly instead of leaving the session in limbo. (Before the first world the client WAITS in the menu.)
			// !_loadingWorld: during OUR OWN FH.game.load the scene flashes through the menu — an auto-exit
			// in that window would do net.stop() → reconnect → new transfer → load → A LOOP (report by ZeroHazard)
			if (ST.wsx.everApplied && ST.wsx.wasInWorld && !ST._loadingWorld && state.store.scene && state.store.scene.active === 1) {
				log("Client returned to title menu — leaving co-op session");
				profileSave(state); // position/inventory per world — BEFORE lifting the pause (profileSave requires paused)
				setClientPaused(false);
				try { net.stop(); } catch (e) {}
				setStatus(t("left_to_menu"), "#fd5");
				return; // the role is already idle — the rest of the client loop makes no sense this frame
			}
			// WORLD CHANGE on the client (menu/different save) → clear tool state tied to the previous world
			// (fix by tony: "infinite items" — the old _grabTool/tank from the previous world + mouse movements = grabPlace spam)
			const curWid = state.store.meta && state.store.meta.worldId;
			if (ST._curWid !== curWid) {
				ST._curWid = curWid;
				ST._grabTool = null;
				ST._grabbedCells.clear(); ST._placedCells.clear();
				ST._fireQ = []; ST._cryoQ = []; ST._volcQ = []; ST._caulkQ = []; ST._caulkRmQ = []; ST._shakeQ = [];
				if (ST._dataSeen) ST._dataSeen.clear();
				if (ST._dataEdited) ST._dataEdited.clear();
			}
			// client profile (G7-lite): saved every 10s (position+inventory per host world)
			if (now - (ST._profT || 0) > 10000) { ST._profT = now; profileSave(state); }
			scanDataEditsIfDue(state); // machine config edited by the client → forward (G5b)
			// AUGMENTS: the client's choice (screen after the artifact) mutates mods.augments locally — diff every 500ms
			// vs. the last stream snapshot → forward the whole object to the host (host = team authority).
			if (now - (ST._augScanT || 0) > 500) {
				ST._augScanT = now;
				try {
					const cur = JSON.stringify((state.store.mods && state.store.mods.augments) || null);
					if (ST._augLast !== undefined && cur !== ST._augLast && cur !== "null") {
						ST._augLast = cur;
						ST._augEditT = now;
						net.send({ t: "act", k: "aug", a: JSON.parse(cur) });
						log("CLIENT augments → forward (selection on augments screen)");
					}
				} catch (e) {}
			}
			// mirror stall (fix G4): it was working, and for >4s nothing has come in and the host is NOT reporting a pause → show how long we've been waiting
			// FIX 0.9.74: alarm only when the host is ALIVE (resource packets are flowing) and the world stream has been silent >15 s.
			// Previously: 4 s of silence = alarm, but silence is NORMAL when nothing is changing in the world
			// (the host isn't sending anything because the queue is empty) — the player had a permanently red stall status.
			// 0.9.196: a stall = either NOTHING is coming from the host (no mirror packets), or packets are coming in,
			// the host declares a non-empty queue, and yet nothing gets applied on our side. Empty packets alone with
			// an empty host queue is normal silence in an unchanging world — we don't raise an alarm.
			const noPackets = !ST._lastWcRx || now - ST._lastWcRx > 15000;
			const stuckQueue = (ST._lastWcQ || 0) > 0 && ST._lastWcT && now - ST._lastWcT > 15000;
			if (ST.wsx.everApplied && !ST._hostPausedShown && (noPackets || stuckQueue) &&
				ST._lastResT && now - ST._lastResT < 5000 && now - (ST._stallHintT || 0) > 5000) {
				ST._stallHintT = now;
				setStatus(t("sync_stalled", Math.round((now - (noPackets ? (ST._lastWcRx || now) : ST._lastWcT)) / 1000)), "#fd5");
				ST._stallShown = true;
			}
		}
		{ const __g0 = performance.now(); drawGhosts(state); ST._profGhost = (ST._profGhost || 0) + (performance.now() - __g0); }
	};
})();
