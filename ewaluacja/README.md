# Ewaluacja detektora PII

Zaślepiony pomiar skuteczności silnika na fikcyjnych polskich dokumentach prawnych.
Metodyka wzorowana na [beerbottle90/arthur-mask](https://github.com/beerbottle90/arthur-mask)
(licencja zastrzeżona, nie open source - wzięty sposób postępowania, nie kod ani dane).
Pełny zakres zapożyczenia: [THIRD_PARTY_INSPIRATIONS.md](../THIRD_PARTY_INSPIRATIONS.md).

## Po co

Silnik miał 32 testy jednostkowe i **zero pomiaru skuteczności**. Test jednostkowy mówi,
że PESEL jest wykrywany. Nie mówi, jaki odsetek PII w realnym piśmie procesowym przechodzi
przez detektor. Kancelaria zapyta o to drugie.

## Zasada zaślepienia

Zestaw powstał **przed** przeczytaniem `src/`. Autor zestawu znał deklarowany zakres
z README (PESEL, NIP, REGON, KRS, telefon, e-mail, osoby, spółki), ale nie znał reguł
detekcji. Bez tego pomiar mierzyłby zgodność reguł z samymi sobą.

Ograniczenie, które trzeba nazwać: zestaw i harness napisała ta sama osoba, która potem
analizowała luki. Zaślepienie jest przez to słabsze niż w pierwowzorze, gdzie zestawy
powstawały niezależnie od analizy. Przy następnym zestawie te role warto rozdzielić.

## Zestaw jest zużywalny

Po pomiarze zestaw jest **spalony do strojenia**: reguły dostrojone pod widziany zestaw
przestają go mierzyć. Kolejne strojenie wymaga nowego zestawu. Ta zasada jest
ważniejsza niż sam wynik.

## Uruchomienie

```bash
node ewaluacja/ocen.mjs ewaluacja/zestaw_ukryty_1.txt --silnik . --szczegoly
node ewaluacja/ocen_bramki.mjs ewaluacja/zestaw_ukryty_1.txt --silnik . --szczegoly
```

`ocen.mjs` mierzy sam detektor (`wykryj`). `ocen_bramki.mjs` mierzy **ścieżkę konsumenta**:
`anonimizuj` wraz z bramką "no PII leaves". Wynik drugiego skryptu opisuje produkt, bo tylko
on mówi, co realnie wychodzi z narzędzia.

## Format zestawu

Jedna linia na fragment, złote spany inline:

```
Powod: {{OSOBA|Marek Wiśniewski}}, PESEL {{PESEL|85071202931}}.
```

Etykieta `NIE` to **kontrola negatywna**: treść, której zamaskować nie wolno (sygnatury,
przepisy, nazwy sądów, kwoty, terminy). Zamaskowana sygnatura psuje dokument prawny
równie skutecznie jak przeoczony PESEL.

Identyfikatory w zestawie mają **poprawne sumy kontrolne** (PESEL, NIP, REGON, IBAN).
Fixture z błędną sumą mierzyłby walidator, nie detektor.

## Wynik 2026-09-23 (zestaw_ukryty_1, sha256:3d0ad1defb5cc0dd, 70 fragmentów)

Detektor (`wykryj`), 93 złote spany PII:

| Metryka | Wartość |
|---|---|
| Pokrycie PII | **0,559** (52/93) |
| w tym dokładne granice spanu | 0,376 |
| Kontrola negatywna zjedzona | **0/17** |
| Nadmiarowe wykrycia | **0** |

Recall per typ: ADRES, PESEL, NIP, EMAIL, REGON, KRS po 1,000 · PHONE 0,667 ·
IBAN 0,500 · FIRMA 0,313 · OSOBA 0,257 · DATA_UR 0,000.

Ścieżka konsumenta (`anonimizuj` plus bramka), 70 fragmentów:

| Wynik | Liczba |
|---|---|
| Czysto | 32 (45,7%) |
| Blokada bramki | **0 (0,0%)** |
| Przeciek z kodem wyjścia 0 | **38 (54,3%)** |

## Diagnoza

Identyfikatory strukturalne trzymają się dobrze, a precyzja nie ma tu ani jednego potknięcia:
zero nadmiarowych wykryć i zero zjedzonych sygnatur na 70 fragmentach. Detektor nie strzela
poza cel. Problem jest wyłącznie recallowy, a to lepsza strona do naprawiania.

Luka siedzi w osobach i spółkach, i układa się w klasy:

1. Fleksja - `Wiśniewskiego`, `Adamczykowi`, `Nowak-Zielińskiej`
2. Samo nazwisko bez imienia - `Lewandowski`, `Kaczmarek`
3. Odwrócona kolejność - `Kowalczyk Jan` (typowa w tabelach i załącznikach)
4. Wielkie litery - `JAN KOWALCZYK` (typowe w komparycji)
5. Brak diakrytyków po OCR - `Lukasz Zolcinski`
6. Inicjały - `M.W.`, `K. Adamczyka`
7. Nazwisko brzmiące jak słowo pospolite - `Jan Zamek`, `Andrzej Sowa`
8. Nazwy spółek - większość form `sp. z o.o.` i `spółka jawna`
9. Telefon stacjonarny z prefiksem miejskim i w nawiasie, IBAN ze spacjami,
   data urodzenia słownie

## Defekt bramki "no PII leaves"

Bramka jest **zamknięta w pętli z własnym detektorem**. `bin/cli.mjs:70` buduje listę
oryginałów przez `detect(text)`, a `detectResidualPII` sprawdza `text.includes(original)`
dla tej listy. Czego detektor nie wykrył, tego na liście nie ma, więc bramka tego nie szuka.

Praktycznie bramka zadziała tylko wtedy, gdy detektor wykryje formę **krótszą** niż ta,
która została w tekście (wykryte `Wiśniewski` znajdzie pozostałe `Wiśniewskiego` przez
`includes`). Detektor wykrywa jednak `Imię Nazwisko`, czyli formę dłuższą - i dlatego na
70 fragmentach bramka nie zadziałała ani razu.

Do tego pomiaru `README.md` i `SKILL.md` zapowiadały, że bramka zatrzyma właśnie fleksję
nazwiska. Zapis poprawiono tego samego dnia: opisuje teraz zakres, który bramka realnie ma.

**Dopóki defekt trwa**, nie twierdzimy publicznie, że bramka zatrzymuje PII przeoczone
przez detektor. Kod wyjścia 0 jest informacją o detektorze, nie gwarancją o dokumencie.

## Co ten pomiar mierzy, a czego nie

Mierzy: tekst czysty, jedna linia na raz, dokumenty fikcyjne.

Nie mierzy: dokumentów wielostronicowych, `.docx`, `.pdf`, skanów, spójności etykiet
między dokumentami w paczce, ani zachowania na prawdziwych aktach. Zaufanie produkcyjne
wymaga zestawu wywiedzionego z zatwierdzonych, zamaskowanych dokumentów kancelarii -
a tego nie da się zrobić bez zgody i poza tajemnicą zawodową.
