# Deploying to Render

This bot is ready for one-click Docker deployment on [Render](https://render.com).

## Files in this repo

| File             | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `Dockerfile`     | Multi-stage build → tiny runtime image with just `dist/index.mjs`      |
| `.dockerignore`  | Keeps the build context small (no `node_modules`, no `attached_assets`) |
| `render.yaml`    | Render Blueprint — auto-creates the web service + Postgres database     |

## One-click deploy

1. Push this repo to GitHub.
2. In Render: **New** → **Blueprint** → connect your repo.
3. Render reads `render.yaml`, creates the database, and starts the build.
4. Open the new service → **Environment** → fill in the four secrets:
   - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `OWNER_TELEGRAM_ID` — your numeric Telegram ID (get it from [@userinfobot](https://t.me/userinfobot))
   - `KPAY_PHONE` — e.g. `09793251923`
   - `KPAY_NAME` — e.g. `ThankHtikeAung`
5. Save → Render redeploys → bot goes live.

`DATABASE_URL`, `PORT`, `HOST`, and `NODE_ENV` are filled in automatically.

## How the build works

The `Dockerfile` does:

1. **Builder stage** — installs pnpm + workspace deps, then runs `pnpm --filter @workspace/api-server run build`. esbuild bundles the entire bot (Telegraf, Express, Postgres driver, etc.) into a single `dist/index.mjs`. Pino's worker threads are emitted as separate `.mjs` files in the same folder.
2. **Runtime stage** — copies only `dist/` into a fresh `node:24-slim` image. No `node_modules` needed at runtime → small, fast image.

## Health check

Render pings `/api/healthz` to know when the service is ready. The endpoint is already wired up in `artifacts/api-server/src/routes/health.ts`.

## Environment variables

| Variable             | Where it comes from                       |
| -------------------- | ----------------------------------------- |
| `PORT`               | Injected by Render — do not set manually  |
| `HOST`               | `0.0.0.0` — set by `render.yaml`          |
| `NODE_ENV`           | `production` — set by `render.yaml`       |
| `DATABASE_URL`       | Auto-wired to the Render Postgres DB      |
| `TELEGRAM_BOT_TOKEN` | **You set this** in Render dashboard      |
| `OWNER_TELEGRAM_ID`  | **You set this** in Render dashboard      |
| `KPAY_PHONE`         | **You set this** in Render dashboard      |
| `KPAY_NAME`          | **You set this** in Render dashboard      |

## Testing the Docker image locally

```bash
docker build -t manhwa-bot .
docker run --rm -p 8080:8080 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e TELEGRAM_BOT_TOKEN="123:abc" \
  -e OWNER_TELEGRAM_ID="123456789" \
  -e KPAY_PHONE="09793251923" \
  -e KPAY_NAME="ThankHtikeAung" \
  manhwa-bot
```

Then visit `http://localhost:8080/api/healthz` — should return `200 OK`.

## Free tier notes

- Render's free web service spins down after 15 minutes of inactivity. The bot uses **long polling**, so when Render wakes it back up it will resume catching up on missed Telegram updates automatically.
- Free Postgres instances expire after 90 days. Use the `💾 Backup` button in the admin panel before that to download a full JSON snapshot (channels, settings, purchases, users) and restore into the new DB with `♻️ Restore`.
- If you upgrade to a paid plan, the spin-down behavior goes away.
