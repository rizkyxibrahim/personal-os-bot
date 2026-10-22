import { formatDate } from "../dates";
import { rupiah } from "../format";
import { saveEntry } from "../handlers/finance";
import { accountStep, categoryStep, pickedAccount, type Ref } from "./shared";
import type { Data, Flow } from "./types";

interface Item {
  name: string;
  price: number | null;
}

// Nama toko dan kategori dari OCR dipakai sebagai petunjuk kategori (mis. "Indomaret" -> Belanja)
const hint = (d: Data) => [
  ...String(d.merchant ?? "")
    .split(/\s+/)
    .filter(Boolean),
  ...(typeof d.categoryHint === "string" ? [d.categoryHint] : []),
];

export function receiptFlow(): Flow {
  return {
    id: "receipt",
    title: "🧾 Struk",
    question: "Simpan transaksi ini?",

    steps: [
      {
        ...categoryStep({ type: "expense", hintWords: hint }),
        ask: () => "Kategori untuk struk ini?",
      },
      accountStep({ ask: "Dibayar dari akun mana?" }),
    ],

    summary: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      const items = (d.items as Item[] | undefined) ?? [];

      const lines = [
        `🏪 ${(d.merchant as string | null) ?? "Tanpa nama toko"}`,
        `💰 Total ${rupiah(d.total as number)}`,
        `📅 ${formatDate(d.date as string)}${d.dateNote ? ` (${d.dateNote})` : ""}`,
      ];
      if (items.length > 0) {
        lines.push(
          "",
          ...items.map(
            (i) =>
              `• ${i.name}${i.price !== null ? ` ${rupiah(i.price)}` : ""}`,
          ),
        );
      }
      if (d.duplicateOf) {
        lines.push(
          "",
          `⚠️ Mirip dengan transaksi #${d.duplicateOf} (tanggal dan nominal sama). Mungkin struk yang sama.`,
        );
      }
      lines.push(
        "",
        `📂 ${(d.category as Ref | undefined)?.name ?? "-"} · 🏦 ${account?.name ?? "-"}`,
      );
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan. Cek /akun.";

      const merchant = (d.merchant as string | null) ?? "";
      return saveEntry(fc.db, {
        userId: fc.userId,
        type: "out",
        amount: d.total as number,
        date: d.date as string,
        account,
        category: d.category as Ref,
        note: `Struk${merchant ? ` ${merchant}` : ""}`.slice(0, 200),
        autoCategory: false,
      });
    },
  };
}
