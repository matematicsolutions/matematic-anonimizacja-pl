# Third-party inspirations i atrybucja

Ten projekt powstał metodą cherry-pick MateMatic: bierzemy pattern strukturalny, treść piszemy od zera z dodaną wartością. Poniżej źródła i dokładny zakres zapożyczenia.

## 1. MateMatic `pl-entities` (projekt Patron) - kod własny

- **Źródło**: `backend/src/lib/pl-entities/` w repozytorium Patron (MateMatic Solutions).
- **Status**: kod własny MateMatic, relicencjonowany przez właściciela praw do Apache-2.0 w tym repo (w Patronie żyje pod powłoką AGPL-3.0).
- **Co wzięte (1:1, bo to algorytmy urzędowe)**: walidatory checksum PESEL/NIP/REGON9/REGON14/KRS (algorytmy z ustaw i rozporządzeń), regexy sygnatur orzeczeń (SN/NSA/WSA/KIO/TK), CELEX, ELI, firmy z formą prawną.
- **Co dopisane od zera tutaj** (czego `pl-entities` nie miał):
  - deterministyczna detekcja OSOBA przez gazetteer imion (w Patronie OSOBA była LLM-fallback),
  - rozwiązywanie nakładających się spanów (`detect.mjs`) - w Patronie zostawione "do T2",
  - dwa tryby RODO (anonimizacja nieodwracalna vs pseudonimizacja odwracalna) z wymuszeniem nieodwracalności na poziomie API,
  - port całości do czystego ESM bez zależności i bez kroku budowania.

## 2. gregmos/PII-Shield - cherry-pick patternu (MIT)

- **Źródło**: https://github.com/gregmos/PII-Shield
- **Licencja**: MIT (Grigorii Moskalev, zespół Microsoft Presidio).
- **Snapshot**: 2026-05-22 (v2.0.2).
- **Co wzięte (pattern strukturalny, NIE kod)**:
  1. TTL mapping cleanup (`MappingStore` - domyślnie 7 dni, konfigurowalne),
  2. `source_hash` per dokument (sha256),
  3. plain-text audit log "proves no PII leaves" dla Inspektora (`AuditLog`),
  4. szyfrowane archiwum mapy AES-256-GCM z kluczem scrypt (`encryptArchive`/`decryptArchive`).
- **Co napisane od zera**: cała implementacja w ESM na `node:crypto`/`node:fs`, polskie nazewnictwo zdarzeń, integracja z bramką `ResidualPIIError`.
- **Czego NIE wzięto**: GLiNER zero-shot NER + ONNX Runtime (>100 MB modeli, łamie zasadę zero-LLM/offline), architektura MCP server, 33 typy encji US/UK/zach.EU (nie rozszerzamy zakresu poza polskie PII).

## 3. Rizzo-AI-Academy/rizzo-pii - cherry-pick patternu (MIT)

- **Źródło**: https://github.com/Rizzo-AI-Academy/rizzo-pii
- **Licencja**: MIT.
- **Snapshot**: 2026-07-13.
- **Co wzięte (pattern strukturalny, NIE kod)**:
  1. stabilny placeholder per (label, wartość znormalizowana) - ten sam byt zawsze dostaje ten sam placeholder,
  2. lokalny słownik odwracania {placeholder -> wartość} z eksportem/importem JSON, który przeżywa restart aplikacji,
  3. osobny krok "Restore" - wklejasz odpowiedź LLM, oryginały wracają lokalnie.
- **Co napisane od zera**: `SlownikOdwracania` w ESM (klucz `KATEGORIA:znormalizowana`, odtwarzanie liczników z sufiksów placeholderów), integracja z istniejącą detekcją checksumową i bramką residual.
- **Czego NIE wzięto**: UI (Streamlit), detekcja przez Presidio/spaCy (łamie zasadę zero zależności), kategorie encji US.

## 4. moyupeng0422/legal-doc-redactor - cherry-pick patternu (MIT)

- **Źródło**: https://github.com/moyupeng0422/legal-doc-redactor
- **Licencja**: MIT.
- **Snapshot**: 2026-07-13.
- **Co wzięte (pattern strukturalny, NIE kod)**:
  1. batch wielu plików z JEDNOLITĄ numeracją placeholderów między plikami (liczniki nie resetują się per plik),
  2. mapping w sidecarze obok dokumentów (u nas: `*.mapa-pii.json` - ostrzeżenie w samej nazwie pliku).
- **Co napisane od zera**: `pseudonimizujPaczke` w ESM na wspólnym słowniku, bramka residual rozszerzona na całą paczkę (każdy wynik vs wszystkie oryginały słownika), zdarzenia audit logu per plik.
- **Czego NIE wzięto (roadmap v2)**: restore `.docx` z zachowaniem tracked changes przez podmianę na poziomie runs - nasz silnik jest dziś tekstowy; odnotowane w CHANGELOG jako v2.

