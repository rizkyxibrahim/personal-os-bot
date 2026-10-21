export interface NewsItem {
  title: string;
  link: string;
  source: string;
  ts: number; // waktu terbit (ms), 0 kalau tidak ada
}

const MAX_ITEMS = 15;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d{1,6});/g, (_, n: string) => {
      const c = Number(n);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => {
      const c = parseInt(h, 16);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    })
    .replace(/&amp;/g, "&");
}

// Buka CDATA, buang tag HTML, urai entitas, rapikan spasi
function clean(raw: string): string {
  const noTags = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
  );
  return m ? m[1] : null;
}

function parseDate(raw: string | null): number {
  if (!raw) return 0;
  const s = clean(raw)
    .replace(/\bWITA\b/, "+0800")
    .replace(/\bWIT\b/, "+0900")
    .replace(/\bWIB\b/, "+0700");
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function parseRss(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  let pos = 0;

  while (items.length < MAX_ITEMS) {
    const start = xml.indexOf("<item", pos);
    if (start === -1) break;
    const end = xml.indexOf("</item>", start);
    if (end === -1) break;
    pos = end + 7;

    const block = xml.slice(start, end);
    const title = clean(tag(block, "title") ?? "");
    let link = clean(tag(block, "link") ?? "");
    if (!/^https?:\/\//i.test(link)) link = clean(tag(block, "guid") ?? "");
    if (!title || !/^https?:\/\//i.test(link)) continue;

    items.push({
      title: title.slice(0, 160),
      link,
      source,
      ts: parseDate(tag(block, "pubDate") ?? tag(block, "dc:date")),
    });
  }
  return items;
}
