import * as users from "../users/store";

const JAKARTA = { lat: -6.2088, lon: 106.8456 };

export async function resolveLocation(
  db: D1Database,
  userId: number,
): Promise<{ lat: number; lon: number; label: string }> {
  const loc = await users.getLocation(db, userId);
  if (loc && loc.lat !== null && loc.lon !== null)
    return { lat: loc.lat, lon: loc.lon, label: "Lokasimu" };
  return { ...JAKARTA, label: "Jakarta" };
}

// Kode cuaca WMO yang dipakai Open-Meteo, diterjemahkan ke bahasa Indonesia
function describe(code: number): string {
  if (code === 0) return "cerah";
  if (code <= 2) return "cerah berawan";
  if (code === 3) return "berawan";
  if (code === 45 || code === 48) return "berkabut";
  if (code >= 51 && code <= 57) return "gerimis";
  if (code >= 61 && code <= 67) return "hujan";
  if (code >= 71 && code <= 77) return "bersalju";
  if (code >= 80 && code <= 82) return "hujan lokal";
  if (code >= 95) return "badai petir";
  return "kondisi tidak diketahui";
}

// Tidak pernah melempar error. Kalau gagal, dashboard tetap tampil tanpa baris cuaca
export async function currentWeather(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      "&current=temperature_2m,weather_code&timezone=Asia%2FJakarta";
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (typeof temp !== "number" || typeof code !== "number") return null;

    return `${Math.round(temp)}°C, ${describe(code)}`;
  } catch (err) {
    console.error("[weather] gagal", err);
    return null;
  }
}
