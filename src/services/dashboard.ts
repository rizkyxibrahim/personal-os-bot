import type { Env } from "../env";
import {
  daysBetween,
  dueDate,
  formatDayLong,
  nowJakarta,
  todayJakarta,
} from "../dates";
import { rupiah } from "../format";
import * as debts from "../finance/debts";
import * as q from "../finance/queries";
import * as subs from "../finance/subscriptions";
import { listOpenTasks } from "../tasksDb";
import { formatTask, groupTasks } from "./taskView";
import { CATEGORIES } from "../news/feeds";
import { ago } from "../news/format";
import { getNews } from "../news/news";
import { clip, listMail, UNREAD_QUERY } from "../gmail/api";
import { getAccount } from "../gmail/store";
import * as users from "../users/store";
import { currentWeather, resolveLocation } from "./location";

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

async function emailSection(env: Env, userId: number): Promise<string> {
  const account = await getAccount(env, userId);
  if (!account)
    return "📧 EMAIL\nBelum terhubung. Ketik /gmail untuk menghubungkan.";

  const mails = await listMail(env, account.refreshToken, UNREAD_QUERY, 3);
  if (mails.length === 0) return "📧 EMAIL\nTidak ada email belum dibaca. 🎉";

  return [
    "📧 EMAIL BELUM DIBACA",
    ...mails.map(
      (m) => `• ${clip(m.subject, 70)} (${clip(m.from, 25)} · ${ago(m.date)})`,
    ),
    "Semua: /unread",
  ].join("\n");
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
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function greeting(minutes: number): string {
  const h = Math.floor(minutes / 60);
  if (h >= 4 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

export async function buildDashboard(
  env: Env,
  userId: number,
): Promise<string> {
  const today = todayJakarta();
  const { minutes } = nowJakarta();

  const user = await users.getUser(env.DB, userId);
  const name = user?.name ?? "kamu";
  const place = await resolveLocation(env.DB, userId);
  const weather = await currentWeather(place.lat, place.lon);

  const sections = (
    await Promise.all([
      safe("balance", () => balanceSection(env, userId, today), "💰 SALDO"),
      safe(
        "reminders",
        () => remindersSection(env, userId, today),
        "⏰ PENGINGAT",
      ),
      safe("news", () => newsSection(env), "📰 BERITA"),
      safe("email", () => emailSection(env, userId), "📧 EMAIL"),
      safe("tasks", () => tasksSection(env, userId, today), "✅ TUGAS"),
    ])
  ).filter((s): s is string => Boolean(s));

  const head = [
    `${greeting(minutes)}, ${name}! 👋`,
    `${formatDayLong(today)} · ${clock(minutes)} WIB`,
  ];
  if (weather) head.push(`🌤️ ${place.label}: ${weather}`);

  return [
    ...head,
    "",
    sections.join("\n\n"),
    "",
    "Ketik /menu untuk tombol, atau /help untuk daftar perintah.",
  ].join("\n");
}
