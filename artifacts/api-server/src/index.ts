import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startBot } from "./bot/index.js";

// PORT: provided automatically by Render (and most PaaS hosts).
// Falls back to 8080 for local dev so the server still binds when PORT is unset.
const rawPort = process.env["PORT"] || "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// HOST: Render requires binding to 0.0.0.0 so its proxy can reach the app.
const host = process.env["HOST"] || "0.0.0.0";

app.listen(port, host, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");

  // Start Telegram bot
  try {
    await startBot();
  } catch (botErr) {
    logger.error({ err: botErr }, "Failed to start Telegram bot");
    process.exit(1);
  }
});

// Graceful shutdown so Render can rotate the instance cleanly
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "Received shutdown signal, exiting...");
    process.exit(0);
  });
}
