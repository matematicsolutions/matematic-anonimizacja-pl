# Changelog

Format wg [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie [SemVer](https://semver.org/lang/pl/).

## [0.1.0-alpha] - 2026-05-22

Pierwsze wydanie. Samodzielny silnik "Let It Be".

### Dodane

- Detekcja polskich PII: PESEL/NIP/REGON/KRS (checksuma urzędowa), e-mail, telefon (z/bez +48), imię i nazwisko (gazetteer ~120 imion + heurystyka), firma z formą prawną. Sygnatury SN/NSA/WSA/KIO/TK + CELEX/ELI (domyślnie nie podmieniane - to nie PII).
- Dwa tryby RODO: `anonimizuj` (nieodwracalny, bez mapy) i `pseudonimizuj` + `odwroc` (odwracalny przez mapę).
- Rozwiązywanie nakładających się spanów (wyższe confidence wygrywa).
- Bramka "no PII leaves" (`ResidualPIIError`) - przerywa operację, gdy oryginał przetrwał podmianę. Komunikat nie ujawnia wartości.
- Wzorce operacyjne (cherry-pick z PII-Shield): `MappingStore` z TTL i cleanup, `sourceHash` (sha256), `AuditLog` plain-text dla Inspektora, archiwum AES-256-GCM (klucz scrypt).
- CLI (`bin/cli.mjs`): `wykryj`, `pseudonimizuj`, `anonimizuj`, `odwroc`. Wejście z pliku lub stdin.
- 18 testów (`node --test`), zero zależności zewnętrznych.

### Znane ograniczenia

- Fleksja imion/nazwisk poza pierwszym wystąpieniem nie zawsze łapana (bramka residual zatrzyma).
- Brak detekcji adresów, dat urodzenia, numerów dokumentów tożsamości.
