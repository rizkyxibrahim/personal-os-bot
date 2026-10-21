import { todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as subs from "../finance/subscriptions";
import {
  accountStep,
  amountStep,
  categoryStep,
  pickedAccount,
  type Ref,
} from "./shared";
import type { Flow } from "./types";

export function subFlow(): Flow {
  return {
    id: "sub",
    title: "📺 Langganan baru",

    steps: [
      {
        key: "name",
        ask: () => "Nama langganannya? (mis. Netflix)",
        parse: async (input, fc) => {
          const t = input.trim();
          if (t.length < 1 || t.length > 30)
            return { ok: false, error: "Nama 1 sampai 30 karakter." };

          const list = await subs.listSubscriptions(
            fc.db,
            fc.userId,
            todayJakarta().slice(0, 7),
          );
          return list.some((s) => s.name.toLowerCase() === t.toLowerCase())
            ? {
                ok: false,
                error: `Langganan "${t}" sudah ada. Pakai nama lain.`,
              }
            : { ok: true, value: t };
        },
      },
      amountStep("amount", "Berapa tagihan per bulan?"),
      {
        key: "day",
        ask: () =>
          "Tanggal tagihan tiap bulan? (1-31)\nPilih tombol atau ketik angkanya.",
        options: () =>
          ["1", "5", "10", "15", "20", "25"].map((n) => ({
            label: `Tgl ${n}`,
            value: `d${n}`,
          })),
        parse: (input) => {
          const m = input
            .trim()
            .toLowerCase()
            .match(/^d?(\d{1,2})$/);
          const n = m ? Number(m[1]) : 0;
          return n >= 1 && n <= 31
            ? { ok: true, value: n }
            : { ok: false, error: "Tanggal harus angka 1 sampai 31." };
        },
      },
      categoryStep({
        type: "expense",
        hintWords: (d) =>
          String(d.name ?? "")
            .split(/\s+/)
            .filter(Boolean),
      }),
      accountStep({ ask: "Dibayar dari akun mana?" }),
      {
        key: "remind",
        optional: true, // Lewati = 3 hari
        ask: () => "Ingatkan berapa hari sebelum jatuh tempo?",
        options: () => [
          { label: "Hari H", value: "r0" },
          { label: "1 hari", value: "r1" },
          { label: "3 hari", value: "r3" },
          { label: "7 hari", value: "r7" },
        ],
        parse: (input) => {
          const m = input
            .trim()
            .toLowerCase()
            .match(/^r?(\d{1,2})$/);
          const n = m ? Number(m[1]) : -1;
          return n >= 0 && n <= 30
            ? { ok: true, value: n }
            : { ok: false, error: "Isi angka 0 sampai 30 (hari)." };
        },
      },
    ],

    summary: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      const remind = (d.remind as number | null) ?? 3;
      return [
        `📺 ${d.name as string}`,
        `📉 ${rupiah(d.amount as number)} · tiap tanggal ${d.day as number}`,
        `📂 ${(d.category as Ref).name} · 🏦 ${account?.name ?? "-"}`,
        `⏰ Ingatkan ${remind === 0 ? "di hari H" : `${remind} hari sebelumnya`}`,
      ].join("\n");
    },

    finish: async (fc, d) => {
      const account = await pickedAccount(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan. Cek /saldo.";

      const category = d.category as Ref;
      const remind = (d.remind as number | null) ?? 3;
      const id = await subs.upsertSubscription(fc.db, fc.userId, {
        name: d.name as string,
        amount: d.amount as number,
        billDay: d.day as number,
        categoryId: category.id,
        accountId: account.id,
        remindDays: remind,
      });

      return [
        `✅ Langganan ${d.name as string} tersimpan (#${id})`,
        `📉 ${rupiah(d.amount as number)} · tiap tanggal ${d.day as number}`,
        `📂 ${category.name} · 🏦 ${account.name} · ingatkan ${remind} hari sebelumnya`,
        `Bayar dengan /bayarsub ${id}`,
      ].join("\n");
    },
  };
}
