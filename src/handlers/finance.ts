import type { Bot, CommandContext, Context } from "grammy";
import type { Env } from "../env";
import { formatDate, formatDayLong, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import { resolveCategory } from "../finance/categorize";
import { parseEntry, parseEntryDate, type Entry } from "../finance/entry";
import * as q from "../finance/queries";
import { budgetAlert } from "../finance/budget";

const ACCOUNT_TYPES: q.AccountType[] = ["cash", "bank", "ewallet", "asset"];
const BUDGET_TYPES: q.BudgetType[] = ["needs", "wants", "savings"];
const ICON_ACCOUNT = {
  cash: "💵",
  bank: "🏦",
  ewallet: "📱",
  asset: "🏠",
} as const;
const BUDGET_LABEL = {
  needs: "Needs",
  wants: "Wants",
  savings: "Savings",
} as const;
const NAME_RE = /^[\p{L}\p{N}_-]{1,20}$/u;

const isCatType = (s: string | undefined): s is q.CategoryType =>
  s === "income" || s === "expense";

const USAGE_ENTRY = [
  "Format: out 25k makan siang",
  "Lengkap: [tanggal] out|in nominal [kategori] [keterangan] [Akun]",
  "Contoh: 05/10 in 5jt gaji [BCA]",
  "Bantuan: /help transaksi",
].join("\n");
const USAGE_ACCOUNT =
  "Format: /addaccount Nama [tipe] [saldo_awal]\nTipe: cash, bank, ewallet, asset\nContoh: /addaccount BCA bank 2jt";
const USAGE_CATEGORY =
  "Format: /addcategory Nama income|expense [needs|wants|savings]\nContoh: /addcategory Seblak expense wants";
const USAGE_EDIT =
  "Format: /edit ID field nilai\nField: amount, category, note, date, account\nContoh: /edit 12 amount 30k";

function parseId(raw: string): number | null {
  const n = parseInt(raw.replace(/^#/, ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function txLine(r: q.TxRow): string {
  const icon = r.type === "in" ? "📈" : r.type === "out" ? "📉" : "🔁";
  const account =
    r.type === "transfer"
      ? `${r.account_name} → ${r.to_account_name}`
      : r.account_name;
  const parts = [`#${r.id} ${icon} ${rupiah(r.amount)}`];
  if (r.category_name) parts.push(r.category_name);
  if (r.note) parts.push(r.note);
  parts.push(account);
  return parts.join(" · ");
}
export type Resolution =
  | { ok: true; account: q.Account; category: q.Category | null; auto: boolean }
  | { ok: false; error: string };

// Cari akun dan kategori untuk sebuah entri
export async function resolveEntry(
  db: D1Database,
  userId: number,
  entry: Entry,
): Promise<Resolution> {
  const account = entry.account
    ? await q.findAccount(db, userId, entry.account)
    : await q.getDefaultAccount(db, userId);
  if (!account) {
    return {
      ok: false,
      error: `⚠️ Akun "${entry.account}" tidak ditemukan.\nLihat /saldo atau tambah: /addaccount ${entry.account} bank`,
    };
  }

  const catType: q.CategoryType = entry.type === "in" ? "income" : "expense";
  const categories = (await q.listCategories(db, userId)).filter(
    (c) => c.type === catType,
  );
  const resolved = resolveCategory({
    words: entry.words,
    hashCategory: entry.hashCategory,
    categories,
    type: catType,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      error: `⚠️ Kategori "${resolved.unknown}" belum ada.\nTambah dulu: /addcategory ${resolved.unknown} ${catType}\nAtau lihat daftar: /kategori`,
    };
  }

  return {
    ok: true,
    account,
    category: resolved.category,
    auto: resolved.auto,
  };
}

export interface SaveParams {
  userId: number;
  type: "in" | "out";
  amount: number;
  date: string;
  account: { id: number; name: string };
  category: { id: number; name: string } | null;
  note: string | null;
  autoCategory: boolean;
  subscriptionId?: number | null;
}

// Simpan transaksi dan kembalikan teks konfirmasi (dipakai entri cepat, /qr, dan /bayarsub)
export async function saveEntry(
  db: D1Database,
  p: SaveParams,
): Promise<string> {
  const id = await q.addTransaction(db, {
    userId: p.userId,
    type: p.type,
    amount: p.amount,
    accountId: p.account.id,
    toAccountId: null,
    categoryId: p.category?.id ?? null,
    note: p.note,
    txDate: p.date,
    subscriptionId: p.subscriptionId ?? null,
  });

  const balance =
    (await q.listAccounts(db, p.userId)).find((a) => a.id === p.account.id)
      ?.balance ?? 0;

  const lines = [
    `✅ ${p.type === "in" ? "Pemasukan" : "Pengeluaran"} tersimpan (#${id})`,
    `📅 ${formatDate(p.date)}`,
    `${p.type === "in" ? "📈" : "📉"} ${rupiah(p.amount)}`,
    `📂 ${p.category?.name ?? "-"}`,
  ];
  if (p.note) lines.push(`📝 ${p.note}`);
  lines.push(`🏦 ${p.account.name} → saldo ${rupiah(balance)}`);
  if (p.autoCategory && p.note)
    lines.push(
      "",
      `💡 Kategori dipilih otomatis. Ubah: /edit ${id} category NamaKategori`,
    );

  const alert =
    p.type === "out"
      ? await budgetAlert(db, p.userId, p.category?.id ?? null, p.date)
      : null;
  if (alert) lines.push("", alert);

  return lines.join("\n");
}

// Dipanggil dari perintah (/out ...) maupun pesan biasa (out 25k ...)
// Mengembalikan true kalau pesan dikenali sebagai transaksi
export async function handleQuickEntry(
  ctx: Context,
  env: Env,
  textOverride?: string,
): Promise<boolean> {
  const userId = ctx.from?.id;
  const text = textOverride ?? ctx.message?.text;
  if (userId === undefined || !text) return false;

  const parsed = parseEntry(text, todayJakarta());
  if (parsed.kind === "none") return false;
  if (parsed.kind === "error") {
    await ctx.reply(`⚠️ ${parsed.message}`);
    return true;
  }

  const { entry } = parsed;
  await q.ensureDefaults(env.DB, userId);

  const target = await resolveEntry(env.DB, userId, entry);
  if (!target.ok) {
    await ctx.reply(target.error);
    return true;
  }

  const note = entry.words.join(" ") || null;
  if (note && note.length > 200) {
    await ctx.reply("⚠️ Keterangan terlalu panjang (maksimal 200 karakter).");
    return true;
  }

  await ctx.reply(
    await saveEntry(env.DB, {
      userId,
      type: entry.type,
      amount: entry.amount,
      date: entry.date,
      account: target.account,
      category: target.category,
      note,
      autoCategory: target.auto,
    }),
  );
  return true;
}

export function registerFinance(bot: Bot, env: Env): void {
  const db = env.DB;

  type Handler = (
    ctx: CommandContext<Context>,
    userId: number,
  ) => Promise<unknown>;
  const on = (names: string | string[], handler: Handler) =>
    bot.command(names, async (ctx) => {
      const userId = ctx.from?.id;
      if (userId === undefined) return;
      await q.ensureDefaults(db, userId);
      await handler(ctx, userId);
    });

  // ---- /in dan /out (dengan awalan "/") ----
  const entryCommand = (names: string[], prefix: "in" | "out") =>
    bot.command(names, async (ctx) => {
      const handled = await handleQuickEntry(
        ctx,
        env,
        `${prefix} ${ctx.match}`,
      );
      if (!handled) await ctx.reply(USAGE_ENTRY);
    });
  entryCommand(["in", "income", "masuk"], "in");
  entryCommand(["out", "expense", "keluar"], "out");

  // ---- Saldo & akun ----
  on(["saldo", "balance", "accounts", "akun"], async (ctx, userId) => {
    const accounts = await q.listAccounts(db, userId);
    const sum = (list: q.AccountBalance[]) =>
      list.reduce((s, a) => s + a.balance, 0);
    const liquid = accounts.filter((a) => a.type !== "asset");
    const assets = accounts.filter((a) => a.type === "asset");

    const lines = [
      "💰 Saldo akun",
      "",
      ...accounts.map(
        (a) => `${ICON_ACCOUNT[a.type]} ${a.name}: ${rupiah(a.balance)}`,
      ),
      "",
      `Total kas & bank: ${rupiah(sum(liquid))}`,
    ];
    if (assets.length > 0) lines.push(`Total aset: ${rupiah(sum(assets))}`);
    return ctx.reply(lines.join("\n"));
  });

  on("addaccount", async (ctx, userId) => {
    const [name, ...rest] = ctx.match.trim().split(/\s+/).filter(Boolean);
    if (!name || !NAME_RE.test(name)) return ctx.reply(USAGE_ACCOUNT);

    let type: q.AccountType = "bank";
    let balance = 0;
    for (const tok of rest) {
      const lower = tok.toLowerCase();
      if ((ACCOUNT_TYPES as string[]).includes(lower)) {
        type = lower as q.AccountType;
      } else {
        const n = lower === "0" ? 0 : parseAmount(lower);
        if (n === null) return ctx.reply(USAGE_ACCOUNT);
        balance = n;
      }
    }

    const created = await q.addAccount(db, userId, name, type, balance);
    return ctx.reply(
      created
        ? `✅ Akun ${name} (${type}) dibuat dengan saldo awal ${rupiah(balance)}.`
        : `Akun ${name} sudah ada. Ubah saldo awal dengan /setsaldoawal ${name} nominal`,
    );
  });

  on("setsaldoawal", async (ctx, userId) => {
    const [name = "", amountRaw = ""] = ctx.match.trim().split(/\s+/);
    const amount = amountRaw === "0" ? 0 : parseAmount(amountRaw);
    if (!name || amount === null)
      return ctx.reply(
        "Format: /setsaldoawal Akun Nominal\nContoh: /setsaldoawal Cash 150k",
      );

    const account = await q.findAccount(db, userId, name);
    if (!account)
      return ctx.reply(`Akun "${name}" tidak ditemukan. Lihat /saldo.`);

    await q.setInitialBalance(db, userId, account.id, amount);
    return ctx.reply(
      `✅ Saldo awal ${account.name} diatur ke ${rupiah(amount)}.`,
    );
  });

  on("transfer", async (ctx, userId) => {
    const [amountRaw = "", fromName = "", toName = "", ...noteWords] = ctx.match
      .trim()
      .split(/\s+/);
    const amount = parseAmount(amountRaw);
    if (amount === null || !fromName || !toName) {
      return ctx.reply(
        "Format: /transfer Nominal Dari Ke [catatan]\nContoh: /transfer 500k BCA Cash",
      );
    }

    const [from, to] = await Promise.all([
      q.findAccount(db, userId, fromName),
      q.findAccount(db, userId, toName),
    ]);
    if (!from)
      return ctx.reply(`Akun "${fromName}" tidak ditemukan. Lihat /saldo.`);
    if (!to)
      return ctx.reply(`Akun "${toName}" tidak ditemukan. Lihat /saldo.`);
    if (from.id === to.id)
      return ctx.reply("Akun asal dan tujuan tidak boleh sama.");

    const id = await q.addTransaction(db, {
      userId,
      type: "transfer",
      amount,
      accountId: from.id,
      toAccountId: to.id,
      categoryId: null,
      note: noteWords.join(" ") || null,
      txDate: todayJakarta(),
    });
    return ctx.reply(
      `🔁 Transfer tersimpan (#${id})\n${rupiah(amount)}: ${from.name} → ${to.name}\nCek hasilnya dengan /saldo`,
    );
  });

  // ---- Kategori ----
  on(["kategori", "categories"], async (ctx, userId) => {
    const cats = await q.listCategories(db, userId);
    const fmt = (c: q.Category) =>
      `${c.icon ?? "•"} ${c.name}${c.budget_type ? ` (${BUDGET_LABEL[c.budget_type]})` : ""}`;

    const lines = [
      "🗂️ Kategori",
      "",
      "📉 Pengeluaran",
      ...cats.filter((c) => c.type === "expense").map(fmt),
      "",
      "📈 Pemasukan",
      ...cats.filter((c) => c.type === "income").map(fmt),
      "",
      "Tambah: /addcategory Nama income|expense [needs|wants|savings]",
    ];
    return ctx.reply(lines.join("\n"));
  });

  on("addcategory", async (ctx, userId) => {
    const [name, typeRaw, budgetRaw] = ctx.match
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const type = typeRaw?.toLowerCase();
    if (!name || !NAME_RE.test(name) || !isCatType(type))
      return ctx.reply(USAGE_CATEGORY);

    let budgetType: q.BudgetType | null = null;
    if (budgetRaw !== undefined) {
      const b = budgetRaw.toLowerCase();
      if (type !== "expense" || !(BUDGET_TYPES as string[]).includes(b))
        return ctx.reply(USAGE_CATEGORY);
      budgetType = b as q.BudgetType;
    }

    const created = await q.addCategory(db, userId, { name, type, budgetType });
    return ctx.reply(
      created
        ? `✅ Kategori ${name} (${type}) ditambahkan.`
        : `Kategori ${name} sudah ada. Lihat /kategori`,
    );
  });

  // ---- Riwayat ----
  on(["details", "detail", "hariini"], async (ctx, userId) => {
    const today = todayJakarta();
    const arg = ctx.match.trim();
    const date = arg ? parseEntryDate(arg, today) : today;
    if (!date)
      return ctx.reply(
        "Tanggal tidak valid. Contoh: /details 05/10 atau /details kemarin",
      );

    const rows = await q.listByDate(db, userId, date);
    if (rows.length === 0)
      return ctx.reply(`📅 ${formatDayLong(date)}\n\nBelum ada transaksi.`);

    const sum = (t: q.TxType) =>
      rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
    const income = sum("in");
    const expense = sum("out");

    return ctx.reply(
      [
        `📅 ${formatDayLong(date)}`,
        "",
        ...rows.map(txLine),
        "",
        `Masuk: ${rupiah(income)}`,
        `Keluar: ${rupiah(expense)}`,
        `Net: ${rupiah(income - expense)}`,
      ].join("\n"),
    );
  });

  // ---- Koreksi ----
  on("edit", async (ctx, userId) => {
    const [idRaw = "", field = "", ...valueWords] = ctx.match
      .trim()
      .split(/\s+/);
    const id = parseId(idRaw);
    const value = valueWords.join(" ").trim();
    if (id === null || !field || !value) return ctx.reply(USAGE_EDIT);

    const tx = await q.getTransaction(db, userId, id);
    if (!tx) return ctx.reply(`Transaksi #${id} tidak ditemukan.`);
    if (tx.deleted_at)
      return ctx.reply(
        `Transaksi #${id} ada di recycle bin. Pulihkan dulu: /restore ${id}`,
      );

    const patch: q.TxPatch = {};

    switch (field.toLowerCase()) {
      case "amount":
      case "nominal": {
        const amount = parseAmount(value);
        if (amount === null)
          return ctx.reply("Nominal tidak valid. Contoh: /edit 12 amount 30k");
        patch.amount = amount;
        break;
      }
      case "category":
      case "kategori": {
        if (tx.type === "transfer")
          return ctx.reply("Transfer tidak punya kategori.");
        const cat = await q.findCategory(
          db,
          userId,
          value,
          tx.type === "in" ? "income" : "expense",
        );
        if (!cat)
          return ctx.reply(
            `Kategori "${value}" tidak ada untuk tipe ini. Lihat /kategori`,
          );
        patch.categoryId = cat.id;
        break;
      }
      case "note":
      case "description":
      case "keterangan":
      case "ket": {
        if (value.length > 200)
          return ctx.reply(
            "Keterangan terlalu panjang (maksimal 200 karakter).",
          );
        patch.note = value;
        break;
      }
      case "date":
      case "tanggal": {
        const today = todayJakarta();
        const date = parseEntryDate(value, today);
        if (!date)
          return ctx.reply("Tanggal tidak valid. Contoh: /edit 12 date 05/10");
        if (date > today)
          return ctx.reply("Tanggal tidak boleh di masa depan.");
        patch.txDate = date;
        break;
      }
      case "account":
      case "akun": {
        if (tx.type === "transfer")
          return ctx.reply(
            "Untuk transfer, hapus lalu buat ulang dengan /transfer.",
          );
        const account = await q.findAccount(db, userId, value);
        if (!account)
          return ctx.reply(`Akun "${value}" tidak ditemukan. Lihat /saldo.`);
        patch.accountId = account.id;
        break;
      }
      default:
        return ctx.reply(USAGE_EDIT);
    }

    const ok = await q.updateTransaction(db, userId, id, patch);
    return ctx.reply(
      ok
        ? `✏️ Transaksi #${id} diperbarui. Cek dengan /details`
        : `Transaksi #${id} tidak berubah.`,
    );
  });

  on(["hapus", "del"], async (ctx, userId) => {
    const id = parseId(ctx.match.trim());
    if (id === null) return ctx.reply("Format: /hapus ID\nContoh: /hapus 12");

    const ok = await q.softDelete(db, userId, id);
    return ctx.reply(
      ok
        ? `🗑️ Transaksi #${id} dipindah ke recycle bin. Saldo sudah disesuaikan.\nPulihkan dengan /restore ${id}`
        : `Transaksi aktif #${id} tidak ditemukan.`,
    );
  });

  on("restore", async (ctx, userId) => {
    const id = parseId(ctx.match.trim());
    if (id === null)
      return ctx.reply("Format: /restore ID\nLihat daftar: /recyclebin");

    const ok = await q.restore(db, userId, id);
    return ctx.reply(
      ok
        ? `♻️ Transaksi #${id} dipulihkan. Saldo sudah disesuaikan.`
        : `Transaksi #${id} tidak ada di recycle bin.`,
    );
  });

  on("recyclebin", async (ctx, userId) => {
    const rows = await q.listDeleted(db, userId);
    if (rows.length === 0) return ctx.reply("🗑️ Recycle bin kosong.");

    return ctx.reply(
      [
        "🗑️ Recycle bin (10 terakhir)",
        "",
        ...rows.map((r) => `${txLine(r)} · ${formatDate(r.tx_date)}`),
        "",
        "Pulihkan: /restore ID",
      ].join("\n"),
    );
  });
}
