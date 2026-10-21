export interface Feed {
  id: string;
  source: string;
  urls: string[];
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  aliases: string[];
  feeds: Feed[];
}

const feed = (id: string, source: string, ...urls: string[]): Feed => ({
  id,
  source,
  urls,
});

export const CATEGORIES: Category[] = [
  {
    id: "umum",
    label: "Indonesia",
    icon: "🏛️",
    aliases: ["indonesia", "nasional", "umum", "terkini"],
    feeds: [
      feed(
        "antara-terkini",
        "Antara",
        "https://www.antaranews.com/rss/terkini.xml",
      ),
      feed(
        "cnn-nasional",
        "CNN Indonesia",
        "https://www.cnnindonesia.com/nasional/rss",
      ),
    ],
  },
  {
    id: "ekonomi",
    label: "Ekonomi & Saham",
    icon: "💹",
    aliases: ["ekonomi", "bisnis", "saham", "investasi", "pasar", "market"],
    feeds: [
      feed(
        "antara-ekonomi",
        "Antara",
        "https://www.antaranews.com/rss/ekonomi.xml",
      ),
      feed(
        "cnn-ekonomi",
        "CNN Indonesia",
        "https://www.cnnindonesia.com/ekonomi/rss",
      ),
      feed(
        "cnbc-market",
        "CNBC Indonesia",
        "https://www.cnbcindonesia.com/market/rss",
      ),
    ],
  },
  {
    id: "teknologi",
    label: "Teknologi",
    icon: "💻",
    aliases: ["teknologi", "tekno", "tech", "ai", "gadget"],
    feeds: [
      feed(
        "antara-tekno",
        "Antara",
        "https://www.antaranews.com/rss/tekno.xml",
      ),
      feed(
        "cnbc-tech",
        "CNBC Indonesia",
        "https://www.cnbcindonesia.com/tech/rss",
      ),
      feed(
        "theverge-tech",
        "The Verge",
        "https://www.theverge.com/rss/tech/index.xml",
      ),
    ],
  },
  {
    id: "global",
    label: "Bisnis Global",
    icon: "🌍",
    aliases: ["global", "dunia", "internasional", "bisnis global", "world"],
    feeds: [
      feed(
        "cna-business",
        "CNA",
        "https://www.cna.id/api/v1/rss-outbound-feed?_format=xml&category=3321",
      ),
    ],
  },
  {
    id: "kripto",
    label: "Kripto",
    icon: "₿",
    aliases: ["kripto", "crypto", "bitcoin", "btc", "ethereum", "eth"],
    feeds: [
      feed(
        "coindesk",
        "CoinDesk",
        "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
      ),
      feed("cointelegraph", "Cointelegraph", "https://cointelegraph.com/rss"),
    ],
  },
  {
    id: "gaming",
    label: "Gaming",
    icon: "🎮",
    aliases: ["gaming", "game", "games", "gim", "esports", "esport"],
    feeds: [
      feed(
        "theverge-gaming",
        "The Verge",
        "https://www.theverge.com/rss/games/index.xml",
      ),
      feed("ign", "IGN", "https://www.ign.com/rss/v2/articles/feed"),
    ],
  },
];

export const ALL_FEEDS: Feed[] = [
  ...new Map(
    CATEGORIES.flatMap((category) => category.feeds).map(
      (item) => [item.id, item] as const,
    ),
  ).values(),
];
