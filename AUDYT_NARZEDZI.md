# AUDYT NARZĘDZI I BLOKÓW — vanilla vs HOST vs KLIENT (29.08.2026, stan po 0.9.160)

## RUNDA WERYFIKACYJNA 29.08 (na 0.9.160, para lvl6)
- ZAGANIACZ: bateria e2e zielona — suma mapa+pula stala co do sztuki przy release/capture, klient
  lustrzany 1:1 (sprity=lista), capDiag = 1 zadanie/stworka (dedup), echo wystrzalu+fizyka+efekty OK.
- TECH-UNLOCK LIVE: host odblokowal 'volcanizer' (unlockTech z def + bypassCosts) -> KLIENT dostal
  ITEM do ekwipunku w <9 s bez restartu. Sciezka item-grant dla techow POTWIERDZONA.
- TELEPORTER: nie jest techem (brak def) — item przyznaje AKCJA kroku fabuly (runner h.run case
  "teleporter", bundle @318738). Wstrzykniety fabryczny item dziala u obu graczy (bez crasha).
  NIEDOMKNIETE: czy klient dostaje item przy ukonczeniu kroku fabuly (akcje moga byc inline w Px,
  nie w listenerze story:stepCompleted) — do weryfikacji przy realnym przejsciu anomalii.
- ZNALEZISKO tz: klient mial 360 stref teleportu vs 351 u hosta — pierwszy sync nie przycina
  lokalnych stref klienta (tzForNet wysyla tylko przy zmianie sygnatury). Do poprawki: pelny tz
  przy world-begin.
- Rury/grower/filterMk2/place/story-sync: zweryfikowane wczesniej tego dnia (sekcje nizej).

Cel (user): „ma działać perfekcyjnie". Każda pozycja: jak mutuje świat w vanilli → czy klient ma forward → status.
Legenda: ✅ działa (test/e2e lub potwierdzenie graczy) · 🟡 prawdopodobnie OK, do weryfikacji e2e · ❌ zepsute/brak forwardu · 🔧 naprawione w 0.9.158-src (przed publikacją).

## Narzędzia waniliowe (enum Np)
| Id | Narzędzie | Mechanika vanilli | Ścieżka co-op | Status |
|---|---|---|---|---|
| 1 | Łopata | dig (excavate) | _dig + profil + energia (0.9.142) | ✅ |
| 2 | Chwytak | pick/place komórek | grabH host-side + tank sloty + zwrot na mapę | ✅ |
| 3 | Rozbiórka | usuwanie struktur | _demol + dobijanie QUEUED | ✅ |
| 4 | Hak | fizyka gracza | lokalne | 🟡 |
| 5 | Odkurzacz | zasys/wylew/oddmuch (Lu+velocity, sloty) | vac/vacres/vacrel/bv (0.9.148–158) | ✅ |
| 6/8/10 | Gun/RL/Shotgun | pociski + dig eksplozji | k:proj + _dig | ✅ |
| 7 | Wybierz i przenieś | copy-paste struktur (filtr z sesji!) | flc w akcie place (0.9.147) | ✅ |
| 9 | Digger | dig | jak łopata | ✅ |
| 11 | Teleporter | teleport gracza (strefy tz) | pozycja lokalna + tz w res | 🟡 |
| 12 | Miotacz ognia | Fire przez Lu, duration~odległość | fireB + guardy terenu + duration | 🔧 |
| 13 | PipeRemover | usuwanie rur | tryb rur w _demol | ✅ |
| 14 | Hauler (drony) | drony hosta | deploy forward; **zgłoszenie Moonbugy OPEN** (grab-once; kandydat: lineId przy kolizji id) | ❌ |
| 15 | Cryoblaster | FreezingIce przez Lu+velocity | cryoB kwadruple+idle (0.9.150) | ✅ |

