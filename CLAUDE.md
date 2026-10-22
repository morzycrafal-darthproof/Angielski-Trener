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
| `sw.js` | Service worker: najpierw sieć, potem cache (`ignoreSearch: true`) |
| `manifest.json` | Manifest PWA |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Ikony instalacyjne (Android wymaga PNG) |
| `icon.svg` | Favicon w przeglądarce |

## Moduły (widoki w obiekcie `V`, routing przez `go(view)` → `render()`)
- **home:** plan dnia, statystyki, ustawienia (talia, limit nowych słów dziennie), dodawanie słów, eksport/import JSON.
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
  settings:{ deck: 'all'|'it'|'work'|'general'|'custom', newPerDay, newToday, newDate }
}
```
Kluczem fiszki jest angielskie słowo pisane małymi literami. Zmiana pisowni `en` w `data.js` gubi postęp tej fiszki.

## Dodawanie treści (`data.js`)
- Słowo: `W(deck, en, pl, przykład, wyjaśnienie?)`, gdzie talie to `it`, `work`, `general`.
- Pytanie: `G(temat, pytanie, [opcje], indeksPoprawnej, wyjaśnienieWJęzykuPolskim)`.
- Zdanie: `S_(en, pl)`.
- Po zmianie sprawdź składnię (`node --check data.js`) i czy `a < opts.length`.

## WAŻNE: PWA i instalacja (wnioski z debugowania)
1. **Po każdej zmianie plików podbij wersję `CACHE` w `sw.js`** (obecnie `english-trainer-v4`). Nowe pliki dopisz do `FILES`.
2. **Nie zmieniaj `id` w manifeście** (`/Angielski-Trener/`). Chrome po nim rozpoznaje zainstalowaną aplikację. Zmiana `id` tworzy „nową” aplikację i potrafi zablokować instalację. `id`, `start_url` i `scope` są pełnymi ścieżkami `/Angielski-Trener/`. **Nie dodawaj przed nie `./`**, bo wtedy adres wskazuje na `/Angielski-Trener/Angielski-Trener/`.
3. Android instaluje PWA (WebAPK) tylko z ikonami PNG 192 i 512. Samo SVG daje jedynie skrót.
4. Historia problemu: pierwsza instalacja (jeszcze bez ikon PNG) się nie dokończyła. Chrome pokazywał potem „Ta aplikacja jest już zainstalowana” i „Nie udało się otworzyć aplikacji”, choć w `chrome://webapks` jej nie było. Nie pomogły zmiana `id`, zmiana nazwy repo, restart telefonu ani czyszczenie cache Google Play. **Pomogło dopiero usunięcie danych przeglądania w Chrome.** Diagnostyka na telefonie: `chrome://webapks` i `chrome://serviceworker-internals`.
5. **Wspólne dane:** wszystkie PWA autora (Dziennik-HRV, Cupra-Terramar, STGym, Angielski-Trener) działają pod tym samym adresem `morzycrafal-darthproof.github.io`, więc dzielą pamięć przeglądarki. Usunięcie danych witryny kasuje dane **wszystkich** tych aplikacji. Przed takim krokiem zawsze zrób eksport. Klucze localStorage muszą być unikalne (tu `et_v1`).
6. Rozpoznawanie mowy wymaga HTTPS, więc działa na GitHub Pages, a nie z pliku lokalnego.

## Testowanie
Brak testów automatycznych. Lokalnie: `python3 -m http.server` w katalogu repo i otwarcie `http://localhost:8000`. Service worker działa na localhost, rozpoznawanie mowy tylko w Chrome i Safari.

## Pomysły na rozwój
- Więcej słówek IT i pytań gramatycznych.
- Przypomnienia o nauce (powiadomienia).
- Wykres postępów, tryb „tylko błędne”.
- Synchronizacja między urządzeniami (obecnie tylko eksport i import JSON).
