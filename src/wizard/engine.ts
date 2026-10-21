import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { ensureDefaults } from "../finance/queries";
import { getFlow } from "./registry";
import { claimState, clearState, getState, saveState } from "./state";
import type { Data, Flow, FlowCtx } from "./types";
import { undoKeyboard } from "./keyboards";

interface Btn {
  text: string;
  data: string;
}

const COLUMNS = 2;
const MAX_OPTIONS = 20;
const NO_KEYBOARD = { inline_keyboard: [] };

const flowCtx = (env: Env, userId: number): FlowCtx => ({
  env,
  db: env.DB,
  userId,
});
const cb = (flow: Flow, step: number, value: string) =>
  `w:${flow.id}:${step}:${value}`;

function keyboard(rows: Btn[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  rows
    .filter((r) => r.length > 0)
    .forEach((row, i) => {
      if (i > 0) kb.row();
      for (const b of row) kb.text(b.text, b.data);
    });
  return kb;
}

async function ack(ctx: Context, text?: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery(text ? { text } : undefined);
  } catch {
    // tombol sudah terlalu lama
  }
}

// ---------- Urutan langkah ----------

async function applicable(
  flow: Flow,
  fc: FlowCtx,
  data: Data,
  index: number,
): Promise<boolean> {
  const step = flow.steps[index];
  return !step.when || (await step.when(fc, data));
}

// flow.steps.length berarti tahap ringkasan/konfirmasi
async function nextIndex(
  flow: Flow,
  fc: FlowCtx,
  data: Data,
  from: number,
): Promise<number> {
  for (let i = from + 1; i < flow.steps.length; i++) {
    if (await applicable(flow, fc, data, i)) return i;
  }
  return flow.steps.length;
}

async function prevIndex(
  flow: Flow,
  fc: FlowCtx,
  data: Data,
  from: number,
): Promise<number | null> {
  for (let i = from - 1; i >= 0; i--) {
    if (await applicable(flow, fc, data, i)) return i;
  }
  return null;
}

async function progress(
  flow: Flow,
  fc: FlowCtx,
  data: Data,
  index: number,
): Promise<{ pos: number; total: number }> {
  let total = 0;
  let pos = 0;
  for (let i = 0; i < flow.steps.length; i++) {
    if (await applicable(flow, fc, data, i)) {
      total++;
      if (i <= index) pos++;
    }
  }
  return { pos, total };
}

// ---------- Tampilan ----------

async function render(
  flow: Flow,
  fc: FlowCtx,
  data: Data,
  index: number,
): Promise<{ text: string; kb: InlineKeyboard }> {
  const canGoBack = (await prevIndex(flow, fc, data, index)) !== null;

  if (index >= flow.steps.length) {
    const nav: Btn[] = [];
    if (canGoBack)
      nav.push({ text: "⬅️ Kembali", data: cb(flow, index, "~back") });
    nav.push({ text: "❌ Batal", data: cb(flow, index, "~cancel") });

    return {
      text: `${flow.title} · ringkasan\n\n${await flow.summary(fc, data)}\n\n${flow.question ?? "Simpan?"}`,
      kb: keyboard([
        [
          {
            text: flow.saveLabel ?? "✅ Simpan",
            data: cb(flow, index, "~save"),
          },
        ],
        nav,
      ]),
    };
  }

  const step = flow.steps[index];
  const { pos, total } = await progress(flow, fc, data, index);
  const options = step.options
    ? (await step.options(fc, data)).slice(0, MAX_OPTIONS)
    : [];

  const rows: Btn[][] = [];
  for (let i = 0; i < options.length; i += COLUMNS) {
    rows.push(
      options
        .slice(i, i + COLUMNS)
        .map((o) => ({ text: o.label, data: cb(flow, index, o.value) })),
    );
  }

  const nav: Btn[] = [];
  if (step.optional)
    nav.push({ text: "⏭️ Lewati", data: cb(flow, index, "~skip") });
  if (canGoBack)
    nav.push({ text: "⬅️ Kembali", data: cb(flow, index, "~back") });
  nav.push({ text: "❌ Batal", data: cb(flow, index, "~cancel") });
  rows.push(nav);

  return {
    text: `${flow.title} · langkah ${pos}/${total}\n\n${await step.ask(fc, data)}`,
    kb: keyboard(rows),
  };
}

// mode "edit": ubah pesan yang tombolnya ditekan. mode "reply": pesan baru, tombol pesan lama dihapus
async function show(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  kb: InlineKeyboard | null,
  prevPromptId: number | null,
): Promise<number | null> {
  if (mode === "edit") {
    try {
      await ctx.editMessageText(text, { reply_markup: kb ?? NO_KEYBOARD });
      return ctx.callbackQuery?.message?.message_id ?? prevPromptId;
    } catch (err) {
      console.error("[wizard] edit pesan gagal, kirim pesan baru", err);
    }
  } else if (prevPromptId !== null && ctx.chat) {
    try {
      await ctx.api.editMessageReplyMarkup(ctx.chat.id, prevPromptId, {
        reply_markup: NO_KEYBOARD,
      });
    } catch {
      // pesan lama sudah tidak ada
    }
  }

  const sent = kb
    ? await ctx.reply(text, { reply_markup: kb })
    : await ctx.reply(text);
  return sent.message_id;
}

