import { ALL_FEEDS, type Category, type Feed } from "./feeds";
import { parseRss, type NewsItem } from "./rss";

const FETCH_TIMEOUT_MS = 5000;
const FRESH_WINDOW = "-20 minutes";

async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  let lastError = "tidak ada alamat";

  for (const url of feed.urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PersonalOSBot/1.0)",
          Accept:
            "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const items = parseRss(await res.text(), feed.source);
      if (items.length === 0) {
        lastError = "tidak ada item (bukan format RSS?)";
        continue;
      }
      return items;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError);
}

async function readCache(
  db: D1Database,
  feedId: string,
): Promise<{ items: NewsItem[]; fresh: boolean } | null> {
  const row = await db
    .prepare(
      "SELECT items, fetched_at > datetime('now', ?2) AS fresh FROM feed_cache WHERE feed = ?1",
    )
    .bind(feedId, FRESH_WINDOW)
    .first<{ items: string; fresh: number }>();
  if (!row) return null;

  try {
    return {
      items: JSON.parse(row.items) as NewsItem[],
      fresh: row.fresh === 1,
    };
  } catch {
    return null;
  }
}

async function writeCache(
  db: D1Database,
  feedId: string,
  items: NewsItem[],
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feed_cache (feed, items, fetched_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT (feed) DO UPDATE SET items = excluded.items, fetched_at = excluded.fetched_at`,
    )
    .bind(feedId, JSON.stringify(items))
    .run();
}

// Dari cache kalau masih segar; kalau tidak, ambil baru. Gagal = pakai data lama (stale)
async function getFeed(
  db: D1Database,
  feed: Feed,
): Promise<{ items: NewsItem[]; stale: boolean }> {
  const cached = await readCache(db, feed.id);
  if (cached?.fresh) return { items: cached.items, stale: false };

  try {
    const items = await fetchFeed(feed);
    await writeCache(db, feed.id, items);
    return { items, stale: false };
  } catch (err) {
    console.error(`[news] ${feed.id} gagal:`, err);
    return { items: cached?.items ?? [], stale: true };
  }
}

export async function getNews(
  db: D1Database,
  category: Category,
  limit: number,
): Promise<{ items: NewsItem[]; stale: boolean }> {
  const results = await Promise.all(category.feeds.map((f) => getFeed(db, f)));

  const seen = new Set<string>();
  const merged = results
    .flatMap((r) => r.items)
    .sort((a, b) => b.ts - a.ts)
    .filter((n) => {
      const key = n.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { items: merged.slice(0, limit), stale: results.some((r) => r.stale) };
}

export interface FeedStatus {
  feed: Feed;
  ok: boolean;
  count: number;
  newest: number;
  error?: string;
}

// Untuk /beritastatus: ambil ulang setiap sumber dan laporkan hasilnya
export async function checkFeeds(db: D1Database): Promise<FeedStatus[]> {
  const out: FeedStatus[] = [];
  for (const feed of ALL_FEEDS) {
    try {
      const items = await fetchFeed(feed);
      await writeCache(db, feed.id, items);
      out.push({
        feed,
        ok: true,
        count: items.length,
        newest: Math.max(0, ...items.map((i) => i.ts)),
      });
    } catch (err) {
      out.push({
        feed,
        ok: false,
        count: 0,
        newest: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