## 5. beerbottle90/arthur-mask - cherry-pick metodyki pomiaru (licencja zastrzeżona)

- **Źródło**: https://github.com/beerbottle90/arthur-mask (katalog `degerlendirme/`)
- **Licencja**: **ArthurLegal Proprietary Non-Commercial - NIE jest to licencja open source.** Kodu ani treści stamtąd nie wolno kopiować ani redystrybuować. Wzięta została wyłącznie metodyka, czyli sposób postępowania, a ten nie podlega ochronie prawnoautorskiej.
- **Snapshot**: 2026-09-23.
- **Co wzięte (metodyka, NIE kod i NIE dane)**:
  1. zestaw ewaluacyjny ze złotymi spanami inline, jeden fragment na linię,
  2. rozdział metryki detektora od metryki ścieżki konsumenta (u nas: `ocen.mjs` i `ocen_bramki.mjs`),
  3. zasada wypalania zestawu - po pomiarze zestaw przestaje nadawać się do strojenia,
  4. kontrola negatywna jako pełnoprawna metryka obok recallu.
- **Co napisane od zera**: oba harnessy w ESM pod nasz format wyjścia i nasze etykiety, zestaw `zestaw_ukryty_1.txt` (fikcja napisana na polskie dokumenty procesowe, z identyfikatorami wygenerowanymi przez własne walidatory checksum), definicje metryk i progi.
- **Czego NIE wzięto**: żadnego fragmentu ich zestawów testowych, żadnego kodu, modeli NER ani zależności (`arthur-mask` opiera się na Presidio, spaCy i GLiNER, co łamie naszą zasadę zero zależności).

## 6. paszkiewiczmichal/poufnik - cherry-pick wzorców bezpieczeństwa (Apache-2.0)

- **Źródło**: https://github.com/paszkiewiczmichal/poufnik
- **Licencja**: Apache-2.0.
- **Snapshot**: commit `63603ca`, ocena 2026-10-10.
- **Co wzięte (idea, NIE kod - ich silnik jest w Pythonie na Presidio/spaCy)**:
  1. trójstan walidacji sumy kontrolnej (`passed` / `failed` / `not_applicable`): numer ze złą sumą nie znika z maskowania, tylko trafia do przeglądu (u nas pole `walidacjaSumy` i `doPrzegladu`),
  2. weryfikacja pliku po eksporcie własnym czytnikiem: oryginał nie może wystąpić w pliku częściej niż w tekście po podmianie, kontrola pozytywna tokenów, skan surowych bajtów, ponowna detekcja (u nas `src/weryfikacja.mjs`, trzy kodowania dobrane pod pliki tekstowe: UTF-8 NFC, UTF-8 NFD, UTF-16LE).
- **Co napisane od zera**: reguły w `src/regex.mjs` (także złe długości po etykiecie, kształty NIP/REGON-14/IBAN bez etykiety, czego źródło nie ma), moduł weryfikacji, wpięcie w CLI z usuwaniem pliku przy BLOKADZIE.

## 7. studiogo/cenzor - cherry-pick metodyki pomiaru (MIT)

- **Źródło**: https://github.com/studiogo/cenzor
- **Licencja**: MIT.
- **Snapshot**: commit `1b67063`, ocena 2026-10-10.
- **Co wzięte (metodyka, NIE kod)**:
  1. kontrola negatywna w testach: kwota, data, sygnatura z kropkami, zakres lat muszą zostać nietknięte (u nas `test/kontrola-negatywna.test.mjs`, zdania napisane od nowa, do każdej kontroli negatywnej kontrola pozytywna telefonu),
  2. sprawdzian numerów: identyfikatory z policzoną sumą włożone w zdania z pism plus fałszywe alarmy na korpusie bez numerów (u nas `ewaluacja/sprawdzian_numerow.mjs` z generatorem z ziarnem, korpusem `korpus_bez_numerow.txt` i trójstanem 0/10/20).
- **Czego NIE wzięto**: kodu, modelu spaCy, dokumentów pomiarowych z BIP-ów (zawierają prawdziwe nazwiska).

## Zgodność z kanonem cherry-pick MateMatic

- **Snapshot permissive licencji** zachowany (data 2026-05-22 w LICENSE i tutaj).
- **Pattern bierzemy, treść piszemy od zera** - powyższe listy "co dopisane / od zera".
- **Atrybucja w 3 miejscach**: [LICENSE](LICENSE), [README.md](README.md), [governance/CONSTITUTION.md](governance/CONSTITUTION.md).
