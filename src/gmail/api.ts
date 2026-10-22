import type { Env } from "../env";
import { accessTokenFrom } from "./oauth";

export const INBOX_QUERY = "in:inbox";
export const UNREAD_QUERY = "in:inbox is:unread";

export interface MailSummary {
  id: string;
  from: string;
  subject: string;
  date: number; // ms
  snippet: string;
  unread: boolean;
}

interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
}

export function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) throw new Error(`Gmail HTTP ${res.status}`);
  return (await res.json()) as T;
}

function header(msg: GmailMessage, name: string): string {
  return (
    msg.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

// "Budi Santoso <budi@x.com>" -> "Budi Santoso"
function senderName(raw: string): string {
  const m = raw.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  return (m ? m[1] : raw).trim();
}

export async function listMail(
  env: Env,
  refreshToken: string,
  query: string,
  max: number,
): Promise<MailSummary[]> {
  const token = await accessTokenFrom(env, refreshToken);
  const list = await gmail<{ messages?: { id: string }[] }>(
    token,
    `messages?maxResults=${max}&q=${encodeURIComponent(query)}`,
  );

  const msgs = await Promise.all(
    (list.messages ?? []).map((m) =>
      gmail<GmailMessage>(
        token,
        `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      ),
    ),
  );

  return msgs.map((msg) => ({
    id: msg.id,
    from: senderName(header(msg, "From")) || "(tanpa pengirim)",
    subject: header(msg, "Subject") || "(tanpa subjek)",
    date: Number(msg.internalDate ?? 0),
    snippet: msg.snippet ?? "",
    unread: msg.labelIds?.includes("UNREAD") ?? false,
  }));
}
