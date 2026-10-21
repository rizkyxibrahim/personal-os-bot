import { rupiah } from "../format";
import * as q from "../finance/queries";
import * as rep from "../finance/reports";
import * as tpl from "../finance/templates";
import {
  accountStep,
  amountStep,
  categoryStep,
  pickedAccount,
  type Ref,
} from "./shared";
import type { Data, Flow, FlowCtx } from "./types";

const NAME_RE = /^[\p{L}\p{N}_-]{1,20}$/u;
const BUDGET_LABEL: Record<string, string> = {
  needs: "Needs",
  wants: "Wants",
  savings: "Savings",
};

const noteWords = (d: Data) =>
  String(d.note ?? "")
    .split(/\s+/)
    .filter(Boolean);

// ---------- Kategori ----------

export function categoryFlow(): Flow {
  return {
    id: "cat",
    title: "🗂️ Kategori baru",

    steps: [
      {
        key: "name",
        ask: () => "Nama kategorinya? (satu kata, mis. Seblak)",
        parse: async (input, fc) => {
          const t = input.trim();
          if (!NAME_RE.test(t))
            return {
              ok: false,
              error:
                "Satu kata saja (huruf, angka, - atau _), maksimal 20 karakter.",
            };
          const exists = (await q.listCategories(fc.db, fc.userId)).some(
            (c) => c.name.toLowerCase() === t.toLowerCase(),
          );
          return exists
            ? { ok: false, error: `Kategori ${t} sudah ada.` }
            : { ok: true, value: t };
        },
      },
      {
        key: "type",
        ask: () => "Jenisnya?",
        options: () => [
          { label: "📉 Pengeluaran", value: "expense" },
          { label: "📈 Pemasukan", value: "income" },
        ],
        parse: (input) => {
          const t = input.trim();
          return t === "expense" || t === "income"
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih Pengeluaran atau Pemasukan." };
        },
      },
      {
        key: "budget",
        optional: true,
        when: (_fc, d) => d.type === "expense",
        ask: () =>
          "Masuk kelompok mana? (untuk aturan 50/30/20)\nNeeds = kebutuhan pokok, Wants = keinginan, Savings = tabungan/investasi",
        options: () => [
          { label: "Needs", value: "needs" },
          { label: "Wants", value: "wants" },
          { label: "Savings", value: "savings" },
        ],
        parse: (input) => {
          const t = input.trim().toLowerCase();
          return Object.hasOwn(BUDGET_LABEL, t)
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih Needs, Wants, atau Savings." };
        },
      },
      {
        key: "icon",
        optional: true,
        ask: () => "Ikon? (opsional, kirim satu emoji)",
        parse: (input) => {
          const t = input.trim();
          return t.length >= 1 && t.length <= 8 && !/\s/.test(t)
            ? { ok: true, value: t }
            : { ok: false, error: "Kirim satu emoji saja." };
        },
      },
    ],

    summary: (_fc, d) =>
      [
        `${(d.icon as string | null) ?? "•"} ${d.name as string}`,
        d.type === "expense" ? "📉 Pengeluaran" : "📈 Pemasukan",
        d.budget ? `Kelompok ${BUDGET_LABEL[d.budget as string]}` : "",
      ]
        .filter(Boolean)
        .join("\n"),

    finish: async (fc, d) => {
      const ok = await q.addCategory(fc.db, fc.userId, {
        name: d.name as string,
        type: d.type as q.CategoryType,
        budgetType: (d.budget as q.BudgetType | null) ?? null,
        icon: (d.icon as string | null) ?? null,
      });
      return ok
        ? `✅ Kategori ${d.name as string} ditambahkan. Lihat semua: /kategori`
        : `⚠️ Kategori ${d.name as string} sudah ada.`;
    },
  };
}

// ---------- Budget ----------

