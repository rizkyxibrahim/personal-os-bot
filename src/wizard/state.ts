import type { Data } from "./types";

export interface FlowState {
  flow: string;
  step: number;
  data: Data;
  promptId: number | null;
}

interface Row {
  flow: string;
  step: number;
  data: string;
  prompt_id: number | null;
}

function toState(row: Row): FlowState {
  let data: Data = {};
  try {
    data = JSON.parse(row.data) as Data;
  } catch {
    // data rusak: mulai dari kosong
  }
  return { flow: row.flow, step: row.step, data, promptId: row.prompt_id };
}

export async function getState(
  db: D1Database,
  userId: number,
): Promise<FlowState | null> {
  const row = await db
    .prepare(
      "SELECT flow, step, data, prompt_id FROM conversation_state WHERE user_id = ?1 AND expires_at > datetime('now')",
    )
    .bind(userId)
    .first<Row>();
  return row ? toState(row) : null;
}

// Setiap penyimpanan memperpanjang batas waktu 15 menit
export async function saveState(
  db: D1Database,
  userId: number,
  s: FlowState,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO conversation_state (user_id, flow, step, data, prompt_id, expires_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', '+15 minutes'), datetime('now'))
       ON CONFLICT (user_id) DO UPDATE SET
         flow = excluded.flow, step = excluded.step, data = excluded.data,
         prompt_id = excluded.prompt_id, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    )
    .bind(userId, s.flow, s.step, JSON.stringify(s.data), s.promptId)
    .run();
}

export async function clearState(
  db: D1Database,
  userId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM conversation_state WHERE user_id = ?1")
    .bind(userId)
    .run();
}

// Ambil sekaligus hapus: kalau tombol Simpan ditekan dua kali, hanya satu yang berhasil
export async function claimState(
  db: D1Database,
  userId: number,
  flow: string,
  step: number,
): Promise<FlowState | null> {
  const row = await db
    .prepare(
      `DELETE FROM conversation_state
       WHERE user_id = ?1 AND flow = ?2 AND step = ?3 AND expires_at > datetime('now')
       RETURNING flow, step, data, prompt_id`,
    )
    .bind(userId, flow, step)
    .first<Row>();
  return row ? toState(row) : null;
}
