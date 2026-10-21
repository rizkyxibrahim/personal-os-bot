import { formatDate, formatMonth, prevMonth } from "../dates";
import { rupiah } from "../format";
import * as rep from "../finance/reports";
import { txLine } from "../handlers/finance";

function delta(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "sama" : "bulan sebelumnya kosong";
  const diff = cur - prev;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${rupiah(diff)} (${sign}${Math.round((diff / prev) * 100)}%)`;
}

export async function buildRekap(
  db: D1Database,
  userId: number,
  month: string,
): Promise<string> {
  const prev = prevMonth(month);

  const [s, p, byCat, top] = await Promise.all([
    rep.monthSummary(db, userId, month),
    rep.monthSummary(db, userId, prev),
    rep.expenseByCategory(db, userId, month),
    rep.topExpenses(db, userId, month, 5),
  ]);

  if (s.n === 0)
    return `📊 Rekap ${formatMonth(month)}\n\nBelum ada transaksi.`;

  const net = s.income - s.expense;
  const lines = [
    `📊 Rekap ${formatMonth(month)}`,
    "",
    `📈 Pemasukan: ${rupiah(s.income)}`,
    `📉 Pengeluaran: ${rupiah(s.expense)}`,
    `💵 Net: ${rupiah(net)}`,
  ];
  if (s.income > 0)
    lines.push(
      `🏦 Sisa dari pemasukan: ${Math.round((net * 100) / s.income)}%`,
    );

  if (byCat.length > 0) {
    lines.push("", "📂 Pengeluaran per kategori");
    for (const c of byCat.slice(0, 8)) {
      lines.push(
        `${c.name}: ${rupiah(c.total)} (${Math.round((c.total * 100) / s.expense)}%)`,
      );
    }
    if (byCat.length > 8) {
      const rest = byCat.slice(8).reduce((sum, c) => sum + c.total, 0);
      lines.push(`Lainnya (${byCat.length - 8} kategori): ${rupiah(rest)}`);
    }
  }

  if (top.length > 0) {
    lines.push("", "🔝 Pengeluaran terbesar");
    lines.push(...top.map((t) => `${txLine(t)} · ${formatDate(t.tx_date)}`));
  }

  lines.push("", `📆 Dibanding ${formatMonth(prev)}`);
  if (p.n === 0) {
    lines.push("Belum ada data bulan sebelumnya.");
  } else {
    lines.push(
      `Pemasukan: ${delta(s.income, p.income)}`,
      `Pengeluaran: ${delta(s.expense, p.expense)}`,
    );
  }

  return lines.join("\n");
}
