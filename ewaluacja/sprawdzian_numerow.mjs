#!/usr/bin/env node
/**
 * sprawdzian_numerow.mjs - czy identyfikatory w zdaniach z pism znikaja, i ile
 * falszywych alarmow te same reguly daja na tekscie bez identyfikatorow.
 *
 * Wzorzec z oceny studiogo/cenzor (#3, pomysl, nie kod - piszemy od zera):
 *   1. numery budowane z POLICZONA suma kontrolna (generator z ziarnem, wiec
 *      przebieg jest powtarzalny), wlozone w zdania w stylu pism; kazda kategoria
 *      w kilku zapisach (z etykieta, bez, z kreskami, ze spacjami);
 *   2. numery z celowo ZLA suma (literowka, OCR) - musza zniknac tak samo;
 *   3. falszywe alarmy na korpusie, w ktorym zadnego identyfikatora nie ma
 *      (kwoty, daty, sygnatury, przepisy, publikatory).
 *
 * Trojstan wyniku (kod wyjscia 0 / 10 / 20):
 *   OK      - kazdy numer wyciety wlasciwym typem, zero falszywych alarmow.
 *   UWAGI   - wszystko wyciete, ale jakis numer dostal inny typ albo korpus
 *             bez numerow dal falszywe alarmy.
 *   BLOKADA - jakikolwiek numer (albo jego czesc) przetrwal, albo lista prob
 *             lub korpus jest pusty (pusta lista nie jest sukcesem).
 *
 * Uzycie:
 *   node ewaluacja/sprawdzian_numerow.mjs [--silnik <repo>] [--ziarno N] [--szczegoly]
 *
 * Wszystkie numery sa SYNTETYCZNE. Raport nie wypisuje wartosci, chyba ze z
 * --szczegoly (i wtedy sa to wartosci z generatora, nie z akt).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const KORPUS_DOMYSLNY = fileURLToPath(new URL('./korpus_bez_numerow.txt', import.meta.url));

/** Deterministyczny generator liczb (mulberry32) - ten sam seed, te same numery. */
export function losowacz(ziarno) {
  let a = ziarno >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cyfra = (r) => Math.floor(r() * 10);
const cyfry = (r, n) => Array.from({ length: n }, () => cyfra(r)).join('');
const zakres = (r, od, do_) => od + Math.floor(r() * (do_ - od + 1));
const dwie = (n) => String(n).padStart(2, '0');

function sumaWazona(ciag, wagi) {
  let s = 0;
  for (let i = 0; i < wagi.length; i++) s += Number(ciag[i]) * wagi[i];
  return s;
}

/** PESEL z prawdziwa data (miesiac +20 dla lat 2000-2099) i policzona suma. */
export function genPesel(r) {
  const rok = zakres(r, 1940, 2008);
  const mies = zakres(r, 1, 12);
  const dzien = zakres(r, 1, 28);
  const mm = mies + (rok >= 2000 ? 20 : 0);
  const baza = dwie(rok % 100) + dwie(mm) + dwie(dzien) + cyfry(r, 4);
  const k = (10 - (sumaWazona(baza, [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]) % 10)) % 10;
  return baza + k;
}

/** Zly PESEL: poprawny z podmieniona cyfra kontrolna (literowka w ostatniej cyfrze). */
export function genPeselZly(r) {
  const p = genPesel(r);
  const zla = (Number(p[10]) + 1 + Math.floor(r() * 9)) % 10;
  return p.slice(0, 10) + zla;
}

export function genNip(r) {
  for (;;) {
    const baza = String(zakres(r, 1, 9)) + cyfry(r, 8);
    const k = sumaWazona(baza, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11;
    if (k !== 10) return baza + k;
  }
}

/** Zly NIP: poprawny z podmieniona ostatnia cyfra (gdy wyjdzie znow poprawny - kolejna). */
export function genNipZly(r) {
  const n = genNip(r);
  return n.slice(0, 9) + ((Number(n[9]) + 1 + Math.floor(r() * 8)) % 10);
}

export function genRegon9(r) {
  const baza = String(zakres(r, 1, 9)) + cyfry(r, 7);
  const m = sumaWazona(baza, [8, 9, 2, 3, 4, 5, 6, 7]) % 11;
  return baza + (m === 10 ? 0 : m);
}

export function genRegon14(r) {
  const baza = genRegon9(r) + cyfry(r, 4);
  const m = sumaWazona(baza, [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]) % 11;
  return baza + (m === 10 ? 0 : m);
}

function mod97(ciag) {
  let reszta = 0;
  for (const c of ciag) reszta = (reszta * 10 + Number(c)) % 97;
  return reszta;
}

/** NRB/IBAN PL: 24 cyfry rachunku, cyfry kontrolne z ISO 13616 (PL = 25 21). */
export function genIban(r) {
  const bban = cyfry(r, 24);
  const kontrolne = dwie(98 - mod97(bban + '252100'));
  return 'PL' + kontrolne + bban;
}

/** Zly IBAN: poprawny z podmieniona ostatnia cyfra rachunku. */
export function genIbanZly(r) {
  const i = genIban(r);
  return i.slice(0, 27) + ((Number(i[27]) + 1 + Math.floor(r() * 9)) % 10);
}

/** Dowod osobisty: 3 litery + cyfra kontrolna + 5 cyfr; suma wazona mod 10 == 0. */
export function genDowod(r) {
  const litery = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(r() * 26))).join('');
  const reszta = cyfry(r, 5);
  const wartosci = [...litery].map((c) => c.charCodeAt(0) - 55);
  const wagi = [7, 3, 1, 7, 3, 1, 7, 3];
  const znaki = [...wartosci, ...[...reszta].map(Number)];
  const s = znaki.reduce((acc, v, i) => acc + v * wagi[i], 0);
  // waga cyfry kontrolnej to 9, a 9 = -1 (mod 10), wiec cyfra = s mod 10
  return litery + (s % 10) + reszta;
}

