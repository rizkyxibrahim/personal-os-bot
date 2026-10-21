import { formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as goals from "../finance/goals";
import { depositToGoal } from "../handlers/goals";
import { accountStep, amountStep, pickedAccount } from "./shared";
import type { Flow } from "./types";

export function goalSaveFlow(): Flow {
  return {
    id: "goalsave",
    title: "🎯 Nabung ke goal",

    steps: [
      amountStep("amount", "Berapa yang mau ditabung?"),
      accountStep({ ask: "Diambil dari akun mana?" }),
    ],

    summary: async (fc, d) => {
      const goal = await goals.getGoal(fc.db, fc.userId, d.goalId as number);
      if (!goal) return "Goal tidak ditemukan.";

      const amount = d.amount as number;
      const account = await pickedAccount(fc, d);
      const pct = Math.round(((goal.saved + amount) * 100) / goal.target);

      return [
        `${goal.icon ?? "🎯"} ${goal.name} (G${goal.id})`,
        `💰 Setoran ${rupiah(amount)}`,
        `🏦 Dari ${account?.name ?? "-"}`,
        `📅 ${formatDate(todayJakarta())}`,
        `Progres setelahnya: ${rupiah(goal.saved + amount)} / ${rupiah(goal.target)} (${pct}%)`,
      ].join("\n");
    },

    finish: async (fc, d) => {
      const goal = await goals.getGoal(fc.db, fc.userId, d.goalId as number);
      if (!goal) return "⚠️ Goal tidak ditemukan.";

      const account = await pickedAccount(fc, d);
      if (!account) return "⚠️ Akun tidak ditemukan. Cek /saldo.";
      return depositToGoal(fc.db, fc.userId, goal, d.amount as number, account);
    },
  };
}
