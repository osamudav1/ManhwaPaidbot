# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a Telegram Manhwa Bot (Burmese) built with Telegraf that allows users to purchase access to private Manhwa channels. Owner controls the bot entirely through inline buttons (no slash commands required).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
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
- Forward any channel message to bot during add-manhwa = auto-detect channel ID & name
- Cancel button at every prompt; Skip button on optional fields

## Database Tables

- `channels` — Manhwa channels (id, channel_id, channel_name, manhwa_title, price, cover_photo_url, review_photo_url, description)
- `purchases` — Purchase records (user info, channel, payment method, screenshot file_id, status, invite_link)
- `bot_settings` — Key-value (welcome_photo_url, welcome_caption, main_channel_link, main_channel_name)

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

See the `pnpm-workspace` skill for workspace structure and TypeScript setup.
