// Reguly regex-based ekstrakcji encji prawa polskiego + identyfikatorow PII.
//
// 5 top kategorii sygnatur orzeczen (SN, NSA, WSA, KIO, TK) = ~90%
// cytowanych orzeczen w opiniach kancelaryjnych. PII: PESEL/NIP/REGON/KRS
// (z checksuma), email, telefon. OSOBA: detekcja "Imie Nazwisko" przez
// gazetteer imion (wartosc dodana - pl-entities mial OSOBA tylko jako
// LLM-fallback; tutaj jest deterministyczna, bez wysylania tekstu do modelu).

import {
    isValidPesel, isValidNip, isValidRegon, isValidKrsFormat,
} from "./checksums.mjs";
import { POLISH_FIRST_NAMES } from "./gazetteers.mjs";

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
const PHONE_PL_RE = /(?:\+48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// --- Firma z forma prawna ---
const FIRMA_Z_FORMA_RE = /\b[A-ZŁŚŻŹĆŃÓĄĘ][\wŁŚŻŹĆŃÓĄĘłśżźćńóąę.,\s&-]{0,80}?\s+(?:Sp\.\s+z\s+o\.o\.|S\.A\.|Sp\.\s+k\.|S\.K\.A\.|Sp\.\s+j\.|Sp\.\s+p\.|P\.S\.A\.)(?=\s|$|[.,;:!?])/g;

// --- Osoba: Imie (z gazetteera) + Nazwisko (z wielkiej litery, opc. dwuczlon) ---
const OSOBA_RE = /\b[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]+\s+[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]+(?:-[A-ZŁŚŻŹĆŃÓĄĘ][a-ząćęłńóśźż]+)?\b/g;

/** True jezeli pierwszy czlon dopasowania jest znanym polskim imieniem. */
function startsWithKnownFirstName(match) {
    const first = match.split(/\s+/)[0];
    return POLISH_FIRST_NAMES.has(foldPl(first).replace(/^(.)/, (c) => c.toUpperCase()));
}

const phoneDigits = (v) => v.replace(/[\s-]/g, "");
// Telefon: odrzucamy prefiks +48 zanim policzymy 9 cyfr krajowych.
const phoneNational = (v) => v.replace(/[\s+-]/g, "").replace(/^48/, "");

export const PL_EXTRACTION_RULES = [
    // === Identyfikatory PII (checksumy walidowane) ===
    { id: "pesel", type: "PESEL", pattern: /\b\d{11}\b/g, validate: isValidPesel, baseConfidence: 1.0, normalize: (v) => v },
    { id: "nip", type: "NIP", pattern: /\b\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, validate: isValidNip, baseConfidence: 1.0, normalize: phoneDigits },
    { id: "regon", type: "REGON", pattern: /\b(\d{14}|\d{9})\b/g, validate: isValidRegon, baseConfidence: 1.0, normalize: phoneDigits },
    { id: "krs", type: "KRS", pattern: /\bKRS[:\s]*(\d{10})\b/gi, validate: isValidKrsFormat, baseConfidence: 0.95, normalize: (v) => v.replace(/[^\d]/g, "").padStart(10, "0") },
    { id: "email", type: "EMAIL", pattern: EMAIL_RE, baseConfidence: 0.9, normalize: (v) => v.toLowerCase() },
    { id: "phone", type: "PHONE", pattern: PHONE_PL_RE, validate: (v) => phoneNational(v).length === 9, baseConfidence: 0.85, normalize: phoneNational },

    // === Osoby fizyczne ===
    { id: "osoba", type: "OSOBA", pattern: OSOBA_RE, validate: startsWithKnownFirstName, baseConfidence: 0.85, normalize: (v) => v.replace(/\s+/g, " ").trim() },

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
    { id: "firma", type: "FIRMA", pattern: FIRMA_Z_FORMA_RE, baseConfidence: 0.75, normalize: (v) => v.replace(/\s+/g, " ").trim() },
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
            const raw = m[1] ?? m[0];
            if (!raw) continue;
            if (m[0].length === 0) { re.lastIndex++; continue; }
            const start = m.index + m[0].indexOf(raw);
            if (rule.validate && !rule.validate(raw)) continue;
            const normalized = rule.normalize ? rule.normalize(raw) : raw;
            matches.push({
                raw, normalized, type: rule.type,
                confidence: rule.baseConfidence, ruleId: rule.id,
                start, end: start + raw.length,
            });
        }
    }
    return matches.sort((a, b) => a.start - b.start);
}
