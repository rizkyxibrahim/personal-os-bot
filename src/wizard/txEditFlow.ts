import { addDays, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseEntryDate } from "../finance/entry";
import * as q from "../finance/queries";
import { txLine } from "../handlers/finance";
import { accountStep, amountStep, categoryStep, type Ref } from "./shared";
import type { Data, Flow, FlowCtx, Step } from "./types";

const SYNONYMS: Record<string, string> = {
  nominal: "amount",
  amount: "amount",
  kategori: "category",
  category: "category",
  keterangan: "note",
  note: "note",
  tanggal: "date",
  date: "date",
  akun: "account",
  account: "account",
};

const loadTx = (fc: FlowCtx, d: Data) =>
  q.getTxRow(fc.db, fc.userId, d.txId as number);

const only = (field: string, step: Step): Step => ({
  ...step,
  when: (_fc, d) => d.field === field,
});

const onlyCategory = (type: "in" | "out", step: Step): Step => ({
  ...step,
  when: async (fc, d) =>
    d.field === "category" && (await loadTx(fc, d))?.type === type,
});

export function txEditFlow(): Flow {
  return {
    id: "txedit",
    title: "✏️ Ubah transaksi",

    steps: [
      {
        key: "field",
        ask: async (fc, d) => {
          const tx = await loadTx(fc, d);
          return tx
            ? `${txLine(tx)}\n\nBagian mana yang mau diubah?`
            : "Transaksi tidak ditemukan.";
        },
        options: async (fc, d) => {
          const tx = await loadTx(fc, d);
          const plain = tx !== null && tx.type !== "transfer";
          const list = [{ label: "💲 Nominal", value: "amount" }];
          if (plain) list.push({ label: "📂 Kategori", value: "category" });
          list.push(
            { label: "📝 Keterangan", value: "note" },
            { label: "📅 Tanggal", value: "date" },
          );
          if (plain) list.push({ label: "🏦 Akun", value: "account" });
          return list;
        },
        parse: (input) => {
          const key = input.trim().toLowerCase();
          return Object.hasOwn(SYNONYMS, key)
            ? { ok: true, value: SYNONYMS[key] }
            : { ok: false, error: "Pilih salah satu bagian dari tombol." };
        },
      },
      only("amount", amountStep("amount", "Nominal baru?")),
      onlyCategory(
        "out",
        categoryStep({ type: "expense", hintWords: () => [] }),
      ),
      onlyCategory("in", categoryStep({ type: "income", hintWords: () => [] })),
      only("note", {
        key: "note",
        ask: () => "Keterangan baru?",
        parse: (input) => {
          const t = input.trim();
          return t.length >= 1 && t.length <= 200
            ? { ok: true, value: t }
            : { ok: false, error: "Keterangan 1 sampai 200 karakter." };
        },
      }),
      only("date", {
        key: "date",
        ask: () =>
          "Tanggal baru?\nPilih tombol, atau ketik dd-mm-yyyy (contoh 05-10-2026)",
        options: () => [
          { label: "📅 Hari ini", value: "today" },
          { label: "Kemarin", value: "yesterday" },
        ],
        parse: (input) => {
          const today = todayJakarta();
          const t = input.trim().toLowerCase();
          if (t === "today") return { ok: true, value: today };
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
      }),
      only("account", accountStep({ ask: "Pindah ke akun mana?" })),
    ],

    summary: async (fc, d) => {
      const tx = await loadTx(fc, d);
      if (!tx) return "Transaksi tidak ditemukan.";

      const change: Record<string, string> = {
        amount: `💲 Nominal → ${typeof d.amount === "number" ? rupiah(d.amount) : "-"}`,
        category: `📂 Kategori → ${(d.category as Ref | undefined)?.name ?? "-"}`,
        note: `📝 Keterangan → ${(d.note as string | undefined) ?? "-"}`,
        date: `📅 Tanggal → ${(d.date as string | undefined) ?? "-"}`,
        account: `🏦 Akun → ${(d.account as Ref | undefined)?.name ?? "-"}`,
      };
      return [
        `Sekarang: ${txLine(tx)}`,
        "",
        change[d.field as string] ?? "",
      ].join("\n");
    },

    finish: async (fc, d) => {
      const patch: q.TxPatch = {};
      switch (d.field) {
        case "amount":
          patch.amount = d.amount as number;
          break;
        case "category":
          patch.categoryId = (d.category as Ref).id;
          break;
        case "note":
          patch.note = d.note as string;
          break;
        case "date":
          patch.txDate = d.date as string;
          break;
        case "account":
          patch.accountId = (d.account as Ref).id;
          break;
        default:
          return "⚠️ Tidak ada perubahan.";
      }

      const id = d.txId as number;
      const ok = await q.updateTransaction(fc.db, fc.userId, id, patch);
      if (!ok) return "⚠️ Transaksi tidak ditemukan atau sudah dihapus.";

      const tx = await q.getTxRow(fc.db, fc.userId, id);
      return [
        "✏️ Transaksi diperbarui. Saldo dan laporan ikut menyesuaikan.",
        tx ? txLine(tx) : "",
      ].join("\n");
    },
  };
}
