// Reguly regex-based ekstrakcji encji prawa polskiego + identyfikatorow PII.
//
// 5 top kategorii sygnatur orzeczen (SN, NSA, WSA, KIO, TK) = ~90%
// cytowanych orzeczen w opiniach kancelaryjnych. PII: PESEL/NIP/REGON/KRS
// (z checksuma), email, telefon. OSOBA: detekcja "Imie Nazwisko" przez
// gazetteer imion (wartosc dodana - pl-entities mial OSOBA tylko jako
// LLM-fallback; tutaj jest deterministyczna, bez wysylania tekstu do modelu).

import {
    isValidPesel, isValidNip, isValidRegon, isValidKrsFormat,
    isValidIbanPl, isValidDowodOsobisty,
} from "./checksums.mjs";
import { FIRST_NAME_FORMS, FIRST_NAMES_NOM } from "./gazetteers.mjs";

/** Sklada polskie znaki diakrytyczne do ASCII (do lookupu w gazetteerze imion). */
export function foldPl(s) {
    return s
        .replace(/[ąĄ]/g, "a").replace(/[ćĆ]/g, "c").replace(/[ęĘ]/g, "e")
        .replace(/[łŁ]/g, "l").replace(/[ńŃ]/g, "n").replace(/[óÓ]/g, "o")
        .replace(/[śŚ]/g, "s").replace(/[żŻźŹ]/g, "z");
}

// --- Sygnatury orzeczen ---
const SN_SIGNATURE_RE = /\b(?:I{1,3}|IV|V|VI|VII)\s+[A-Z]{2,4}\s+\d{1,5}\/\d{2,4}\b/g;
const NSA_SIGNATURE_RE = /\b(?:I|II|III)\s+(?:FSK|OSK|OPS|GSK|FPS|FSW|FZ)\s+\d{1,5}\/\d{2,4}\b/g;
const WSA_SIGNATURE_RE = /\b(?:I|II|III|IV)\s+SA\/[A-Z][a-z]{1,2}\s+\d{1,5}\/\d{2,4}\b/g;
const KIO_SIGNATURE_RE = /\bKIO(?:\/UZP)?\s+\d{1,5}\/\d{2,4}\b/g;
const TK_SIGNATURE_RE = /\b(?:K|P|U|SK|Kp|Kpt|Pp)\s+\d{1,4}\/\d{2,4}\b/g;

// --- Akty prawne ---
const CELEX_RE = /\b3\d{4}[RLDQ]\d{4}\b/g;
const ELI_FRAGMENT_RE = /eli\/(?:sejm|mp|powszechnie|akty-prawne)\/[a-z]+\/\d{4}\/\d+\/?\d*/gi;

// --- Kontakt ---
// Telefon: 9 cyfr (3-3-3) z opcjonalnym +48 / "48 ". Granice zmierzone w kontroli
// negatywnej (test/kontrola-negatywna.test.mjs, ewaluacja/sprawdzian_numerow.mjs):
//   - nie bierze 9 cyfr ze srodka dluzszego ciagu (wczesniej z 11 cyfr zlego PESEL
//     bral 9, zostawiajac 2 jawne, a z "NIP PL..." i KRS robil telefon);
//   - nie bierze kwoty: grupy przed nia ("1 152 422 384"), grosze (",00") ani
//     waluta po niej ("zl", "PLN", "zlotych") - wczesniej "152 422 384,00 zl" bylo telefonem.
const PHONE_PL_RE = /(?<!\d[\s.]?)(?:\+48[\s-]?|48[\s-])?\d{3}[\s-]?\d{3}[\s-]?\d{3}(?!\d)(?![.,]\d)(?!\s*(?:zł|zl|złot|zlot|pln|eur|usd|gr\b))/giu;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// --- Dane finansowe i dokumenty ---
// IBAN/NRB PL: opcjonalne "PL" + 26 cyfr, dopuszczamy grupy po 4.
const IBAN_PL_RE = /\b(?:PL\s?)?\d{2}(?:\s?\d{4}){6}\b/gi;
// Dowod osobisty: 3 litery + 6 cyfr (checksuma odsiewa wiekszosc falszywek).
const DOWOD_RE = /\b[A-Z]{3}\s?\d{6}\b/g;

