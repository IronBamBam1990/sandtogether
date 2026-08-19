# SandTogether — coop mod dla Sandustry (v0.9.39-beta)

**Autor: Kamil Padula** · Współtwórcy: **dotNine**, **Knight-HD**, **DwoaC**, **Cr0ss0vr**

Mod dodaje pełny multiplayer coop do Sandustry — jeden wspólny żywy świat przez
zaproszenia Steam (lub LAN), do 4 graczy. Osiągnięcia Steam działają normalnie.

## Instalacja — RAZ, na zawsze

**Windows:**
1. Miej zainstalowane Sandustry ze Steama (odpal raz normalnie).
2. Kliknij prawym na `install.bat` → **Uruchom** (albo `install.ps1` → Uruchom
   w PowerShell; jeśli Windows blokuje: `powershell -ExecutionPolicy Bypass -File install.ps1`).
3. Odpal grę — panel **SandTogether** pojawi się w prawym górnym rogu.

**macOS** (wkład społeczności — DwoaC, przetestowane na Apple Silicon):
1. Miej zainstalowane Sandustry ze Steama (odpal raz normalnie).
2. Kliknij dwa razy `install.command` (albo w Terminalu: `bash install.command`;
   jeśli macOS blokuje: Ustawienia → Prywatność i ochrona → Otwórz mimo to).
   Bez zależności — instalator używa silnika samej gry.
3. Odpalaj grę przez `SandTogether-Launch.command` (sam doinstaluje moda,
   gdyby update Steama go cofnął) albo normalnie ze Steama.
   LAN co-op w pełni zweryfikowany; zaproszenia Steam dostały fix w 0.9.41.

**Linux** (eksperymentalne — szukamy testerów!):
1. Miej zainstalowane Sandustry ze Steama (gra ma natywny build linuksowy).
2. W terminalu: `bash install-linux.sh` (jeśli nie znajdzie gry, podaj folder:
   `bash install-linux.sh /sciezka/do/steamapps/common/Sandustry`).
   Bez zależności — instalator używa silnika samej gry.
3. Odpal grę ze Steama — panel SandTogether w prawym górnym rogu. Jeśli
   update GRY ze Steama cofnie moda, odpal ponownie `install-linux.sh`
   (aktualizacje samego moda dalej są automatyczne).

**To wszystko — na zawsze.** Od wersji 0.9.39 mod **aktualizuje się sam** przy
każdym starcie gry (z Twojej subskrypcji Warsztatu; gra raz się zrestartuje przy
aktualizacji). Instalatora nie odpalasz nigdy więcej, a obaj gracze zawsze mają
tę samą wersję.

## Jak grać (internet, przez Steam — bez konfiguracji sieci)

**Host:**
1. Panel → **Host (Steam)** → **Zaproś** (wybierz znajomego).
2. Wczytaj/rozpocznij grę — świat wyśle się dołączającemu automatycznie.

**Dołączający:**
1. Przyjmij zaproszenie Steam (działa przy otwartej i zamkniętej grze).
2. Po "World imported!": **Load Game** → wczytaj otrzymany świat.
3. Gracie w jednym wspólnym świecie (panel pokazuje "lustro hosta").

**LAN:** Host LAN / Dołącz LAN (wpisz `ip` lub `ip:port`, domyślnie 27777).
**Czat:** pole wiadomości w panelu, Enter wysyła.
**Panel:** klik w nagłówek lub Ctrl+Shift+H chowa/pokazuje. **Resync** wymusza pełne odświeżenie świata.

## Co działa (v0.9.39 — pełny coop)

- Jeden autorytatywny żywy świat: piasek, płyny, kopanie, teren, odblokowane strefy
  (streaming delta + pomijanie mgły = mało pasma, szybkie dołączanie)
- Każde narzędzie u każdego gracza: łopata, spray, broń palna i rakiety, vacuum,
  grabber, miotacz ognia, cryoblaster, demolisher
- Jedna wspólna fabryka: budowa, rozbiórka, przenoszenie, copy-paste blueprintów,
  rury, sygnały i przyciski, ustawienia maszyn — po obu stronach
- Wspólna progresja drużyny: pula badań/ulepszeń, tech tree, fabuła, cele,
  kolekcja critterów, procesy fabryczne
- Podnoszenie przedmiotów z pełnymi efektami; stworki, drony, pociski, dźwięki
- Prawdziwe modele graczy z narzędziami, duchy budowania, celownik grabbera,
  strzałki poza ekranem; czat drużynowy
- Pamięć per-gracz: wracasz do świata tam, gdzie skończyłeś, ze swoim ekwipunkiem
- Auto-reconnect (Steam i LAN); czytelne ostrzeżenia o pauzie hosta, różnicy
  wersji moda i różnych buildach gry

## Ważne dla dołączającego

Nie polegaj na zapisie gry będąc klientem — Twój zapis utrwala świat z momentu
dołączenia. Autorytatywny jest zapis hosta.

## Odinstalowanie

Steam → Sandustry → Właściwości → Zainstalowane pliki → Sprawdź spójność plików gry,
potem usuń folder `resources\app`.

---
SandTogether — **Kamil Padula** · kod źródłowy: https://github.com/IronBamBam1990/sandtogether (MIT)
