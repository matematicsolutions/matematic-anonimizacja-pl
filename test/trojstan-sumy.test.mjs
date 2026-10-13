// Trojstan walidacji sumy kontrolnej (passed / failed / not_applicable).
//
// Wzorzec z oceny paszkiewiczmichal/poufnik (#4, idea, nie kod): numer ze ZLA
// suma nie znika z maskowania - literowka albo blad OCR w PESEL to nadal dana
// osobowa. Zostaje zamaskowany i oznaczony do przegladu.
//
// Wszystkie numery SYNTETYCZNE: poprawne policzone recznie albo celowo popsute
// w ostatniej cyfrze. Nie naleza do nikogo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { detect, pseudonimizuj, anonimizuj } from "../src/index.mjs";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

const PESEL = "44051401359";       // poprawna suma
const PESEL_ZLY = "44051401358";   // ta sama data, zla cyfra kontrolna
const pesele = (t) => detect(t).entities.filter((e) => e.type === "PESEL");

test("trojstan: 11 cyfr ze zla suma BEZ etykiety zamaskowane jako PESEL i oznaczone do przegladu", () => {
    const t = `Swiadek, ur. 14.05.1944 r., nr ${PESEL_ZLY}, zam. w Lodzi.`;
    const [e] = pesele(t);
    assert.ok(e, "zly PESEL bez etykiety zniknal z maskowania (cichy wyciek)");
    assert.equal(e.ruleId, "pesel-zla-suma-bez-etykiety");
    assert.equal(e.walidacjaSumy, "failed");
    assert.equal(e.doPrzegladu, true);
    assert.equal(e.raw, PESEL_ZLY, "span musi objac wszystkie 11 cyfr");
});

test("trojstan: po pseudonimizacji i anonimizacji z 11 cyfr nie zostaje ani jedna", () => {
    const t = `Faktura nr ${PESEL_ZLY} z dnia 1 marca.`;
    for (const wynik of [pseudonimizuj(t).text, anonimizuj(t).text]) {
        assert.ok(!/\d{2,}/.test(wynik.replace(/\[[A-Z_]+_\d+\]/g, "")), `zostaly cyfry: ${wynik}`);
        assert.match(wynik, /\[PESEL_1\]/);
    }
});

test("trojstan: anonimizuj przenosi oznaczenie do przegladu (bez wartosci)", () => {
    const { entities } = anonimizuj(`nr ${PESEL_ZLY}`);
    assert.equal(entities.length, 1);
    assert.equal(entities[0].walidacjaSumy, "failed");
    assert.equal(entities[0].doPrzegladu, true);
    assert.ok(!("raw" in entities[0]) && !("normalized" in entities[0]));
});

test("trojstan: kazda encja ma jedna z trzech wartosci", () => {
    const t = `Jan Kowalski, PESEL ${PESEL}, PESEL ${PESEL_ZLY}, KRS 0000123456, jan@example.pl`;
    const wg = Object.fromEntries(detect(t).entities.map((e) => [e.ruleId, e]));
    assert.equal(wg["pesel"].walidacjaSumy, "passed");
    assert.equal(wg["pesel"].doPrzegladu, false);
    assert.equal(wg["pesel-zla-suma"].walidacjaSumy, "failed");
    assert.equal(wg["pesel-zla-suma"].doPrzegladu, true);
    assert.equal(wg["krs"].walidacjaSumy, "not_applicable");   // KRS nie ma publicznej sumy
    assert.equal(wg["email"].walidacjaSumy, "not_applicable");
    assert.equal(wg["osoba"].walidacjaSumy, "not_applicable");
    for (const e of detect(t).entities) {
        assert.ok(["passed", "failed", "not_applicable"].includes(e.walidacjaSumy), `${e.ruleId}: ${e.walidacjaSumy}`);
    }
});

test("trojstan: poprawny PESEL bez etykiety raz, passed (bez duplikatu z regula zlej sumy)", () => {
    const p = pesele(`nr ${PESEL} w aktach`);
    assert.equal(p.length, 1);
    assert.equal(p[0].ruleId, "pesel");
    assert.equal(p[0].walidacjaSumy, "passed");
});

test("trojstan: zly PESEL z etykieta wygrywa z regula bez etykiety (jedna encja)", () => {
    const p = pesele(`PESEL: ${PESEL_ZLY}`);
    assert.equal(p.length, 1);
    assert.equal(p[0].ruleId, "pesel-zla-suma");
});

