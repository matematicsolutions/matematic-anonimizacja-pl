# Changelog

Format wg [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie [SemVer](https://semver.org/lang/pl/).

## [0.3.0] - 2026-09-24

Osoba wykryta raz jest maskowana w calym tekscie. Zmienia wynik detekcji (wiecej encji OSOBA), dlatego wersja minor.

### Dodane

- `src/propaguj.mjs`: nazwisko kazdej wykrytej osoby jest maskowane przy dalszych wystapieniach - w przypadkach liczby pojedynczej ("Zielinskiej", "Kaczmarkowi", "Wrobla"), wersalikami i bez ogonkow po OCR. Liczba mnoga ("Kowalscy") nie jest obslugiwana. Kazda forma dostaje wlasny token, wiec pseudonimizacja odwraca sie co do znaku.
- Imie w odmianie rozpoznaje osobe ("powodki Anny Zielinskiej", "pozwanemu Janowi Kowalskiemu"). Slownik imion: ok. 200 imion (bylo ok. 120) wraz z odmiana.
- `.githooks/commit-msg`: blokuje polskie znaki i dlugi myslnik w tresci commita (konwencja z AGENTS.md).
- `ewaluacja/zestaw_ukryty_2.txt`: 80 fragmentow, 350 spanow, napisany na slepo przez osobnego agenta.

### Zmierzone (ewaluacja/README.md, zestaw 2)

- Recall OSOBA 0,307 -> 0,729, przeciek sciezka konsumenta 88,8% -> 52,5% (30 naprawionych, 1 pogorszony, McNemar p < 0,000001), kontrola negatywna 0/21 bez zmian, 0 nadmiarowych wykryc. FIRMA 27/31 -> 26/31.

### Naprawione

- Harness `ewaluacja/`: przy braku silnika raport pokazywal "0/0" z kodem 0, a blad silnika liczyl sie jako BLOKADA. Teraz kod 2 przy braku silnika i osobna kategoria bledu silnika.

### Znane, jeszcze otwarte

- Nazwisko osoby, ktora nigdy nie stoi przy imieniu, nie jest wykrywane; pierwsze wystapienie tylko wersalikami ("JAN KOWALCZYK") i odwrocona kolejnosc ("Kowalczyk Jan") tez nie.

## [0.2.2] - 2026-09-24

### Naprawione

- Tekst w postaci NFD (np. z PDF: litera bazowa plus laczacy akcent zamiast "Ś") gubil adresy i czesc osob, bo reguly szukaja liter w postaci zlozonej. `detect()` normalizuje teraz wejscie do NFC i zwraca pole `text`, do ktorego odnosza sie offsety `start`/`end`. Dla wejscia juz w NFC nic sie nie zmienia.
- `pseudonimizuj`, `anonimizuj` i `pseudonimizujPaczke` zwracaja tekst w NFC. `sourceHash` liczy dalej skrot z wejscia, tak jak przyszlo.
- 1 nowy test (wejscie NFD: te same typy encji co dla NFC, zero przecieku po anonimizacji). Razem 35.

## [0.2.1] - 2026-09-24

Poprawka wykrywania osob. Bez zmian w API.

### Naprawione

- Regula OSOBA szukala granic wyrazu przez `\b` bez flagi `u`, wiec nie widziala polskiej litery na granicy wyrazu. "Łukasz Nowak" nie byl wykrywany, a "Jan Łoś" byl maskowany jako "Jan Ło" (koncowka nazwiska przeciekala). Granice ustala teraz lookaround na `\p{L}` z flaga `u`.
- Gdy para slow przed osoba nie przeszla walidacji (np. "Pozwany Jan"), skan gubil imie nastepnej osoby. Regula OSOBA szuka teraz dalej od drugiego slowa odrzuconej pary (`retryOnReject`).
- 2 nowe testy. Razem 34.

### Zmierzone (ewaluacja/README.md)

- Recall OSOBA 0,257 -> 0,457, przeciek sciezka konsumenta 54,3% -> 47,1%, kontrola negatywna 0/17 bez zmian. Zestaw posluzyl juz wczesniej do analizy luk, wiec to kierunek, nie niezalezne potwierdzenie.

### Znane, jeszcze otwarte

- Brak normalizacji Unicode (NFC) na wejsciu: tekst w postaci NFD gubi osoby i adresy.
- Slownik imion nie zna czesci imion (np. "Żaneta").
- Bramka "no PII leaves" dalej sprawdza tylko to, co wykryl detektor.

## [0.2.0] - 2026-07-13

Warstwa odwracalnej redakcji PACZKI dokumentow. Do tej pory `pseudonimizuj` + `odwroc` dzialaly na pojedynczym dokumencie, a kazdy plik dostawal wlasna numeracje ([OSOBA_1] w pozwie i [OSOBA_1] w zeznaniu mogly byc dwiema roznymi osobami).

### Dodane

- `src/paczka.mjs` - `SlownikOdwracania`: stabilny placeholder per (kategoria, wartosc znormalizowana) w obrebie calej paczki; jednolita numeracja miedzy plikami; eksport/import JSON przezywa restart procesu (wczytany slownik kontynuuje numeracje, znane wartosci trzymaja stare placeholdery). Liczniki odtwarzane takze z sufiksow placeholderow, gdy pole `liczniki` w sidecarze jest niepelne.
- `pseudonimizujPaczke(pliki, opts)` - pseudonimizacja wielu dokumentow na wspolnym slowniku; per plik zwraca tekst, liczniki i `source_hash`.
- `przywroc(text, slownik)` - przywraca oryginaly (np. w odpowiedzi LLM) i raportuje placeholdery bez wpisu w slowniku (inna paczka albo zmyslone przez model).
- CLI: `paczka <plik...> --slownik s.mapa-pii.json [--out-dir]` oraz `przywroc <plik|-> --slownik s.mapa-pii.json`. Konwencja nazwy sidecara `*.mapa-pii.json` (ostrzezenie w nazwie pliku); CLI ostrzega, gdy nazwa od niej odbiega.
- Bramka "no PII leaves" dla paczki: kazdy wynik sprawdzany przeciw WSZYSTKIM oryginalom slownika (takze z innych plikow i poprzednich sesji); przy porazce nic nie jest zapisywane.
- Zdarzenie audit logu `paczka-applied` (per plik) i `pseudonim-reversed` dla `przywroc`.
- 11 nowych testow (roundtrip paczki, determinizm, jednolita numeracja, import/eksport, kontynuacja numeracji po restarcie procesu przez CLI, halucynowane placeholdery). Razem 32.

### Wzorce (pattern, nie kod - THIRD_PARTY_INSPIRATIONS.md)

- Rizzo-AI-Academy/rizzo-pii (MIT): stabilny placeholder per (label, wartosc znormalizowana) + slownik odwracania z eksportem/importem.
- moyupeng0422/legal-doc-redactor (MIT): jednolita numeracja w batchu + mapping w sidecarze.

### Roadmap v2 (nie w tym wydaniu)

- Tryb docx z zachowaniem tracked changes (podmiana na poziomie runs) - silnik jest dzis tekstowy.
- Publikacja pakietu (npm/PyPI wrapper) - poza tym wydaniem.

## [0.1.0-alpha] - 2026-05-22

Pierwsze wydanie. Samodzielny silnik "Let It Be".

### Dodane

- Detekcja polskich PII: PESEL/NIP/REGON/KRS (checksuma urzędowa), IBAN/NRB (checksuma mod-97), dowód osobisty (checksuma), e-mail, telefon (z/bez +48), imię i nazwisko (gazetteer ~120 imion + heurystyka), firma z formą prawną, adres (ulica + numer, kod pocztowy). Sygnatury SN/NSA/WSA/KIO/TK + CELEX/ELI (domyślnie nie podmieniane - to nie PII).
- Flaga `--min-confidence <n>` (CLI) i opcja `minConfidence` (biblioteka) - próg czułości detekcji.
- CI na GitHub Actions (`node --test` na Node 20/22/24).
- Dwa tryby RODO: `anonimizuj` (nieodwracalny, bez mapy) i `pseudonimizuj` + `odwroc` (odwracalny przez mapę).
- Rozwiązywanie nakładających się spanów (wyższe confidence wygrywa).
- Bramka "no PII leaves" (`ResidualPIIError`) - przerywa operację, gdy oryginał przetrwał podmianę. Komunikat nie ujawnia wartości.
- Wzorce operacyjne (cherry-pick z PII-Shield): `MappingStore` z TTL i cleanup, `sourceHash` (sha256), `AuditLog` plain-text dla Inspektora, archiwum AES-256-GCM (klucz scrypt).
- CLI (`bin/cli.mjs`): `wykryj`, `pseudonimizuj`, `anonimizuj`, `odwroc`. Wejście z pliku lub stdin.
- 18 testów (`node --test`), zero zależności zewnętrznych.

### Znane ograniczenia

- Fleksja imion/nazwisk poza pierwszym wystąpieniem nie zawsze łapana (bramka residual zatrzyma).
- Adres bez prefiksu ulicy (ul./al./pl./os.) może umknąć.
- Brak detekcji dat urodzenia, paszportu, prawa jazdy, PWZ.
