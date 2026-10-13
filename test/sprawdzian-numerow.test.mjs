// Sprawdzian numerow (ewaluacja/sprawdzian_numerow.mjs) jako bramka w testach.
//
// Kontrola pozytywna bramki: na silniku z wycieta regula i na pustej liscie
// MUSI byc BLOKADA - bramki, ktorej nie widzielismy na czerwono, nie mamy.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as silnik from "../src/index.mjs";
import {
    sprawdzian, zdaniaSprawdzianu, wczytajKorpus,
    genPesel, genPeselZly, genNip, genNipZly, genRegon9, genRegon14, genIban, genIbanZly, genDowod, losowacz,
} from "../ewaluacja/sprawdzian_numerow.mjs";

test("sprawdzian: generatory licza poprawna sume (i zly PESEL jest zly)", () => {
    const r = losowacz(7);
    for (let i = 0; i < 200; i++) {
        assert.ok(silnik.isValidPesel(genPesel(r)));
        assert.ok(!silnik.isValidPesel(genPeselZly(r)));
        assert.ok(!silnik.isValidNip(genNipZly(r)));
        assert.ok(!silnik.isValidIbanPl(genIbanZly(r)));
        assert.ok(silnik.isValidNip(genNip(r)));
        assert.ok(silnik.isValidRegon(genRegon9(r)));
        assert.ok(silnik.isValidRegon(genRegon14(r)));
        assert.ok(silnik.isValidIbanPl(genIban(r)));
        assert.ok(silnik.isValidDowodOsobisty(genDowod(r)));
    }
});

test("sprawdzian: to samo ziarno = te same zdania", () => {
    assert.deepEqual(zdaniaSprawdzianu(5), zdaniaSprawdzianu(5));
    assert.notDeepEqual(zdaniaSprawdzianu(5), zdaniaSprawdzianu(6));
});

test("sprawdzian: na silniku kazdy numer wyciety wlasciwym typem, zero falszywych alarmow", () => {
    for (const ziarno of [20261013, 1, 2, 3, 4]) {
        const wynik = sprawdzian({ silnik, proby: zdaniaSprawdzianu(ziarno), korpus: wczytajKorpus() });
        assert.equal(wynik.status, "OK", `ziarno ${ziarno}: ${JSON.stringify(wynik.powody)}`);
    }
});

test("sprawdzian: silnik bez reguly PESEL daje BLOKADE (kontrola pozytywna bramki)", () => {
    const reguly = silnik.PL_EXTRACTION_RULES.filter((r) => !r.id.startsWith("pesel"));
    const okaleczony = {
        detect: (t) => silnik.detect(t, { rules: reguly }),
        anonimizuj: (t) => silnik.anonimizuj(t, { rules: reguly }),
    };
    const wynik = sprawdzian({ silnik: okaleczony, proby: zdaniaSprawdzianu(), korpus: wczytajKorpus() });
    assert.equal(wynik.status, "BLOKADA");
    assert.ok(wynik.powody.some((p) => /PESEL/.test(p.opis) && p.status === "BLOKADA"));
});

test("sprawdzian: pusta lista prob albo pusty korpus = BLOKADA, nie sukces", () => {
    assert.equal(sprawdzian({ silnik, proby: [], korpus: wczytajKorpus() }).status, "BLOKADA");
    assert.equal(sprawdzian({ silnik, proby: zdaniaSprawdzianu(), korpus: [] }).status, "BLOKADA");
});

test("sprawdzian: falszywy alarm na korpusie bez numerow daje UWAGI", () => {
    const wynik = sprawdzian({ silnik, proby: zdaniaSprawdzianu(), korpus: ["Kontakt: tel. 600 700 800."] });
    assert.equal(wynik.status, "UWAGI");
});

test("sprawdzian: powody nie zawieraja wartosci numerow", () => {
    const proby = zdaniaSprawdzianu();
    const reguly = silnik.PL_EXTRACTION_RULES.filter((r) => r.type !== "NIP");
    const wynik = sprawdzian({
        silnik: { detect: (t) => silnik.detect(t, { rules: reguly }), anonimizuj: (t) => silnik.anonimizuj(t, { rules: reguly }) },
        proby, korpus: wczytajKorpus(),
    });
    const tekst = JSON.stringify(wynik.powody);
    for (const p of proby) assert.ok(!tekst.includes(p.numer), `wartosc w powodach: ${p.nazwa}`);
});
