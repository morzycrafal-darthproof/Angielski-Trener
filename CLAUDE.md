# English Trainer — streszczenie projektu

PWA do nauki angielskiego dla polskiego użytkownika na poziomie B1–B2, z naciskiem na angielski w IT.
Interfejs i wyjaśnienia są po polsku, treść do nauki po angielsku.

- **Repo:** `morzycrafal-darthproof/Angielski-Trener` (wcześniej `English-Trainer`)
- **Adres:** https://morzycrafal-darthproof.github.io/Angielski-Trener/
- **Hosting:** GitHub Pages z gałęzi `main`, folder `/` (root). Nie ma kroku budowania.
- **Urządzenie docelowe:** Pixel 9 Pro XL, Chrome, aplikacja zainstalowana jako PWA.

## Zasady
- Czysty HTML/CSS/JS, **bez frameworków, bez npm, bez kroku budowania**. Tak samo jak w pozostałych PWA autora (Dziennik-HRV, Cupra Terramar).
- Mobile first: szerokość ~400 px, dolna nawigacja, tryb ciemny przez `prefers-color-scheme`.
- Wszystkie ścieżki do zasobów są względne (`icon-192.png`, `sw.js`), bo strona działa w podfolderze `/Angielski-Trener/`.
- Teksty interfejsu i komunikaty commitów piszemy po polsku.

## Pliki
| Plik | Rola |
|---|---|
| `index.html` | Cała aplikacja: style, widoki, logika w jednym `<script>` |
| `data.js` | Treść: `WORDS` (słówka), `GRAMMAR` (pytania), `SENTENCES` (zdania do mówienia i dyktanda) |
| `b2.js` | Ścieżka B1 → B2+ (talia `b2`, ~440 pozycji) i pytania gramatyczne B2. Ładowane po `data.js`, dopisuje się do `WORDS` i `GRAMMAR` |
| `sw.js` | Service worker: najpierw sieć, potem cache (`ignoreSearch: true`) |
| `manifest.json` | Manifest PWA |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Ikony instalacyjne (Android wymaga PNG) |
| `icon.svg` | Favicon w przeglądarce |

## Moduły (widoki w obiekcie `V`, routing przez `go(view)` → `render()`)
- **home:** plan dnia, statystyki, ustawienia (talia, limit nowych słów dziennie), dodawanie słów, eksport/import JSON. Jeśli talia to `b2` i nie było testu, pokazuje zaproszenie do testu poziomującego.
- **test:** test poziomujący oceniany przez aplikację. Próbka 10 pozycji z każdego poziomu (`B2_LEVELS`). Przy każdej wybór polskiego znaczenia z 4 opcji albo „Nie wiem”. Błędne opcje (`testOpts()`) pochodzą z tego samego typu (najpierw z tego samego poziomu), a czasowniki (`to …`) dostają tylko czasowniki. Wynik poziomu = (trafienia − błędy/3) / pytania, czyli korekta za zgadywanie. Poziomy z wynikiem ≥80% zaliczane są kolejno od B1 (pierwszy niezaliczony przerywa ciąg). Wszystkie pozycje zaliczonych poziomów i pojedyncze trafienia dostają kartę z `int` 30–60 dni (`knownCard()`), więc wracają na kontrolę. Błędy i „nie wiem” zostają nowe.
- **cards:** fiszki z algorytmem SM-2 (`grade(w, q)`: 0 = nie wiem, 3 = trudne, 4 = dobrze, 5 = łatwe). Kierunek EN→PL albo PL→EN losowany, wymowa przez `speechSynthesis` (en-GB).
- **grammar:** pytania jednokrotnego wyboru z wyjaśnieniem. Tematy z błędami wracają częściej (`S.grammar.wrong[topic]`).
- **speak:** rozpoznawanie mowy (`webkitSpeechRecognition`, en-GB). Porównanie słów przez LCS w `compare()`, błędnie wymówione słowa są podkreślane.
- **listen:** dyktando. Zdanie czytane przez TTS (normalnie lub 🐢 wolniej), wpisany tekst porównywany przez `compare()`.
- **add:** własne słowa (talia `custom`).

## Dane (localStorage, klucz `et_v1`)
```js
S = {
  cards:   { [en.toLowerCase()]: { ef, reps, int /*dni*/, due /*ms*/, lapses } },
  custom:  [ { en, pl, ex, deck: 'custom' } ],
  grammar: { done, ok, wrong: { [topic]: n } },
  days:    [ 'YYYY-MM-DD', ... ],   // licznik dni nauki z rzędu
  settings:{ deck: 'b2'|'all'|'it'|'work'|'general'|'custom', newPerDay, newToday, newDate, v },
  placement: { date, res: { B1: %, ... }, passed: ['B1', ...] }   // wynik ostatniego testu poziomującego
}
```
Kluczem fiszki jest angielskie słowo pisane małymi literami. Zmiana pisowni `en` w `data.js`/`b2.js` gubi postęp tej fiszki. To samo `en` w dwóch taliach dzieli postęp, więc nowych pozycji nie dublujemy (sprawdzaj skryptem).
`settings.v` to wersja ustawień: brak `v` oznacza starego użytkownika, którego migracja przełącza jednorazowo na talię `b2` i 15 nowych dziennie.
Nowe karty podawane są w kolejności z plików, więc kolejność w `b2.js` to ścieżka nauki: poziomami, a w obrębie poziomu typy są przeplatane automatycznie (kod na końcu listy w `b2.js`).

