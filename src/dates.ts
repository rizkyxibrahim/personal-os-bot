const TZ = "Asia/Jakarta";

// "2026-10-18" (tanggal hari ini di Jakarta)
export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

// "20 Okt"
export function formatDue(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(utc(date));
}

// "20 Okt 2026"
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(utc(date));
}

// "Minggu, 18 Oktober 2026"
export function formatDayLong(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utc(date));
}

// ---------- Helper bulan ("2026-10") ----------

// start = tanggal 1 (termasuk), end = tanggal 1 bulan berikutnya (tidak termasuk)
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${month}-01`, end: `${next}-01` };
}

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// "Oktober 2026"
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

// "" / "ini" -> bulan ini, "lalu" -> bulan lalu, "09/26", "9/2026", "2026-09"
export function parseMonthArg(arg: string, today: string): string | null {
  const a = arg.trim().toLowerCase();
  const current = today.slice(0, 7);
  if (a === "" || a === "ini" || a === "bulanini") return current;
  if (a === "lalu" || a === "bulanlalu") return prevMonth(current);

  let year: string;
  let month: string;

  const iso = a.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    year = iso[1];
    month = iso[2];
  } else {
    const my = a.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/);
    if (!my) return null;
    month = my[1].padStart(2, "0");
    year = my[2].length === 2 ? "20" + my[2] : my[2];
  }

  const mm = Number(month);
  return mm >= 1 && mm <= 12 ? `${year}-${month}` : null;
}
