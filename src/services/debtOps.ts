import { formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as debts from "../finance/debts";
import * as q from "../finance/queries";

interface AccountRef {
  id: number;
  name: string;
}

// account = null berarti catatan lama: tidak ada pergerakan kas
export async function saveDebt(
  db: D1Database,
  userId: number,
  p: {
    direction: debts.Direction;
    counterparty: string;
    principal: number;
    note: string | null;
    dueDate: string | null;
    account: AccountRef | null;
  },
): Promise<string> {
  const id = await debts.addDebt(db, userId, {
    direction: p.direction,
    counterparty: p.counterparty,
    principal: p.principal,
    note: p.note,
    dueDate: p.dueDate,
  });
  const payable = p.direction === "payable";

  const lines = [
    `${payable ? "🔻 Hutang" : "🔺 Piutang"} tercatat (D${id})`,
    `👤 ${p.counterparty} · ${rupiah(p.principal)}`,
  ];
  if (p.dueDate) lines.push(`📅 tempo ${formatDate(p.dueDate)}`);
  if (p.note) lines.push(`📝 ${p.note}`);

  if (p.account) {
    const accountId = p.account.id;
    await q.addTransaction(db, {
      userId,
      type: payable ? "in" : "out",
      amount: p.principal,
      accountId,
      toAccountId: null,
      categoryId: null,
      note: payable
        ? `Hutang dari ${p.counterparty}`
        : `Piutang ke ${p.counterparty}`,
      txDate: todayJakarta(),
      debtId: id,
    });
    const balance =
      (await q.listAccounts(db, userId)).find((a) => a.id === accountId)
        ?.balance ?? 0;
    lines.push(`🏦 ${p.account.name} → saldo ${rupiah(balance)}`);
  } else {
    lines.push("ℹ️ Catatan awal: tidak ada pergerakan kas.");
  }

  lines.push(
    payable
      ? `Bayar dengan /bayar D${id} jumlah`
      : `Terima dengan /terima D${id} jumlah`,
  );
  return lines.join("\n");
}

// Pembayaran hutang (uang keluar) atau penerimaan piutang (uang masuk)
export async function payDebt(
  db: D1Database,
  userId: number,
  debt: debts.Debt,
  amount: number,
  account: AccountRef,
): Promise<string> {
  const payable = debt.direction === "payable";
  const today = todayJakarta();

  const txId = await q.addTransaction(db, {
    userId,
    type: payable ? "out" : "in",
    amount,
    accountId: account.id,
    toAccountId: null,
    categoryId: null,
    note: payable
      ? `Bayar hutang ke ${debt.counterparty}`
      : `Terima piutang dari ${debt.counterparty}`,
    txDate: today,
    debtId: debt.id,
  });

  const balance =
    (await q.listAccounts(db, userId)).find((a) => a.id === account.id)
      ?.balance ?? 0;
  const left = debt.principal - debt.paid - amount;

  return [
    `✅ ${payable ? "Pembayaran hutang" : "Penerimaan piutang"} ${debt.counterparty}: ${rupiah(amount)} (#${txId})`,
    `📅 ${formatDate(today)}`,
    `🏦 ${account.name} → saldo ${rupiah(balance)}`,
    left > 0 ? `Sisa: ${rupiah(left)}` : "🎉 Lunas!",
  ].join("\n");
}
