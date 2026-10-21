import { rupiah } from "../format";

export interface HealthInput {
  income: number; // pemasukan bulan ini
  expense: number; // pengeluaran bulan ini
  budgetsTotal: number;
  budgetsWithin: number; // budget yang belum terlampaui
  liquid: number; // kas & bank
  avgMonthlyExpense: number;
  debt: number; // sisa hutang
}

export interface HealthComponent {
  key: "savings" | "budget" | "emergency" | "debt";
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface Health {
  score: number;
  grade: string;
  components: HealthComponent[];
  tip: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const dec1 = (x: number) => x.toFixed(1).replace(".", ",");

const TIPS: Record<HealthComponent["key"], string> = {
  savings: "Sisihkan lebih banyak dari pemasukan. Targetnya minimal 20%.",
  budget: "Ada budget yang terlampaui. Cek /cekbudget.",
  emergency: "Perbesar dana darurat sampai sekitar 6 bulan pengeluaran.",
  debt: "Utamakan melunasi hutang. Cek /cekhutang.",
};

export function gradeOf(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

// Mengembalikan null kalau datanya belum cukup (hanya komponen hutang yang bisa dinilai)
export function computeHealth(i: HealthInput): Health | null {
  const components: HealthComponent[] = [];

  if (i.income > 0) {
    const rate = (i.income - i.expense) / i.income;
    components.push({
      key: "savings",
      label: "Tabungan",
      max: 35,
      points: Math.round(35 * clamp01(rate / 0.2)),
      detail: `sisa ${Math.round(rate * 100)}% dari pemasukan (target ≥20%)`,
    });
  }

  if (i.budgetsTotal > 0) {
    components.push({
      key: "budget",
      label: "Budget",
      max: 25,
      points: Math.round(25 * (i.budgetsWithin / i.budgetsTotal)),
      detail: `${i.budgetsWithin} dari ${i.budgetsTotal} budget dalam batas`,
    });
  }

  if (i.avgMonthlyExpense > 0) {
    const months = i.liquid / i.avgMonthlyExpense;
    components.push({
      key: "emergency",
      label: "Dana darurat",
      max: 25,
      points: Math.round(25 * clamp01(months / 6)),
      detail: `${dec1(months)} bulan pengeluaran (target 6)`,
    });
  }

  if (components.length === 0) return null;

  if (i.debt <= 0) {
    components.push({
      key: "debt",
      label: "Hutang",
      max: 15,
      points: 15,
      detail: "tidak ada hutang",
    });
  } else if (i.income > 0) {
    const ratio = i.debt / i.income;
    components.push({
      key: "debt",
      label: "Hutang",
      max: 15,
      points: Math.round(15 * clamp01((6 - ratio) / 5)),
      detail: `${dec1(ratio)}× pemasukan bulan ini`,
    });
  } else {
    components.push({
      key: "debt",
      label: "Hutang",
      max: 15,
      points: 0,
      detail: `${rupiah(i.debt)} tanpa pemasukan bulan ini`,
    });
  }

  const total = components.reduce((s, c) => s + c.points, 0);
  const max = components.reduce((s, c) => s + c.max, 0);
  const score = Math.round((total * 100) / max);

  // Saran diambil dari komponen yang paling jauh dari penuh
  const weakest = components
    .filter((c) => c.points < c.max)
    .sort((a, b) => a.points / a.max - b.points / b.max)[0];

  return {
    score,
    grade: gradeOf(score),
    components,
    tip: weakest
      ? TIPS[weakest.key]
      : "Kondisi keuangan bulan ini bagus, pertahankan.",
  };
}
