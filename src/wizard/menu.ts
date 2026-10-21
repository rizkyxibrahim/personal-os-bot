import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { todayJakarta } from "../dates";
import { buildDebtList } from "../handlers/debts";
import { buildGoalList } from "../handlers/goals";
import { buildSubList } from "../handlers/subscriptions";
import { buildDashboard } from "../services/dashboard";
import { buildRekap } from "../services/rekap";
import { buildSaldo, buildToday, buildTodo } from "../services/views";
import { startFlow } from "./engine";
import {
  showDebtPicker,
  showDonePicker,
  showGoalPicker,
  showSubPicker,
} from "./pickers";

const MAIN_TEXT = "🧭 Menu\nMau ngapain?";

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
    ],
  },
  lihat: {
    title: "📊 Lihat",
    items: [
      ["💰 Saldo", "saldo"],
      ["📊 Rekap bulan ini", "rekap"],
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
};

function mainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Catat", "m:g:catat")
    .text("📊 Lihat", "m:g:lihat")
    .row()
    .text("✅ Tugas", "m:g:tugas")
    .text("🎯 Goals", "m:g:goal")
    .row()
    .text("⚖️ Hutang & piutang", "m:g:hutang")
    .text("📺 Langganan", "m:g:langganan");
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

  if (action === "menu") {
    await editMenu(ctx, MAIN_TEXT, mainKeyboard());
    return;
  }
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
      await startFlow(ctx, env, action);
      return;

    // Pilih dari daftar
    case "done":
      await showDonePicker(ctx, env, userId);
      return;
    case "save":
      await showGoalPicker(ctx, env, userId);
      return;
    case "pay":
      await showDebtPicker(ctx, env, userId);
      return;
    case "paysub":
      await showSubPicker(ctx, env, userId);
      return;

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
      await ctx.reply(
        await buildDashboard(env, userId, ctx.from?.first_name ?? "kamu"),
      );
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
  }
}