// --- Adres ---
// Kod pocztowy NN-NNN.
const KOD_POCZTOWY_RE = /\b\d{2}-\d{3}\b/g;
// Ulica/aleja/plac/osiedle + nazwa + numer (opc. /mieszkanie).
const ULICA_RE = /\b(?:ul\.|al\.|pl\.|os\.)\s*[A-ZŁŚŻŹĆŃÓĄĘ][\wŁŚŻŹĆŃÓĄĘłśżźćńóąę.\s-]{1,40}?\s+\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?\b/g;

// --- Firma z forma prawna ---
// Forma prawna w kazdej wielkosci liter i w pelnym brzmieniu ("sp. z o.o.",
// "SP. Z O.O.", "spolka z ograniczona odpowiedzialnoscia"), takze laczona
// ("sp. z o.o. sp.k."). Wczesniej regula znala tylko "Sp. z o.o." z wielkiej
// litery i na umowach spolek lapala 7 z 30 firm.
// Wzorzec bez rozrozniania wielkosci liter tylko w tym fragmencie (flaga `i`
// dotyczylaby calego regexu). Ucieczki (\s) zostaja, klasy [..] dostaja wielkie.
function bezWielkosci(wzorzec) {
    let out = "";
    for (let i = 0; i < wzorzec.length; i++) {
        const c = wzorzec[i];
        if (c === "\\") { out += c + wzorzec[++i]; continue; }
        if (c === "[") {
            const koniec = wzorzec.indexOf("]", i);
            const klasa = wzorzec.slice(i + 1, koniec);
            out += `[${klasa}${klasa.toUpperCase()}]`;
            i = koniec;
            continue;
        }
        out += /\p{L}/u.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c;
    }
    return out;
}
const FORMY_PRAWNE = [
    String.raw`sp\.\s*z\s*o\.\s*o\.`, String.raw`sp\.\s*k\.`, String.raw`sp\.\s*j\.`, String.raw`sp\.\s*p\.`,
    String.raw`s\.\s*k\.\s*a\.`, String.raw`p\.\s*s\.\s*a\.`, String.raw`s\.\s*a\.`, String.raw`s\.\s*c\.`,
    "spółk[aęiąo] z ograniczoną odpowiedzialnością", String.raw`spółk[aęiąo]\s+z\s+o\.\s*o\.`,
    "spółk[aęiąo] akcyjn[aąeyj]{1,2}",
    "prost[aąeyj]{1,2} spółk[aęiąo] akcyjn[aąeyj]{1,2}", "spółk[aęiąo] komandytowo-akcyjn[aąeyj]{1,2}",
    "spółk[aęiąo] komandytow[aąeyj]{1,2}", "spółk[aęiąo] jawn[aąeyj]{1,2}",
    "spółk[aęiąo] partnersk[aąiej]{1,2}", "spółk[aęiąo] cywiln[aąeyj]{1,2}",
].map((f) => bezWielkosci(f).replace(/ /g, String.raw`\s+`));
export const FORMA = `(?:${FORMY_PRAWNE.join("|")})`;
// Czlon nazwy: z wielkiej litery albo cyfra/cudzyslow; lacznik "i", "&", "oraz"
// miedzy czlonami. Odstep tylko spacja/tabulator - tytul w linii wyzej nie
// wchodzi do nazwy.
// Bez kropki: inaczej "S.A." byloby czlonem nazwy i lacznik "i" sklejal dwie
// spolki ("X S.A. i Y sp. j."), a kropka konca zdania wchodzila do nazwy.
const CZLON = String.raw`[\p{Lu}\d„"'][\p{L}\d&'’”"+-]*`;
const FIRMA_Z_FORMA_RE = new RegExp(
    String.raw`(?<![\p{L}\p{N}])${CZLON}(?:[ \t]+(?:(?:i|&|oraz)[ \t]+)?${CZLON}){0,5}[ \t]+${FORMA}(?:[ \t]+${FORMA})?(?![\p{L}\p{N}])`,
    "gu",
);
// --- Fundacja / stowarzyszenie / spoldzielnia (bez formy prawnej w nazwie) ---
// Rzeczownik organizacji + 1-5 czlonow z wielkiej litery albo nazwa w cudzyslowie.
// Sam rzeczownik ("Fundacja to forma prawna") nie jest firma - wymagany czlon.
const ORGANIZACJA = bezWielkosci("(?:fundacj[aięą]|stowarzyszeni[aeuo]|spółdzielni[aęąi]?)");
const ORGANIZACJA_RE = new RegExp(
    String.raw`(?<![\p{L}\p{N}])${ORGANIZACJA}(?:[ \t]+(?:(?:i|&)[ \t]+)?${CZLON}){1,5}(?![\p{L}\p{N}])`,
    "gu",
);

