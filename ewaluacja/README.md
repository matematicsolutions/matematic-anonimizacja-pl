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
# zestawy 2 i 3 - tak samo, bez --szczegoly, dopoki nie zapadnie decyzja o ich spaleniu
node ewaluacja/ocen_bramki.mjs ewaluacja/zestaw_ukryty_2.txt --silnik .
node ewaluacja/ocen_bramki.mjs ewaluacja/zestaw_ukryty_3.txt --silnik .
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

## Wynik 2026-09-24 po poprawce reguły OSOBA (v0.2.1)

Reguła OSOBA szukała granic wyrazu przez `\b` bez flagi `u`. W JavaScripcie taki `\b` widzi
tylko litery ASCII, więc zawodził na każdej polskiej literze stojącej na granicy wyrazu:

- `Łukasz Nowak` - niewykryty wcale, bo wyraz zaczyna się od `Ł`,
- `Jan Łoś` - zamaskowany jako `Jan Ło`, a końcówka nazwiska przeciekała,
- `Anna Kość` - zamaskowana jako `Anna Ko`.

Drugi defekt: gdy para słów przed osobą nie przeszła walidacji (np. `Pozwany Jan`), skan
ruszał dalej za nią i gubił imię. Zdanie `Wnioskodawca Anna Nowak oraz Pozwany Jan Kowalski`
dawało zero wykrytych osób.

Oba defekty znaleźliśmy na przypadkach syntetycznych i poprawki nie stroiliśmy pod ten
zestaw. Zestaw posłużył już jednak 2026-09-23 do analizy luk, więc poniższy wynik nie jest
niezależnym potwierdzeniem. Kolejne zmiany zmierzymy nowym zestawem.

| Metryka | 2026-09-23 | 2026-09-24 |
|---|---|---|
| Pokrycie PII | 0,559 (52/93) | **0,634** (59/93) |
| w tym dokładne granice spanu | 0,376 | 0,452 |
| Recall OSOBA | 0,257 (9/35) | **0,457** (16/35) |
| Kontrola negatywna zjedzona | 0/17 | **0/17** |
| Nadmiarowe wykrycia | 0 | **0** |
| Ścieżka konsumenta: przeciek | 38 (54,3%) | **33 (47,1%)** |

Porównanie fragment po fragmencie: 5 fragmentów przeszło z przecieku do czystych, żaden
nie pogorszył się. Dokładny test McNemara daje p = 0,0625. Na 70 fragmentach to wyraźny
kierunek, ale wynik nierozstrzygający. Przedziały Wilsona 95% dla przecieku to
[42,7%; 65,4%] przed poprawką i [35,9%; 58,7%] po niej.

Poprawka nie rusza bramki: dalej zatrzymała 0 z 70 fragmentów, z powodu opisanego niżej.

## Wynik 2026-09-24 na zestawie_ukrytym_2 (v0.3.0)

Nowy zestaw napisał osobny agent, który nie widział `src/`, testów ani zestawu 1 i nie
uruchamiał detektora. Znał tylko ten plik (format, zasadę zaślepienia) oraz sekcje README
o zakresie i ograniczeniach, więc był ślepy na reguły, a nie na zadeklarowane słabości.
Zestaw ma 80 fragmentów, w większości wielozdaniowych, bo w prawdziwym piśmie osoba
wraca w odmianie po pierwszym przedstawieniu. Ma 350 spanów, w tym 199 OSOBA i 21 NIE.
Sumy kontrolne identyfikatorów są poprawne. Pomiar wykonano raz, na obu wersjach silnika,
bez oglądania pojedynczych fragmentów.

| Metryka | v0.2.2 | v0.3.0 |
|---|---|---|
| Pokrycie PII | 0,535 (176/329) | **0,787** (259/329) |
| w tym dokładne granice spanu | 0,419 | 0,678 |
| Recall OSOBA | 0,307 (61/199) | **0,729** (145/199) |
| Recall FIRMA | 0,871 (27/31) | 0,839 (26/31) |
| Kontrola negatywna zjedzona | 0/21 | **0/21** |
| Nadmiarowe wykrycia | 0 | **0** |
| Ścieżka konsumenta: przeciek | 71 (88,8%) | **42 (52,5%)** |

