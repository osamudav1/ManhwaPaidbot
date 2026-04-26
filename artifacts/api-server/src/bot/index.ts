import { Telegraf } from "telegraf";
import { logger } from "../lib/logger.js";
import { registerHandlers } from "./handlers.js";
import { ensureBotSchema } from "./init-db.js";

let botInstance: Telegraf | null = null;

export function getBot(): Telegraf {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
    }
    botInstance = new Telegraf(token);
    registerHandlers(botInstance);
  }
  return botInstance;
}

export async function startBot() {
  const bot = getBot();
  await ensureBotSchema();
  await bot.launch({
    allowedUpdates: [
      "message",
      "callback_query",
      "chat_member",
      "my_chat_member",
      "chat_join_request",
    ],
  });
  logger.info("Telegram bot started successfully");

  process.once("SIGINT", () => {
    logger.info("SIGINT received, stopping bot");
    bot.stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    logger.info("SIGTERM received, stopping bot");
    bot.stop("SIGTERM");
  });
}
