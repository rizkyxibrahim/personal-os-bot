import { formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import * as debts from "../finance/debts";
import { payDebt } from "../services/debtOps";
import { accountStep, AMOUNT_HINT, pickedAccount } from "./shared";
import type { Flow } from "./types";

export function debtPayFlow(): Flow {
  return {
    id: "debtpay",
    title: "⚖️ Pembayaran",

    steps: [
      {
        key: "amount",
        ask: async (fc, d) => {
          const debt = await debts.getDebt(
            fc.db,
            fc.userId,
            d.debtId as number,
          );
          if (!debt) return "Catatan tidak ditemukan.";
          const payable = debt.direction === "payable";
          return `${payable ? "🔻 Hutang ke" : "🔺 Piutang dari"} ${debt.counterparty} (D${debt.id})\nSisa: ${rupiah(debt.principal - debt.paid)}\n\nBerapa ${payable ? "yang dibayar" : "yang diterima"}?\n${AMOUNT_HINT}`;
        },
        options: () => [{ label: "✅ Lunas", value: "lunas" }],
        parse: async (input, fc, d) => {
          const debt = await debts.getDebt(
            fc.db,
            fc.userId,
            d.debtId as number,
          );
          if (!debt) return { ok: false, error: "Catatan tidak ditemukan." };

          const remaining = debt.principal - debt.paid;
          if (remaining <= 0)
            return { ok: false, error: "Catatan ini sudah lunas." };

          const t = input.trim().toLowerCase();
          const amount = t === "lunas" ? remaining : parseAmount(t);
          if (amount === null)
            return { ok: false, error: `Nominal tidak valid. ${AMOUNT_HINT}` };
          if (amount > remaining) {
            return {
              ok: false,
              error: `Melebihi sisa (${rupiah(remaining)}). Tekan Lunas untuk melunasi.`,
            };
          }
          return { ok: true, value: amount };
        },
      },
      accountStep({ ask: "Lewat akun mana?" }),
    ],

    summary: async (fc, d) => {
      const debt = await debts.getDebt(fc.db, fc.userId, d.debtId as number);
      if (!debt) return "Catatan tidak ditemukan.";

      const amount = d.amount as number;
      const payable = debt.direction === "payable";
      const left = debt.principal - debt.paid - amount;
      const account = await pickedAccount(fc, d);

      return [
        `${payable ? "🔻 Hutang ke" : "🔺 Piutang dari"} ${debt.counterparty} (D${debt.id})`,
        `💸 ${payable ? "Dibayar" : "Diterima"}: ${rupiah(amount)}`,
        `🏦 ${account?.name ?? "-"}`,
        `📅 ${formatDate(todayJakarta())}`,
        left > 0
          ? `Sisa setelahnya: ${rupiah(left)}`
          : "🎉 Ini melunasi seluruh sisa",
      ].join("\n");
    },

    finish: async (fc, d) => {
      const debt = await debts.getDebt(fc.db, fc.userId, d.debtId as number);
      if (!debt) return "⚠️ Catatan tidak ditemukan.";

      const remaining = debt.principal - debt.paid;
      const amount = d.amount as number;
      if (remaining <= 0)
        return `D${debt.id} ${debt.counterparty} sudah lunas.`;
      if (amount > remaining)
        return `⚠️ Nominal melebihi sisa (${rupiah(remaining)}). Ulangi lewat /bayar.`;

      const account = await pickedAccount(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan. Cek /saldo.";
      return payDebt(fc.db, fc.userId, debt, amount, account);
    },
  };
}
