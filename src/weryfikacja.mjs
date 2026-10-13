// Weryfikacja pliku PO zapisie, wlasnym czytnikiem.
//
// Wzorzec z oceny paszkiewiczmichal/poufnik (#12, idea, nie kod): bramka "no PII
// leaves" sprawdza tekst w pamieci, a do odbiorcy idzie PLIK. Zapis bywa inny niz
// tekst (kodowanie, uciecie, pozniejsza zmiana formatu wyjscia), wiec plik jest
// czytany od nowa i sprawdzany niezaleznie od tego, kto go zapisal:
//
//   oryginaly        - zaden oryginal nie wystepuje w pliku czesciej niz w tekscie
//                      po podmianie (zwykle: zero razy)                -> BLOKADA
//   tokeny           - kontrola POZYTYWNA: kazdy wydany token jest w pliku;
//                      brak tokenu = plik nie jest tym, co zatwierdzila bramka
//                                                                        -> BLOKADA
//                      zero tokenow = nie ma czego sprawdzic             -> UWAGI
//   surowe-bajty     - oryginal w bajtach pliku w trzech kodowaniach: UTF-8 (NFC),
//                      UTF-8 (NFD - tak bywa po kopiowaniu z PDF), UTF-16LE
//                                                                        -> BLOKADA
//   ponowna-detekcja - silnik na odczytanym pliku nie znajduje danych osobowych
//                                                                        -> UWAGI
//
// Wynik: trojstan OK / UWAGI / BLOKADA. Komunikaty niosa WYLACZNIE liczniki i typy,
// nigdy wartosci - raport mozna zalogowac.

import { readFile } from "node:fs/promises";
import { detect, countByType } from "./detect.mjs";

export const WERYFIKACJA_OK = "OK";
export const WERYFIKACJA_UWAGI = "UWAGI";
export const WERYFIKACJA_BLOKADA = "BLOKADA";

/** Ten sam prog co bramka residual: krotsze oryginaly to inicjaly, szum. */
const MIN_DLUGOSC = 2;

function ileRazy(tekst, fraza) {
    if (!fraza) return 0;
    let n = 0;
    for (let i = tekst.indexOf(fraza); i !== -1; i = tekst.indexOf(fraza, i + fraza.length)) n++;
    return n;
}

function ileRazyBajty(bufor, wzor) {
    if (wzor.length === 0) return 0;
    let n = 0;
    for (let i = bufor.indexOf(wzor); i !== -1; i = bufor.indexOf(wzor, i + wzor.length)) n++;
    return n;
}

const KODOWANIA = [
    ["UTF-8", (s) => Buffer.from(s.normalize("NFC"), "utf8")],
    ["UTF-8 NFD", (s) => Buffer.from(s.normalize("NFD"), "utf8")],
    ["UTF-16LE", (s) => Buffer.from(s.normalize("NFC"), "utf16le")],
];

/**
 * Czyta zapisany plik od nowa i sprawdza go niezaleznie od zapisu.
 *
 * @param {string} sciezka zapisany plik wynikowy.
 * @param {object} oczekiwane
 * @param {string}   oczekiwane.tekst     tekst po podmianie, ktory przeszedl bramke.
 * @param {string[]} oczekiwane.oryginaly oryginalne wartosci PII (wejscie bramki).
 * @param {string[]} oczekiwane.tokeny    tokeny wydane dla tego pliku.
 * @param {object}  [oczekiwane.opts]     opcje detect() uzyte przy podmianie.
 * @returns {Promise<{status:string, kontrole:Array<{kontrola:string, status:string, opis:string}>}>}
 */
