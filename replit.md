# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a Telegram Manhwa Bot built with Telegraf that allows users to purchase access to private Manhwa channels.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Telegram Bot**: Telegraf (long polling)

## Telegram Bot Features

- `/start` — Welcome message with photo + Help/Contact/Main Channel buttons + Manhwa list
- Manhwa selection with preview photo and price
- Payment via Wave Pay or KPay (shows KPay number/name, awaits screenshot)
- Owner DM receives purchase request with user info and confirm/cancel buttons
- On confirm: generates 1-time invite link (member_limit=1) and sends to user with warning not to share
- On cancel: notifies user

## Admin Commands (Owner only)

- `/addchannel` — Add a new Manhwa channel (multi-step flow: channel ID, title, price, description)
- `/removechannel` — Deactivate a channel
- `/listchannels` — List all active channels
- `/setwelcome` — Set welcome photo and caption
- `/setmainchannel <link> <name>` — Set main channel link shown in /start
- `/setcover <channel_id> <photo_url>` — Set cover photo URL for a channel
- `/setreview <channel_id> <photo_url>` — Set review photo URL shown before purchase
- `/adminhelp` — Show all admin commands

## Database Tables

- `channels` — Manhwa channels (id, channel_id, channel_name, manhwa_title, price, photos, description)
- `purchases` — Purchase records (user info, channel, payment method, screenshot, status, invite_link)
- `bot_settings` — Key-value store (welcome_photo_url, welcome_caption, main_channel_link, main_channel_name)

## Bot Setup Requirements

- `TELEGRAM_BOT_TOKEN` — BotFather token (secret)
- `OWNER_TELEGRAM_ID` — Owner's Telegram user ID (secret)
- `KPAY_PHONE` — KPay phone number (secret)
- `KPAY_NAME` — KPay account name (secret)
- Bot must be added as **Admin** to each Manhwa channel with **Invite Users** permission

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
