import * as q from "../finance/queries";
import { rupiah } from "../format";
import { makeTransfer } from "../services/transfer";
import { amountStep } from "./shared";
import type { Data, Flow, FlowCtx } from "./types";

interface Ref {
  id: number;
  name: string;
}

const KIND_LABEL: Record<string, string> = {
  cash: "💵 Tarik tunai",
  topup: "📱 Isi e-wallet",
  other: "↔️ Pindah antar akun",
};

// Pilihan akun untuk peran "dari" atau "ke", disaring menurut jenis transfer
async function candidates(
  fc: FlowCtx,
  d: Data,
  role: "from" | "to",
): Promise<q.AccountBalance[]> {
  const all = await q.listAccounts(fc.db, fc.userId);
  const from = d.from as Ref | undefined;
  const notFrom = (a: q.AccountBalance) => role === "from" || a.id !== from?.id;

  let list = all.filter(notFrom);
  if (role === "from") {
    if (d.kind === "cash") list = list.filter((a) => a.type !== "cash");
    else if (d.kind === "topup") list = list.filter((a) => a.type === "bank");
  } else if (d.kind === "cash") {
    list = list.filter((a) => a.type === "cash");
  } else if (d.kind === "topup") {
    list = list.filter((a) => a.type === "ewallet");
  }

  // Kalau penyaringan mengosongkan pilihan, tampilkan semua supaya tidak buntu
  return list.length > 0 ? list : all.filter(notFrom);
}

async function parseAccount(
  input: string,
  fc: FlowCtx,
  d: Data,
  role: "from" | "to",
) {
  const list = await candidates(fc, d, role);
  const m = input.match(/^a(\d+)$/);
  const found = m
    ? list.find((a) => a.id === Number(m[1]))
    : list.find((a) => a.name.toLowerCase() === input.trim().toLowerCase());
  return found
    ? { ok: true as const, value: { id: found.id, name: found.name } }
    : {
        ok: false as const,
        error: `Akun "${input}" tidak ada di pilihan. Pilih dari tombol.`,
      };
}

async function destination(fc: FlowCtx, d: Data): Promise<Ref | null> {
  const list = await candidates(fc, d, "to");
  const chosen = d.to as Ref | undefined;
  const found = chosen && list.find((a) => a.id === chosen.id);
  const pick = found ?? list[0];
  return pick ? { id: pick.id, name: pick.name } : null;
}

export function transferFlow(): Flow {
  return {
    id: "transfer",
    title: "🔁 Transfer",

    steps: [
      {
        key: "kind",
        when: (_fc, d) => d.kind === undefined, // dilewati kalau sudah ditentukan (mis. /tarik)
        ask: () => "Mau ngapain?",
        options: () => [
          { label: "💵 Tarik tunai", value: "cash" },
          { label: "📱 Isi e-wallet", value: "topup" },
          { label: "↔️ Antar akun", value: "other" },
        ],
        parse: (input) => {
          const t = input.trim();
          return ["cash", "topup", "other"].includes(t)
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih salah satu." };
        },
      },
      {
        key: "from",
        ask: (_fc, d) =>
          d.kind === "cash"
            ? "Ditarik dari rekening mana?"
            : d.kind === "topup"
              ? "Diisi dari rekening mana?"
              : "Dari akun mana?",
        options: async (fc, d) =>
          (await candidates(fc, d, "from")).map((a) => ({
            label: `${a.name} · ${rupiah(a.balance)}`,
            value: `a${a.id}`,
          })),
        parse: (input, fc, d) => parseAccount(input, fc, d, "from"),
      },
      {
        key: "to",
        when: async (fc, d) => (await candidates(fc, d, "to")).length > 1, // satu pilihan saja = otomatis
        ask: (_fc, d) =>
          d.kind === "cash"
            ? "Tunainya masuk ke akun mana?"
            : d.kind === "topup"
              ? "E-wallet mana yang diisi?"
              : "Ke akun mana?",
        options: async (fc, d) =>
          (await candidates(fc, d, "to")).map((a) => ({
            label: `${a.name} · ${rupiah(a.balance)}`,
            value: `a${a.id}`,
          })),
        parse: (input, fc, d) => parseAccount(input, fc, d, "to"),
      },
      amountStep("amount", "Berapa nominalnya?"),
      amountStep("fee", "Ada biaya admin? (opsional, mis. 6500)", {
        optional: true,
        allowZero: true,
      }),
    ],

    summary: async (fc, d) => {
      const to = await destination(fc, d);
      const from = d.from as Ref;
      const fee = (d.fee as number | null) ?? 0;
      const lines = [
        `${KIND_LABEL[(d.kind as string) ?? "other"]} ${rupiah(d.amount as number)}`,
        `${from.name} → ${to?.name ?? "-"}`,
      ];
      if (fee > 0)
        lines.push(
          `🏷️ Biaya admin ${rupiah(fee)} (dicatat sebagai pengeluaran)`,
        );
      return lines.join("\n");
    },

    finish: async (fc, d) => {
      const to = await destination(fc, d);
      const from = d.from as Ref;
      if (!to) return "⚠️ Akun tujuan tidak ditemukan. Cek /akun.";
      if (to.id === from.id) return "⚠️ Akun asal dan tujuan tidak boleh sama.";
      return makeTransfer(
        fc.db,
        fc.userId,
        from,
        to,
        d.amount as number,
        null,
        (d.fee as number | null) ?? 0,
      );
    },
  };
}
