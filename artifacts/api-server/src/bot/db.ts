import { pool } from "@workspace/db";

type QueryResult = { rows: Record<string, unknown>[] };

async function query(sql: string, params?: unknown[]): Promise<QueryResult> {
  return (pool as unknown as { query: (sql: string, params?: unknown[]) => Promise<QueryResult> }).query(sql, params);
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
    "SELECT * FROM channels WHERE is_active = true ORDER BY manhwa_title ASC"
  );
  return res.rows as unknown as Channel[];
}

export async function getChannelByManhwaTitle(title: string): Promise<Channel | null> {
  const res = await query(
    "SELECT * FROM channels WHERE manhwa_title = $1 AND is_active = true",
    [title]
  );
  return (res.rows[0] as unknown as Channel) || null;
}

export async function getChannelByChannelId(channelId: string): Promise<Channel | null> {
  const res = await query(
    "SELECT * FROM channels WHERE channel_id = $1",
    [channelId]
  );
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
    `INSERT INTO channels (channel_id, channel_name, channel_username, manhwa_title, price, cover_photo_url, review_photo_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (channel_id) DO UPDATE SET
       channel_name = EXCLUDED.channel_name,
       channel_username = EXCLUDED.channel_username,
       manhwa_title = EXCLUDED.manhwa_title,
       price = EXCLUDED.price,
       cover_photo_url = EXCLUDED.cover_photo_url,
       review_photo_url = EXCLUDED.review_photo_url,
       description = EXCLUDED.description
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

export async function removeChannel(channelId: string): Promise<boolean> {
  const res = await (pool as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number }> }).query(
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
  await query(
    "UPDATE purchases SET status = 'cancelled' WHERE id = $1",
    [id]
  );
}

export async function getBotSetting(key: string): Promise<string | null> {
  const res = await query(
    "SELECT value FROM bot_settings WHERE key = $1",
    [key]
  );
  return (res.rows[0] as Record<string, string> | undefined)?.value || null;
}

export async function setBotSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO bot_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}
