import { Telegraf } from "telegraf";
import { logger } from "../lib/logger.js";
import { registerHandlers } from "./handlers.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

export const bot = new Telegraf(BOT_TOKEN);

registerHandlers(bot);

export async function startBot() {
  try {
    await bot.launch();
    logger.info("Telegram bot started successfully");

    process.once("SIGINT", () => {
      logger.info("SIGINT received, stopping bot");
      bot.stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      logger.info("SIGTERM received, stopping bot");
      bot.stop("SIGTERM");
    });
  } catch (err) {
    logger.error({ err }, "Failed to start Telegram bot");
    throw err;
  }
}
