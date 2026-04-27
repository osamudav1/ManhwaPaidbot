import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT UNIQUE NOT NULL,
  channel_name TEXT NOT NULL,
  channel_username TEXT,
  manhwa_title TEXT NOT NULL,
  price INTEGER NOT NULL,
  cover_photo_url TEXT,
  review_photo_url TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  channel_id TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  screenshot_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_blocked INTEGER NOT NULL DEFAULT 0
);
`;

async function ensureColumn(
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const info = await pool.query(`PRAGMA table_info(${table})`);
  const exists = info.rows.some(
    (r) => (r as { name?: string }).name === column,
  );
  if (!exists) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export async function ensureBotSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await ensureColumn(
    "bot_settings",
    "welcome_caption_entities",
    "welcome_caption_entities TEXT",
  );
  await ensureColumn("bot_users", "warnings", "warnings INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("bot_users", "credits",  "credits INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("bot_users", "muted_until", "muted_until TEXT");
  await ensureColumn("bot_users", "is_banned", "is_banned INTEGER NOT NULL DEFAULT 0");
  logger.info("Bot DB schema ensured (sqlite)");
}
