# Audyt warstwy synchronizacji — 2026-08-20

## Wniosek: jedna przyczyna, nie kilkanaście bugów

Zgłoszenia z ostatnich dni — J.Slayer ("nie mogę kopać jako klient"), Akriz ("kolega kopie u siebie,
ja go nie widzę"), Tobi1Kenobi ("klient nie może kopać, budowanie nie dochodzi, resync na czerwono"),
Drewby ("tylko host kopie piasek"), ZeroHazard/TCentraL/Spiddy (przeładowanie mapy co ~10 s),
derErste67 ("animacja kopania, zero efektu") — to NIE są osobne błędy. To jeden mechanizm.

## Mechanizm

1. Wczytanie świata w grze (`FH.game.load`) = PRZEŁADOWANIE STRONY renderera.
2. Cały stan sesji moda (388 pól `ST._*`: lustro, pauza, zaufanie świata, liczniki transferu) żyje
   w RENDERERZE i ginie przy tym przeładowaniu.
3. Sieć żyje w procesie MAIN i przeładowanie przeżywa — połączenie się NIE zrywa.
4. Host uzbrajał pełny świat tylko w trzech miejscach: `peer-connected`, `hello`, `resync`.
   Żadne z nich nie odpala się po przeładowaniu renderera klienta — host nie ma skąd wiedzieć,
   że druga strona straciła cały stan.

Efekt: klient stoi w świecie hosta z MARTWYM lustrem i grą NIEZAPAUZOWANĄ — czyli gra we własnej
kopii świata. Kopanie nie jest forwardowane (forward wymaga aktywnego lustra), host go nie widzi,
badania się nie synchronizują. Stary mechanizm ratunkowy prosił wtedy o SAVE → kolejny auto-load →
kolejne przeładowanie → pętla co ~10-15 s.

## Naprawy (0.9.73 - 0.9.77)

| Wersja | Zmiana | Status |
| --- | --- | --- |
| 0.9.73 | MIRROR-KICK: klient w świecie bez lustra prosi o STRUMIEŃ (nie o save) | zweryfikowane e2e |
| 0.9.74 | `t()` podstawia `{0}` (gracze widzieli dosłownie "{0}"); fałszywy alarm "brak danych świata" po 4 s ciszy → teraz 15 s + wymóg, by host żył | zweryfikowane |
| 0.9.75 | Zakleszczenie transferu: klient prosił o paczki starego `tid`, host odsyłał je z nowym → wieczne "recovering", a guard blokował każdy kolejny transfer | zweryfikowane |
| 0.9.76 | HANDSHAKE: renderer klienta ogłasza się hostowi przy każdej inicjalizacji (także po przeładowaniu) i podaje swój worldId | wprowadziło błąd timingu |
| 0.9.77 | Handshake czeka na przechwycenie stanu gry; host wysyła save TYLKO gdy klient nie jest na jego świecie | zweryfikowane e2e |

## Dowód (log z testu na dwóch instancjach)

```
HANDSHAKE: renderer gotowy — zglaszam sie hostowi (wid=jxk6nk3hjip scene=4)
hello: klient JUZ na moim swiecie — tylko stream, bez save
Pierwsze paczki swiata zastosowane — lustro dziala
```

Przed naprawą ten sam scenariusz kończył się: `paused=false`, `everApplied=false`,
status "Czekam na świat hosta", host `pending=0` — czyli klient sam w swoim świecie.

## Co dalej (kolejność)

1. Odzyskiwanie transferu: host powinien trzymać paczki do potwierdzenia odbioru (dziś przy zgubieniu
   paczek startuje cały transfer od nowa).
2. Stan sesji krytyczny dla synchronizacji przenieść do procesu MAIN (przeżywa przeładowanie) —
   handshake to załatwia objawowo, ale źródłem jest podział stanu między dwa procesy.
3. Testy regresyjne na harnessie `tools/cdp.js` (dwie instancje + skrypt) przed każdą publikacją.
