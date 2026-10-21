import type { Env } from "../env";
import { daysBetween, dueDate, formatDayLong, todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as debts from "../finance/debts";
import * as q from "../finance/queries";
import * as subs from "../finance/subscriptions";
import { listOpenTasks } from "../tasksDb";
import { formatTask, groupTasks } from "./taskView";
import { CATEGORIES } from "../news/feeds";
import { ago } from "../news/format";
import { getNews } from "../news/news";

async function balanceSection(
  env: Env,
  userId: number,
  today: string,
): Promise<string> {
  await q.ensureDefaults(env.DB, userId);
  const [accounts, todayTx] = await Promise.all([
    q.listAccounts(env.DB, userId),
    q.listByDate(env.DB, userId, today),
  ]);

  const liquid = accounts
    .filter((a) => a.type !== "asset")
    .reduce((s, a) => s + a.balance, 0);
  const sum = (type: q.TxType) =>
    todayTx.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  const lines = ["💰 SALDO", rupiah(liquid)];
  if (todayTx.length === 0) {
    lines.push("Hari ini: belum ada transaksi");
  } else {
    lines.push(
      `📈 Masuk hari ini: ${rupiah(sum("in"))}`,
      `📉 Keluar hari ini: ${rupiah(sum("out"))}`,
    );
  }
  return lines.join("\n");
}
// Langganan yang belum dibayar dan sudah masuk jendela pengingat, plus tempo hutang <= 3 hari
async function remindersSection(
  env: Env,
  userId: number,
  today: string,
): Promise<string | null> {
  const month = today.slice(0, 7);
  const [subList, debtList] = await Promise.all([
    subs.listSubscriptions(env.DB, userId, month),
    debts.listDebts(env.DB, userId),
  ]);

  const lines: string[] = [];

  for (const s of subList) {
    if (s.paid) continue;
    const diff = daysBetween(today, dueDate(month, s.bill_day));
    if (diff > s.remind_days) continue;

    const when =
      diff < 0
        ? `lewat jatuh tempo ${-diff} hari`
        : diff === 0
          ? "jatuh tempo hari ini"
          : `jatuh tempo ${diff} hari lagi`;
    lines.push(
      `${diff < 0 ? "🔴" : diff === 0 ? "⚠️" : "⏳"} ${s.name} ${rupiah(s.amount)} ${when} (/bayarsub ${s.id})`,
    );
  }

  for (const d of debtList) {
    const remaining = d.principal - d.paid;
    if (remaining <= 0 || !d.due_date) continue;
    const diff = daysBetween(today, d.due_date);
    if (diff > 3) continue;

    const label = d.direction === "payable" ? "Hutang ke" : "Piutang dari";
    const when =
      diff < 0
        ? `lewat tempo ${-diff} hari`
        : diff === 0
          ? "jatuh tempo hari ini"
          : `tempo ${diff} hari lagi`;
    lines.push(
      `${diff < 0 ? "🔴" : "⏳"} ${label} ${d.counterparty} ${rupiah(remaining)} ${when} (D${d.id})`,
    );
  }

  return lines.length > 0 ? ["⏰ PENGINGAT", ...lines].join("\n") : null;
}

async function tasksSection(
  env: Env,
  userId: number,
  today: string,
): Promise<string> {
  const title = "✅ TUGAS";
  const tasks = await listOpenTasks(env.DB, userId);
  if (tasks.length === 0)
    return `${title}\nBelum ada tugas. Tambah dengan /addtask.`;

  const g = groupTasks(tasks, today);
  const focus = g.overdue.length + g.today.length;
  if (focus === 0)
    return `${title}\nTidak ada yang jatuh tempo hari ini. (${tasks.length} tugas lain, ketik /todo)`;

  const MAX = 5;
  const lines = [title];
  let shown = 0;

  for (const [label, list] of [
    ["⏰ Terlewat:", g.overdue],
    ["📅 Hari ini:", g.today],
  ] as const) {
    const room = MAX - shown;
    if (list.length === 0 || room <= 0) continue;
    lines.push(label, ...list.slice(0, room).map(formatTask));
    shown += Math.min(list.length, room);
  }
  if (focus > shown) lines.push(`…dan ${focus - shown} lainnya (ketik /todo)`);

  return lines.join("\n");
}

async function newsSection(env: Env): Promise<string> {
  const title = "📰 BERITA";
  const { items } = await getNews(env.DB, CATEGORIES[0], 3);
  if (items.length === 0)
    return `${title}\nBelum bisa dimuat. Coba /berita nanti.`;

  const lines = items.map((n) => {
    const t = n.title.length > 110 ? `${n.title.slice(0, 109)}…` : n.title;
    return `• ${t} (${n.source}${n.ts ? ` · ${ago(n.ts)}` : ""})`;
  });
  return [title, ...lines, "Selengkapnya: /berita"].join("\n");
}

// Satu bagian gagal tidak boleh merusak seluruh dashboard
async function safe(
  label: string,
  fn: () => Promise<string | null>,
  title: string,
): Promise<string | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`Dashboard section failed: ${label}`, err);
    return `${title}\nGagal memuat data.`;
  }
}

export async function buildDashboard(
  env: Env,
  userId: number,
  name: string,
): Promise<string> {
  const today = todayJakarta();

  const sections = (
    await Promise.all([
      safe("balance", () => balanceSection(env, userId, today), "💰 SALDO"),
      safe(
        "reminders",
        () => remindersSection(env, userId, today),
        "⏰ PENGINGAT",
      ),
      safe("news", () => newsSection(env), "📰 BERITA"),
      safe("tasks", () => tasksSection(env, userId, today), "✅ TUGAS"),
    ])
  ).filter((s): s is string => Boolean(s));

  return [
    `Hi ${name}! 👋`,
    formatDayLong(today),
    "",
    sections.join("\n\n"),
    "",
    "🚧 Email: segera hadir",
    "Ketik /menu untuk tombol, atau /help untuk daftar perintah.",
  ].join("\n");
}
