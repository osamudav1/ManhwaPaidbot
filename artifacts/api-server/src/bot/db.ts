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
  is_active: number; // sqlite stores booleans as 0/1
  created_at: string;
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
  created_at: string;
}

export async function getAllActiveChannels(): Promise<Channel[]> {
  const res = await query(
    "SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at DESC"
  );
  return res.rows as unknown as Channel[];
}

export async function getChannelById(id: number): Promise<Channel | null> {
  const res = await query("SELECT * FROM channels WHERE id = $1", [id]);
  return (res.rows[0] as unknown as Channel) || null;
}

export async function getChannelByManhwaTitle(title: string): Promise<Channel | null> {
  const res = await query(
    "SELECT * FROM channels WHERE manhwa_title = $1 AND is_active = 1",
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
     ON CONFLICT (channel_id) DO UPDATE SET
       channel_name = excluded.channel_name,
       channel_username = excluded.channel_username,
       manhwa_title = excluded.manhwa_title,
       price = excluded.price,
       cover_photo_url = COALESCE(excluded.cover_photo_url, channels.cover_photo_url),
       review_photo_url = COALESCE(excluded.review_photo_url, channels.review_photo_url),
       description = COALESCE(excluded.description, channels.description),
       is_active = 1
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
    "UPDATE channels SET is_active = 0 WHERE channel_id = $1",
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
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
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
  joined_at: string;
  last_seen_at: string;
  is_blocked: number;
}

export async function upsertBotUser(data: {
  telegram_id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): Promise<{ isNew: boolean }> {
  const existing = await query(
    "SELECT telegram_id FROM bot_users WHERE telegram_id = $1",
    [data.telegram_id]
  );
  const isNew = existing.rows.length === 0;
  await query(
    `INSERT INTO bot_users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       last_seen_at = datetime('now'),
       is_blocked = 0`,
    [
      data.telegram_id,
      data.username ?? null,
      data.first_name ?? null,
      data.last_name ?? null,
    ]
  );
  return { isNew };
}

export async function getUserTotalSpend(telegramId: string): Promise<number> {
  const res = await query(
    `SELECT COALESCE(SUM(c.price), 0) AS total
     FROM purchases p
     JOIN channels c ON c.channel_id = p.channel_id
     WHERE p.user_id = $1 AND p.status = 'confirmed'`,
    [telegramId]
  );
  return Number((res.rows[0] as { total?: unknown })?.total ?? 0);
}

export async function markUserBlocked(telegramId: string): Promise<void> {
  await query(
    "UPDATE bot_users SET is_blocked = 1 WHERE telegram_id = $1",
    [telegramId]
  );
}

export async function getActiveUserIds(): Promise<string[]> {
  const res = await query(
    "SELECT telegram_id FROM bot_users WHERE is_blocked = 0 ORDER BY joined_at ASC"
  );
  return (res.rows as { telegram_id: string }[]).map((r) => r.telegram_id);
}

export async function getUserCount(): Promise<{ total: number; active: number }> {
  const res = await query(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN is_blocked = 0 THEN 1 ELSE 0 END) AS active FROM bot_users"
  );
  const row = (res.rows[0] as { total?: number; active?: number }) || {};
  return { total: Number(row.total ?? 0), active: Number(row.active ?? 0) };
}

// ===== Warn / Mute / Ban system =====

export interface UserStatus {
  warnings: number;
  credits: number;
  muted_until: string | null;
  is_banned: number;
}

export async function getUserStatus(telegramId: string): Promise<UserStatus> {
  const res = await query(
    "SELECT warnings, credits, muted_until, is_banned FROM bot_users WHERE telegram_id = $1",
    [telegramId]
  );
  const row = res.rows[0] as Partial<UserStatus> | undefined;
  return {
    warnings:    Number(row?.warnings    ?? 0),
    credits:     Number(row?.credits     ?? 100),
    muted_until: (row?.muted_until as string | null | undefined) ?? null,
    is_banned:   Number(row?.is_banned   ?? 0),
  };
}

/** Increments warnings, deducts 20 credits.
 *  Returns the state AS REPORTED to the user (warnings before reset, credits after deduct).
 *  If warnings reached 3, resets warnings to 0 (mute handled by caller). */
export async function addWarnGetState(telegramId: string): Promise<{
  warnNum: number;
  credits: number;
  shouldMute: boolean;
  shouldBan: boolean;
}> {
  const status = await getUserStatus(telegramId);
  const warnNum  = status.warnings + 1;
  const credits  = Math.max(0, status.credits - 20);
  const shouldMute = warnNum >= 3;
  const shouldBan  = credits <= 0;
  const storedWarnings = shouldMute ? 0 : warnNum;

  await query(
    "UPDATE bot_users SET warnings = $1, credits = $2 WHERE telegram_id = $3",
    [storedWarnings, credits, telegramId]
  );
  return { warnNum, credits, shouldMute, shouldBan };
}

export async function muteUser(telegramId: string, until: string): Promise<void> {
  await query(
    "UPDATE bot_users SET muted_until = $1 WHERE telegram_id = $2",
    [until, telegramId]
  );
}

export async function unmuteUser(telegramId: string): Promise<void> {
  await query(
    "UPDATE bot_users SET muted_until = NULL, warnings = 0 WHERE telegram_id = $1",
    [telegramId]
  );
}

export async function banUser(telegramId: string): Promise<void> {
  await query(
    "UPDATE bot_users SET is_banned = 1, muted_until = NULL WHERE telegram_id = $1",
    [telegramId]
  );
}

export async function unbanUser(telegramId: string): Promise<void> {
  await query(
    "UPDATE bot_users SET is_banned = 0, muted_until = NULL, warnings = 0, credits = 100 WHERE telegram_id = $1",
    [telegramId]
  );
}

export async function getBotUserById(telegramId: string): Promise<BotUser | null> {
  const res = await query(
    "SELECT * FROM bot_users WHERE telegram_id = $1",
    [telegramId]
  );
  return (res.rows[0] as unknown as BotUser) || null;
}

// ===== Backup / Restore =====

export interface BackupData {
  version: number;
  exported_at: string;
  channels: Channel[];
  bot_settings: { key: string; value: string; updated_at?: string }[];
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

function toBit(v: unknown, fallback: 0 | 1): 0 | 1 {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v ? 1 : 0;
  return fallback;
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, datetime('now')))`,
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
          toBit(c.is_active, 1),
          c.created_at ?? null,
        ]
      );
      chCount++;
    }

    let stCount = 0;
    for (const s of data.bot_settings || []) {
      await client.query(
        `INSERT INTO bot_settings (key, value, updated_at) VALUES ($1, $2, COALESCE($3, datetime('now')))`,
        [s.key, s.value, s.updated_at ?? null]
      );
      stCount++;
    }

    let pCount = 0;
    for (const p of data.purchases || []) {
      await client.query(
        `INSERT INTO purchases (id, user_id, username, first_name, channel_id, payment_method, screenshot_file_id, status, invite_link, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10, datetime('now')))`,
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

    let uCount = 0;
    for (const u of data.users || []) {
      await client.query(
        `INSERT OR IGNORE INTO bot_users (telegram_id, username, first_name, last_name, joined_at, last_seen_at, is_blocked)
         VALUES ($1, $2, $3, $4, COALESCE($5, datetime('now')), COALESCE($6, datetime('now')), COALESCE($7, 0))`,
        [
          String(u.telegram_id),
          u.username ?? null,
          u.first_name ?? null,
          (u as any).last_name ?? null,
          u.joined_at ?? null,
          (u as any).last_seen_at ?? null,
          toBit((u as any).is_blocked, 0),
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
