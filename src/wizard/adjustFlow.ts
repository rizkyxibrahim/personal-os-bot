import { todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as q from "../finance/queries";
import { accountStep, amountStep } from "./shared";
import type { Data, Flow, FlowCtx } from "./types";

async function compare(
  fc: FlowCtx,
  d: Data,
): Promise<{ account: q.AccountBalance | null; diff: number }> {
  const chosen = d.account as { id: number } | undefined;
  const accounts = await q.listAccounts(fc.db, fc.userId);
  const account = chosen
    ? (accounts.find((a) => a.id === chosen.id) ?? null)
    : (accounts.find((a) => a.is_default === 1) ?? accounts[0] ?? null);
  const actual = (d.actual as number | undefined) ?? 0;
  return { account, diff: account ? actual - account.balance : 0 };
}

export function adjustFlow(): Flow {
  return {
    id: "adjust",
    title: "🛠️ Koreksi saldo",

    steps: [
      accountStep({ ask: "Saldo akun mana yang mau dicocokkan?" }),
      amountStep(
        "actual",
        "Berapa saldo sebenarnya di aplikasi bank/e-wallet/dompetmu sekarang?",
        { allowZero: true },
      ),
      {
        key: "mode",
        when: async (fc, d) => (await compare(fc, d)).diff !== 0,
        ask: async (fc, d) => {
          const { account, diff } = await compare(fc, d);
          return [
            `Saldo di bot: ${rupiah(account?.balance ?? 0)}`,
            `Saldo sebenarnya: ${rupiah(d.actual as number)}`,
            `Selisih: ${diff > 0 ? "+" : ""}${rupiah(diff)}`,
            "",
            "Selisihnya mau dicatat bagaimana?",
            "• Penyesuaian: dicatat sebagai transaksi dan MASUK rekap (cocok kalau ada yang lupa dicatat).",
            "• Saldo awal: titik awal akun diubah dan TIDAK masuk rekap (cocok kalau saldo awalnya salah).",
          ].join("\n");
        },
        options: () => [
          { label: "📊 Catat penyesuaian", value: "tx" },
          { label: "⚙️ Ubah saldo awal", value: "init" },
        ],
        parse: (input) => {
          const t = input.trim();
          return t === "tx" || t === "init"
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih salah satu dari tombol." };
        },
      },
    ],

    summary: async (fc, d) => {
      const { account, diff } = await compare(fc, d);
      if (!account) return "Akun tidak ditemukan.";

      const lines = [
        `🏦 ${account.name}`,
        `Saldo di bot: ${rupiah(account.balance)}`,
        `Saldo sebenarnya: ${rupiah(d.actual as number)}`,
        `Selisih: ${diff > 0 ? "+" : ""}${rupiah(diff)}`,
      ];
      if (diff === 0) lines.push("✅ Sudah cocok, tidak ada yang diubah.");
      else if (d.mode === "init")
        lines.push("⚙️ Saldo awal akun diubah (tidak masuk rekap).");
      else
        lines.push(
          `📊 Dicatat sebagai ${diff > 0 ? "pemasukan" : "pengeluaran"} "Koreksi ${diff > 0 ? "masuk" : "keluar"}" (masuk rekap).`,
        );
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      const { account, diff } = await compare(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan.";
      if (diff === 0)
        return `✅ Saldo ${account.name} sudah cocok (${rupiah(account.balance)}). Tidak ada yang diubah.`;

      if (d.mode === "init") {
        await q.setInitialBalance(
          fc.db,
          fc.userId,
          account.id,
          account.initial_balance + diff,
        );
        return `✅ Saldo awal ${account.name} diubah. Saldo sekarang ${rupiah(account.balance + diff)}.`;
      }

      const income = diff > 0;
      const name = income ? "Koreksi masuk" : "Koreksi keluar";
      const type: q.CategoryType = income ? "income" : "expense";
      await q.addCategory(fc.db, fc.userId, {
        name,
        type,
        budgetType: null,
        icon: "🛠️",
      });
      const cat = await q.findCategory(fc.db, fc.userId, name, type);

      const id = await q.addTransaction(fc.db, {
        userId: fc.userId,
        type: income ? "in" : "out",
        amount: Math.abs(diff),
        accountId: account.id,
        toAccountId: null,
        categoryId: cat?.id ?? null,
        note: "Koreksi saldo",
        txDate: todayJakarta(),
      });
      return `✅ Saldo ${account.name} dikoreksi (#${id})\n${income ? "📈" : "📉"} ${rupiah(Math.abs(diff))} · ${name}\nSaldo sekarang ${rupiah(account.balance + diff)}.`;
    },
  };
}
