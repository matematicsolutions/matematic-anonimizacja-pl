// Kontrola negatywna: czego maskowac NIE wolno.
//
// Wzorzec z oceny studiogo/cenzor (#5, idea, nie kod): falszywy alarm na kwocie,
// dacie albo sygnaturze psuje pismo rownie skutecznie jak przeoczony PESEL.
// Zdania napisane od nowa w stylu pism, nie przepisane z ich testow.
//
// Do kazdej kontroli negatywnej jest kontrola pozytywna (telefon nadal lapany),
// zeby poprawka nie mogla przejsc przez wylaczenie reguly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, anonimizuj, pseudonimizuj } from "../src/index.mjs";

const NIETYKALNE = [
    ["kwota z groszami", "Wartosc przedmiotu sporu wynosi 152 422 384,00 zl.", "152 422 384,00 zl"],
    ["kwota w PLN", "Sad zasadzil kwote 600 700 800 PLN wraz z odsetkami.", "600 700 800 PLN"],
    ["kwota slownie po liczbie", "Szkoda wyniosla 312 450 990 zlotych.", "312 450 990 zlotych"],
    ["kwota jako czesc wiekszej liczby", "Kapital zakladowy 1 152 422 384 zl zostal pokryty.", "1 152 422 384 zl"],
    ["kwota bez waluty w tabeli", "Razem: 4 123 456,78", "4 123 456,78"],
    ["kwota wielomilionowa", "Wydatki zamknely sie kwota 8 113 087 zl.", "8 113 087 zl"],
    ["data z kropkami", "Umowe zawarto dnia 05.05.2016 r. w Krakowie.", "05.05.2016"],
    ["data ISO", "Termin uplywa 2026-01-31.", "2026-01-31"],
    ["sygnatura z kropkami", "Postepowanie o sygnaturze 1331.35.2020 umorzono.", "1331.35.2020"],
    ["zakres lat", "Program realizowany w latach 2015-2030 przez gmine.", "2015-2030"],
    ["sygnatura sadowa", "Wyrok w sprawie I C 123/24 jest prawomocny.", "I C 123/24"],
    ["przepis", "Na podstawie art. 415 k.c. w zw. z art. 361 par. 1 k.c.", "art. 415 k.c."],
];

for (const [nazwa, zdanie, fragment] of NIETYKALNE) {
    test(`kontrola negatywna: ${nazwa} zostaje nietknieta`, () => {
        assert.ok(zdanie.includes(fragment), "zly fixture");
        const start = zdanie.indexOf(fragment);
        const end = start + fragment.length;
        const naFragmencie = detect(zdanie).entities
            .filter((e) => e.isPii && e.start < end && start < e.end)
            .map((e) => `${e.type}(${e.ruleId})`);
        assert.deepEqual(naFragmencie, [], `fragment "${fragment}" zjedzony przez ${naFragmencie}`);
        assert.ok(anonimizuj(zdanie).text.includes(fragment));
        assert.ok(pseudonimizuj(zdanie).text.includes(fragment));
    });
}

const TELEFONY = [
    ["tel. 600 700 800, w dni robocze", "600700800"],
    ["Prosze dzwonic +48 601 234 567 po poludniu.", "601234567"],
    ["kom. 600-700-800.", "600700800"],
    ["Kontakt: 600700800", "600700800"],
    ["tel. 600 700 800 lub 601 702 803", "601702803"],
    ["tel. 48 601 234 567 (bez plusa)", "601234567"],
];

for (const [zdanie, krajowy] of TELEFONY) {
    test(`kontrola pozytywna: telefon w "${zdanie}" nadal maskowany`, () => {
        const tel = detect(zdanie).entities.filter((e) => e.type === "PHONE").map((e) => e.normalized);
        assert.ok(tel.includes(krajowy), `zgubiony telefon ${krajowy}, sa: ${tel}`);
    });
}