export const genKrs = (r) => '0000' + cyfry(r, 6);
export const genTelefon = (r) => String(zakres(r, 5, 8)) + cyfry(r, 8);

const grupy = (s, rozmiary, sep) => {
  const out = [];
  let i = 0;
  for (const n of rozmiary) { out.push(s.slice(i, i + n)); i += n; }
  return out.join(sep);
};

/**
 * Proby: {nazwa, zdanie, numer, typ}. `numer` to dokladny napis w zdaniu;
 * `typ` to typ, jakim silnik powinien go zamaskowac.
 */
export function zdaniaSprawdzianu(ziarno = 20261013) {
  const r = losowacz(ziarno);
  const p = [];
  // `numer` = dokladny zapis w zdaniu (z kreskami, spacjami) - po nim szukamy wycieku i typu.
  const dodaj = (nazwa, typ, numer, szablon) => p.push({ nazwa, typ, numer, zdanie: szablon(numer) });

  dodaj('PESEL z etykieta', 'PESEL', genPesel(r), (x) => `Wnioskodawczyni (PESEL ${x}) wniosla o zabezpieczenie.`);
  dodaj('PESEL z dwukropkiem', 'PESEL', genPesel(r), (x) => `Pozwany, PESEL: ${x}, zamieszkaly w Poznaniu.`);
  dodaj('PESEL bez etykiety', 'PESEL', genPesel(r), (x) => `Swiadek legitymujacy sie numerem ${x} odmowil zeznan.`);
  dodaj('PESEL obok kwoty', 'PESEL', genPesel(r), (x) => `Dluznik (${x}) zalega z kwota 12 345,67 zl.`);
  dodaj('PESEL zla suma z etykieta', 'PESEL', genPeselZly(r), (x) => `Powod, PESEL ${x}, wniosl o zaplate.`);
  dodaj('PESEL zla suma bez etykiety', 'PESEL', genPeselZly(r), (x) => `Uczestniczka nr ${x} stawila sie osobiscie.`);
  dodaj('NIP z kreskami 3-3-2-2', 'NIP', grupy(genNip(r), [3, 3, 2, 2], '-'), (x) => `Wykonawca, NIP ${x}, zlozyl oferte.`);
  dodaj('NIP z kreskami 3-2-2-3', 'NIP', grupy(genNip(r), [3, 2, 2, 3], '-'), (x) => `Sprzedawca, NIP: ${x}, wystawil fakture.`);
  dodaj('NIP z prefiksem PL', 'NIP', genNip(r), (x) => `Nabywca NIP PL${x} zaplacil przelewem.`);
  dodaj('NIP bez etykiety', 'NIP', genNip(r), (x) => `Podatnik o numerze identyfikacji podatkowej ${x} zlozyl korekte.`);
  dodaj('NIP zla suma bez etykiety', 'NIP', grupy(genNipZly(r), [3, 3, 2, 2], '-'), (x) => `Kontrahent ${x} zaplacil po terminie.`);
  dodaj('PESEL z etykieta, brak cyfry', 'PESEL', genPesel(r).slice(0, 10), (x) => `Pozwana, PESEL ${x}, nie stawila sie.`);
  dodaj('REGON 9 z etykieta', 'REGON', genRegon9(r), (x) => `Zamawiajacy, REGON ${x}, oglosil przetarg.`);
  dodaj('REGON 14 z etykieta', 'REGON', genRegon14(r), (x) => `Oddzial, REGON ${x}, prowadzi dzialalnosc.`);
  dodaj('IBAN ze spacjami', 'IBAN', grupy(genIban(r), [4, 4, 4, 4, 4, 4, 4], ' '), (x) => `Zaplata na rachunek nr ${x} w terminie 14 dni.`);
  dodaj('NRB bez PL', 'IBAN', genIban(r).slice(2), (x) => `Rachunek dluznika ${x} zostal zajety.`);
  dodaj('IBAN zla suma', 'IBAN', grupy(genIbanZly(r), [4, 4, 4, 4, 4, 4, 4], ' '), (x) => `Przelew na rachunek ${x} wrocil.`);
  dodaj('dowod osobisty', 'DOWOD_OSOBISTY', genDowod(r), (x) => `Legitymuje sie dowodem osobistym ${x} wydanym w 2019 r.`);
  dodaj('KRS z etykieta', 'KRS', genKrs(r), (x) => `Spolka wpisana do rejestru przedsiebiorcow KRS ${x}.`);
  dodaj('KRS pod numerem', 'KRS', genKrs(r), (x) => `Spolka wpisana do rejestru przedsiebiorcow KRS pod numerem ${x}.`);
  dodaj('KRS bez etykiety', 'KRS', genKrs(r), (x) => `Spolke wpisano do rejestru pod nr ${x} dnia 12 stycznia.`);
  dodaj('telefon ze skrotem', 'PHONE', grupy(genTelefon(r), [3, 3, 3], ' '), (x) => `Kontakt z pelnomocnikiem: tel. ${x} w dni robocze.`);
  dodaj('telefon +48', 'PHONE', grupy(genTelefon(r), [3, 3, 3], ' '), (x) => `Prosze dzwonic +48 ${x} po poludniu.`);
  dodaj('telefon z kreskami', 'PHONE', grupy(genTelefon(r), [3, 3, 3], '-'), (x) => `Sekretariat, kom. ${x}.`);
  return p;
}

