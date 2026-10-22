import type { Env } from "../env";
import { randomToken } from "./crypto";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const redirectUri = (env: Env) =>
  `${env.PUBLIC_BASE_URL}/gmail/callback`;

// Dipanggil bot hanya untuk pemilik. State sekali pakai, berlaku 10 menit.
export async function createConnectUrl(
  env: Env,
  userId: number,
): Promise<string> {
  const state = randomToken();
  await env.DB.prepare(
    "INSERT INTO oauth_states (state, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+10 minutes'))",
  )
    .bind(state, userId)
    .run();

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function consumeState(
  db: D1Database,
  state: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      "DELETE FROM oauth_states WHERE state = ?1 AND expires_at > datetime('now') RETURNING user_id",
    )
    .bind(state)
    .first<{ user_id: number }>();
  return row?.user_id ?? null;
}

export async function exchangeCode(
  env: Env,
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
  };
  if (!res.ok || !data.refresh_token || !data.access_token) {
    throw new Error(`token exchange gagal: ${data.error ?? res.status}`);
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}

export async function accessTokenFrom(
  env: Env,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `invalid_grant: akses perlu dihubungkan ulang (${data.error ?? res.status})`,
    );
  }
  return data.access_token;
}

// Mencabut akses di sisi Google. Kalau gagal, tetap lanjut menghapus data lokal
export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // abaikan: penghapusan lokal tetap berjalan
  }
}
