import { pool } from "@workspace/db";

type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number };

async function query(sql: string, params?: unknown[]): Promise<QueryResult> {
  return (
    pool as unknown as {
      query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
    }
  ).query(sql, params);
}

export interface Channel {
  id: number;
  channel_id: string;
  channel_name: string;
  channel_username: string | null;
  manhwa_title: string;
  price: number;
  cover_photo_url: string | null;
  review_photo_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface Purchase {
  id: number;
  user_id: string;
  username: string | null;
  first_name: string | null;
  channel_id: string;
  payment_method: string;
  screenshot_file_id: string | null;
  status: string;
  invite_link: string | null;
  created_at: Date;
}

export async function getAllActiveChannels(): Promise<Channel[]> {
  const res = await query(
    "SELECT * FROM channels WHERE is_active = true ORDER BY created_at DESC"
  );
  return res.rows as unknown as Channel[];
}

export async function getChannelById(id: number): Promise<Channel | null> {
  const res = await query("SELECT * FROM channels WHERE id = $1", [id]);
  return (res.rows[0] as unknown as Channel) || null;
}

export async function getChannelByManhwaTitle(title: string): Promise<Channel | null> {
  const res = await query(
    "SELECT * FROM channels WHERE manhwa_title = $1 AND is_active = true",
    [title]
  );
  return (res.rows[0] as unknown as Channel) || null;
}

export async function getChannelByChannelId(channelId: string): Promise<Channel | null> {
  const res = await query("SELECT * FROM channels WHERE channel_id = $1", [channelId]);
  return (res.rows[0] as unknown as Channel) || null;
}

export async function addChannel(data: {
  channel_id: string;
  channel_name: string;
  channel_username?: string;
  manhwa_title: string;
  price: number;
  cover_photo_url?: string;
  review_photo_url?: string;
  description?: string;
}): Promise<Channel> {
  const res = await query(
    `INSERT INTO channels (channel_id, channel_name, channel_username, manhwa_title, price, cover_photo_url, review_photo_url, description, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     ON CONFLICT (channel_id) DO UPDATE SET
       channel_name = EXCLUDED.channel_name,
       channel_username = EXCLUDED.channel_username,
       manhwa_title = EXCLUDED.manhwa_title,
       price = EXCLUDED.price,
       cover_photo_url = COALESCE(EXCLUDED.cover_photo_url, channels.cover_photo_url),
       review_photo_url = COALESCE(EXCLUDED.review_photo_url, channels.review_photo_url),
       description = COALESCE(EXCLUDED.description, channels.description),
       is_active = true
     RETURNING *`,
    [
      data.channel_id,
      data.channel_name,
      data.channel_username || null,
      data.manhwa_title,
      data.price,
      data.cover_photo_url || null,
      data.review_photo_url || null,
      data.description || null,
    ]
  );
  return res.rows[0] as unknown as Channel;
}

export async function updateChannel(
  id: number,
  patch: Partial<{
    manhwa_title: string;
    price: number;
    cover_photo_url: string | null;
    review_photo_url: string | null;
    description: string | null;
    channel_name: string;
  }>
): Promise<Channel | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = $${i++}`);
    values.push(value);
  }
  if (fields.length === 0) return getChannelById(id);
  values.push(id);
  const res = await query(
    `UPDATE channels SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return (res.rows[0] as unknown as Channel) || null;
}