export async function zweryfikujEksport(sciezka, { tekst, oryginaly = [], tokeny = [], opts = {} }) {
    const kontrole = [];
    const dodaj = (kontrola, status, opis) => kontrole.push({ kontrola, status, opis });

    let bufor;
    try {
        bufor = await readFile(sciezka);
    } catch (err) {
        dodaj("odczyt", WERYFIKACJA_BLOKADA, `nie da sie odczytac zapisanego pliku (${err.code ?? "blad"})`);
        return { status: WERYFIKACJA_BLOKADA, kontrole };
    }
    const odczytany = bufor.toString("utf8").normalize("NFC");
    const oczekiwany = String(tekst ?? "").normalize("NFC");
    const doSprawdzenia = [...new Set(oryginaly)].filter((o) => typeof o === "string" && o.length >= MIN_DLUGOSC);

    // 1. Oryginaly w odczytanym tekscie.
    const nadmiarowe = doSprawdzenia.filter((o) => {
        const n = o.normalize("NFC");
        return ileRazy(odczytany, n) > ileRazy(oczekiwany, n);
    }).length;
    dodaj("oryginaly", nadmiarowe ? WERYFIKACJA_BLOKADA : WERYFIKACJA_OK, nadmiarowe
        ? `${nadmiarowe} z ${doSprawdzenia.length} oryginalow jest w pliku czesciej niz w tekscie po podmianie`
        : `${doSprawdzenia.length} oryginalow - zaden nie przetrwal w pliku`);

    // 2. Kontrola pozytywna: tokeny.
    const unikalneTokeny = [...new Set(tokeny)];
    if (unikalneTokeny.length === 0) {
        dodaj("tokeny", WERYFIKACJA_UWAGI, "zero tokenow - nic nie zamaskowano, kontrola pozytywna nie ma czego sprawdzic");
    } else {
        const brakujace = unikalneTokeny.filter((t) => !odczytany.includes(t)).length;
        dodaj("tokeny", brakujace ? WERYFIKACJA_BLOKADA : WERYFIKACJA_OK, brakujace
            ? `${brakujace} z ${unikalneTokeny.length} tokenow brak w pliku - zapis rozni sie od zatwierdzonego tekstu`
            : `${unikalneTokeny.length} tokenow - wszystkie sa w pliku`);
    }

    // 3. Surowe bajty w trzech kodowaniach.
    const oczekiwaneBajty = Buffer.from(oczekiwany, "utf8");
    const trafienia = {};
    for (const o of doSprawdzenia) {
        const widziane = new Set();
        for (const [nazwa, koduj] of KODOWANIA) {
            const wzor = koduj(o);
            const klucz = wzor.toString("hex");
            if (widziane.has(klucz)) continue; // NFD == NFC dla napisow bez znakow diakrytycznych
            widziane.add(klucz);
            if (ileRazyBajty(bufor, wzor) > ileRazyBajty(oczekiwaneBajty, wzor)) {
                trafienia[nazwa] = (trafienia[nazwa] ?? 0) + 1;
            }
        }
    }
    const opisTrafien = Object.entries(trafienia).map(([k, n]) => `${k}:${n}`).join(", ");
    dodaj("surowe-bajty", opisTrafien ? WERYFIKACJA_BLOKADA : WERYFIKACJA_OK, opisTrafien
        ? `oryginaly w surowych bajtach pliku (${opisTrafien})`
        : `${doSprawdzenia.length} oryginalow x ${KODOWANIA.length} kodowania - zero trafien`);

    // 4. Ponowna detekcja na odczytanym pliku.
    const ponownie = detect(odczytany, opts).entities.filter((e) => e.isPii);
    const typy = Object.entries(countByType(ponownie)).map(([k, n]) => `${k}:${n}`).join(",");
    dodaj("ponowna-detekcja", ponownie.length ? WERYFIKACJA_UWAGI : WERYFIKACJA_OK, ponownie.length
        ? `silnik widzi w zapisanym pliku ${ponownie.length} danych osobowych ({${typy}}) - przejrzyj przed wyslaniem`
        : "silnik nie widzi w zapisanym pliku danych osobowych");

    const status = kontrole.some((k) => k.status === WERYFIKACJA_BLOKADA) ? WERYFIKACJA_BLOKADA
        : kontrole.some((k) => k.status === WERYFIKACJA_UWAGI) ? WERYFIKACJA_UWAGI
            : WERYFIKACJA_OK;
    return { status, kontrole };
}

/** Jedna linia do stderr: status + kontrole niebedace OK. Bez wartosci. */
export function opiszWeryfikacje(w) {
    const problemy = w.kontrole.filter((k) => k.status !== WERYFIKACJA_OK);
    const szczegoly = problemy.length
        ? problemy.map((k) => `[${k.status}] ${k.kontrola}: ${k.opis}`).join("; ")
        : `${w.kontrole.length} kontrole`;
    return `Weryfikacja eksportu: ${w.status} (${szczegoly})`;
}
