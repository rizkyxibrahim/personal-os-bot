// Klaim dulu sebelum kirim: kalau sudah pernah diklaim, pesan itu tidak dikirim lagi
export async function claim(
  db: D1Database,
  userId: number,
  job: string,
  period: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      "INSERT OR IGNORE INTO scheduled_notifications (user_id, job, period) VALUES (?1, ?2, ?3)",
    )
    .bind(userId, job, period)
    .run();
  return res.meta.changes > 0;
}

// Dilepas kalau pengiriman gagal, supaya dicoba lagi di jalan cron berikutnya
export async function release(
  db: D1Database,
  userId: number,
  job: string,
  period: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM scheduled_notifications WHERE user_id = ?1 AND job = ?2 AND period = ?3",
    )
    .bind(userId, job, period)
    .run();
}

export async function cleanup(db: D1Database): Promise<void> {
  await db
    .prepare(
      "DELETE FROM scheduled_notifications WHERE created_at < datetime('now', '-60 days')",
    )
    .run();
}
