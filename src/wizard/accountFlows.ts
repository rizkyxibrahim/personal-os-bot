import * as acc from "../finance/accounts";
import * as q from "../finance/queries";
import { rupiah } from "../format";
import { ACCOUNT_NAME_RE, BANKS, EWALLETS } from "./presets";
import { amountStep } from "./shared";
import type { Data, Flow } from "./types";

const KINDS = ["bank", "ewallet", "cash", "asset"];
const KIND_LABEL: Record<string, string> = {
  bank: "🏦 Bank",
  ewallet: "📱 E-wallet",
  cash: "💵 Tunai",
  asset: "🏠 Aset",
};

const presets = (d: Data) => (d.kind === "bank" ? BANKS : EWALLETS);

function nameOf(d: Data): string | undefined {
  const preset = d.kind === "bank" || d.kind === "ewallet";
  if (preset && typeof d.provider === "string" && d.provider !== "__other__")
    return d.provider;
  return typeof d.customName === "string" ? d.customName : undefined;
}

export function accountFlow(): Flow {
  return {
    id: "acct",
    title: "🏦 Akun baru",

    steps: [
      {
        key: "kind",
        ask: () => "Jenis akunnya?",
        options: () => [
          { label: "🏦 Bank", value: "bank" },
          { label: "📱 E-wallet", value: "ewallet" },
          { label: "💵 Tunai", value: "cash" },
          { label: "🏠 Aset (emas, dll.)", value: "asset" },
        ],
        parse: (input) => {
          const t = input.trim().toLowerCase();
          return KINDS.includes(t)
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih salah satu jenis akun." };
        },
      },
      {
        key: "provider",
        when: (_fc, d) => d.kind === "bank" || d.kind === "ewallet",
        ask: (_fc, d) => (d.kind === "bank" ? "Bank mana?" : "E-wallet mana?"),
        options: (_fc, d) => [
          ...presets(d).map((name, i) => ({ label: name, value: `p${i}` })),
          { label: "✏️ Lainnya", value: "other" },
        ],
        parse: async (input, fc, d) => {
          const t = input.trim();
          if (t === "other") return { ok: true, value: "__other__" };

          const m = t.match(/^p(\d+)$/);
          const name = m ? presets(d)[Number(m[1])] : t;
          if (!name || !ACCOUNT_NAME_RE.test(name)) {
            return {
              ok: false,
              error:
                "Pilih dari tombol, atau ketik nama satu kata (maksimal 20 karakter).",
            };
          }
          if (await acc.isNameTaken(fc.db, fc.userId, name)) {
            return {
              ok: false,
              error: `Akun ${name} sudah ada. Pilih Lainnya untuk nama lain (mis. ${name}-Tabungan).`,
            };
          }
          return { ok: true, value: name };
        },
      },
      {
        key: "customName",
        when: (_fc, d) =>
          d.kind === "cash" || d.kind === "asset" || d.provider === "__other__",
        ask: (_fc, d) =>
          d.kind === "cash"
            ? "Nama akunnya? (mis. Dompet)"
            : "Nama akunnya, satu kata (mis. Jenius, Emas)",
        parse: async (input, fc) => {
          const t = input.trim();
          if (!ACCOUNT_NAME_RE.test(t)) {
            return {
              ok: false,
              error:
                "Satu kata saja (huruf, angka, - atau _), maksimal 20 karakter.",
            };
          }
          if (await acc.isNameTaken(fc.db, fc.userId, t))
            return { ok: false, error: `Akun ${t} sudah ada.` };
          return { ok: true, value: t };
        },
      },
      amountStep("balance", "Saldo awalnya berapa? (opsional)", {
        optional: true,
        allowZero: true,
      }),
    ],

    summary: (_fc, d) =>
      [
        `${KIND_LABEL[d.kind as string]} ${nameOf(d) ?? "-"}`,
        `💰 Saldo awal ${rupiah((d.balance as number | null) ?? 0)}`,
      ].join("\n"),

    finish: async (fc, d) => {
      const name = nameOf(d);
      if (!name) return "⚠️ Nama akun kosong. Ulangi dengan /addaccount.";

      const balance = (d.balance as number | null) ?? 0;
      const ok = await q.addAccount(
        fc.db,
        fc.userId,
        name,
        d.kind as q.AccountType,
        balance,
      );
      return ok
        ? `✅ Akun ${name} dibuat dengan saldo awal ${rupiah(balance)}.\nLihat semua: /saldo atau /akun`
        : `⚠️ Akun ${name} sudah ada.`;
    },
  };
}

export function accountRenameFlow(): Flow {
  return {
    id: "acctrename",
    title: "✏️ Ganti nama akun",

    steps: [
      {
        key: "name",
        ask: async (fc, d) => {
          const a = await acc.getAccountInfo(
            fc.db,
            fc.userId,
            d.accountId as number,
          );
          return `Nama baru untuk ${a?.name ?? "akun ini"}? (satu kata, maksimal 20 karakter)`;
        },
        parse: async (input, fc, d) => {
          const t = input.trim();
          if (!ACCOUNT_NAME_RE.test(t)) {
            return {
              ok: false,
              error:
                "Satu kata saja (huruf, angka, - atau _), maksimal 20 karakter.",
            };
          }
          if (
            await acc.isNameTaken(fc.db, fc.userId, t, d.accountId as number)
          ) {
            return { ok: false, error: `Nama ${t} sudah dipakai akun lain.` };
          }
          return { ok: true, value: t };
        },
      },
    ],

    summary: async (fc, d) => {
      const a = await acc.getAccountInfo(
        fc.db,
        fc.userId,
        d.accountId as number,
      );
      return `${a?.name ?? "-"} → ${d.name as string}`;
    },

    finish: async (fc, d) => {
      await acc.renameAccount(
        fc.db,
        fc.userId,
        d.accountId as number,
        d.name as string,
      );
      return `✅ Nama akun diubah menjadi ${d.name as string}.`;
    },
  };
}

export function accountInitFlow(): Flow {
  const base = amountStep("amount", "Saldo awal baru?", { allowZero: true });

  return {
    id: "acctinit",
    title: "💰 Ubah saldo awal",

    steps: [
      {
        ...base,
        ask: async (fc, d) => {
          const a = await acc.getAccountInfo(
            fc.db,
            fc.userId,
            d.accountId as number,
          );
          return `Akun ${a?.name ?? "-"}: saldo awal sekarang ${rupiah(a?.initial_balance ?? 0)}.\n\n${await (base.ask as (fc: unknown, d: unknown) => string)(fc, d)}`;
        },
      },
    ],

    summary: async (fc, d) => {
      const a = await acc.getAccountInfo(
        fc.db,
        fc.userId,
        d.accountId as number,
      );
      if (!a) return "Akun tidak ditemukan.";
      const next = d.amount as number;
      return [
        `${a.name}: saldo awal ${rupiah(a.initial_balance)} → ${rupiah(next)}`,
        `Saldo sekarang berubah dari ${rupiah(a.balance)} menjadi ${rupiah(a.balance + (next - a.initial_balance))}`,
        "(Tidak masuk rekap. Ini mengubah titik awal, bukan transaksi.)",
      ].join("\n");
    },

    finish: async (fc, d) => {
      const id = d.accountId as number;
      await q.setInitialBalance(fc.db, fc.userId, id, d.amount as number);
      const a = await acc.getAccountInfo(fc.db, fc.userId, id);
      return `✅ Saldo awal diubah. Saldo ${a?.name ?? "akun"} sekarang ${rupiah(a?.balance ?? 0)}.`;
    },
  };
}