/** Wczytuje korpus bez identyfikatorow: linia = fragment, # = komentarz. */
export function wczytajKorpus(sciezka = KORPUS_DOMYSLNY) {
  return readFileSync(sciezka, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

const TOKEN = /\[[A-Z_]+_\d+\]/g;

/**
 * Uruchamia sprawdzian na podanym silniku (`silnik.anonimizuj`, `silnik.detect`).
 * Zwraca {status, proby, falszyweAlarmy, powody} - bez wartosci w `powody`.
 */
export function sprawdzian({ silnik, proby, korpus }) {
  const powody = [];
  if (!proby?.length) powody.push({ status: 'BLOKADA', opis: 'pusta lista prob - nie ma czego sprawdzac' });
  if (!korpus?.length) powody.push({ status: 'BLOKADA', opis: 'pusty korpus bez numerow - nie da sie policzyc falszywych alarmow' });

  const wyniki = (proby ?? []).map((p) => {
    const { text } = silnik.anonimizuj(p.zdanie);
    const cyfryNumeru = p.numer.replace(/\D/g, '');
    // Przetrwanie liczymy po cyfrach: kawalek numeru (np. 2 cyfry po telefonie) to tez wyciek.
    // Ciagi cyfr, ktore zdanie ma i bez numeru ("14 dni", "2019 r."), odliczamy.
    const kontekst = new Map();
    for (const c of p.zdanie.replace(p.numer, ' ').match(/\d{2,}/g) ?? []) kontekst.set(c, (kontekst.get(c) ?? 0) + 1);
    const ocalaleCyfry = [];
    for (const c of text.replace(TOKEN, ' ').match(/\d{2,}/g) ?? []) {
      if (kontekst.get(c) > 0) kontekst.set(c, kontekst.get(c) - 1);
      else if (cyfryNumeru.includes(c)) ocalaleCyfry.push(c);
    }
    const wyciety = !text.includes(p.numer) && ocalaleCyfry.length === 0;
    const start = p.zdanie.indexOf(p.numer);
    const typy = silnik.detect(p.zdanie).entities
      .filter((e) => e.isPii && e.start < start + p.numer.length && start < e.end)
      .map((e) => e.type);
    const wlasciwyTyp = typy.length > 0 && typy.every((t) => t === p.typ);
    return { nazwa: p.nazwa, typ: p.typ, wyciety, wlasciwyTyp, typy, numer: p.numer };
  });
  for (const w of wyniki) {
    if (!w.wyciety) powody.push({ status: 'BLOKADA', opis: `${w.nazwa}: numer (albo jego czesc) przetrwal` });
    else if (!w.wlasciwyTyp) powody.push({ status: 'UWAGI', opis: `${w.nazwa}: wyciety jako ${w.typy.join('+') || '?'}, oczekiwano ${w.typ}` });
  }

  const falszyweAlarmy = {};
  for (const linia of korpus ?? []) {
    for (const e of silnik.detect(linia).entities.filter((x) => x.isPii)) {
      const klucz = `${e.type}(${e.ruleId})`;
      (falszyweAlarmy[klucz] ??= []).push(e.raw);
    }
  }
  for (const [klucz, lista] of Object.entries(falszyweAlarmy)) {
    powody.push({ status: 'UWAGI', opis: `korpus bez numerow: ${lista.length} falszywych alarmow ${klucz}` });
  }

  const status = powody.some((x) => x.status === 'BLOKADA') ? 'BLOKADA'
    : powody.some((x) => x.status === 'UWAGI') ? 'UWAGI' : 'OK';
  return { status, proby: wyniki, falszyweAlarmy, powody };
}

export const KOD_WYJSCIA = { OK: 0, UWAGI: 10, BLOKADA: 20 };

async function main() {
  const args = process.argv.slice(2);
  const opcja = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const repo = path.resolve(opcja('--silnik') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const ziarno = Number(opcja('--ziarno') ?? 20261013);
  const szczegoly = args.includes('--szczegoly');
  const silnik = await import(pathToFileURL(path.join(repo, 'src', 'index.mjs')).href);

  const proby = zdaniaSprawdzianu(ziarno);
  const korpus = wczytajKorpus();
  const wynik = sprawdzian({ silnik, proby, korpus });

  console.log(`SPRAWDZIAN NUMEROW ${new Date().toISOString().slice(0, 10)} | silnik ${repo} | ziarno ${ziarno}`);
  console.log(`\nWyciecie (${proby.length} prob):`);
  for (const w of wynik.proby) {
    const znak = !w.wyciety ? 'WYCIEK' : w.wlasciwyTyp ? 'tak' : 'tak, inny typ';
    console.log(`  ${w.nazwa.padEnd(30)} ${znak.padEnd(14)} jako: ${w.typy.join('+') || '-'}${szczegoly ? `  [${w.numer}]` : ''}`);
  }
  const wyciete = wynik.proby.filter((w) => w.wyciety).length;
  console.log(`  Wyciete: ${wyciete} z ${proby.length}`);
  const fa = Object.entries(wynik.falszyweAlarmy);
  console.log(`\nFalszywe alarmy na korpusie bez numerow (${korpus.length} fragmentow): ${fa.reduce((s, [, l]) => s + l.length, 0)}`);
  for (const [klucz, lista] of fa) console.log(`  ${klucz}: ${lista.length}${szczegoly ? `  np. ${JSON.stringify(lista.slice(0, 3))}` : ''}`);
  console.log(`\nSTATUS: ${wynik.status}`);
  for (const x of wynik.powody) console.log(`  [${x.status}] ${x.opis}`);
  process.exitCode = KOD_WYJSCIA[wynik.status];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`BLAD: ${err.message}`); process.exitCode = 20; });
}
