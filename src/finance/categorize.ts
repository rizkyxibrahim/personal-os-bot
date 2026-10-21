import type { Category, CategoryType } from "./queries";

// Nama kategori bawaan -> kata kunci
const KEYWORDS: Record<string, string[]> = {
  Makan: [
    "makan",
    "nasi",
    "kopi",
    "bakso",
    "mie",
    "soto",
    "ayam",
    "sate",
    "jajan",
    "minum",
    "sarapan",
    "lunch",
    "dinner",
    "snack",
    "boba",
    "cafe",
    "gofood",
    "grabfood",
  ],
  Transport: [
    "ojol",
    "gojek",
    "grab",
    "bensin",
    "pertalite",
    "parkir",
    "tol",
    "busway",
    "krl",
    "mrt",
    "taksi",
    "ojek",
    "transport",
  ],
  Tagihan: [
    "listrik",
    "pln",
    "pulsa",
    "internet",
    "wifi",
    "pdam",
    "kos",
    "kost",
    "sewa",
    "token",
    "indihome",
  ],
  Belanja: [
    "belanja",
    "indomaret",
    "alfamart",
    "shopee",
    "tokopedia",
    "lazada",
    "baju",
    "groceries",
  ],
  Hiburan: ["netflix", "spotify", "bioskop", "game", "youtube", "nonton"],
  Kesehatan: ["obat", "dokter", "apotek", "klinik", "vitamin"],
  Pendidikan: ["buku", "kursus", "kuliah", "udemy", "sekolah"],
  Tabungan: ["tabungan", "nabung", "investasi", "reksadana"],
  Gaji: ["gaji", "salary"],
  Bonus: ["bonus", "thr"],
  Freelance: ["freelance", "proyek", "project"],
};

const FALLBACK: Record<CategoryType, string> = {
  income: "Lain-lain",
  expense: "Lainnya",
};

export type Resolved =
  | { ok: true; category: Category | null; auto: boolean }
  | { ok: false; unknown: string };

export function resolveCategory(input: {
  words: string[];
  hashCategory: string | null;
  categories: Category[]; // sudah difilter sesuai tipe
  type: CategoryType;
}): Resolved {
  const { words, hashCategory, categories, type } = input;
  const byName = (name: string) =>
    categories.find((c) => c.name.toLowerCase() === name.toLowerCase());

  // 1. #kategori eksplisit
  if (hashCategory) {
    const found = byName(hashCategory);
    return found
      ? { ok: true, category: found, auto: false }
      : { ok: false, unknown: hashCategory };
  }

  // 2. kata pertama = nama kategori
  const first = words[0] ? byName(words[0]) : undefined;
  if (first) return { ok: true, category: first, auto: false };

  // 3. kata kunci
  const lowered = words.map((w) =>
    w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""),
  );
  for (const c of categories) {
    const kws = KEYWORDS[c.name];
    if (kws && lowered.some((w) => kws.includes(w)))
      return { ok: true, category: c, auto: true };
  }

  // 4. cadangan
  return { ok: true, category: byName(FALLBACK[type]) ?? null, auto: true };
}