export async function removeChannel(channelId: string): Promise<boolean> {
  const res = await query(
    "UPDATE channels SET is_active = false WHERE channel_id = $1",
    [channelId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function createPurchase(data: {
  user_id: string;
  username: string | null;
  first_name: string | null;
  channel_id: string;
  payment_method: string;
}): Promise<Purchase> {
  const res = await query(
    `INSERT INTO purchases (user_id, username, first_name, channel_id, payment_method, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [data.user_id, data.username, data.first_name, data.channel_id, data.payment_method]
  );
  return res.rows[0] as unknown as Purchase;
}

export async function getPurchaseById(id: number): Promise<Purchase | null> {
  const res = await query("SELECT * FROM purchases WHERE id = $1", [id]);
  return (res.rows[0] as unknown as Purchase) || null;
}

export async function updatePurchaseScreenshot(id: number, fileId: string): Promise<void> {
  await query(
    "UPDATE purchases SET screenshot_file_id = $1 WHERE id = $2",
    [fileId, id]
  );
}

export async function confirmPurchase(id: number, inviteLink: string): Promise<void> {
  await query(
    "UPDATE purchases SET status = 'confirmed', invite_link = $1 WHERE id = $2",
    [inviteLink, id]
  );
}

export async function cancelPurchase(id: number): Promise<void> {
  await query("UPDATE purchases SET status = 'cancelled' WHERE id = $1", [id]);
}

export async function getPurchaseByInviteLink(link: string): Promise<Purchase | null> {
  const res = await query(
    "SELECT * FROM purchases WHERE invite_link = $1 ORDER BY id DESC LIMIT 1",
    [link]
  );
  return (res.rows[0] as unknown as Purchase) || null;
}

export async function getRecentPurchases(limit: number = 10): Promise<Purchase[]> {
  const res = await query(
    "SELECT * FROM purchases ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return res.rows as unknown as Purchase[];
}

export async function getBotSetting(key: string): Promise<string | null> {
  const res = await query("SELECT value FROM bot_settings WHERE key = $1", [key]);
  return (res.rows[0] as Record<string, string> | undefined)?.value || null;
}

export async function setBotSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO bot_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

export async function deleteBotSetting(key: string): Promise<void> {
  await query("DELETE FROM bot_settings WHERE key = $1", [key]);
}

// ===== Bot Users (broadcast list) =====

export interface BotUser {
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  joined_at: Date;
  last_seen_at: Date;
  is_blocked: boolean;
}

export async function upsertBotUser(data: {
  telegram_id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO bot_users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       last_seen_at = NOW(),
       is_blocked = false`,
    [
      data.telegram_id,
      data.username ?? null,
      data.first_name ?? null,
      data.last_name ?? null,
    ]
  );
}

export async function markUserBlocked(telegramId: string): Promise<void> {
  await query(
    "UPDATE bot_users SET is_blocked = true WHERE telegram_id = $1",
    [telegramId]
  );
}

export async function getActiveUserIds(): Promise<string[]> {
  const res = await query(
    "SELECT telegram_id FROM bot_users WHERE is_blocked = false ORDER BY joined_at ASC"
  );
  return (res.rows as { telegram_id: string }[]).map((r) => r.telegram_id);
}

export async function getUserCount(): Promise<{ total: number; active: number }> {
  const res = await query(
    "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_blocked = false)::int AS active FROM bot_users"
  );
  const row = res.rows[0] as { total: number; active: number };
  return { total: row?.total ?? 0, active: row?.active ?? 0 };
}

// ===== Backup / Restore =====

export interface BackupData {
  version: number;
  exported_at: string;
  channels: Channel[];
  bot_settings: { key: string; value: string; updated_at?: Date }[];
  purchases: Purchase[];
  users?: BotUser[];
}

export async function exportAllData(): Promise<BackupData> {
  const channelsRes = await query("SELECT * FROM channels ORDER BY id ASC");
  const settingsRes = await query("SELECT key, value, updated_at FROM bot_settings");
  const purchasesRes = await query("SELECT * FROM purchases ORDER BY id ASC");
  const usersRes = await query("SELECT * FROM bot_users ORDER BY joined_at ASC");
  return {
    version: 2,
    exported_at: new Date().toISOString(),
    channels: channelsRes.rows as unknown as Channel[],
    bot_settings: settingsRes.rows as unknown as BackupData["bot_settings"],
    purchases: purchasesRes.rows as unknown as Purchase[],
    users: usersRes.rows as unknown as BotUser[],
  };
}

export async function importAllData(data: BackupData): Promise<{
  channels: number;
  bot_settings: number;
  purchases: number;
  users: number;
}> {
  if (!data || typeof data !== "object" || !Array.isArray(data.channels)) {
    throw new Error("Invalid backup data");
  }
  const client = await (
    pool as unknown as { connect: () => Promise<any> }
  ).connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM bot_settings");
    await client.query("DELETE FROM purchases");
    await client.query("DELETE FROM channels");
    await client.query("DELETE FROM bot_users");

    let chCount = 0;
    for (const c of data.channels) {
      await client.query(
        `INSERT INTO channels (id, channel_id, channel_name, channel_username, manhwa_title, price, cover_photo_url, review_photo_url, description, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, NOW()))`,
        [
          c.id,
          c.channel_id,
          c.channel_name,
          c.channel_username ?? null,
          c.manhwa_title,
          c.price,
          c.cover_photo_url ?? null,
          c.review_photo_url ?? null,
          c.description ?? null,
          c.is_active ?? true,
          c.created_at ?? null,
        ]
      );
      chCount++;
    }
    if (chCount > 0) {
      await client.query(
        "SELECT setval('channels_id_seq', (SELECT MAX(id) FROM channels))"
      );
    }

    let stCount = 0;
    for (const s of data.bot_settings || []) {
      await client.query(
        `INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, COALESCE($3, NOW()))`,
        [s.key, s.value, s.updated_at ?? null]
      );
      stCount++;
    }

    let pCount = 0;
    for (const p of data.purchases || []) {
      await client.query(
        `INSERT INTO purchases (id, user_id, username, first_name, channel_id, payment_method, screenshot_file_id, status, invite_link, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10, NOW()))`,
        [
          p.id,
          p.user_id,
          p.username ?? null,
          p.first_name ?? null,
          p.channel_id,
          p.payment_method,
          p.screenshot_file_id ?? null,
          p.status ?? "pending",
          p.invite_link ?? null,
          p.created_at ?? null,
        ]
      );
      pCount++;
    }
    if (pCount > 0) {
      await client.query(
        "SELECT setval('purchases_id_seq', (SELECT MAX(id) FROM purchases))"
      );
    }

    let uCount = 0;
    for (const u of data.users || []) {
      await client.query(
        `INSERT INTO bot_users (telegram_id, username, first_name, last_name, joined_at, last_seen_at, is_blocked)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), COALESCE($6, NOW()), COALESCE($7, false))
         ON CONFLICT (telegram_id) DO NOTHING`,
        [
          String(u.telegram_id),
          u.username ?? null,
          u.first_name ?? null,
          (u as any).last_name ?? null,
          u.joined_at ?? null,
          (u as any).last_seen_at ?? null,
          (u as any).is_blocked ?? false,
        ]
      );
      uCount++;
    }

    await client.query("COMMIT");
    return { channels: chCount, bot_settings: stCount, purchases: pCount, users: uCount };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
