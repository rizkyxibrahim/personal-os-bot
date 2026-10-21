import { daysBetween, formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseFutureDate } from "../finance/entry";
import * as goals from "../finance/goals";
import { goalBlock } from "../handlers/goals";
import { amountStep } from "./shared";
import type { Flow } from "./types";

const PRIORITY_WORDS: Record<string, goals.Priority> = {
  high: "high",
  tinggi: "high",
  med: "med",
  medium: "med",
  sedang: "med",
  low: "low",
  rendah: "low",
};
const PRIORITY_LABEL = {
  high: "🔴 Tinggi",
  med: "🟡 Sedang",
  low: "🟢 Rendah",
} as const;

export function goalFlow(): Flow {
  return {
    id: "goal",
    title: "🎯 Goal baru",

    steps: [
      {
        key: "name",
        ask: () => "Apa tujuan atau barang yang kamu inginkan?",
        parse: async (input, fc) => {
          const t = input.trim();
          if (t.length < 1 || t.length > 40)
            return { ok: false, error: "Nama 1 sampai 40 karakter." };
          const exists = (await goals.listGoals(fc.db, fc.userId)).some(
            (g) => g.name.toLowerCase() === t.toLowerCase(),
          );
          return exists
            ? { ok: false, error: `Goal "${t}" sudah ada. Pakai nama lain.` }
            : { ok: true, value: t };
        },
      },
      amountStep("target", "Berapa harga atau target dananya?"),
      {
        key: "deadline",
        optional: true,
        ask: () =>
          "Mau tercapai kapan?\nKetik dd-mm-yyyy (contoh 06-06-2027), atau Lewati kalau tanpa batas waktu.",
        parse: (input) => {
          const t = input.trim();
          const today = todayJakarta();
          const d = /^\d/.test(t) ? parseFutureDate(t, today) : null;
          if (!d)
            return {
              ok: false,
              error: "Tanggal tidak valid. Pakai dd-mm-yyyy, mis. 06-06-2027.",
            };
          if (d < today)
            return {
              ok: false,
              error: "Tanggal itu sudah lewat. Pakai tanggal yang akan datang.",
            };
          return { ok: true, value: d };
        },
      },
      {
        key: "priority",
        optional: true, // Lewati = Sedang
        ask: () => "Prioritasnya?",
        options: () => [
          { label: "🔴 Tinggi", value: "high" },
          { label: "🟡 Sedang", value: "med" },
          { label: "🟢 Rendah", value: "low" },
        ],
        parse: (input) => {
          const p = PRIORITY_WORDS[input.trim().toLowerCase()];
          return p
            ? { ok: true, value: p }
            : { ok: false, error: "Pilih Tinggi, Sedang, atau Rendah." };
        },
      },
      {
        key: "icon",
        optional: true,
        ask: () => "Pilih ikon (opsional). Kirim satu emoji, mis. 💻",
        parse: (input) => {
          const t = input.trim();
          return t.length >= 1 && t.length <= 8 && !/\s/.test(t)
            ? { ok: true, value: t }
            : { ok: false, error: "Kirim satu emoji saja, tanpa spasi." };
        },
      },
      amountStep("start", "Sudah terkumpul berapa? (opsional)", {
        optional: true,
        allowZero: true,
      }),
    ],

    summary: (_fc, d) => {
      const target = d.target as number;
      const start = (d.start as number | null) ?? 0;
      const priority = (d.priority as goals.Priority | null) ?? "med";

      const lines = [
        `${(d.icon as string | null) ?? "🎯"} ${d.name as string}`,
        `💰 Target ${rupiah(target)}`,
      ];
      if (start > 0) lines.push(`🏦 Dana awal ${rupiah(start)}`);

      if (d.deadline) {
        const deadline = d.deadline as string;
        const days = daysBetween(todayJakarta(), deadline);
        const need = goals.neededPerMonth(Math.max(0, target - start), days);
        lines.push(
          `📅 Deadline ${formatDate(deadline)} (${days} hari lagi) · butuh ±${rupiah(need)}/bulan`,
        );
      } else {
        lines.push("📅 Tanpa deadline");
      }
      lines.push(`Prioritas ${PRIORITY_LABEL[priority]}`);
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      const id = await goals.upsertGoal(fc.db, fc.userId, {
        name: d.name as string,
        target: d.target as number,
        startAmount: (d.start as number | null) ?? 0,
        deadline: (d.deadline as string | null) ?? null,
        icon: (d.icon as string | null) ?? null,
        priority: (d.priority as goals.Priority | null) ?? "med",
      });

      const goal = await goals.getGoal(fc.db, fc.userId, id);
      if (!goal) return "🎯 Target tersimpan.";
      return [
        "🎯 Target tersimpan",
        ...goalBlock(goal, todayJakarta()),
        `Nabung: /save G${id}`,
      ].join("\n");
    },
  };
}