## Dodawanie treści (`data.js`)
- Słowo: `W(deck, en, pl, przykład, wyjaśnienie?)`, gdzie talie to `it`, `work`, `general`.
- Pytanie: `G(temat, pytanie, [opcje], indeksPoprawnej, wyjaśnienieWJęzykuPolskim)`.
- Zdanie: `S_(en, pl)`.
- Pozycja ścieżki B2 (`b2.js`): `B(poziom, typ, en, pl, przykład, wyjaśnienie?)`, poziomy `B1`, `B1+`, `B2`, `B2+`, typy `word`, `col` (kolokacja), `pv` (phrasal verb), `phr` (zwrot). Docelowe proporcje: ok. 40% słowa, 25% kolokacje, 25% phrasal verbs, 10% zwroty. Słowa i przykłady piszemy sami (nie kopiujemy list typu Oxford 3000/5000).
- Pytanie B2: `GB(...)` — jak `G`, z `level: 'B2'`.
- Po zmianie sprawdź składnię (`node --check data.js b2.js`), duplikaty `en` w całym `WORDS` i czy `a < opts.length`.

## WAŻNE: PWA i instalacja (wnioski z debugowania)
1. **Po każdej zmianie plików podbij wersję `CACHE` w `sw.js`** (obecnie `english-trainer-v6`). Nowe pliki dopisz do `FILES`.
2. **Nie zmieniaj `id` w manifeście** (`/Angielski-Trener/`). Chrome po nim rozpoznaje zainstalowaną aplikację. Zmiana `id` tworzy „nową” aplikację i potrafi zablokować instalację. `id`, `start_url` i `scope` są pełnymi ścieżkami `/Angielski-Trener/`. **Nie dodawaj przed nie `./`**, bo wtedy adres wskazuje na `/Angielski-Trener/Angielski-Trener/`.
3. Android instaluje PWA (WebAPK) tylko z ikonami PNG 192 i 512. Samo SVG daje jedynie skrót.
4. Historia problemu: pierwsza instalacja (jeszcze bez ikon PNG) się nie dokończyła. Chrome pokazywał potem „Ta aplikacja jest już zainstalowana” i „Nie udało się otworzyć aplikacji”, choć w `chrome://webapks` jej nie było. Nie pomogły zmiana `id`, zmiana nazwy repo, restart telefonu ani czyszczenie cache Google Play. **Pomogło dopiero usunięcie danych przeglądania w Chrome.** Diagnostyka na telefonie: `chrome://webapks` i `chrome://serviceworker-internals`.
5. **Wspólne dane:** wszystkie PWA autora (Dziennik-HRV, Cupra-Terramar, STGym, Angielski-Trener) działają pod tym samym adresem `morzycrafal-darthproof.github.io`, więc dzielą pamięć przeglądarki. Usunięcie danych witryny kasuje dane **wszystkich** tych aplikacji. Przed takim krokiem zawsze zrób eksport. Klucze localStorage muszą być unikalne (tu `et_v1`).
6. Rozpoznawanie mowy wymaga HTTPS, więc działa na GitHub Pages, a nie z pliku lokalnego.

## Testowanie
Brak testów automatycznych. Lokalnie: `npx http-server -p 8000 -c-1` (na tym komputerze nie ma Pythona) w katalogu repo i otwarcie `http://localhost:8000`. Service worker działa na localhost, rozpoznawanie mowy tylko w Chrome i Safari.

## Plan rozwoju (ustalony 2026-10-22)
Cel użytkownika: ogólny angielski z poziomu A2/B1 do B2+, 15–20 min dziennie, 15 nowych pozycji dziennie. IT jest drugorzędne.
1. ✅ Talia `b2` (~440 pozycji) + ~60 pytań gramatycznych B2.
2. ✅ Test poziomujący.
3. Tryb z luką: zdanie z przykładu z wykropkowanym słowem (aktywne przypominanie).
4. Układanie zdań z rozsypanych słów (gramatyka przez wzorce).
5. Punkty i poziomy (lokalnie).
6. Ewentualnie: rozmowa z botem AI na własnym kluczu API użytkownika (płatne, zapis tylko w telefonie).
- Kolejne paczki `b2.js` po 300–500 pozycji, gdy talia się kończy.
- Odrzucone: analiza głosek (Web Speech zwraca tylko słowa), wycinki filmów (prawa autorskie, rozmiar), rankingi ze znajomymi (wymaga serwera), powiadomienia (brak Notification Triggers w Chrome, push wymaga serwera).
