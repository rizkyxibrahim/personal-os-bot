import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { todayJakarta } from "../dates";
import { buildDebtList } from "../handlers/debts";
import { buildGoalList } from "../handlers/goals";
import { buildSubList } from "../handlers/subscriptions";
import { buildDashboard } from "../services/dashboard";
import { buildRekap } from "../services/rekap";
import { buildSaldo, buildToday, buildTodo } from "../services/views";
import { showAccountList } from "./accounts";
import { startFlow } from "./engine";
import {
  showDebtPicker,
  showDonePicker,
  showGoalPicker,
  showSubPicker,
} from "./pickers";
import { sendBackup, startReset } from "./resetFlow";
import { sendNews } from "../handlers/news";
import { CATEGORIES } from "../news/feeds";

const MAIN_TEXT = [
  "🧭 Personal OS",
  "Semua urusanmu, satu tempat.",
  "",
  "Pilih menu untuk melanjutkan.",
].join("\n");

interface Group {
  title: string;
  items: [label: string, action: string][];
}

const GROUPS: Record<string, Group> = {
  catat: {
    title: "➕ Catat",
    items: [
      ["➖ Pengeluaran", "out"],
      ["➕ Pemasukan", "in"],
      ["🔁 Transfer / tarik tunai", "transfer"],
    ],
  },
  lihat: {
    title: "📊 Ringkasan",
    items: [
      ["💰 Saldo", "saldo"],
      ["📊 Rekap bulan ini", "rekap"],
      ["📰 Berita", "news"],
      ["🏠 Dashboard", "start"],
    ],
  },
  tugas: {
    title: "✅ Tugas",
    items: [
      ["✅ Tugas baru", "task"],
      ["☑️ Selesaikan tugas", "done"],
      ["📋 Daftar tugas", "todo"],
      ["🗒️ Rencana hari ini", "today"],
    ],
  },
  goal: {
    title: "🎯 Goals",
    items: [
      ["🎯 Goal baru", "goal"],
      ["💰 Nabung ke goal", "save"],
      ["📋 Progres goal", "goals"],
    ],
  },
  hutang: {
    title: "⚖️ Hutang & piutang",
    items: [
      ["🔻 Hutang baru", "debt"],
      ["🔺 Piutang baru", "recv"],
      ["💸 Bayar / terima", "pay"],
      ["📋 Daftar", "debts"],
    ],
  },
  langganan: {
    title: "📺 Langganan",
    items: [
      ["📺 Langganan baru", "sub"],
      ["💸 Bayar langganan", "paysub"],
      ["📋 Status", "subs"],
    ],
  },
  akun: {
    title: "🏦 Akun",
    items: [
      ["🏦 Kelola akun", "acct"],
      ["➕ Akun baru", "acctnew"],
      ["🛠️ Koreksi saldo", "adjust"],
    ],
  },
  atur: {
    title: "⚙️ Pengaturan",
    items: [
      ["💰 Budget baru", "budget"],
      ["🗂️ Kategori baru", "cat"],
      ["⚡ Template baru", "tpl"],
      ["📦 Cadangan data", "backup"],
      ["🧹 Reset data", "reset"],
    ],
  },
};

function mainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Catat", "m:g:catat")
    .text("📊 Ringkasan", "m:g:lihat")
    .row()
    .text("✅ Tugas", "m:g:tugas")
    .text("🎯 Goals", "m:g:goal")
    .row()
    .text("⚖️ Hutang & piutang", "m:g:hutang")
    .text("📺 Langganan", "m:g:langganan")
    .row()
    .text("🏦 Akun", "m:g:akun")
    .text("⚙️ Pengaturan", "m:g:atur");
}

function groupKeyboard(group: Group): InlineKeyboard {
  const kb = new InlineKeyboard();
  group.items.forEach(([label, action], i) => {
    kb.text(label, `m:${action}`);
    if (i % 2 === 1) kb.row();
  });
  if (group.items.length % 2 === 1) kb.row();
  return kb.text("⬅️ Menu utama", "m:menu");
}

async function editMenu(
  ctx: Context,
  text: string,
  kb: InlineKeyboard,
): Promise<void> {
  try {
    await ctx.editMessageText(text, { reply_markup: kb });
  } catch {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function showMenu(ctx: Context): Promise<void> {
  await ctx.reply(MAIN_TEXT, { reply_markup: mainKeyboard() });
}

export async function handleMenuCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // tombol sudah terlalu lama
  }

  const userId = ctx.from?.id;
  if (userId === undefined) return;

  const action = (ctx.callbackQuery?.data ?? "").slice(2);

  if (action === "menu") return editMenu(ctx, MAIN_TEXT, mainKeyboard());
  if (action.startsWith("g:")) {
    const group = GROUPS[action.slice(2)];
    if (group) await editMenu(ctx, group.title, groupKeyboard(group));
    return;
  }

  switch (action) {
    // Tanya-jawab
    case "out":
    case "in":
    case "task":
    case "goal":
    case "debt":
    case "recv":
    case "sub":
    case "transfer":
    case "adjust":
    case "budget":
    case "cat":
    case "tpl":
      return startFlow(ctx, env, action);
    case "acctnew":
      return startFlow(ctx, env, "acct");
    case "reset":
      return startReset(ctx, env);

    // Pilih dari daftar / kelola
    case "done":
      return showDonePicker(ctx, env, userId);
    case "save":
      return showGoalPicker(ctx, env, userId);
    case "pay":
      return showDebtPicker(ctx, env, userId);
    case "paysub":
      return showSubPicker(ctx, env, userId);
    case "acct":
      return showAccountList(ctx, env, userId);
    case "backup":
      return sendBackup(
        ctx,
        env,
        "📦 Cadangan lengkap (JSON). Simpan di tempat aman.",
      );

    // Lihat
    case "todo":
      await ctx.reply(await buildTodo(env.DB, userId));
      return;
    case "today":
      await ctx.reply(await buildToday(env.DB, userId));
      return;
    case "saldo":
      await ctx.reply(await buildSaldo(env.DB, userId));
      return;
    case "rekap":
      await ctx.reply(
        await buildRekap(env.DB, userId, todayJakarta().slice(0, 7)),
      );
      return;
    case "start":
      await ctx.reply(await buildDashboard(env, userId));
      return;
    case "goals":
      await ctx.reply(await buildGoalList(env.DB, userId));
      return;
    case "debts":
      await ctx.reply(await buildDebtList(env.DB, userId, false));
      return;
    case "subs":
      await ctx.reply(await buildSubList(env.DB, userId));
      return;
    case "news":
      return sendNews(ctx, env, CATEGORIES[0]);
  }
}
