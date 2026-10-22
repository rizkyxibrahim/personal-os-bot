import type { Env } from "../env";
import { decryptSecret, encryptSecret } from "./crypto";

export interface Account {
  email: string;
  refreshToken: string;
}

export async function getAccount(
  env: Env,
  userId: number,
): Promise<Account | null> {
  const row = await env.DB.prepare(
    "SELECT email, refresh_token_enc FROM gmail_accounts WHERE user_id = ?1",
  )
    .bind(userId)
    .first<{ email: string; refresh_token_enc: string }>();
  if (!row) return null;
  return {
    email: row.email,
    refreshToken: await decryptSecret(env.TOKEN_KEY, row.refresh_token_enc),
  };
}

export async function saveAccount(
  env: Env,
  userId: number,
  email: string,
  refreshToken: string,
): Promise<void> {
  const packed = await encryptSecret(env.TOKEN_KEY, refreshToken);
  await env.DB.prepare(
    `INSERT INTO gmail_accounts (user_id, email, refresh_token_enc, connected_at) VALUES (?1, ?2, ?3, datetime('now'))
     ON CONFLICT (user_id) DO UPDATE SET email = excluded.email,
       refresh_token_enc = excluded.refresh_token_enc, connected_at = excluded.connected_at`,
  )
    .bind(userId, email, packed)
    .run();
}

export async function deleteAccount(env: Env, userId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM gmail_accounts WHERE user_id = ?1")
    .bind(userId)
    .run();
}
