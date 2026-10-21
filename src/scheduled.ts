import { Api, InputFile } from "grammy";
import type { Env } from "./env";
import { nowJakarta, prevMonth } from "./dates";
import { buildBackup, countData } from "./services/backup";
import { buildDashboard } from "./services/dashboard";
import { buildDailyFinance, buildTaskReview } from "./services/digests";
import { claim, cleanup, release } from "./services/notifications";
import { buildRekap } from "./services/rekap";

interface JobContext {
  env: Env;
  userId: number;
  name: string;
  today: string;
  period: string;
  force: boolean; // true hanya saat pengujian lokal
}

interface Job {
  name: string;
  at: string; // "HH:MM" WIB
  weekday?: number; // 0 = Minggu ... 6 = Sabtu (menurut tanggal WIB)
  monthlyOnDay?: number;
  period: (today: string) => string; // kunci anti-duplikat
  build?: (c: JobContext) => Promise<string>; // pesan teks
  deliver?: (c: JobContext, api: Api) => Promise<void>; // pengiriman khusus (mis. file)
}

const GRACE_MINUTES = 90; // lewat dari ini, pesan dianggap basi dan dilewati

const JOBS: Job[] = [
  {
    name: "morning_brief",
    at: "07:00",
    period: (d) => d,
    build: (c) => buildDashboard(c.env, c.userId, c.name),
  },
  {
    name: "task_review",
    at: "20:30",
    period: (d) => d,
    build: (c) => buildTaskReview(c.env, c.userId, c.today),
  },
  {
    name: "finance_summary",
    at: "21:00",
    period: (d) => d,
    build: (c) => buildDailyFinance(c.env, c.userId, c.today),
  },
  {
    name: "monthly_report",
    at: "08:00",
    monthlyOnDay: 1,
    period: (d) => prevMonth(d.slice(0, 7)),
    build: async (c) =>
      `📅 Laporan bulanan\n\n${await buildRekap(c.env.DB, c.userId, c.period)}`,
  },
  {
    name: "weekly_backup",
    at: "20:00",
    weekday: 0,
    period: (d) => d,
    deliver: async (c, api) => {
      const counts = await countData(c.env.DB, c.userId);
      const empty = Object.values(counts).every((n) => n === 0);
      if (empty && !c.force) return; // belum ada data, tidak perlu dicadangkan

      const backup = await buildBackup(c.env.DB, c.userId);
      await api.sendDocument(
        c.userId,
        new InputFile(new TextEncoder().encode(backup.json), backup.filename),
        {
          caption:
            "📦 Cadangan mingguan otomatis (JSON). Berisi data keuanganmu, simpan di tempat aman.",
        },
      );
    },
  },
];

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

function isDue(job: Job, date: string, minutes: number): boolean {
  if (
    job.monthlyOnDay !== undefined &&
    Number(date.slice(8, 10)) !== job.monthlyOnDay
  )
    return false;
  if (job.weekday !== undefined && weekdayOf(date) !== job.weekday)
    return false;
  const [h, m] = job.at.split(":").map(Number);
  const start = h * 60 + m;
  return minutes >= start && minutes < start + GRACE_MINUTES;
}

async function ownerName(api: Api, ownerId: number): Promise<string> {
  try {
    const chat = await api.getChat(ownerId);
    return "first_name" in chat && chat.first_name ? chat.first_name : "kamu";
  } catch {
    return "kamu";
  }
}

// forceJob hanya dipakai saat pengujian lokal (lewati jendela waktu dan klaim)
export async function runScheduled(env: Env, forceJob?: string): Promise<void> {
  const ownerId = Number(env.OWNER_ID);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    console.error("[cron] OWNER_ID tidak valid");
    return;
  }

  const { date, minutes } = nowJakarta();
  const due = JOBS.filter((j) =>
    forceJob ? j.name === forceJob : isDue(j, date, minutes),
  );
  console.log(
    `[cron] ${date} ${hhmm(minutes)} WIB, due: ${due.map((j) => j.name).join(", ") || "-"}`,
  );

  const api = new Api(env.BOT_TOKEN);
  let name: string | null = null;

  for (const job of due) {
    const period = job.period(date);
    if (!forceJob && !(await claim(env.DB, ownerId, job.name, period)))
      continue;

    try {
      name ??= await ownerName(api, ownerId);
      const ctx: JobContext = {
        env,
        userId: ownerId,
        name,
        today: date,
        period,
        force: Boolean(forceJob),
      };

      if (job.deliver) await job.deliver(ctx, api);
      else if (job.build) await api.sendMessage(ownerId, await job.build(ctx));
    } catch (err) {
      console.error(`[cron] ${job.name} gagal`, err);
      if (!forceJob) await release(env.DB, ownerId, job.name, period);
    }
  }

  try {
    await cleanup(env.DB);
  } catch (err) {
    console.error("[cron] cleanup gagal", err);
  }
}