// Slowo okreslajace strone na poczatku nazwy ("Pozwana Termika sp. z o.o.")
// to rola, nie czesc firmy.
const STRONY = new Set(["pozwana", "pozwany", "powodka", "powod", "wierzyciel", "dluznik", "dluzniczka",
    "zamawiajacy", "wykonawca", "sprzedajacy", "kupujacy", "spolka", "firma", "kontrahent",
    "wnioskodawca", "wnioskodawczyni", "uczestnik", "uczestniczka", "dostawca", "odbiorca", "zleceniodawca",
    "zleceniobiorca", "najemca", "wynajmujacy", "pozyczkodawca", "pozyczkobiorca", "strona",
    // Rodzaj dokumentu przed forma prawna ("UMOWA SPOLKI Z O.O.") to tytul, nie nazwa.
    "umowa", "umowy", "statut", "statutu", "uchwala", "uchwaly", "protokol", "protokolu",
    "aneks", "aneksu", "regulamin", "regulaminu", "akt", "aktu", "wniosek", "wniosku"]);
function przytnijStrone(raw) {
    const czlony = raw.split(/[ \t]+/);
    let i = 0;
    while (i < czlony.length - 1 && STRONY.has(foldPl(czlony[i]).toLowerCase())) i++;
    return czlony.slice(i).join(" ");
}
/** Nazwa musi miec co najmniej jeden czlon przed forma prawna, ktory nie jest slowem "Spolka". */
function maNazwe(raw) {
    const przedForma = raw.replace(new RegExp(String.raw`[ \t]+${FORMA}(?:[ \t]+${FORMA})?$`, "u"), "");
    return przedForma !== raw && przedForma.trim().length > 0 && !new RegExp(`^${FORMA}`, "u").test(raw);
}

// --- Osoba: Imie (z gazetteera) + Nazwisko (z wielkiej litery, opc. dwuczlon) ---
// Granice przez lookaround na \p{L}, nie \b: bez flagi `u` \b nie widzi liter
// spoza ASCII ("Łukasz" nie startuje, "Jan Łoś" urywa sie na "Jan Ło").
const OSOBA_RE = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?(?![\p{L}\p{N}])/gu;

const zlozone = (slowo) => foldPl(slowo).toLowerCase();
const jestImieniem = (slowo) => FIRST_NAME_FORMS.has(zlozone(slowo));

/** True jezeli pierwszy czlon dopasowania jest znanym polskim imieniem. */
function startsWithKnownFirstName(match) {
    return jestImieniem(match.split(/\s+/)[0]);
}

