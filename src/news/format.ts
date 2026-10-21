import type { NewsItem } from "./rss";

export function ago(ts: number, now = Date.now()): string {
  if (!ts) return "";
  const minutes = Math.round((now - ts) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

export function newsLines(items: NewsItem[], withLinks: boolean): string[] {
  return items.flatMap((n, i) => [
    [
      `${i + 1}. ${n.title}`,
      `   ${n.source}${n.ts ? ` · ${ago(n.ts)}` : ""}`,
      ...(withLinks ? [`   ${n.link}`] : []),
    ].join("\n"),
    "",
  ]);
}