async function advance(
  ctx: Context,
  mode: "reply" | "edit",
  flow: Flow,
  fc: FlowCtx,
  data: Data,
  from: number,
  prevPromptId: number | null,
): Promise<void> {
  const index = await nextIndex(flow, fc, data, from);
  const { text, kb } = await render(flow, fc, data, index);
  const promptId = await show(ctx, mode, text, kb, prevPromptId);
  await saveState(fc.db, fc.userId, {
    flow: flow.id,
    step: index,
    data,
    promptId,
  });
}

// ---------- Titik masuk ----------

export async function startFlow(
  ctx: Context,
  env: Env,
  flowId: string,
  initial: Data = {},
): Promise<void> {
  const userId = ctx.from?.id;
  const flow = getFlow(flowId);
  if (userId === undefined || !flow) return;

  await ensureDefaults(env.DB, userId);
  const fc = flowCtx(env, userId);
  const data: Data = { ...initial };

  const first = await nextIndex(flow, fc, data, -1);
  const { text, kb } = await render(flow, fc, data, first);
  const sent = await ctx.reply(text, { reply_markup: kb });
  await saveState(env.DB, userId, {
    flow: flow.id,
    step: first,
    data,
    promptId: sent.message_id,
  });
}

// Jawaban ketikan. Mengembalikan true kalau pesan dipakai oleh wizard
export async function handleFlowText(ctx: Context, env: Env): Promise<boolean> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text?.trim();
  if (userId === undefined || !text) return false;

  const state = await getState(env.DB, userId);
  if (!state) return false;

  const flow = getFlow(state.flow);
  if (!flow) {
    await clearState(env.DB, userId);
    return false;
  }

  if (state.step >= flow.steps.length) {
    await ctx.reply(
      "Tekan salah satu tombol di atas: ✅ Simpan, ⬅️ Kembali, atau ❌ Batal.",
    );
    return true;
  }

  const fc = flowCtx(env, userId);
  const step = flow.steps[state.step];
  const parsed = await step.parse(text, fc, state.data);
  if (!parsed.ok) {
    await ctx.reply(
      `⚠️ ${parsed.error}\nCoba lagi, atau /batal untuk berhenti.`,
    );
    return true;
  }

  state.data[step.key] = parsed.value;
  await advance(ctx, "reply", flow, fc, state.data, state.step, state.promptId);
  return true;
}

// Tombol: w:<flow>:<langkah>:<nilai>
export async function handleFlowCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  const userId = ctx.from?.id;
  const raw = ctx.callbackQuery?.data ?? "";
  const [, flowId = "", stepRaw = "", ...rest] = raw.split(":");
  const value = rest.join(":");
  const stepIndex = Number(stepRaw);

  if (userId === undefined) return ack(ctx);

  const state = await getState(env.DB, userId);
  const flow = getFlow(flowId);
  if (!state || !flow || state.flow !== flowId || state.step !== stepIndex) {
    return ack(ctx, "Sesi ini sudah berakhir. Mulai lagi lewat /menu.");
  }
  await ack(ctx);

  const fc = flowCtx(env, userId);
  const data = state.data;

  if (value === "~cancel") {
    await clearState(env.DB, userId);
    await show(ctx, "edit", "❌ Dibatalkan.", null, state.promptId);
    return;
  }

  if (value === "~back") {
    const prev = await prevIndex(flow, fc, data, stepIndex);
    if (prev === null) return;
    const { text, kb } = await render(flow, fc, data, prev);
    const promptId = await show(ctx, "edit", text, kb, state.promptId);
    await saveState(env.DB, userId, {
      flow: flow.id,
      step: prev,
      data,
      promptId,
    });
    return;
  }

  // Tahap ringkasan
  if (stepIndex >= flow.steps.length) {
    if (value !== "~save") return;

    const claimed = await claimState(env.DB, userId, flow.id, stepIndex);
    if (!claimed) return; // sudah diproses

    let message: string;
    try {
      message = await flow.finish(fc, claimed.data);
    } catch (err) {
      console.error(`[wizard] ${flow.id} gagal disimpan`, err);
      message = "⚠️ Gagal menyimpan. Coba lagi lewat /menu.";
    }
    await show(ctx, "edit", message, undoKeyboard(message), state.promptId);
    return;
  }

  const step = flow.steps[stepIndex];

  if (value === "~skip") {
    if (!step.optional) return;
    data[step.key] = null;
  } else {
    const parsed = await step.parse(value, fc, data);
    if (!parsed.ok) {
      await ctx.reply(`⚠️ ${parsed.error}`);
      return;
    }
    data[step.key] = parsed.value;
  }

  await advance(ctx, "edit", flow, fc, data, stepIndex, state.promptId);
}
