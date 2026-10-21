import { formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseFutureDate } from "../finance/entry";
import { saveDebt } from "../services/debtOps";
import { accountStep, amountStep, pickedAccount } from "./shared";
import type { Flow } from "./types";

export function debtFlow(direction: "payable" | "receivable"): Flow {
  const payable = direction === "payable";

  return {
    id: payable ? "debt" : "recv",
    title: payable ? "🔻 Hutang baru" : "🔺 Piutang baru",

    steps: [
      {
        key: "who",
        ask: () =>
          payable ? "Hutang kepada siapa?" : "Siapa yang berutang padamu?",
        parse: (input) => {
          const t = input.trim();
          return t.length >= 1 && t.length <= 30
            ? { ok: true, value: t }
            : { ok: false, error: "Nama 1 sampai 30 karakter." };
        },
      },
      amountStep(
        "amount",
        payable ? "Berapa jumlah hutangnya?" : "Berapa jumlah piutangnya?",
      ),
      {
        key: "note",
        optional: true,
        ask: () => "Untuk apa? (keterangan, opsional)",
        parse: (input) =>
          input.length > 200
            ? {
                ok: false,
                error: "Keterangan terlalu panjang (maksimal 200 karakter).",
              }
            : { ok: true, value: input },
      },
      {
        key: "due",
        optional: true,
        ask: () =>
          "Jatuh tempo kapan?\nKetik dd-mm-yyyy (contoh 31-12-2026), atau Lewati.",
        parse: (input) => {
          const t = input.trim();
          const d = /^\d/.test(t) ? parseFutureDate(t, todayJakarta()) : null;
          return d
            ? { ok: true, value: d }
            : {
                ok: false,
                error:
                  "Tanggal tidak valid. Pakai dd-mm-yyyy, mis. 31-12-2026.",
              };
        },
      },
      {
        key: "cashflow",
        ask: () =>
          payable
            ? "Apakah uang pinjaman ini masuk ke salah satu akunmu sekarang?\n(Pilih Tidak untuk mencatat hutang lama tanpa mengubah saldo.)"
            : "Apakah uang ini keluar dari salah satu akunmu sekarang?\n(Pilih Tidak untuk mencatat piutang lama tanpa mengubah saldo.)",
        options: () => [
          {
            label: payable ? "💰 Ya, masuk ke akun" : "💸 Ya, keluar dari akun",
            value: "yes",
          },
          { label: "📝 Tidak, catatan lama", value: "no" },
        ],
        parse: (input) => {
          const t = input.trim().toLowerCase();
          if (["yes", "ya", "y"].includes(t)) return { ok: true, value: true };
          if (["no", "tidak", "t", "n"].includes(t))
            return { ok: true, value: false };
          return { ok: false, error: "Pilih Ya atau Tidak." };
        },
      },
      accountStep({
        ask: payable
          ? "Uang masuk ke akun mana?"
          : "Uang keluar dari akun mana?",
        also: (d) => d.cashflow === true,
      }),
    ],

    summary: async (fc, d) => {
      const amount = d.amount as number;
      const lines = [`👤 ${d.who as string} · ${rupiah(amount)}`];
      if (d.note) lines.push(`📝 ${d.note as string}`);
      if (d.due) lines.push(`📅 Tempo ${formatDate(d.due as string)}`);

      if (d.cashflow === true) {
        const account = await pickedAccount(fc, d);
        lines.push(
          `🏦 Saldo ${account?.name ?? "-"} ${payable ? "bertambah" : "berkurang"} ${rupiah(amount)}`,
        );
      } else {
        lines.push("ℹ️ Catatan lama: saldo tidak berubah");
      }
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      let account: { id: number; name: string } | null = null;
      if (d.cashflow === true) {
        account = await pickedAccount(fc, d);
        if (!account) return "⚠️ Akun tidak ditemukan. Cek /saldo.";
      }

      return saveDebt(fc.db, fc.userId, {
        direction,
        counterparty: d.who as string,
        principal: d.amount as number,
        note: (d.note as string | null) ?? null,
        dueDate: (d.due as string | null) ?? null,
        account,
      });
    },
  };
}
