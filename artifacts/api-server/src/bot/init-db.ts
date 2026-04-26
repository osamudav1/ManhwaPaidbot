import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  channel_name TEXT NOT NULL,
  channel_username TEXT,
  manhwa_title TEXT NOT NULL,
  price INTEGER NOT NULL,
  cover_photo_url TEXT,
  review_photo_url TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  channel_id TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  screenshot_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS welcome_caption_entities TEXT;
`;

export async function ensureBotSchema(): Promise<void> {
  const p = pool as unknown as { query: (sql: string) => Promise<unknown> };
  await p.query(SCHEMA_SQL);
  logger.info("Bot DB schema ensured");
}
