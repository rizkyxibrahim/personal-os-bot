import { addDays, isValidDate } from "../dates";
import { parseAmount } from "../parse";

const IN_PREFIXES = new Set(["in", "i", "income", "masuk", "+"]);
const OUT_PREFIXES = new Set(["out", "o", "expense", "ex", "x", "keluar", "-"]);

export interface Entry {
  type: "in" | "out";
  amount: number;
  date: string;
  words: string[];
  hashCategory: string | null;
  account: string | null;
}

export type EntryResult =
  | { kind: "entry"; entry: Entry }
  | { kind: "error"; message: string } // bentuknya transaksi, tapi isinya salah
  | { kind: "none" }; // bukan transaksi

function looksLikeDate(tok: string): boolean {
  return (
    /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(tok) ||
    /^\d{4}-\d{2}-\d{2}$/.test(tok) ||
    tok.toLowerCase() === "kemarin"
  );
}

// "05/10", "5-10", "05/10/2026", "2026-10-05", "kemarin" -> "2026-10-05"
export function parseEntryDate(tok: string, today: string): string | null {
  const t = tok.toLowerCase();
  if (t === "kemarin") return addDays(today, -1);

  let y: string;
  let m: string;
  let d: string;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    [, y, m, d] = iso;
  } else {
    const dm = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (!dm) return null;
    d = dm[1];
    m = dm[2];
    y = dm[3] ?? today.slice(0, 4);
    if (y.length === 2) y = "20" + y;
  }

  const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isValidDate(date) ? date : null;
}

// [tanggal] out|in nominal [kategori] [keterangan] [Akun]
export function parseEntry(text: string, today: string): EntryResult {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  let dateTok: string | null = null;

  if (tokens[0] && looksLikeDate(tokens[0])) {
    dateTok = tokens[0];
    i = 1;
  }

  const prefix = tokens[i]?.toLowerCase();
  if (!prefix) return { kind: "none" };

  const type = IN_PREFIXES.has(prefix)
    ? "in"
    : OUT_PREFIXES.has(prefix)
      ? "out"
      : null;
  if (!type) return { kind: "none" };

  let j = i + 1;
  if (!dateTok && tokens[j] && looksLikeDate(tokens[j])) {
    dateTok = tokens[j];
    j++;
  }

  const amount = tokens[j] ? parseAmount(tokens[j]) : null;
  if (amount === null) return { kind: "none" };

  let date = today;
  if (dateTok) {
    const parsed = parseEntryDate(dateTok, today);
    if (!parsed)
      return { kind: "error", message: `Tanggal tidak valid: ${dateTok}` };
    if (parsed > today)
      return { kind: "error", message: "Tanggal tidak boleh di masa depan." };
    date = parsed;
  }

  let rest = tokens.slice(j + 1).join(" ");

  let account: string | null = null;
  const acc = rest.match(/\[([^\]]+)\]/);
  if (acc) {
    account = acc[1].trim();
    rest = rest.replace(acc[0], " ");
  }

  let hashCategory: string | null = null;
  const tag = rest.match(/(?:^|\s)#(\S+)/);
  if (tag) {
    hashCategory = tag[1].toLowerCase();
    rest = rest.replace(tag[0], " ");
  }

  const words = rest.split(/\s+/).filter(Boolean);
  return {
    kind: "entry",
    entry: { type, amount, date, words, hashCategory, account },
  };
}

// Untuk tempo/deadline: "31/12" yang tanggalnya sudah lewat dianggap tahun depan
export function parseFutureDate(tok: string, today: string): string | null {
  const d = parseEntryDate(tok, today);
  if (!d) return null;

  const hasYear = /^\d{4}-/.test(tok) || tok.split(/[/-]/).length === 3;
  if (hasYear || d >= today) return d;

  const bumped = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  return isValidDate(bumped) ? bumped : null;
}