// --- Osoba: dwa imiona + nazwisko ("Anna Maria Nowak") ---
// Regula "Imie Nazwisko" brala "Anna Maria" i nazwisko przeciekalo.
const OSOBA_DWA_IMIONA_RE = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?(?![\p{L}\p{N}])/gu;
function dwaImiona(match) {
    const [a, b] = match.split(/\s+/);
    return jestImieniem(a) && jestImieniem(b);
}

// --- Osoba: "Nazwisko Imie" z tabel i zalacznikow ---
// Drugi czlon musi byc imieniem w MIANOWNIKU (tabele go uzywaja), a pierwszy
// nie moze byc imieniem - inaczej "Anna Maria" byloby osoba odwrocona.
// Tylko przed separatorem tabeli/listy albo koncem linii: w zdaniu "Pozwany Jan
// zeznal" para z wielkich liter to rola + imie, nie "Nazwisko Imie".
const OSOBA_ODWROCONA_RE = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+(?![\p{L}\p{N}])(?=[ \t]*(?:[|,;\t]|\r?$))/gmu;
function odwrocona(match) {
    const [a, b] = match.split(/\s+/);
    return !jestImieniem(a) && FIRST_NAMES_NOM.has(zlozone(b));
}

// --- Osoba wersalikami ("JAN KOWALCZYK", "KOWALCZYK JAN") z komparycji ---
const OSOBA_WERSALIKI_RE = /(?<![\p{L}\p{N}])\p{Lu}{2,}(?:\s+\p{Lu}{2,}){1,2}(?:-\p{Lu}{2,})?(?![\p{L}\p{N}])/gu;
function wersalikami(match) {
    const czlony = match.split(/\s+/);
    if (jestImieniem(czlony[0])) return czlony.slice(1).some((c) => !jestImieniem(c));
    return czlony.length === 2 && FIRST_NAMES_NOM.has(zlozone(czlony[1]));
}

const phoneDigits = (v) => v.replace(/[\s-]/g, "");
// Telefon: odrzucamy prefiks +48 zanim policzymy 9 cyfr krajowych.
const phoneNational = (v) => v.replace(/[\s+-]/g, "").replace(/^48/, "");

// Trojstan walidacji sumy kontrolnej na kazdej regule (pole `walidacjaSumy` encji):
//   "passed"         - numer przeszedl sume (PESEL, NIP, REGON, IBAN, dowod),
//   "failed"         - numer maskowany MIMO zlej sumy (literowka, OCR) -> `doPrzegladu`,
//   "not_applicable" - typ bez sumy (KRS, e-mail, telefon, osoba, adres, firma).
// Wzorzec z oceny paszkiewiczmichal/poufnik (#4): zly numer nie znika z maskowania.
export const SUMA_PASSED = "passed";
export const SUMA_FAILED = "failed";
export const SUMA_NIE_DOTYCZY = "not_applicable";