// Brzegi zmierzone sonda przed/po (13.10): czesc z nich do 0.7.0 maskowala PRZYPADKIEM
// regula telefonu (9 cyfr z dluzszego ciagu, reszta jawna); po granicy cyfr w telefonie
// bylyby jawne w calosci. IBAN i NIP 3-3-2-2 ze zla suma byly jawne juz w 0.7.0.
const BRZEGI = [
    ["PESEL z etykieta, brak cyfry (OCR)", "PESEL 4405140135, zam. w Lodzi.", "4405140135", "PESEL"],
    ["PESEL z etykieta, cyfra za duzo", "PESEL 440514013590, zam. w Lodzi.", "440514013590", "PESEL"],
    ["NIP zla suma bez etykiety, ciagiem", "Kontrahent 5260250275 zaplacil.", "5260250275", "NIP"],
    ["NIP zla suma bez etykiety, 3-3-2-2", "Kontrahent 526-025-02-75 zaplacil.", "526-025-02-75", "NIP"],
    ["NIP z etykieta, cyfra za duzo", "NIP 52602502745 wpisano.", "52602502745", "NIP"],
    ["REGON-14 zla suma bez etykiety", "Oddzial 12345678512340 dziala.", "12345678512340", "REGON"],
    ["REGON z etykieta, brak cyfry", "REGON 12345678 nadano.", "12345678", "REGON"],
    ["IBAN zla suma z PL", "Rachunek PL61 1090 1014 0000 0712 1981 2875 zamknieto.", "PL61 1090 1014 0000 0712 1981 2875", "IBAN"],
    ["NRB zla suma bez PL", "Rachunek 61109010140000071219812875 zamknieto.", "61109010140000071219812875", "IBAN"],
];

for (const [nazwa, zdanie, numer, typ] of BRZEGI) {
    test(`trojstan brzegi: ${nazwa} - zamaskowany w calosci, do przegladu`, () => {
        const start = zdanie.indexOf(numer);
        const na = detect(zdanie).entities.filter((e) => e.isPii && e.start < start + numer.length && start < e.end);
        assert.equal(na.length, 1, `encje na numerze: ${na.map((e) => e.ruleId)}`);
        assert.equal(na[0].type, typ);
        assert.equal(na[0].doPrzegladu, true);
        assert.equal(na[0].start, start);
        assert.equal(na[0].end, start + numer.length);
        const cyfry = numer.replace(/\D/g, "");
        const zostalo = (anonimizuj(zdanie).text.replace(/\[[A-Z_]+_\d+\]/g, " ").match(/\d{2,}/g) ?? [])
            .filter((c) => cyfry.includes(c));
        assert.deepEqual(zostalo, []);
    });
}

test("trojstan brzegi: 12 cyfr bez etykiety to nie identyfikator (granica, nazwana w SKILL.md)", () => {
    assert.deepEqual(detect("Zamowienie 440514013590 zrealizowano.").entities.filter((e) => e.isPii), []);
});

test("KRS: etykieta 'pod numerem' daje pewnosc 0.95, wiec numer zostaje przy minConfidence 0.8", () => {
    // Sam ksztalt (10 cyfr od "000") to tylko 0.7 - przy progu 0.8 KRS bez etykiety odpada.
    const krs = (t) => detect(t, { minConfidence: 0.8 }).entities.filter((e) => e.type === "KRS").map((e) => e.ruleId);
    assert.deepEqual(krs("Spolka wpisana do rejestru KRS pod numerem 0000123456."), ["krs"]);
    assert.deepEqual(krs("Spolka wpisana do KRS nr 0000123456."), ["krs"]);
    assert.deepEqual(krs("Spolke wpisano pod nr 0000123456."), []);
    assert.deepEqual(detect("Spolke wpisano pod nr 0000123456.").entities.map((e) => e.ruleId), ["krs-bez-etykiety"]);
});

test("KRS z cyframi przechodzacymi sume NIP zostaje KRS (wczesniej token NIP)", () => {
    // 0000908136 i 0000461416 przechodza sume NIP - znalezione przez sprawdzian numerow (ziarna 1, 2).
    const typ = (t) => detect(t).entities.filter((e) => e.isPii).map((e) => e.type);
    assert.deepEqual(typ("Spolka wpisana do rejestru KRS 0000908136."), ["KRS"]);
    assert.deepEqual(typ("Spolke wpisano pod nr 0000461416 dnia 12 stycznia."), ["KRS"]);
});

test("trojstan: 10 i 12 cyfr bez etykiety nie sa PESEL", () => {
    assert.equal(pesele("nr 4405140135 i 440514013590").length, 0);
});

test("trojstan: CLI anonimizuj ostrzega o numerach do przegladu, bez wartosci w komunikacie", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trojstan-"));
    try {
        const wej = join(dir, "pismo.txt");
        await writeFile(wej, `Swiadek nr ${PESEL_ZLY} zeznal.`, "utf8");
        const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, "anonimizuj", wej]);
        assert.ok(!stdout.includes(PESEL_ZLY));
        assert.match(stderr, /do przegladu/);
        assert.match(stderr, /PESEL:1/);
        assert.ok(!stderr.includes(PESEL_ZLY), "wartosc w komunikacie");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
