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

const server = app.listen(port, host, () => {
  logger.info({ port, host }, "Server listening");

  // Start Telegram bot AFTER the HTTP port is bound so Render's port scan
  // succeeds even if the bot fails to launch (e.g. invalid token, 409 Conflict
  // from another instance still polling, transient Telegram API outage).
  startBot()
    .then(() => {
      logger.info("Bot startup complete");
    })
    .catch((botErr) => {
      logger.error(
        { err: botErr },
        "Failed to start Telegram bot — HTTP server will continue running",
      );
    });
});

server.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  process.exit(1);
});

// Graceful shutdown so Render can rotate the instance cleanly
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "Received shutdown signal, exiting...");
    server.close(() => process.exit(0));
    // Hard-exit if close hangs
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
