import { resolveCategory } from "../finance/categorize";
import * as q from "../finance/queries";
import { parseAmount } from "../parse";
import type { Data, FlowCtx, Step } from "./types";

export interface Ref {
  id: number;
  name: string;
}

export const AMOUNT_HINT = "Contoh: 25000, 25k, 1,5jt, 30 juta";

const ICON_ACCOUNT = {
  cash: "💵",
  bank: "🏦",
  ewallet: "📱",
  asset: "🏠",
} as const;
const FALLBACK_NAMES = ["Lainnya", "Lain-lain"];

export function amountStep(
  key: string,
  ask: string,
  opts: { optional?: boolean; allowZero?: boolean } = {},
): Step {
  return {
    key,
    optional: opts.optional,
    ask: () => `${ask}\n${AMOUNT_HINT}`,
    parse: (input) => {
      const t = input.trim();
      if (opts.allowZero && t === "0") return { ok: true, value: 0 };
      const n = parseAmount(t);
      return n === null
        ? { ok: false, error: `Nominal tidak valid. ${AMOUNT_HINT}` }
        : { ok: true, value: n };
    },
  };
}

// Akun pilihan pengguna, atau akun utama kalau langkah akun dilewati
export async function pickedAccount(
  fc: FlowCtx,
  data: Data,
): Promise<q.Account | null> {
  const chosen = data.account as Ref | undefined;
  if (chosen) {
    const accounts = await q.listAccounts(fc.db, fc.userId);
    return accounts.find((a) => a.id === chosen.id) ?? null;
  }
  return q.getDefaultAccount(fc.db, fc.userId);
}

// Dilewati kalau hanya ada satu akun, atau kalau also() mengembalikan false
export function accountStep(opts: {
  ask: string;
  also?: (data: Data) => boolean;
}): Step {
  return {
    key: "account",
    when: async (fc, data) => {
      if (opts.also && !opts.also(data)) return false;
      return (await q.listAccounts(fc.db, fc.userId)).length > 1;
    },
    ask: () => opts.ask,
    options: async (fc) =>
      (await q.listAccounts(fc.db, fc.userId)).map((a) => ({
        label: `${ICON_ACCOUNT[a.type]} ${a.name}${a.is_default ? " (utama)" : ""}`,
        value: `a${a.id}`,
      })),
    parse: async (input, fc) => {
      const accounts = await q.listAccounts(fc.db, fc.userId);
      const m = input.match(/^a(\d+)$/);
      const found = m
        ? accounts.find((a) => a.id === Number(m[1]))
        : accounts.find(
            (a) => a.name.toLowerCase() === input.trim().toLowerCase(),
          );
      return found
        ? { ok: true, value: { id: found.id, name: found.name } }
        : {
            ok: false,
            error: `Akun "${input}" tidak ditemukan. Pilih dari tombol, atau lihat /saldo.`,
          };
    },
  };
}

// Pilih kategori; kategori yang cocok dengan kata kunci ditandai ⭐ dan ditaruh paling atas
export function categoryStep(opts: {
  type: q.CategoryType;
  hintWords: (data: Data) => string[];
}): Step {
  return {
    key: "category",
    ask: () => "Pilih kategori (atau ketik namanya):",
    options: async (fc, data) => {
      const cats = (await q.listCategories(fc.db, fc.userId)).filter(
        (c) => c.type === opts.type,
      );
      const words = opts.hintWords(data);
      const guess =
        words.length > 0
          ? resolveCategory({
              words,
              hashCategory: null,
              categories: cats,
              type: opts.type,
            })
          : null;
      const suggestedId =
        guess &&
        guess.ok &&
        guess.category &&
        !FALLBACK_NAMES.includes(guess.category.name)
          ? guess.category.id
          : null;

      const ordered =
        suggestedId === null
          ? cats
          : [
              ...cats.filter((c) => c.id === suggestedId),
              ...cats.filter((c) => c.id !== suggestedId),
            ];

      return ordered.map((c) => ({
        label: `${c.id === suggestedId ? "⭐ " : ""}${c.icon ?? "•"} ${c.name}`,
        value: `c${c.id}`,
      }));
    },
    parse: async (input, fc) => {
      const cats = (await q.listCategories(fc.db, fc.userId)).filter(
        (c) => c.type === opts.type,
      );
      const m = input.match(/^c(\d+)$/);
      const found = m
        ? cats.find((c) => c.id === Number(m[1]))
        : cats.find((c) => c.name.toLowerCase() === input.trim().toLowerCase());
      return found
        ? { ok: true, value: { id: found.id, name: found.name } }
        : {
            ok: false,
            error: `Kategori "${input}" tidak ditemukan. Pilih dari tombol, atau lihat /kategori.`,
          };
    },
  };
}