## Mod-itemy wbudowane (sandkit.mods.items)
| Id | PL | Mechanika | Status |
|---|---|---|---|
| drill, laser, precisionLaser | Wiertło/Laser/Precyzyjny | excavate+energy hooki (0.9.142) | ✅ (precision 🟡 zweryfikować) |
| volcanizer | Wulkanat („LavaGun") | Lava przez Lu+velocity | 🔧 |
| caulkBlaster | Blaster szczeliwa | caulk przez Lu+velocity; usuwanie caulkRmB | 🔧 / ✅ |
| corraller | **Zaganiacz** | entities.startCapture w stożku; liczniki store.creatures; encje tykane w RENDERERZE per-strona | ❌ **zaprojektowane**: hooki startCapture/spawn/launch w installFhHooks → host autorytatywny |
| locator | Lokalizator | ammo=próżniosok (konsumpcja komórek przy ładowaniu), skan lokalny | ❌ ładowanie u klienta niemożliwe (Lu drop) → forward konsumpcji |
| recallDevice | Odłamek przywołania | portal (struktura) + teleport + konsumpcja gloomu nad podstawą | ❌ obie połówki do forwardu |
| blinker | Migacz | teleport do kliknięcia | 🟡 (pozycja lokalna — powinno działać) |
| implosionGun | Próżniopistolet | ammo=próżniosok; implozja = masowe usunięcie komórek | 🟡 jeśli idzie przez excavate-hook ✅, jeśli własna ścieżka ❌ — ZWERYFIKOWAĆ |
| wallTool | (placeholderGun) | dodaje/usuwa ŚCIANY (warstwa wall!) | ❌? wall-writes klienta nie forwardowane — ZWERYFIKOWAĆ |
| coloringTool | Narzędzie do kolorowania | maluje kolory (palette/wall data) | ❌? jak wyżej |
| prefabulator | Prefabrykat | kopiuje teren → stawia jako strukturę | 🟡 stawianie przez place ✓; wycięcie terenu źródłowego? |
| energySiphon | Syfon energii | zasysa energię ze struktur | 🟡 energy.consume hook może pokrywać |
| signalLinker | Łącznik sygnałów | łączy przewody sygnałowe (data struktur?) | 🟡 jeśli data → sdata ✓ |
| sweeper, flashlight, flareGun, thruster, reconDrone, retroConsoleController | — | efekty lokalne/kosmetyka/dron zwiadu | 🟡 (reconDrone: kamera lokalna — OK) |

## Struktury / bloki budowlane
| Obszar | Status |
|---|---|
| Stawianie/rozbiórka (wszystkie typy, clearance/queued) | ✅ 0.9.143 |
| Filtry (place+edit+copy, workery) | ✅ 0.9.151 |
| Fundamenty (data), rury, przewody | ✅ |
| Shakery/growery (fp liczniki SAB) | ✅ (fp w res) |
| **swarmConsole = EKSTRAKTOR AURY (lvl 7)** + studnie pryzmitu/pryzmalinu | ❌ stan w kanałach SAB `swarmConsole.spawnJammed/crystalMined`, `auralite.convergence/production`, `prismite.*`, `prismaline.*` — NIE lustrzane → klient nie widzi postępu aury/kręgu; strefy budowy wokół dysku mogą się różnić. **Fix: rozszerzyć fp-sync o te klucze** + zweryfikować pozycję konsoli (`prismite.swarmConsolePos`). |
| Konsola retro, dekoracje Conservatory | 🟡 |
| Sygnały (przyciski/dźwignie klikane przez klienta) | 🟡 ZWERYFIKOWAĆ czy klik klienta dochodzi (podejrzenie: lokalny, sim hosta nie widzi) |

## Plan wydań
1. **0.9.158** (gotowe w src): wulkanat/szczeliwo/ogień + ack watchdoga. Test na dużym świecie → publikacja.
2. **0.9.159 „late-game batch"**: corraller (hooki entities), locator (forward konsumpcji ammo), recallDevice (portal+gloom), swarmConsole/aura SAB-sync (wzorzec fp).
3. **0.9.160 „weryfikacje"**: e2e dla 🟡 (wallTool, coloringTool, implosionGun, signalLinker, teleporter, energySiphon, przyciski sygnałów) — każdy z krótkim testem na dużym świecie; naprawy wg wyników.
4. Drony Moonbugy (lineId) — po odpowiedzi zgłaszającego albo własna reprodukcja.

Metodyka testów: duży świat lvl6/7 (polecenie usera), stały region pomiaru + przemiany typów, real itemy z zapisów, PID-owe instancje.

## Zgloszenia MaxMasterB (29.08, na 0.9.157) — PRZEANALIZOWANE, fixy w 0.9.159-src
1. FILTRY resetowane po wczytaniu (host, direct). Weryfikacja e2e na lvl6: postaw (SA.build)+filtr+save+load
   = filtr PRZEZYWA (sciezka podstawowa OK). Znaleziony realny wektor: skan sdata KLIENTA dolaczal jego
   (potencjalnie przestarzaly) filtr przy KAZDEJ zmianie danych maszyny → host cofal swoj filtr do stanu
   zapamietanego przez klienta → po zapisie "reset". FIX: m.f w sdata tylko gdy zmienil sie sig FILTRA.
   Do potwierdzenia u zglaszajacego: czy filtry stawial host czy klient i czy "reset" = default czy brak.
2. ORB/STUCK: pendingChoice+viewMode to flagi UI GRACZA we WSPOLNYM mods.augments. Dwa bledy naraz:
   (a) stream hosta przywracal drugiemu graczowi pendingChoice=true po zamknieciu popupu (>5 s po _augEditT)
   = blokada wejscia na zawsze az host wybierze → FIX klient: pendingChoice=true przyjmowane tylko na
   KRAWEDZI false→true (nowy orb), podtrzymanie ignorowane; viewMode zawsze lokalny.
   (b) handler aug u hosta robil Object.assign CALEGO obiektu → wybor klienta kasowal hostowi otwarty popup
   i cofal jego nody stara kopia → FIX: scalanie (nodes/disabledNodes=unia, liczby=max, booleany=OR,
   pendingChoice z zewnatrz moze sie tylko ZAPALIC).
   Obserwacja przy okazji: zmiany filtra hosta z dala od gracza nie sa broadcastowane (skan R=48 wokol
   gracza) — w realnej grze edycja wymaga bycia przy maszynie, wiec OK; wiedziec przy debugowaniu.

## Zgloszenia darkaliena — WYNIKI (29.08, fixy w 0.9.159-src)
1. Teleporter/anomalia po restarcie: kroki fabuly przychodzily CICHO w st (bez emisji zdarzenia) — klient
   nie odpalal nagrod/waypointow (krok anomalii otwiera cel teleportu "Void"). FIX: emisja story:stepCompleted
   dla nowych krokow od druzyny (guard _applyingNet). Zweryfikowane propagacja <8 s na parze.
2. Rury: na 0.9.159 zdrowe end-to-end (klient SA.build -> intercept -> act -> host store.pipes -> mirror;
   siatka lacznosci session.cache.pipes.grid ma wpisy po OBU stronach). Zgloszenie bylo z 0.9.157.
3. Planter box (= grower, typ 21) klienta blokuje zloto: ROOT CAUSE — akt place niesie defaultFilter
   stawiajacego i nadpisywal SPECYFICZNY auto-filtr growera [7,18,30] (przepusc zloto/nasiona) generykiem
   [1,3] (piasek+woda). FIX: nadpisanie tylko gdy filtr po budowie == defaultFilter hosta (po sortowaniu
   kluczy, bez wymuszanych affectsLiquid/Gas). Zweryfikowane: grower=specyficzny(chroniony), Mk2=nadpisywalny.

## Zgloszenia darkaliena (28.08 wieczor) — DO REPRODUKCJI (runda weryfikacji)
1. Teleporter/anomalia odblokowane W TRAKCIE sesji — klient nie widzi/nie moze uzyc az do restartu.
   Trop: sciezka grantu itemow przy live-sync tech (SYNC: tech od druzyny) nie dosypuje itemu do ekwipunku
   klienta albo pg/anomalia idzie inna sciezka niz th. Workaround znany: restart klienta.
2. Rury hosta i klienta "nie chca wspolgrac" — podejrzenie: siec rur (graf polaczen) nie laczy
   segmentow stawianych przez rozne strony. Repro na parze: kazdy stawia po kawalku rurociagu.
3. Planter box postawiony przez klienta nie przepuszcza zlota — podejrzenie: brak defaultData/propagacji
   dla tego typu przy budowie z aktu place. Repro + porownanie data z hostowym.

## Zgloszenie Maelle (31.08) — recall shard + dupe grabbera na voidbloom

### 1. Recall Shard: klient dostaje "no voidbloom above it", host dziala

Kod waniliowy (bundle 0.5.5, item `recallDevice`, struktura `homeBeacon`):
```
if(!RM) -> tryb stawiania portalu
a = structures.getAtCell(RM.x, RM.y); if(!a||a.queued) -> toast "notBuiltYet"
gloomCheck: KAZDA z 16 komorek (4x4, wiersze RM.y-4..RM.y-1) musi miec
            getResolvedTypeAtPos === RJ.Gloom (8)  -> inaczej toast "noVoidbloomFuel"
RM ustawiane w: event "building:placed" (typ homeBeacon) oraz skan store.structures w "game:ready"
```

Zweryfikowane NA ZYWO (para host+klient, duzy swiat) — wszystko ZGODNE, wiec to NIE sa przyczyny:
- `building:placed` ODPALA SIE u klienta z identycznymi wspolrzednymi (mod stawia struktury z sieci
  przez waniliowe SA.build, ktore emituje event) -> RM u klienta jest ustawione poprawnie.
- struktura widoczna po obu stronach; flaga `queued` synchronizuje sie (zbieznosc w oknie skanu 5 s).
- typ elementu Gloom(8) w lustrze klienta = 1:1 z hostem (test: 192 komorki gloomu, host 192 / klient 192,
  takze w ruchu; getResolvedTypeAtPos zwraca 8 po obu stronach).
- cząstki: pierwszy pomiar sugerowal brak, ale po odczekaniu lustro nadaza — roznicy nie potwierdzono.

STATUS: NIE ODTWORZONE. Do domkniecia potrzebny log/save od zglaszajacego (albo przejscie fabuly
do voidbloom u nas). Podejrzenie do sprawdzenia przy repro: czy 16 komorek nad baza jest u klienta
w 100% gloomem (wystarczy JEDNA komorka inna = toast), np. gdy gloom jest w formie plynnej i faluje.

### 2. Grabber: duplikacja materialow (voidbloom/void petals)

Porownanie z vanilla (funkcja H, pickup):
```
vanilla: pomija komorki juz zaklepane (dt), usuwa przez KOLEJKE Lu z WERYFIKACJA typu
         (jesli komorka zmieniona -> ROLLBACK slotu tanku), zaklepuje komorke (cV)
nasz host-harvest: removeAt natychmiast, BEZ weryfikacji i BEZ zaklepania
```
Zmierzone: `removeAt` na hoscie dziala SYNCHRONICZNIE takze dla czastek (typ->null od razu),
wiec "wyscig usuwania" nie jest tu glownym mechanizmem — ale niezmiennik i tak byl niepilnowany.

WPROWADZONE (0.9.164): host oddaje klientowi TYLKO to, co faktycznie zniknelo ze swiata
(`grabRemoveConfirmed`), a komorke, z ktorej usuniecie sie nie powiodlo, zaklepuje na 400 ms
(`grabClaim`) — normalna sciezka zbierania nietknieta (zmierzone: 0 odrzucen w tescie).
STATUS: hardening wprowadzony, ale ROOT CAUSE dupe'a voidbloom NIEPOTWIERDZONY — brak contentu
do repro (u nas fabula nieprzeszla). Do zamkniecia: log klienta od Maelle podczas dupe'a.
