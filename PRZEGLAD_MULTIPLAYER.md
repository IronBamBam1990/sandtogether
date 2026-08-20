# Przegląd multiplayera SandTogether — od A do Z

Stan na 2026-08-21, wersja moda **0.9.86-beta**, gra Sandustry 0.5.2–0.5.5.
Kod: `src/sandtogether.js` (3801 linii, renderer), `src/st-main.js` (708, proces główny),
`src/patch.js` (180, instalator zmian w plikach gry), `src/st-preload-append.js` (16, mostek IPC).

---

## 1. Jak to w ogóle działa

Gra nie ma trybu wieloosobowego ani API modów — mod **wstrzykuje się w pliki gry**: `app.asar`
jest rozpakowywany, a `patch.js` wstawia 22 zaczepy w `bundle.js` (kod gry), mostek IPC do
`preload.js` oraz blok startowy do `main.js`. Zaczepy są wariantowe (osobne kotwice dla wersji
gry 0.5.2–0.5.5), bo Steam serwuje różnym graczom różne buildy.

Model: **host jest autorytatywny**. Symulacja u klienta jest **zapauzowana** (`manager.postMessage([54,true])`),
a jego ekran to **lustro** świata hosta. Wszystko, co klient robi, jest wysyłane do hosta jako
*intencja*, host wykonuje to u siebie prawdziwym kodem gry, a wynik wraca strumieniem świata.

Dlaczego nie lockstep: fizyka piasku używa 83 wywołań `Math.random` i niedeterministycznego
podziału pracy między wątki — dwie instancje nigdy nie policzą tego samo.

Sieć żyje w **procesie głównym** (Steam P2P przez steamworks.js albo własny serwer WebSocket),
stan sesji moda w **rendererze**. Ten podział jest źródłem największej klasy problemów (punkt 6).

---

## 2. Warstwa transportowa

| Transport | Jak działa | Uwagi |
|---|---|---|
| **Steam P2P** | lobby FriendsOnly + `sendP2PPacket` | Idzie przez **relay Valve**, gdy nie uda się połączenie bezpośrednie: dławione pasmo, ping potrafi sięgnąć sekund. Biblioteka w grze **nie daje** `GetP2PSessionState` ani `AllowP2PPacketRelay`, więc nie wymusimy trasy. |
| **Bezpośredni (0.9.79+)** | własny serwer WS + **UPnP** otwierający port na routerze | Pełna przepustowość łącza. Adres pokazywany zamaskowany, kopiowanie bez odsłaniania. Fallback: ręczne przekierowanie portu. |
| **LAN / VPN** | ten sam serwer WS, adres podawany ręcznie | Działa też przez Tailscale/ZeroTier. |

Kanały: `pos`, `ping`, `pong`, `wcack` idą **nieuporządkowanym** kanałem Steam (inaczej RTT mierzyłby
głębokość kolejki, a nie sieć); reszta kanałem pewnym.

Przy 3–4 graczach **host jest przekaźnikiem** (`t:"relay"`) — czat, pozycje, pociski i dźwięki
przechodzą przez niego. Oznacza to, że host wysyła świat osobno do każdego gracza; jego łącze
jest wąskim gardłem sesji.

---

## 3. Protokół (29 typów wiadomości)

