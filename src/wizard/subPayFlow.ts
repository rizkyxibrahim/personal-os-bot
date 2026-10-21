import { todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as subs from "../finance/subscriptions";
import { paySubscription } from "../handlers/subscriptions";
import type { Flow } from "./types";

export function subPayFlow(): Flow {
  const load = (db: D1Database, userId: number, subId: number) =>
    subs.getSubscription(db, userId, subId, todayJakarta().slice(0, 7));

  return {
    id: "subpay",
    title: "📺 Bayar langganan",
    steps: [],

    summary: async (fc, d) => {
      const sub = await load(fc.db, fc.userId, d.subId as number);
      if (!sub) return "Langganan tidak ditemukan.";
      if (sub.paid) return `${sub.name} sudah dibayar bulan ini.`;

      return [
        `📺 ${sub.name} (#${sub.id})`,
        `📉 ${rupiah(sub.amount)}`,
        `📂 ${sub.category_name ?? "-"}`,
        `🏦 Dari ${sub.account_name}`,
      ].join("\n");
    },

    finish: async (fc, d) => {
      const sub = await load(fc.db, fc.userId, d.subId as number);
      if (!sub) return "⚠️ Langganan tidak ditemukan.";
      if (sub.paid) return `${sub.name} sudah dibayar bulan ini.`;
      return paySubscription(fc.db, fc.userId, sub);
    },
  };
}
