// Propagacja wykrytej osoby na dalsze wystapienia jej nazwiska.
//
// W pismie osoba pojawia sie raz pelnym imieniem i nazwiskiem ("powodka Anna
// Zielinska"), a potem sama, w odmianie ("Zielinska wniosla", "zdaniem
// Zielinskiej"). Regula OSOBA lapie tylko pare imie + nazwisko, wiec kazde
// dalsze wystapienie przeciekalo. Tu bierzemy nazwisko z KAZDEJ wykrytej
// osoby, wyznaczamy jego rdzen i maskujemy slowa z tym rdzeniem i polska
// koncowka fleksyjna - takze WERSALIKAMI i po zgubieniu ogonkow przez OCR.
//
// Granica: propagujemy tylko to, co detektor juz znalazl. Osoba nigdy nie
// przedstawiona z imieniem nie zostanie wykryta. Kazda forma dostaje wlasny
// token (odwracalnosc co do znaku), wiec model widzi "Zielinska" i
// "Zielinskiej" jako dwa rozne tokeny.

import { FIRST_NAME_FORMS } from "./gazetteers.mjs";

const MIN_RDZEN = 4;

/** Male litery bez ogonkow - "Ł" nie rozklada sie w NFD, stad osobna zamiana. */
export function zloz(slowo) {
    return slowo
        .toLowerCase()
        .replace(/ł/g, "l")
        .normalize("NFD")
        .replace(/\p{M}/gu, "");
}

// Koncowki po rdzeniu (juz w postaci zlozonej, bez ogonkow).
const PRZYMIOTNIKOWE = ["i", "iego", "iemu", "im", "a", "iej", "ich", "imi", "y", "ego", "emu", "ym", "ej", "ych", "ymi"];
const RZECZOWNIKOWE = ["", "a", "owi", "iem", "em", "u", "ie", "owie", "ow", "om", "y", "e", "o", "ami", "ach"];

/** Rdzenie nazwiska wraz z dopuszczalnymi koncowkami. */
export function rdzenie(nazwisko) {
    const s = zloz(nazwisko);
    const out = [];
    // Pierwsze wystapienie tez bywa w odmianie ("pozwanemu Janowi Kowalskiemu").
    const m = s.match(/^(.*(?:sk|ck|dzk))(?:i|a|iego|iemu|im|iej|ich|imi)$/);
    if (m) {
        out.push({ rdzen: m[1], koncowki: PRZYMIOTNIKOWE });
        return out.filter((r) => r.rdzen.length >= MIN_RDZEN);
    }
    if (s.endsWith("a")) {
        // Nazwisko meskie na -a (Zagloba) albo zenskie rzeczownikowe (Kowalowa).
        out.push({ rdzen: s.slice(0, -1), koncowki: ["a", "y", "i", "e", "ie", "o"] });
    }
    // Pierwsze wystapienie w odmianie ("z Pawlem Nowakiem"): zdejmujemy koncowke,
    // zeby dotrzec do mianownika. Rdzen za krotki odpada nizej (MIN_RDZEN).
    const kandydaci = new Set([s]);
    for (const k of RZECZOWNIKOWE) if (k && s.endsWith(k)) kandydaci.add(s.slice(0, -k.length));
    for (const r of kandydaci) {
        out.push({ rdzen: r, koncowki: RZECZOWNIKOWE });
        // e ruchome: Wrobel -> Wrobla, Kaczmarek -> Kaczmarka, Stasiec -> Stasca.
        const ruchome = r.match(/^(.*)e([lkc])$/);
        if (ruchome) out.push({ rdzen: ruchome[1] + ruchome[2], koncowki: RZECZOWNIKOWE.filter((k) => k !== "") });
    }
    return out.filter((r) => r.rdzen.length >= MIN_RDZEN);
}

function pasuje(slowo, listaRdzeni) {
    const z = zloz(slowo);
    return listaRdzeni.some(({ rdzen, koncowki }) =>
        z.startsWith(rdzen) && koncowki.includes(z.slice(rdzen.length)),
    );
}

/**
 * Nazwiska z encji OSOBA ("Anna Nowak-Zielinska" -> ["Nowak", "Zielinska"]).
 * Nazwiskiem jest kazdy czlon, ktory nie jest imieniem - dziala dla kolejnosci
 * "Imie Nazwisko", "Nazwisko Imie" z tabel i dla dwoch imion.
 */
function nazwiskaOsob(encje) {
    const out = new Set();
    for (const e of encje) {
        if (e.type !== "OSOBA") continue;
        const czlony = e.raw.trim().split(/\s+/);
        for (const czlon of czlony.filter((c) => !FIRST_NAME_FORMS.has(zloz(c)))) {
            for (const czesc of czlon.split("-")) if (czesc) out.add(czesc);
        }
    }
    return [...out];
}

// Slowo z wielkiej litery albo wersalikami, z opcjonalnym lacznikiem.
const SLOWO_RE = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}]*(?:-\p{Lu}[\p{L}]*)?(?![\p{L}\p{N}])/gu;

/**
 * Dodatkowe encje OSOBA dla dalszych wystapien nazwisk juz wykrytych osob.
 * `encje` to wszystkie rozlaczne dopasowania (takze nie-PII: sygnatury,
 * sady) - nowe wystapienie nie moze na nie nachodzic.
 */
export function propagujNazwiska(text, encje) {
    const listaRdzeni = nazwiskaOsob(encje).flatMap(rdzenie);
    if (listaRdzeni.length === 0) return [];
    const zajete = encje.map((e) => [e.start, e.end]);
    const out = [];
    for (const m of text.matchAll(SLOWO_RE)) {
        const start = m.index;
        const end = start + m[0].length;
        if (zajete.some(([s, e]) => start < e && s < end)) continue;
        const czesci = m[0].split("-");
        if (!czesci.some((c) => c && pasuje(c, listaRdzeni))) continue;
        out.push({
            raw: m[0],
            normalized: m[0],
            type: "OSOBA",
            confidence: 0.8,
            ruleId: "osoba-odmiana",
            start,
            end,
        });
    }
    return out;
}
