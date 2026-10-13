// Weryfikacja pliku PO zapisie, wlasnym czytnikiem.
//
// Wzorzec z oceny paszkiewiczmichal/poufnik (#12, idea, nie kod): eksport nie
// jest udany, dopoki zapisany plik nie zostanie przeczytany od nowa i sprawdzony:
//   - oryginal nie wystepuje czesciej niz w tekscie po podmianie,
//   - kontrola POZYTYWNA: kazdy wydany token jest w pliku,
//   - surowe bajty w trzech kodowaniach (UTF-8 NFC, UTF-8 NFD, UTF-16LE),
//   - ponowna detekcja na pliku nic nie znajduje.
// Wartosci syntetyczne.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { pseudonimizuj, zweryfikujEksport } from "../src/index.mjs";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

const PESEL = "44051401359";
const TEKST = `Pozew wniosl Jan Kowalski (PESEL ${PESEL}) przeciwko Annie Zielińskiej.`;

async function wKatalogu(fn) {
    const dir = await mkdtemp(join(tmpdir(), "weryfikacja-"));
    try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function przygotuj() {
    const res = pseudonimizuj(TEKST);
    return { tekst: res.text, oryginaly: Object.values(res.map), tokeny: Object.keys(res.map) };
}

const statusKontroli = (w, nazwa) => w.kontrole.find((k) => k.kontrola === nazwa)?.status;

test("weryfikacja: czysty eksport = OK, wszystkie kontrole przebiegly", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, e.tekst, "utf8");
    const w = await zweryfikujEksport(plik, e);
    assert.equal(w.status, "OK", JSON.stringify(w.kontrole));
    for (const k of ["oryginaly", "tokeny", "surowe-bajty", "ponowna-detekcja"]) {
        assert.equal(statusKontroli(w, k), "OK", k);
    }
}));

test("weryfikacja: oryginal w zapisanym pliku = BLOKADA", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, e.tekst + `\nDopisek: ${PESEL}`, "utf8");
    const w = await zweryfikujEksport(plik, e);
    assert.equal(w.status, "BLOKADA");
    assert.equal(statusKontroli(w, "oryginaly"), "BLOKADA");
}));

test("weryfikacja: brak tokenu w pliku (np. uciety zapis) = BLOKADA - kontrola pozytywna", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, e.tekst.slice(0, e.tekst.indexOf("[PESEL_1]")), "utf8");
    const w = await zweryfikujEksport(plik, e);
    assert.equal(w.status, "BLOKADA");
    assert.equal(statusKontroli(w, "tokeny"), "BLOKADA");
}));

test("weryfikacja: oryginal w NFD w surowych bajtach = BLOKADA", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const nazwisko = e.oryginaly.find((o) => o.includes("ń"));
    assert.ok(nazwisko, "fixture potrzebuje oryginalu z diakrytykiem");
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, e.tekst + "\n" + nazwisko.normalize("NFD"), "utf8");
    const w = await zweryfikujEksport(plik, e);
    assert.equal(w.status, "BLOKADA");
    assert.equal(statusKontroli(w, "surowe-bajty"), "BLOKADA");
}));

test("weryfikacja: oryginal w UTF-16LE w surowych bajtach = BLOKADA", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, Buffer.concat([Buffer.from(e.tekst, "utf8"), Buffer.from(PESEL, "utf16le")]));
    const w = await zweryfikujEksport(plik, e);
    assert.equal(w.status, "BLOKADA");
    assert.equal(statusKontroli(w, "surowe-bajty"), "BLOKADA");
}));

test("weryfikacja: ponowna detekcja znajduje nowe PII = UWAGI", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const plik = join(dir, "wynik.txt");
    // Telefon spoza listy oryginalow (np. dopisany po podmianie) - wartosci w raporcie byc nie moze.
    await writeFile(plik, e.tekst + "\ntel. 600 700 800", "utf8");
    const w = await zweryfikujEksport(plik, e);
    assert.equal(w.status, "UWAGI");
    assert.equal(statusKontroli(w, "ponowna-detekcja"), "UWAGI");
    assert.ok(!JSON.stringify(w).includes("600 700 800"), "wartosc w raporcie");
}));

test("weryfikacja: zero tokenow = UWAGI (kontrola pozytywna nie ma czego sprawdzic), nie OK", () => wKatalogu(async (dir) => {
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, "Pismo bez danych osobowych.", "utf8");
    const w = await zweryfikujEksport(plik, { tekst: "Pismo bez danych osobowych.", oryginaly: [], tokeny: [] });
    assert.equal(w.status, "UWAGI");
}));

test("weryfikacja: komunikaty bez wartosci PII", () => wKatalogu(async (dir) => {
    const e = przygotuj();
    const plik = join(dir, "wynik.txt");
    await writeFile(plik, e.tekst + `\n${PESEL} Jan Kowalski`, "utf8");
    const raport = JSON.stringify(await zweryfikujEksport(plik, e));
    for (const o of e.oryginaly) assert.ok(!raport.includes(o), "wartosc w raporcie");
}));

test("weryfikacja: CLI anonimizuj --out melduje wynik weryfikacji zapisanego pliku", () => wKatalogu(async (dir) => {
    const wej = join(dir, "pismo.txt");
    const wyj = join(dir, "pismo.anon.txt");
    await writeFile(wej, TEKST, "utf8");
    const { stderr } = await execFileAsync(process.execPath, [CLI, "anonimizuj", wej, "--out", wyj]);
    // Liczba kontroli, nie samo "OK": zaslepka bez weryfikacji tez umie napisac "OK".
    assert.match(stderr, /Weryfikacja eksportu: OK \(4 kontrole\)/);
    assert.ok(!(await readFile(wyj, "utf8")).includes(PESEL));
}));

test("weryfikacja: CLI paczka weryfikuje kazdy zapisany plik", () => wKatalogu(async (dir) => {
    const wej = join(dir, "pozew.txt");
    await writeFile(wej, TEKST, "utf8");
    const { stderr } = await execFileAsync(process.execPath, [
        CLI, "paczka", wej, "--slownik", join(dir, "p.mapa-pii.json"), "--out-dir", join(dir, "wyniki"),
    ]);
    assert.match(stderr, /pozew\.pseudo\.txt \| Weryfikacja eksportu: OK \(4 kontrole\)/);
    await access(join(dir, "wyniki", "pozew.pseudo.txt"));
}));
