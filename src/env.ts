export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  OWNER_ID: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_KEY: string;
  PUBLIC_BASE_URL: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_FALLBACK_MODEL: string;
  DB: D1Database;
}
