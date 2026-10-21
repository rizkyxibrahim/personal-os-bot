// "25000", "25.000", "25k", "25rb", "1,5jt" -> angka rupiah
export function parseAmount(raw: string): number | null {
  const s = raw
    .toLowerCase()
    .replace(/^rp\.?/, "")
    .trim();
  const m = s.match(/^([\d.,]+)(k|rb|jt)?$/);
  if (!m) return null;

  const [, num, suffix] = m;
  let value: number;

  if (suffix) {
    const multiplier = suffix === "jt" ? 1_000_000 : 1_000;
    value = Math.round(parseFloat(num.replace(",", ".")) * multiplier);
  } else {
    value = parseInt(num.replace(/[.,]/g, ""), 10);
  }

  return Number.isFinite(value) && value > 0 ? value : null;
}

// "makan siang #makan" -> { note: "makan siang", category: "makan" }
export function splitNote(text: string): {
  note: string | null;
  category: string | null;
} {
  const m = text.match(/#(\w+)/);
  const category = m ? m[1].toLowerCase() : null;
  const note = text.replace(/#\w+/g, "").replace(/\s+/g, " ").trim() || null;
  return { note, category };
}
