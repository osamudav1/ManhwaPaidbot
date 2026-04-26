# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a Telegram Manhwa Bot (Burmese) built with Telegraf that allows users to purchase access to private Manhwa channels. Owner controls the bot entirely through inline buttons (no slash commands required).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: SQLite (temporary, via Node 24's built-in `node:sqlite`). File at `SQLITE_PATH` env var (defaults to `./data/manhwa-bot.sqlite`). The `lib/db` package exposes a thin pg-compatible `pool` shim so existing code keeps working unchanged. Note: SQLite is ephemeral on Render's free tier — restarts wipe data unless a persistent disk is attached.
- **Telegram Bot**: Telegraf (long polling)

## Telegram Bot Features

### User Flow
- `/start` — Welcome photo + caption + Help/Contact/Main Channel buttons + Manhwa list
- Manhwa selection → Review photo + price + Buy button
- Buy → Wave Pay or KPay options
- KPay shows phone/name/price, awaits screenshot
- Owner DM receives purchase request with user info + Confirm/Cancel buttons
- On Confirm: 1-time invite link (member_limit=1) sent to user with "do not share" warning

### Owner Admin Panel (Inline Buttons Only)
- `/start` for owner shows extra "🔧 Admin Panel" button
- `/admin` quick-access command also opens panel
- **➕ Add Manhwa** — 5-step flow: Channel ID (or forward channel message) → Title → Price → Cover → Review → Description → Confirm
- **📋 Manage Manhwa** — List all; per-manhwa edit (title/price/cover/review/description) or delete
- **🎨 Welcome Settings** — Set welcome photo, caption, preview
- **📢 Main Channel** — Set/remove main channel link & display name
- **📊 Purchase Records** — Recent 10 purchases with status
- **📣 Broadcast** — Send a message (text or photo+caption) to every tracked user. Preserves owner's HTML/blockquote/bold formatting via `entities` passthrough. Supports optional colored URL buttons (e.g. TG channel link). Anti-spam: sends in batches of 5 with a 1.5s pause between batches; auto-marks blocked/deleted users so they're skipped next time.
- **💾 Backup / ♻️ Restore** — JSON backup includes channels, settings, purchases, **and tracked user IDs**. Restore wipes & repopulates all four tables atomically.
- Forward any channel message to bot during add-manhwa = auto-detect channel ID & name
- Cancel button at every prompt; Skip button on optional fields

## Database Tables

- `channels` — Manhwa channels (id, channel_id, channel_name, manhwa_title, price, cover_photo_url, review_photo_url, description)
- `purchases` — Purchase records (user info, channel, payment method, screenshot file_id, status, invite_link)
- `bot_settings` — Key-value (welcome_photo_url, welcome_caption, welcome_caption_entities, main_channel_link, main_channel_name)
- `bot_users` — Tracked Telegram users for broadcast (telegram_id, username, first_name, last_name, joined_at, last_seen_at, is_blocked) — populated on every `/start`

## Bot Setup Requirements

- `TELEGRAM_BOT_TOKEN` — BotFather token (secret)
- `OWNER_TELEGRAM_ID` — Owner's Telegram user ID (secret)
- `KPAY_PHONE` — KPay phone number (secret)
- `KPAY_NAME` — KPay account name (secret)
- Bot must be added as **Admin** to each Manhwa channel with **Invite Users via Link** permission

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — build all packages
- `pnpm --filter @workspace/api-server run dev` — run API/Bot server locally

## Bot Features

- **Edit-in-place navigation** — `editOrReply` / `editOrReplyPhoto` helpers swap message content (caption/media/text) instead of sending new messages, keeping the chat clean. Handles "message is not modified" errors silently.
- **Colored buttons (Bot API 9.5)** — Helpers `primaryCallback`, `successCallback`, `dangerCallback`, `primaryUrl`, `successUrl` in `keyboards.ts` add the `style` field (`primary` blue / `success` green / `danger` red) to inline buttons. The `style` field is at the top level of each button object — Telegraf 4.16.3 forwards unknown fields unchanged.
- **Copy buttons (Bot API 8.0)** — `copyButton(label, value)` produces a `copy_text` inline button that one-tap-copies the value to the user's clipboard (used for KPay phone & name).
- **Welcome caption entities** — Telegram message entities (bold, italic, custom emoji, links, etc.) captured from owner's message are stored as JSON in `bot_settings.welcome_caption_entities` and reapplied on render.
- **Auto-revoke 1-time invite link** — `chat_member` updates trigger `revokeChatInviteLink` once a user joins via their issued link.

## Bot Setup Requirements

- `TELEGRAM_BOT_TOKEN` — BotFather token (secret)
- `OWNER_TELEGRAM_ID` — Owner's Telegram user ID (secret)
- `KPAY_PHONE` — KPay phone number (secret)
- `KPAY_NAME` — KPay account name (secret)
- Bot must be added as **Admin** to each Manhwa channel with **Invite Users via Link** permission

See the `pnpm-workspace` skill for workspace structure and TypeScript setup.