Porównanie fragment po fragmencie: 30 fragmentów przeszło z przecieku do czystych,
1 się pogorszył. Dokładny test McNemara daje p < 0,000001. Przedziały Wilsona 95% dla
przecieku nie zachodzą na siebie: [80,0%; 94,0%] przed i [41,7%; 63,1%] po.
Pogorszonego fragmentu i jednego utraconego trafienia FIRMA nie oglądaliśmy, żeby
nie spalić zestawu przed kolejną zmianą. To znany koszt tego wyniku.

Co dało wynik: nazwisko wykrytej osoby jest maskowane także w dalszych wystąpieniach,
w przypadkach liczby pojedynczej, wersalikami i bez ogonków (`src/propaguj.mjs`). Imię w odmianie
("powódki Anny", "Janowi") rozpoznaje osobę, a słownik imion urósł ze 120 do około 200.

Przeciek 52,5% liczy fragmenty z co najmniej jednym ocalałym PII - to nadal więcej niż
połowa. Od tego pomiaru zestaw 2 też jest spalony do strojenia.

Przy tym pomiarze wyszła usterka harnessu: przy braku silnika `ocen.mjs` pokazywał
"0/0" z kodem 0, a `ocen_bramki.mjs` liczył każdy błąd silnika jako BLOKADĘ, czyli jako
skuteczną ochronę. Oba skrypty kończą się teraz kodem 2 przy braku silnika, a błąd silnika
jest osobną kategorią z kodem różnym od 0.

## Wynik 2026-09-24 na zestawie_ukrytym_3 (v0.4.0)

Zestaw 3 napisał kolejny osobny agent, z tymi samymi zasadami zaślepienia i celowo innymi
gatunkami: komparycje aktów notarialnych i umów spółek (strony wersalikami), tabele i
załączniki (kolejność "Nazwisko Imię"), listy obecności, protokoły zgromadzeń, wyciągi
z KRS, maile kancelarii. Ma 80 fragmentów i 354 spany, w tym 170 OSOBA, 30 FIRMA i 24 NIE
(głównie tytuły i nagłówki wersalikami). Agent zastrzegł, że narzędzie dokleiło mu do
kontekstu `AGENTS.md` - opis zasad, bez reguł detekcji.

| Metryka | v0.3.0 | v0.4.0 |
|---|---|---|
| Pokrycie PII | 0,642 (212/330) | **0,709** (234/330) |
| Recall OSOBA | 0,535 (91/170) | **0,665** (113/170) |
| Recall FIRMA | 0,233 (7/30) | 0,233 (7/30) |
| Kontrola negatywna zjedzona | 1/24 | 1/24 |
| Nadmiarowe wykrycia | 0 | **0** |
| Ścieżka konsumenta: przeciek | 63 (78,8%) | **56 (70,0%)** |

Fragment po fragmencie: 7 naprawionych, 0 pogorszonych, dokładny McNemar p = 0,016.
Wilson 95% dla przecieku: [68,6%; 86,3%] przed, [59,2%; 78,9%] po.

Co dało wynik: wersaliki z komparycji, kolejność "Nazwisko Imię" przed separatorem tabeli
i dwa imiona ("Anna Maria Nowak") - dotąd nazwisko po dwóch imionach przeciekało.

Czego ten zestaw uczy: w umowach spółek i wyciągach KRS spółka bez formy prawnej w nazwie
to największa luka (FIRMA 0,233, wobec 0,839 na pismach procesowych z zestawu 2), a jedno zjedzenie kontroli negatywnej istniało już w v0.3.0. Nie
oglądaliśmy ani jednego, ani drugiego fragmentu - zestaw 3 jest od tego pomiaru spalony,
więc dalsza analiza luk może już korzystać z jego szczegółów.

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
