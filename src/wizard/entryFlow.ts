import { addDays, formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import { resolveCategory } from "../finance/categorize";
import { parseEntryDate } from "../finance/entry";
import * as q from "../finance/queries";
import { saveEntry } from "../handlers/finance";
import type { Data, Flow, FlowCtx } from "./types";

const ICON_ACCOUNT = {
  cash: "💵",
  bank: "🏦",
  ewallet: "📱",
  asset: "🏠",
} as const;
const FALLBACK_NAMES = ["Lainnya", "Lain-lain"];
const AMOUNT_HINT = "Contoh: 25000, 25k, 1,5jt, 30 juta";

interface Ref {
  id: number;
  name: string;
}

// Akun pilihan pengguna, atau akun utama kalau langkah akun dilewati
async function pickedAccount(
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

export function entryFlow(type: "in" | "out"): Flow {
  const catType: q.CategoryType = type === "in" ? "income" : "expense";
  const label = type === "in" ? "Pemasukan" : "Pengeluaran";
  const icon = type === "in" ? "📈" : "📉";

  return {
    id: type,
    title: `${icon} ${label} baru`,

    steps: [
      {
        key: "amount",
        ask: () => `Berapa nominalnya?\n${AMOUNT_HINT}`,
        parse: (input) => {
          const n = parseAmount(input);
          return n === null
            ? { ok: false, error: `Nominal tidak valid. ${AMOUNT_HINT}` }
            : { ok: true, value: n };
        },
      },
      {
        key: "note",
        optional: true,
        ask: () => "Untuk apa? (keterangan, mis. makan siang)",
        parse: (input) =>
          input.length > 200
            ? {
                ok: false,
                error: "Keterangan terlalu panjang (maksimal 200 karakter).",
              }
            : { ok: true, value: input },
      },
      {
        key: "category",
        ask: () => "Pilih kategori (atau ketik namanya):",
        options: async (fc, data) => {
          const cats = (await q.listCategories(fc.db, fc.userId)).filter(
            (c) => c.type === catType,
          );
          const words =
            typeof data.note === "string"
              ? data.note.split(/\s+/).filter(Boolean)
              : [];
          const guess =
            words.length > 0
              ? resolveCategory({
                  words,
                  hashCategory: null,
                  categories: cats,
                  type: catType,
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
            (c) => c.type === catType,
          );
          const m = input.match(/^c(\d+)$/);
          const found = m
            ? cats.find((c) => c.id === Number(m[1]))
            : cats.find((c) => c.name.toLowerCase() === input.toLowerCase());
          return found
            ? { ok: true, value: { id: found.id, name: found.name } }
            : {
                ok: false,
                error: `Kategori "${input}" tidak ditemukan. Pilih dari tombol, atau lihat /kategori.`,
              };
        },
      },
      {
        key: "account",
        // Kalau hanya ada satu akun, langkah ini dilewati dan akun utama dipakai
        when: async (fc) => (await q.listAccounts(fc.db, fc.userId)).length > 1,
        ask: () =>
          type === "in" ? "Masuk ke akun mana?" : "Dibayar dari akun mana?",
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
                (a) => a.name.toLowerCase() === input.toLowerCase(),
              );
          return found
            ? { ok: true, value: { id: found.id, name: found.name } }
            : {
                ok: false,
                error: `Akun "${input}" tidak ditemukan. Pilih dari tombol, atau lihat /saldo.`,
              };
        },
      },
      {
        key: "date",
        ask: () =>
          "Tanggal transaksi?\nPilih tombol, atau ketik dd-mm-yyyy (contoh 05-10-2026)",
        options: () => [
          { label: "📅 Hari ini", value: "today" },
          { label: "Kemarin", value: "yesterday" },
        ],
        parse: (input) => {
          const today = todayJakarta();
          const t = input.trim().toLowerCase();
          if (t === "today" || t === "hari ini" || t === "hariini")
            return { ok: true, value: today };
          if (t === "yesterday") return { ok: true, value: addDays(today, -1) };

          const d = parseEntryDate(t, today);
          if (!d)
            return {
              ok: false,
              error: "Tanggal tidak valid. Pakai dd-mm-yyyy, mis. 05-10-2026.",
            };
          if (d > today)
            return { ok: false, error: "Tanggal tidak boleh di masa depan." };
          return { ok: true, value: d };
        },
      },
    ],

    summary: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      const lines = [
        `${icon} ${rupiah(d.amount as number)}`,
        `📂 ${(d.category as Ref).name}`,
      ];
      if (typeof d.note === "string" && d.note) lines.push(`📝 ${d.note}`);
      lines.push(
        `🏦 ${account?.name ?? "-"}`,
        `📅 ${formatDate(d.date as string)}`,
      );
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan. Cek /saldo.";

      const category = d.category as Ref;
      return saveEntry(fc.db, {
        userId: fc.userId,
        type,
        amount: d.amount as number,
        date: d.date as string,
        account,
        category,
        note: typeof d.note === "string" && d.note ? d.note : null,
        autoCategory: false,
      });
    },
  };
}
