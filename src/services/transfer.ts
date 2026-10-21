import { formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as q from "../finance/queries";

interface Ref {
  id: number;
  name: string;
}

// Pindah dana dari -> ke. Biaya admin (opsional) dicatat sebagai pengeluaran terpisah dari akun asal
export async function makeTransfer(
  db: D1Database,
  userId: number,
  from: Ref,
  to: Ref,
  amount: number,
  note: string | null,
  fee = 0,
): Promise<string> {
  const today = todayJakarta();
  const id = await q.addTransaction(db, {
    userId,
    type: "transfer",
    amount,
    accountId: from.id,
    toAccountId: to.id,
    categoryId: null,
    note,
    txDate: today,
  });

  let feeLine: string | null = null;
  if (fee > 0) {
    await q.addCategory(db, userId, {
      name: "Biaya admin",
      type: "expense",
      budgetType: "wants",
      icon: "🏷️",
    });
    const cat = await q.findCategory(db, userId, "Biaya admin", "expense");
    await q.addTransaction(db, {
      userId,
      type: "out",
      amount: fee,
      accountId: from.id,
      toAccountId: null,
      categoryId: cat?.id ?? null,
      note: `Biaya admin ${from.name} → ${to.name}`,
      txDate: today,
    });
    feeLine = `🏷️ Biaya admin ${rupiah(fee)} dicatat sebagai pengeluaran terpisah`;
  }

  const balances = await q.listAccounts(db, userId);
  const bal = (r: Ref) =>
    rupiah(balances.find((a) => a.id === r.id)?.balance ?? 0);

  return [
    `🔁 Transfer tersimpan (#${id})`,
    `${rupiah(amount)}: ${from.name} → ${to.name}`,
    `📅 ${formatDate(today)}`,
    ...(feeLine ? [feeLine] : []),
    `🏦 ${from.name}: ${bal(from)}`,
    `🏦 ${to.name}: ${bal(to)}`,
  ].join("\n");
}