export const PL_EXTRACTION_RULES = [
    // === Identyfikatory PII (checksumy walidowane) ===
    { id: "pesel", type: "PESEL", pattern: /\b\d{11}\b/g, validate: isValidPesel, walidacjaSumy: SUMA_PASSED, baseConfidence: 1.0, normalize: (v) => v },
    // NIP w obu zapisach spotykanych w pismach: 123-456-78-90 oraz 123-45-67-890,
    // takze z doklejonym "PL" ("NIP PL1234567890" - bez tego brala go regula telefonu).
    // NIP zaczyna sie od kodu urzedu skarbowego, nigdy od "000"; 10 cyfr od "000" to ksztalt
    // KRS - bez tego wykluczenia KRS z cyframi przechodzacymi sume NIP dostawal token NIP.
    { id: "nip", type: "NIP", pattern: /(?<![\p{L}\p{N}])(?:PL\s?)?(\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{3})(?![\p{L}\p{N}])/gu, validate: (v) => isValidNip(v) && !phoneDigits(v).startsWith("000"), walidacjaSumy: SUMA_PASSED, baseConfidence: 1.0, normalize: phoneDigits },
    { id: "regon", type: "REGON", pattern: /\b(\d{14}|\d{9})\b/g, validate: isValidRegon, walidacjaSumy: SUMA_PASSED, baseConfidence: 1.0, normalize: phoneDigits },
    // KRS z etykieta, takze "KRS pod numerem ..." / "KRS nr ...".
    { id: "krs", type: "KRS", pattern: /\bKRS\b[:\s]*(?:(?:pod\s+)?(?:numerem|numer|nr)\.?[:\s]*)?(\d{10})\b/gi, validate: isValidKrsFormat, baseConfidence: 0.95, normalize: (v) => v.replace(/[^\d]/g, "").padStart(10, "0") },
    // KRS bez etykiety po ksztalcie: 10 cyfr zaczynajacych sie od "000" (numery KRS
    // sa nadawane kolejno i dzis maja 7 cyfr znaczacych). Wczesniej taki numer
    // maskowal przypadkiem telefon (9 ostatnich cyfr); po granicy cyfr w regule
    // telefonu zostalby jawny.
    { id: "krs-bez-etykiety", type: "KRS", pattern: /(?<![\p{L}\p{N}])000\d{7}(?![\p{L}\p{N}])/gu, baseConfidence: 0.7, normalize: (v) => v },
    { id: "email", type: "EMAIL", pattern: EMAIL_RE, baseConfidence: 0.9, normalize: (v) => v.toLowerCase() },
    { id: "phone", type: "PHONE", pattern: PHONE_PL_RE, validate: (v) => phoneNational(v).length === 9, baseConfidence: 0.85, normalize: phoneNational },

    // === Identyfikator z etykieta, ale ze ZLA suma kontrolna: do przegladu, nie do kosza ===
    // Regula wyzej odrzuca 11 cyfr ze zla suma, bo bez kontekstu to czesciej numer sprawy czy
    // faktury niz PESEL. Gdy jednak tuz przed liczba stoi "PESEL" / "NIP" / "REGON", zla suma to
    // najpewniej literowka albo blad OCR - a odrzucenie oznaczaloby, ze dana osobowa wychodzi
    // niezamaskowana. Taki numer maskujemy jako ten sam typ. Pewnosc 0.9, nie nizej: etykieta
    // czyni z liczby dana osobowa prawie na pewno (watpliwa jest tylko poprawnosc numeru), a przy
    // 0.5 przegrywala z regula telefonu (0.85) na 9 cyfrach w srodku - zmierzone w tescie.
    // ruleId `*-zla-suma` mowi recenzentowi, co sprawdzic; encja ma `doPrzegladu: true`.
    // Po etykiecie takze ZLA DLUGOSC (brak albo nadmiar cyfry - typowy blad OCR): do 0.7.0
    // taki ciag lapal przypadkiem telefon (9 cyfr, reszta jawna).
    { id: "pesel-zla-suma", type: "PESEL", pattern: /\bPESEL\b[:\s]*(?:nr\.?\s*)?(\d{9,13})\b/gi, validate: (v) => !isValidPesel(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.9, normalize: (v) => v },
    { id: "nip-zla-suma", type: "NIP", pattern: /\bNIP\b[:\s]*(?:PL\s*)?(\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{3}|\d{9,12})\b/gi, validate: (v) => !isValidNip(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.9, normalize: phoneDigits },
    { id: "regon-zla-suma", type: "REGON", pattern: /\bREGON\b[:\s]*(\d{8,15})\b/gi, validate: (v) => !isValidRegon(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.9, normalize: phoneDigits },
    // 11 cyfr ze zla suma BEZ etykiety: do 0.7.0 przechodzily jawne (granica przeciw
    // falszywym trafieniom). Cichy wyciek PESEL z literowka jest drozszy niz numer
    // faktury oznaczony do przegladu, wiec maskujemy jako PESEL z `doPrzegladu`.
    // Pewnosc 0.5: przegrywa z kazda regula z etykieta i z poprawna suma; telefon
    // nie konkuruje, bo nie bierze 9 cyfr ze srodka dluzszego ciagu.
    // GRANICA: przy minConfidence > 0.5 taki numer odpada (wybor uzytkownika).
    { id: "pesel-zla-suma-bez-etykiety", type: "PESEL", pattern: /\b\d{11}\b/g, validate: (v) => !isValidPesel(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.5, normalize: (v) => v },
    // Ta sama zasada dla ksztaltow NIP (10 cyfr ciagiem albo 3-3-2-2 / 3-2-2-3) i REGON-14.
    // REGON-9 ze zla suma nie potrzebuje reguly: 9 cyfr bierze telefon (zamaskowany, inny typ).
    { id: "nip-zla-suma-bez-etykiety", type: "NIP", pattern: /(?<![\p{L}\p{N}])(\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{3}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{3})(?![\p{L}\p{N}])/gu, validate: (v) => !isValidNip(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.5, normalize: phoneDigits },
    { id: "regon-zla-suma-bez-etykiety", type: "REGON", pattern: /\b\d{14}\b/g, validate: (v) => !isValidRegon(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.5, normalize: (v) => v },

    // === Dane finansowe i dokumenty (checksumy walidowane) ===
    { id: "iban", type: "IBAN", pattern: IBAN_PL_RE, validate: isValidIbanPl, walidacjaSumy: SUMA_PASSED, baseConfidence: 1.0, normalize: (v) => { const s = v.replace(/\s/g, "").toUpperCase(); return s.startsWith("PL") ? s : "PL" + s; } },
    // IBAN/NRB ze zla suma: 26 cyfr (opcjonalnie z PL) to ksztalt jednoznaczny - literowka w
    // rachunku nadal jest rachunkiem. Do 0.7.0 przechodzil jawny w calosci.
    { id: "iban-zla-suma", type: "IBAN", pattern: IBAN_PL_RE, validate: (v) => !isValidIbanPl(v), walidacjaSumy: SUMA_FAILED, baseConfidence: 0.9, normalize: (v) => { const s = v.replace(/\s/g, "").toUpperCase(); return s.startsWith("PL") ? s : "PL" + s; } },
    { id: "dowod-osobisty", type: "DOWOD_OSOBISTY", pattern: DOWOD_RE, validate: isValidDowodOsobisty, walidacjaSumy: SUMA_PASSED, baseConfidence: 0.9, normalize: (v) => v.replace(/\s/g, "").toUpperCase() },

    // === Adres ===
    { id: "ulica", type: "ADRES", pattern: ULICA_RE, baseConfidence: 0.7, normalize: (v) => v.replace(/\s+/g, " ").trim() },
    { id: "kod-pocztowy", type: "ADRES", pattern: KOD_POCZTOWY_RE, baseConfidence: 0.6, normalize: (v) => v },

    // === Osoby fizyczne ===
    // retryOnReject: "Pozwany Jan" odrzucone -> szukaj dalej od "Jan", inaczej
    // skan przeskakuje imie i "Jan Kowalski" przecieka.
    { id: "osoba", type: "OSOBA", pattern: OSOBA_RE, validate: startsWithKnownFirstName, baseConfidence: 0.85, normalize: (v) => v.replace(/\s+/g, " ").trim(), retryOnReject: true },
    { id: "osoba-dwa-imiona", type: "OSOBA", pattern: OSOBA_DWA_IMIONA_RE, validate: dwaImiona, baseConfidence: 0.85, normalize: (v) => v.replace(/\s+/g, " ").trim(), retryOnReject: true },
    { id: "osoba-odwrocona", type: "OSOBA", pattern: OSOBA_ODWROCONA_RE, validate: odwrocona, baseConfidence: 0.8, normalize: (v) => v.replace(/\s+/g, " ").trim(), retryOnReject: true },
    { id: "osoba-wersaliki", type: "OSOBA", pattern: OSOBA_WERSALIKI_RE, validate: wersalikami, baseConfidence: 0.8, normalize: (v) => v.replace(/\s+/g, " ").trim(), retryOnReject: true },

    // === Sygnatury orzeczen (5 top kategorii) ===
    { id: "sygn-sn", type: "SYGNATURA_ORZECZENIA", pattern: SN_SIGNATURE_RE, baseConfidence: 0.85, normalize: (v) => v.replace(/\s+/g, " ").trim().toUpperCase() },
    { id: "sygn-nsa", type: "SYGNATURA_ORZECZENIA", pattern: NSA_SIGNATURE_RE, baseConfidence: 0.9, normalize: (v) => v.replace(/\s+/g, " ").trim().toUpperCase() },
    { id: "sygn-wsa", type: "SYGNATURA_ORZECZENIA", pattern: WSA_SIGNATURE_RE, baseConfidence: 0.9, normalize: (v) => v.replace(/\s+/g, " ").trim() },
    { id: "sygn-kio", type: "SYGNATURA_ORZECZENIA", pattern: KIO_SIGNATURE_RE, baseConfidence: 0.95, normalize: (v) => v.replace(/\s+/g, " ").trim().toUpperCase() },
    { id: "sygn-tk", type: "SYGNATURA_ORZECZENIA", pattern: TK_SIGNATURE_RE, baseConfidence: 0.6, normalize: (v) => v.replace(/\s+/g, " ").trim().toUpperCase() },

    // === Akty prawne (NIE sa PII - domyslnie nie podmieniamy, patrz detect.mjs) ===
    { id: "celex", type: "SYGNATURA_AKTU", pattern: CELEX_RE, baseConfidence: 1.0, normalize: (v) => v.toUpperCase() },
    { id: "eli", type: "SYGNATURA_AKTU", pattern: ELI_FRAGMENT_RE, baseConfidence: 0.95, normalize: (v) => v.toLowerCase() },

    // === Firmy z forma prawna ===
    { id: "organizacja", type: "FIRMA", pattern: ORGANIZACJA_RE, baseConfidence: 0.7, normalize: (v) => v.replace(/\s+/g, " ").trim() },
    { id: "firma", type: "FIRMA", pattern: FIRMA_Z_FORMA_RE, trim: przytnijStrone, validate: maNazwe, baseConfidence: 0.75, normalize: (v) => v.replace(/\s+/g, " ").trim() },
];

/**
 * Detekcja regex-based - przebiega po regulach, walidator filtruje
 * false-positives, normalizator transformuje. Zwraca matches posortowane
 * wg pozycji. Konflikty (nakladajace sie spany) rozwiazuje warstwa wyzej
 * (detect.mjs).
 */
export function detectAll(text, rules = PL_EXTRACTION_RULES) {
    const matches = [];
    for (const rule of rules) {
        const re = new RegExp(rule.pattern.source, rule.pattern.flags);
        let m;
        while ((m = re.exec(text)) !== null) {
            let raw = m[1] ?? m[0];
            if (rule.trim) raw = rule.trim(raw);
            if (!raw) continue;
            if (m[0].length === 0) { re.lastIndex++; continue; }
            const start = m.index + m[0].indexOf(raw);
            if (rule.validate && !rule.validate(raw)) {
                if (rule.retryOnReject) re.lastIndex = m.index + 1;
                continue;
            }
            const normalized = rule.normalize ? rule.normalize(raw) : raw;
            const walidacjaSumy = rule.walidacjaSumy ?? SUMA_NIE_DOTYCZY;
            matches.push({
                raw, normalized, type: rule.type,
                confidence: rule.baseConfidence, ruleId: rule.id,
                start, end: start + raw.length,
                walidacjaSumy, doPrzegladu: walidacjaSumy === SUMA_FAILED,
            });
        }
    }
    return matches.sort((a, b) => a.start - b.start);
}
