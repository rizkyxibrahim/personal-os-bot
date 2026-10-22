import { Api } from "grammy";
import type { Env } from "../env";
import { consumeState, exchangeCode } from "./oauth";
import { saveAccount } from "./store";

function page(title: string, message: string, status = 200): Response {
  const html = `<!doctype html><html lang="id"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px">
<h2>${title}</h2><p>${message}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) throw new Error(`profile HTTP ${res.status}`);
  const data = (await res.json()) as { emailAddress?: string };
  if (!data.emailAddress) throw new Error("emailAddress kosong");
  return data.emailAddress;
}

export async function handleGmailCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has("error")) {
    return page(
      "Dibatalkan",
      "Persetujuan Google dibatalkan. Ketik /gmail di Telegram untuk mencoba lagi.",
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state)
    return page(
      "Permintaan tidak valid",
      "Buka tautan dari Telegram lewat /gmail.",
      400,
    );

  const userId = await consumeState(env.DB, state);
  if (userId === null) {
    return page(
      "Tautan kedaluwarsa",
      "Ketik /gmail di Telegram untuk membuat tautan baru.",
      400,
    );
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode(env, code);
    const email = await fetchEmail(accessToken);
    await saveAccount(env, userId, email, refreshToken);
    await new Api(env.BOT_TOKEN).sendMessage(
      userId,
      `✅ Gmail terhubung: ${email}\nCoba /inbox atau /unread.`,
    );
    return page("Gmail terhubung", "Kamu bisa kembali ke Telegram.");
  } catch (err) {
    console.error("[gmail] callback gagal", err);
    return page(
      "Gagal menghubungkan",
      "Coba /gmail lagi dari Telegram. Kalau tetap gagal, cek npx wrangler tail.",
      500,
    );
  }
}