**Świat:** `wc` (strumień lustra), `wcack` (potwierdzenie), `resync`, `snap` (snapshot struktur),
`world-begin` / `world-chunk` / `world-end` / `world-need` / `world-req` / `world-wait` (transfer save'a).

**Gracze i sesja:** `hello`, `mver` (wersja moda + odcisk buildu gry), `ping` / `pong`, `pos`, `hb`, `chat`, `relay`.

**Stan gry:** `st` (struktury), `res` (zasoby, ulepszenia, drzewko, fabuła, progresja), `resDelta`,
`ent` (istoty/drony), `wi` (przedmioty w świecie), `snd` (dźwięki), `myproj` (pociski), `tech-nak`,
`grabres` / `grabRef` / `vacres` (odpowiedzi na zbieranie).

**Akcje klienta** (`t:"act"`, 30 rodzajów): `dig`, `set`, `place`, `build`, `demolish`, `pipeRm`, `move`,
`mv`, `paste`, `pickup`, `collect`, `vac`, `grabH`, `grabPick`, `grabPlace`, `drone`, `proj`,
`fireB`, `cryoB`, `volcB`, `caulkB`, `caulkRmB`, `shakeB`, `sig`, `sbtn`, `sdata`, `story`, `tech`,
`upg`, `aug`.

Każda akcja ma ten sam kształt: klient przechwytuje wywołanie w kodzie gry (zaczep), **anuluje je
lokalnie**, wysyła do hosta; host odtwarza je oryginalną funkcją gry.

---

## 4. Synchronizacja świata (serce moda)

- Świat: 3840×3840 komórek = **14,7 mln**, dzielony na chunki 40×40 → **9216 chunków**.
- Na komórkę idzie 12 bajtów (mapData RGBA, ściany, cień, autoryzacja, cellId, typ elementu).
- **Row-delta v5**: host trzyma hash każdego wiersza w chunku i wysyła **tylko zmienione wiersze**.
- **Fog-skip**: chunki w pełni nieodkryte (cień=255) są pomijane.
- **Dwa pasma**: szybkie (24 chunki wokół dowolnego gracza — to, co widać) i wolne FIFO (reszta).
- **Sterowanie tempem** (wkład AlyxiaFox, PR #8 + moje zmiany): klient potwierdza zastosowane paczki,
  host liczy zaległość najwolniejszego gracza i **sam się dławi** (AIMD), reagując też na ping.
  Budżet: 24 KB na paczkę (~240 KB/s), start sesji od 25 % pasma.

### Słabe punkty
1. **Row-delta zakłada, że nic nie ginie.** Hash wiersza jest oznaczany jako „wysłany" bez
   potwierdzenia. Zgubiona paczka = **trwała dziura** w świecie klienta (objaw: „ser szwajcarski”).
   Częściowo złagodzone (wykrywanie zatrzymanego potwierdzania), ale **nie rozwiązane u źródła**.
2. **Pełny świat to 9216 chunków** — przy 20–50 chunkach/s pełna synchronizacja trwa 3–8 minut.
   Ratuje nas szybkie pasmo (gracz widzi swoje otoczenie od razu), ale reszta mapy dociąga się długo.
3. **Transfer save'a** (~700 KB, paczki po 48 KB) nie jest wznawialny: przy zgubieniu paczek host
   startuje transfer od nowa zamiast dosłać brakujące.

---

## 5. Co jest zsynchronizowane

Kopanie, spray, stawianie i rozbiórka budynków, przenoszenie i kopiuj-wklej, rury, sygnały i przyciski,
konfiguracja maszyn, zbieranie (chwytak, odkurzacz, podnoszenie przedmiotów), wszystkie bronie
(pistolety, rakiety, miotacz ognia, kriolodówka, wulkanizator, caulk), drony, istoty, dźwięki,
wspólna pula zasobów, ulepszeń i badań, kroki fabuły, kolekcja stworków, liczniki fabryki, augmenty,
pozycje i sylwetki graczy z narzędziami, czat.

**Jedyne nieforwardowane narzędzie:** `placeholderGun` / wall tool — operuje na prefabach
fabularnych (`FH.terrains.transform`); ślepe przekazanie mogłoby zepsuć fabułę. U klienta jest
bezpiecznie martwe. Świadomie odłożone.

---

## 6. Największy dług architektoniczny

**Stan sesji żyje w rendererze, a renderer ginie przy każdym wczytaniu świata.**
`FH.game.load` = przeładowanie strony. 388 pól `ST._*` (lustro, pauza, zaufanie do świata, liczniki
transferu, guardy) znika, podczas gdy **połączenie w procesie głównym przeżywa** — więc host nie
wie, że druga strona wyzerowała stan.

To jedna przyczyna całej rodziny zgłoszeń z 20 sierpnia: „klient nie może kopać", „kopie u siebie",
„budynki nie dochodzą", „badania nie synchronizują się", „mapa przeładowuje się co 10 s".

Załatane trzema warstwami: **handshake** (renderer melduje się hostowi po każdym starcie, host
wznawia strumień), **mirror-kick** (klient w świecie bez lustra prosi o strumień, nigdy o save)
oraz komplet guardów. Docelowo stan krytyczny powinien mieszkać w procesie głównym.

---

## 7. Model zaufania (świadomy kompromis)

Host wykonuje intencje klienta **bez walidacji**:
- `resDelta` — klient zgłasza przyrost zasobów, host go dopisuje.
- `upg` — klient podaje poziom **i koszt**; host odejmuje to, co dostał.
- `add` / `place` — klient prosi o budynek, host stawia (`force`).
- `dig` / `set` — dowolne współrzędne w świecie.

Dla coopu ze znajomymi (lobby Steam jest FriendsOnly, LAN wymaga adresu) to akceptowalne i takie
było założenie. Ale: **zmodyfikowany klient może dać sobie zasoby, ulepszenia i budynki**, a przy
publicznym udostępnieniu adresu bezpośredniego dochodzi ryzyko obcego, który po prostu zna adres.
Nie ma też **żadnego limitu tempa** wiadomości — zalew pakietów zapcha hosta.

Rekomendacja: walidacja kosztów po stronie hosta (liczyć z definicji gry, nie z wiadomości),
limit tempa na peera i prosty sekret sesji dla trybu bezpośredniego.

---

## 8. Jakość kodu i odporność

- 187 bloków `try` / 161 `catch` — praktycznie każda ścieżka jest osłonięta, renderer nie wywala się
  od pojedynczego błędu (dobrze), ale część błędów ginie po cichu (źle przy diagnozie).
- Główna pętla robi sporo pracy na klatkę: skan brudnych chunków, diff konfiguracji maszyn co 0,8 s,
  augmenty co 0,5 s, przedmioty co 0,2 s, snapshot co 2,5 s, zasoby 1 Hz, encje 10 Hz.
- Pamięć: hashe wierszy ~1,5 MB, 22 mapy/zbiory stanu — do przyjęcia.
- Instalator jest idempotentny i od 0.9.79 **wymienia** mostek IPC (wcześniej doklejał raz, przez co
  nowe funkcje nie docierały do już zainstalowanych kopii — cichy, poważny błąd).
- Od 0.9.86 każda instancja gry pisze **własny plik logu** — wcześniej dwie kopie na jednym
  komputerze mieszały się w jednym pliku i zgłoszenia były nieczytelne.

---

## 9. Ryzyka zewnętrzne

1. **Aktualizacja gry** rozwala kotwice — 19 sierpnia (0.5.5) przestało pasować 15 z 22 zaczepów,
   a mod „działał" pozornie (panel był, akcje martwe). Mamy na to `node src/check-anchors.js <build>`.
2. **Limit publikacji Warsztatu** — 25+ publikacji w 48 h zamroziło dostarczanie plików. Zasada:
   1–3 dziennie i **weryfikacja `time_updated` po każdej publikacji** (lokalny sukces ≠ serwerowy).
3. **Auto-updater** to pojedynczy punkt awarii — gdy padł (0.9.40–0.9.71, literówka), gracze przez
   trzy dni siedzieli na starych wersjach i zgłaszali dawno naprawione błędy.

---

## 10. Co zrobić dalej (kolejność wg zysku)

1. **Potwierdzane hashe wierszy** — koniec trwałych dziur przy zgubionej paczce. Największy zysk
   dla grania przez internet.
2. **Wznawialny transfer save'a** — host trzyma paczki do potwierdzenia, dosyła brakujące zamiast
   startować od nowa.
3. **Mniej danych na komórkę** — dziś 12 bajtów; paleta + maski bitowe dają realnie 2–3× mniej.
4. **Stan krytyczny do procesu głównego** — przeładowanie renderera przestanie cokolwiek znaczyć.
5. **Walidacja i limit tempa** — zamknięcie modelu zaufania przed nadużyciem.
6. **Testy regresyjne na harnessie** (`tools/cdp.js`, dwie instancje) uruchamiane przed każdą publikacją.
7. `placeholderGun` — domknięcie ostatniego narzędzia.

---

## 11. Ocena

Mod robi rzecz, której gra w ogóle nie przewiduje: **wspólny, żywy świat piaskowy w czasie
rzeczywistym**, i robi to szeroko — zsynchronizowane jest praktycznie wszystko poza jednym
narzędziem. Architektura (host-autorytatywny + lustro + intencje) jest właściwa i przetrwała
zderzenie z prawdziwymi graczami.

Największe pozostałe słabości nie są w pomyśle, tylko w dwóch miejscach: **założeniu, że sieć nic
nie gubi** (row-delta bez potwierdzeń) oraz **rozdzieleniu stanu między dwa procesy**. Oba są
naprawialne bez przebudowy całości, w kolejności z punktu 10.
