import { formatDate } from "../dates";
import { formatTask, PRIORITY_ICON } from "../services/taskView";
import { parseDue, PRIORITIES, type Priority } from "../taskParse";
import { addTask } from "../tasksDb";
import type { Flow } from "./types";

const PRIORITY_LABEL = {
  high: "Tinggi",
  normal: "Sedang",
  low: "Rendah",
} as const;
const DUE_WORDS: Record<string, string> = {
  today: "hariini",
  tomorrow: "besok",
  day2: "lusa",
};

export function taskFlow(): Flow {
  return {
    id: "task",
    title: "✅ Tugas baru",

    steps: [
      {
        key: "title",
        ask: () => "Apa tugasnya?",
        parse: (input) => {
          if (input.length > 200)
            return {
              ok: false,
              error: "Judul terlalu panjang (maksimal 200 karakter).",
            };
          return { ok: true, value: input };
        },
      },
      {
        key: "due",
        ask: () =>
          "Kapan tenggatnya?\nPilih tombol, atau ketik dd-mm-yyyy (contoh 25-10-2026)",
        options: () => [
          { label: "📅 Hari ini", value: "today" },
          { label: "Besok", value: "tomorrow" },
          { label: "Lusa", value: "day2" },
          { label: "Tanpa tanggal", value: "none" },
        ],
        parse: (input) => {
          const t = input.trim().toLowerCase();
          if (t === "none" || t === "tanpa tanggal")
            return { ok: true, value: null };

          const d = parseDue(DUE_WORDS[t] ?? t);
          return d
            ? { ok: true, value: d }
            : {
                ok: false,
                error:
                  "Tanggal tidak dikenali. Pilih tombol, atau ketik dd-mm-yyyy, besok, lusa.",
              };
        },
      },
      {
        key: "priority",
        optional: true, // Lewati = Sedang
        ask: () => "Prioritasnya?",
        options: () => [
          { label: "🔴 Tinggi", value: "high" },
          { label: "🟡 Sedang", value: "normal" },
          { label: "🟢 Rendah", value: "low" },
        ],
        parse: (input) => {
          const p = PRIORITIES[input.trim().toLowerCase()];
          return p
            ? { ok: true, value: p }
            : { ok: false, error: "Pilih Tinggi, Sedang, atau Rendah." };
        },
      },
      {
        key: "category",
        optional: true,
        ask: () => "Kategori? (opsional, satu kata, mis. rumah)",
        parse: (input) => {
          const t = input.trim().toLowerCase().replace(/^#/, "");
          return /^[\p{L}\p{N}_-]{1,30}$/u.test(t)
            ? { ok: true, value: t }
            : {
                ok: false,
                error:
                  "Kategori satu kata saja (huruf, angka, - atau _, maksimal 30).",
              };
        },
      },
    ],

    summary: (_fc, d) => {
      const priority = (d.priority as Priority | null) ?? "normal";
      const lines = [`📝 ${d.title as string}`];
      lines.push(
        d.due ? `📅 ${formatDate(d.due as string)}` : "📅 Tanpa tanggal",
      );
      lines.push(
        `${PRIORITY_ICON[priority]} Prioritas ${PRIORITY_LABEL[priority]}`,
      );
      if (d.category) lines.push(`🏷️ ${d.category as string}`);
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      const title = d.title as string;
      const priority = (d.priority as Priority | null) ?? "normal";
      const category = (d.category as string | null) ?? null;
      const due = (d.due as string | null) ?? null;

      const id = await addTask(fc.db, fc.userId, {
        title,
        priority,
        category,
        dueDate: due,
      });
      return `✅ Tugas ditambahkan\n${formatTask({ id, title, status: "open", priority, category, due_date: due })}`;
    },
  };
}