export function budgetFlow(): Flow {
  return {
    id: "budget",
    title: "💰 Budget baru",

    steps: [
      {
        ...categoryStep({ type: "expense", hintWords: () => [] }),
        ask: () => "Budget untuk kategori apa?",
      },
      amountStep("limit", "Batas pengeluaran per bulan?"),
      {
        key: "alert",
        optional: true, // Lewati = 80%
        ask: () => "Peringatkan saat terpakai berapa persen?",
        options: () =>
          [70, 80, 90, 100].map((n) => ({ label: `${n}%`, value: `n${n}` })),
        parse: (input) => {
          const m = input
            .trim()
            .toLowerCase()
            .match(/^n?(\d{1,3})%?$/);
          const n = m ? Number(m[1]) : 0;
          return n >= 1 && n <= 100
            ? { ok: true, value: n }
            : { ok: false, error: "Isi angka 1 sampai 100." };
        },
      },
    ],

    summary: (_fc, d) =>
      [
        `📂 ${(d.category as Ref).name}`,
        `💰 ${rupiah(d.limit as number)} per bulan`,
        `⚠️ Peringatan di ${(d.alert as number | null) ?? 80}%`,
      ].join("\n"),

    finish: async (fc, d) => {
      const category = d.category as Ref;
      const alert = (d.alert as number | null) ?? 80;
      await rep.setBudget(
        fc.db,
        fc.userId,
        category.id,
        d.limit as number,
        alert,
      );
      return `✅ Budget ${category.name}: ${rupiah(d.limit as number)}/bulan, peringatan di ${alert}%.\nPantau dengan /cekbudget`;
    },
  };
}

// ---------- Template ----------

export function templateFlow(): Flow {
  const kindIs = (k: string) => (_fc: FlowCtx, d: Data) => d.kind === k;

  return {
    id: "tpl",
    title: "⚡ Template baru",

    steps: [
      {
        key: "shortcut",
        ask: () => "Nama singkat template? (satu kata, mis. kopi)",
        parse: async (input, fc) => {
          const t = input.trim().toLowerCase();
          if (!NAME_RE.test(t))
            return {
              ok: false,
              error:
                "Satu kata saja (huruf, angka, - atau _), maksimal 20 karakter.",
            };
          const exists = await tpl.findTemplate(fc.db, fc.userId, t);
          if (!exists && (await tpl.countTemplates(fc.db, fc.userId)) >= 50) {
            return {
              ok: false,
              error:
                "Maksimal 50 template. Hapus dulu yang tidak dipakai: /template delete nama",
            };
          }
          return { ok: true, value: t };
        },
      },
      {
        key: "kind",
        ask: () => "Jenisnya?",
        options: () => [
          { label: "📉 Pengeluaran", value: "out" },
          { label: "📈 Pemasukan", value: "in" },
        ],
        parse: (input) => {
          const t = input.trim();
          return t === "out" || t === "in"
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih Pengeluaran atau Pemasukan." };
        },
      },
      amountStep("amount", "Nominalnya?"),
      {
        key: "note",
        optional: true,
        ask: () => "Keterangan? (opsional, mis. kopi susu gula aren)",
        parse: (input) =>
          input.length > 200
            ? {
                ok: false,
                error: "Keterangan terlalu panjang (maksimal 200 karakter).",
              }
            : { ok: true, value: input.trim() },
      },
      {
        ...categoryStep({ type: "expense", hintWords: noteWords }),
        when: kindIs("out"),
      },
      {
        ...categoryStep({ type: "income", hintWords: noteWords }),
        when: kindIs("in"),
      },
      accountStep({ ask: "Pakai akun mana?" }),
    ],

    summary: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      return [
        `⚡ ${d.shortcut as string}`,
        `${d.kind === "in" ? "📈" : "📉"} ${rupiah(d.amount as number)} · ${(d.category as Ref).name}`,
        d.note ? `📝 ${d.note as string}` : "",
        `🏦 ${account?.name ?? "-"}`,
      ]
        .filter(Boolean)
        .join("\n");
    },

    finish: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan. Cek /akun.";

      await tpl.upsertTemplate(fc.db, fc.userId, {
        shortcut: d.shortcut as string,
        type: d.kind as "in" | "out",
        amount: d.amount as number,
        accountId: account.id,
        categoryId: (d.category as Ref).id,
        note: (d.note as string | null) || null,
      });
      return `✅ Template ${d.shortcut as string} tersimpan.\nPakai: /qr ${d.shortcut as string}`;
    },
  };
}
