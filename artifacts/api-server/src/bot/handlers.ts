import type { Telegraf } from "telegraf";
import { Markup } from "telegraf";
import {
  getAllActiveChannels,
  getChannelById,
  getChannelByChannelId,
  createPurchase,
  getPurchaseById,
  confirmPurchase,
  cancelPurchase,
  getBotSetting,
  setBotSetting,
  deleteBotSetting,
  addChannel,
  updateChannel,
  removeChannel,
  updatePurchaseScreenshot,
  getRecentPurchases,
  getPurchaseByInviteLink,
  exportAllData,
  importAllData,
  upsertBotUser,
  getActiveUserIds,
  getUserCount,
  markUserBlocked,
  getUserTotalSpend,
  getUserStatus,
  addWarnGetState,
  muteUser,
  unmuteUser,
  banUser,
  unbanUser,
  getBotUserById,
} from "./db.js";
import {
  getStartKeyboard,
  getManhwaListKeyboard,
  getManhwaDetailKeyboard,
  getPaymentKeyboard,
  getOwnerConfirmKeyboard,
  getBackToListKeyboard,
  getAdminPanelKeyboard,
  getAdminManhwaListKeyboard,
  getAdminEditManhwaKeyboard,
  getDeleteConfirmKeyboard,
  getWelcomeSettingsKeyboard,
  getMainChannelSettingsKeyboard,
  getCancelKeyboard,
  getSkipCancelKeyboard,
  getAddManhwaConfirmKeyboard,
  copyButton,
  primaryCallback,
  successCallback,
  dangerCallback,
  primaryUrl,
  successUrl,
} from "./keyboards.js";
import { getUserState, setUserState, updateUserState, clearUserState } from "./states.js";
import { logger } from "../lib/logger.js";

const OWNER_ID = parseInt(process.env.OWNER_TELEGRAM_ID || "0", 10);
const KPAY_PHONE = process.env.KPAY_PHONE || "";
const KPAY_NAME = process.env.KPAY_NAME || "";

function isOwner(userId: number): boolean {
  return userId === OWNER_ID;
}

// Escape Telegram legacy Markdown special chars in user-provided text
function escMd(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/([_*`\[\]])/g, "\\$1");
}

// Escape HTML special chars for Telegram HTML parse_mode
function escHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function safeReply(ctx: any, text: string, extra?: any) {
  try {
    return await ctx.reply(text, extra);
  } catch (err) {
    logger.error({ err }, "safeReply failed");
  }
}

// Edit current message in place when possible, fallback to sending a new one.
// Auto-detects whether the prior message has media (use editMessageCaption)
// or is text (use editMessageText). Avoids cluttering chat with new bubbles.
function isNotModifiedError(err: any): boolean {
  const desc = String(err?.description || err?.message || "");
  return desc.includes("message is not modified");
}

async function editOrReply(ctx: any, text: string, extra?: any) {
  const msg = ctx.callbackQuery?.message as any;
  if (msg) {
    const hasMedia = !!(msg.photo || msg.video || msg.document || msg.animation);
    try {
      if (hasMedia) {
        await ctx.editMessageCaption(text, extra);
      } else {
        await ctx.editMessageText(text, extra);
      }
      return;
    } catch (err) {
      if (isNotModifiedError(err)) return;
      // fall through to safeReply
    }
  }
  await safeReply(ctx, text, extra);
}

// For navigating from a text screen to a photo screen (e.g. manhwa detail):
// - If previous message already has media, swap it via editMessageMedia
// - Otherwise delete the old text message and send a fresh photo
async function editOrReplyPhoto(
  ctx: any,
  photoFileId: string,
  caption: string,
  extra: any
) {
  const msg = ctx.callbackQuery?.message as any;
  if (msg) {
    const hasMedia = !!(msg.photo || msg.video);
    try {
      if (hasMedia) {
        await ctx.editMessageMedia(
          {
            type: "photo",
            media: photoFileId,
            caption,
            ...(extra?.parse_mode ? { parse_mode: extra.parse_mode } : {}),
          },
          { reply_markup: extra?.reply_markup }
        );
        return;
      } else {
        try {
          await ctx.deleteMessage();
        } catch {}
        await ctx.replyWithPhoto(photoFileId, { caption, ...extra });
        return;
      }
    } catch {
      // fall through
    }
  }
  try {
    await ctx.replyWithPhoto(photoFileId, { caption, ...extra });
  } catch {
    await safeReply(ctx, caption, extra);
  }
}

function parseEntities(json: string | null): any[] | undefined {
  if (!json) return undefined;
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) && arr.length > 0 ? arr : undefined;
  } catch {
    return undefined;
  }
}

async function showStartScreen(ctx: any) {
  const userId = ctx.from.id;
  clearUserState(userId);

  // Track user for broadcast list; detect new users to notify owner
  try {
    const { isNew } = await upsertBotUser({
      telegram_id: String(userId),
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      last_name: ctx.from.last_name || null,
    });

    if (isNew && !isOwner(userId)) {
      // Notify owner about new user joining (fires only once per unique user ID)
      try {
        const [totalSpend, userCount] = await Promise.all([
          getUserTotalSpend(String(userId)),
          getUserCount(),
        ]);
        const fullName = `${ctx.from.first_name || ""}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`.trim();
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
        const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        const mention = `<a href="tg://user?id=${userId}">${escHtml(fullName || "User")}</a>`;
        const usernamePart = ctx.from.username ? `@${escHtml(ctx.from.username)}` : "(username မရှိ)";

        await ctx.telegram.sendMessage(
          OWNER_ID,
          `🆕 <b>User အသစ် ဝင်လာပါပြီ!</b>\n\n` +
          `👤 <b>အမည်:</b> ${mention}\n` +
          `🔖 <b>Username:</b> ${usernamePart}\n` +
          `🆔 <b>ID:</b> <code>${userId}</code>\n` +
          `📅 <b>Date:</b> ${dateStr}\n` +
          `🕐 <b>Time:</b> ${timeStr}\n` +
          `💰 <b>Total Spend:</b> ${totalSpend.toLocaleString()} ကျပ်\n` +
          `\n👥 <b>Bot Total Users:</b> ${userCount.total} ယောက်`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        logger.error({ err }, "Failed to notify owner of new user");
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to upsert bot user");
  }

  const welcomeCaption = await getBotSetting("welcome_caption");
  const welcomeEntitiesJson = await getBotSetting("welcome_caption_entities");
  const welcomePhoto = await getBotSetting("welcome_photo_url");
  const mainChannelLink = await getBotSetting("main_channel_link");
  const mainChannelName = (await getBotSetting("main_channel_name")) || "Main Channel";
  const channels = await getAllActiveChannels();
  const botUsername = ctx.botInfo?.username || null;

  const caption = welcomeCaption || "မင်္ဂလာပါ! Manhwa Store မှ ကြိုဆိုပါသည်။";
  const entities = parseEntities(welcomeEntitiesJson);
  const keyboard = getStartKeyboard(
    mainChannelLink,
    mainChannelName,
    OWNER_ID,
    isOwner(userId),
    botUsername
  );

  if (welcomePhoto) {
    try {
      await ctx.replyWithPhoto(welcomePhoto, {
        caption,
        ...(entities ? { caption_entities: entities } : {}),
        ...keyboard,
      });
    } catch {
      await safeReply(ctx, caption, { ...(entities ? { entities } : {}), ...keyboard });
    }
  } else {
    await safeReply(ctx, caption, { ...(entities ? { entities } : {}), ...keyboard });
  }
}

async function showAdminPanel(ctx: any) {
  const userId = ctx.from.id;
  if (!isOwner(userId)) return;
  clearUserState(userId);

  const channels = await getAllActiveChannels();
  const text =
    `🔧 *Admin Panel*\n\n` +
    `📚 Manhwa စုစုပေါင်း: *${channels.length}*\n` +
    `💼 Owner ID: \`${OWNER_ID}\`\n\n` +
    `လုပ်ဆောင်လိုသည့် item ကို ရွေးပါ:`;

  try {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      ...getAdminPanelKeyboard(),
    });
  } catch {
    await safeReply(ctx, text, {
      parse_mode: "Markdown",
      ...getAdminPanelKeyboard(),
    });
  }
}

export function registerHandlers(bot: Telegraf) {
  // ===== User ↔ Owner Relay =====
  const forwardedMap = new Map<number, number>();

  // ===== Button-Spam Rate Limiter =====
  // Track callback_query timestamps per user (in-memory, resets on restart).
  const clickLog = new Map<number, number[]>(); // userId → ms timestamps
  const SPAM_WINDOW_MS = 10_000; // 10 seconds
  const SPAM_THRESHOLD = 11;     // 11 clicks → warn

  // ===== Spam Warn Helper =====
  async function handleSpamWarn(userId: number, ctx: any): Promise<void> {
    try {
      const { warnNum, credits, shouldMute, shouldBan } = await addWarnGetState(String(userId));
      const user = await getBotUserById(String(userId));
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
      const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

      // Build warn message to user
      let warnText =
        `⚠️ <b>Warn - ${warnNum}/3</b>\n` +
        (shouldMute ? `Ban Type - 1Day Mute\n` : ``) +
        `Reason - Button Spam\n` +
        `Time - ${timeStr}\n` +
        `Date - ${dateStr}\n` +
        `You Id - <code>${userId}</code>\n` +
        `You Account Credit - -20 &gt; Now ${credits}\n\n` +
        `<i>Credit 0 ဖြစ်ရင် bot အသုံးပြုခွင့် Auto Banပါမယ်</i>`;

      await bot.telegram.sendMessage(userId, warnText, { parse_mode: "HTML" });

      // 3/3 → mute for 1 day
      if (shouldMute && !shouldBan) {
        const muteUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await muteUser(String(userId), muteUntil.toISOString());

        // Notify owner
        const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User";
        const uname = user?.username ? ` @${escHtml(user.username)}` : "";
        const muteStr = muteUntil.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) +
          " " + muteUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
        await bot.telegram.sendMessage(
          OWNER_ID,
          `🔇 <b>User Muted (Button Spam)</b>\n\n` +
          `👤 ${escHtml(fullName)}${uname}\n` +
          `🆔 <code>${userId}</code>\n` +
          `⚠️ Warns: 3/3\n` +
          `💰 Credits: ${credits}\n` +
          `🗓 Muted Until: ${muteStr}`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🔊 Unmute", callback_data: `owner_unmute_${userId}` },
                  { text: "🚫 Ban",    callback_data: `owner_ban_${userId}` },
                ],
              ],
            },
          }
        );
      }

      // Credits hit 0 → auto-ban
      if (shouldBan) {
        await banUser(String(userId));
        await bot.telegram.sendMessage(
          userId,
          `🚫 <b>Account Banned</b>\n\nCredit 0 ဖြစ်သောကြောင့် Bot အသုံးပြုခွင့် ပိတ်ပါပြီ။\nAdmin ကို ဆက်သွယ်ပါ။`,
          { parse_mode: "HTML" }
        );
        const user2 = await getBotUserById(String(userId));
        const fullName2 = [user2?.first_name, user2?.last_name].filter(Boolean).join(" ") || "User";
        const uname2 = user2?.username ? ` @${escHtml(user2.username)}` : "";
        await bot.telegram.sendMessage(
          OWNER_ID,
          `🚫 <b>User Auto-Banned (Credit 0)</b>\n\n👤 ${escHtml(fullName2)}${uname2}\n🆔 <code>${userId}</code>`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Unban", callback_data: `owner_unban_${userId}` }],
              ],
            },
          }
        );
      }
    } catch (err) {
      logger.error({ err }, "handleSpamWarn failed");
    }
  }

  // ===== Callback-Query Gate: Ban / Mute / Rate-Limit checks =====
  bot.use(async (ctx: any, next: any) => {
    if (!ctx.callbackQuery || !ctx.from) return next();
    const userId = ctx.from.id;
    if (isOwner(userId)) return next();

    // Ensure user exists in DB before status check
    const status = await getUserStatus(String(userId)).catch(() => null);
    if (!status) return next();

    // 1. Banned → block all callbacks
    if (status.is_banned) {
      await ctx.answerCbQuery("❌ Bot အသုံးပြုခွင့် ပိတ်ထားသည်").catch(() => {});
      return;
    }

    // 2. Muted → check expiry
    if (status.muted_until) {
      const muteEnd = new Date(status.muted_until);
      if (muteEnd > new Date()) {
        const muteStr = muteEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) +
          " " + muteEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
        await ctx.answerCbQuery(`🔇 ${muteStr} အထိ Mute ဖြစ်နေသည်`).catch(() => {});
        return;
      }
      // Mute expired — lift it
      await unmuteUser(String(userId)).catch(() => {});
    }

    // 3. Rate limit — track click timestamps
    const now = Date.now();
    const prev = (clickLog.get(userId) || []).filter((t) => now - t < SPAM_WINDOW_MS);
    prev.push(now);
    clickLog.set(userId, prev);

    if (prev.length >= SPAM_THRESHOLD) {
      clickLog.delete(userId); // reset counter so warn isn't repeated every click
      await ctx.answerCbQuery("⚠️ Spam detected!").catch(() => {});
      await handleSpamWarn(userId, ctx);
      return;
    }

    return next();
  });

  bot.use(async (ctx, next) => {
    const message: any = (ctx as any).message;
    if (!message || !ctx.from || !ctx.chat) return next();

    const userId = ctx.from.id;

    // ----- Owner replying to a forwarded user message → relay back -----
    if (isOwner(userId)) {
      const replyTo = message.reply_to_message;
      if (replyTo) {
        const targetUserId = forwardedMap.get(replyTo.message_id);
        if (targetUserId) {
          try {
            await ctx.telegram.copyMessage(
              targetUserId,
              ctx.chat.id,
              message.message_id
            );
            await safeReply(ctx, "✅ User ဆီ ပြန်ပို့ပြီးပါပြီ");
          } catch (err: any) {
            const desc = String(err?.description || err?.message || "");
            logger.warn({ err: desc, targetUserId }, "Owner reply relay failed");
            await safeReply(
              ctx,
              `❌ User ဆီ ပြန်ပို့ မရပါ။\n<blockquote>${escHtml(desc)}</blockquote>`,
              { parse_mode: "HTML" }
            );
          }
          return; // handled — do not pass to other handlers
        }
      }
      return next();
    }

    // ----- Non-owner sending a message → forward to owner if no active flow -----
    const state = getUserState(userId);
    if (state.action) return next(); // user is in purchase / restore / etc.
    if (typeof message.text === "string" && message.text.startsWith("/")) {
      return next(); // commands like /start
    }

    // Skip pure callback / channel posts / forwarded service messages
    const isRelayable =
      message.text ||
      message.photo ||
      message.video ||
      message.voice ||
      message.audio ||
      message.document ||
      message.sticker ||
      message.animation ||
      message.video_note;
    if (!isRelayable) return next();

    try {
      const fullName = `${ctx.from.first_name || ""}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`.trim();
      const mention = `<a href="tg://user?id=${userId}">${escHtml(fullName || "User")}</a>`;
      const usernamePart = ctx.from.username ? ` · @${escHtml(ctx.from.username)}` : "";

      // Detect media type label for owner's info header
      let mediaLabel = "💬 Text";
      if (message.photo) mediaLabel = "🖼️ Photo";
      else if (message.video) mediaLabel = "🎬 Video";
      else if (message.voice) mediaLabel = "🎤 Voice";
      else if (message.audio) mediaLabel = "🎵 Audio";
      else if (message.document) mediaLabel = "📄 Document";
      else if (message.sticker) mediaLabel = "😄 Sticker";
      else if (message.animation) mediaLabel = "🎞️ GIF";
      else if (message.video_note) mediaLabel = "⭕ Video Note";

      // 1. Info header — one compact message so owner knows who & what
      await ctx.telegram.sendMessage(
        OWNER_ID,
        `📨 ${mention}${usernamePart}\n` +
          `🆔 <code>${userId}</code> · ${mediaLabel}\n` +
          `<blockquote>↩️ Reply ဆွဲပြီး ပြန်ပို့ပါ — User ဆီ အလိုအလျောက် ရောက်ပါမည်</blockquote>`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } as any }
      );

      // 2. Forward the actual message (shows "Forwarded from [User]" header in Telegram)
      const forwarded = await ctx.telegram.forwardMessage(
        OWNER_ID,
        ctx.chat.id,
        message.message_id
      );
      forwardedMap.set(forwarded.message_id, userId);

      // Trim the map if it grows too large (keep last 1000 entries)
      if (forwardedMap.size > 1000) {
        const firstKey = forwardedMap.keys().next().value;
        if (firstKey !== undefined) forwardedMap.delete(firstKey);
      }

      // Acknowledge to user so they know the message reached the owner
      try {
        await ctx.telegram.sendMessage(
          userId,
          `✅ သင့်စာ Admin ဆီ ရောက်ပါပြီ။ ခဏ စောင့်ပါ။`,
          { reply_parameters: { message_id: message.message_id } } as any
        );
      } catch {
        // ack failure is non-critical
      }
    } catch (err) {
      logger.error({ err }, "Failed to relay user message to owner");
    }
    // After relaying, stop — no other handler should react to this message.
    return;
  });

  // ===== /start =====
  bot.start(async (ctx) => {
    try {
      await showStartScreen(ctx);
    } catch (err) {
      logger.error({ err }, "Error in /start handler");
      await safeReply(ctx, "တစ်ခုခု မှားသွားပါသည်။ /start ကို ထပ်ကြိုးစားပါ။");
    }
  });

  // ===== /admin (quick access for owner) =====
  bot.command("admin", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await showAdminPanel(ctx);
  });

  // ===== /backup (owner only) — exports all data as a JSON file =====
  bot.command("backup", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await ctx.replyWithDocument(
        {
          source: Buffer.from(json, "utf-8"),
          filename: `manhwa-backup-${ts}.json`,
        },
        {
          caption:
            `💾 *Backup ပြီးပါပြီ*\n\n` +
            `📚 Manhwa: *${data.channels.length}*\n` +
            `⚙️ Settings: *${data.bot_settings.length}*\n` +
            `🛒 Purchases: *${data.purchases.length}*\n\n` +
            `ပြန်လည်ဆင်းသွင်းရန်: \`/restore\` ကို နှိပ်ပြီး ဤ JSON ဖိုင်ကို ပြန်ပို့ပါ`,
          parse_mode: "Markdown",
        }
      );
    } catch (err) {
      logger.error({ err }, "Backup failed");
      await safeReply(ctx, "❌ Backup ထုတ်၍ မရပါ။ နောက်မှ ထပ်ကြိုးစားပါ။");
    }
  });

  // ===== /restore (owner only) — set state to wait for backup file =====
  bot.command("restore", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    setUserState(ctx.from.id, { action: "waiting_restore_file" });
    await safeReply(
      ctx,
      "♻️ *Restore Mode*\n\n" +
        "Backup JSON ဖိုင်ကို Document အဖြစ် ပြန်ပို့ပါ။\n\n" +
        "⚠️ *သတိ:* ယခု database ထဲက data အားလုံးကို ဖယ်ပြီး backup ထဲက data နဲ့ အစားထိုးပါမည်။",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [dangerCallback("❌ ပယ်ဖျက်ရန်", "cancel_restore")],
        ]),
      }
    );
  });

  // Admin panel button shortcuts → run the same flows
  bot.action("admin_backup", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await ctx.replyWithDocument(
        {
          source: Buffer.from(json, "utf-8"),
          filename: `manhwa-backup-${ts}.json`,
        },
        {
          caption:
            `💾 *Backup ပြီးပါပြီ*\n\n` +
            `📚 Manhwa: *${data.channels.length}*\n` +
            `⚙️ Settings: *${data.bot_settings.length}*\n` +
            `🛒 Purchases: *${data.purchases.length}*\n` +
            `👥 Users: *${data.users?.length ?? 0}*`,
          parse_mode: "Markdown",
        }
      );
    } catch (err) {
      logger.error({ err }, "Backup failed (admin button)");
      await safeReply(ctx, "❌ Backup ထုတ်၍ မရပါ။");
    }
  });

  bot.action("admin_restore", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    setUserState(ctx.from.id, { action: "waiting_restore_file" });
    await editOrReply(
      ctx,
      "♻️ *Restore Mode*\n\n" +
        "Backup JSON ဖိုင်ကို Document အဖြစ် ပြန်ပို့ပါ။\n\n" +
        "⚠️ *သတိ:* ယခု database ထဲက data အားလုံးကို ဖယ်ပြီး backup ထဲက data နဲ့ အစားထိုးပါမည်။",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [dangerCallback("❌ ပယ်ဖျက်ရန်", "cancel_restore")],
        ]),
      }
    );
  });

  bot.action("cancel_restore", async (ctx) => {
    await ctx.answerCbQuery();
    clearUserState(ctx.from.id);
    await editOrReply(ctx, "❌ Restore ပယ်ဖျက်ပြီး။");
  });

  // ===== Broadcast =====
  bot.action("admin_broadcast", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    const counts = await getUserCount();
    setUserState(ctx.from.id, {
      action: "broadcast_wait_content",
      broadcastButtons: [],
    });
    await editOrReply(
      ctx,
      `📣 <b>Broadcast Mode</b>\n\n` +
        `👥 လက်ရှိ user: <b>${counts.active}</b> ယောက် (စုစုပေါင်း ${counts.total})\n\n` +
        `ပို့လိုသော <b>စာ</b> သို့မဟုတ် <b>ပုံ + caption</b> ကို ပို့ပါ။\n` +
        `<blockquote>HTML format / blockquote / bold / italic အားလုံး အသုံးပြုနိုင်ပါတယ်။\nTelegram အတွင်းပဲ format လုပ်ပြီး ပို့လိုက်ပါ — bot က entities တွေ ထိန်းသိမ်းပေးပါမယ်။</blockquote>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [dangerCallback("❌ ပယ်ဖျက်ရန်", "broadcast_cancel")],
        ]),
      }
    );
  });

  bot.action("broadcast_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    clearUserState(ctx.from.id);
    await editOrReply(ctx, "❌ Broadcast ပယ်ဖျက်ပြီး။");
  });

  bot.action("broadcast_add_button", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    const state = getUserState(ctx.from.id);
    if (!state.broadcastText && !state.broadcastPhotoFileId) {
      await safeReply(ctx, "❌ ပထမ broadcast message ပို့ပေးပါ။");
      return;
    }
    updateUserState(ctx.from.id, { action: "broadcast_wait_button_label" });
    await safeReply(
      ctx,
      `🔘 <b>Button Label</b>\n\nButton မှာ ပြသမည့် စာသား ရိုက်ပါ။\n<blockquote>ဥပမာ: 📢 Channel သို့ ဝင်ရန်</blockquote>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [dangerCallback("❌ ပယ်ဖျက်ရန်", "broadcast_cancel")],
        ]),
      }
    );
  });

  bot.action("broadcast_send", async (ctx) => {
    await ctx.answerCbQuery();
    if (!isOwner(ctx.from.id)) return;
    const ownerId = ctx.from.id;
    const state = getUserState(ownerId);
    if (!state.broadcastText && !state.broadcastPhotoFileId) {
      await safeReply(ctx, "❌ ပို့စရာ message မရှိပါ။");
      return;
    }

    const userIds = await getActiveUserIds();
    const total = userIds.length;
    if (total === 0) {
      clearUserState(ownerId);
      await safeReply(ctx, "❌ User စာရင်းထဲမှာ မည်သူမှ မရှိသေးပါ။");
      return;
    }

    const buttons = state.broadcastButtons || [];
    const inlineKeyboard = buttons.length
      ? buttons.map((b) => [{ text: b.label, url: b.url, style: "success" } as any])
      : undefined;
    const replyMarkup = inlineKeyboard
      ? { inline_keyboard: inlineKeyboard }
      : undefined;

    const text = state.broadcastText || "";
    const entities = state.broadcastEntities;
    const photoId = state.broadcastPhotoFileId;

    await safeReply(
      ctx,
      `📤 Broadcast စတင်ပို့နေပါသည်...\n👥 ${total} ယောက်ဆီ ပို့မည်`,
      { parse_mode: "HTML" }
    );

    let sent = 0;
    let failed = 0;
    const BATCH_SIZE = 5;
    const PAUSE_MS = 1500;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (uid) => {
          try {
            if (photoId) {
              await ctx.telegram.sendPhoto(uid, photoId, {
                caption: text || undefined,
                caption_entities: entities,
                reply_markup: replyMarkup,
              } as any);
            } else {
              await ctx.telegram.sendMessage(uid, text, {
                entities,
                reply_markup: replyMarkup,
                link_preview_options: { is_disabled: true },
              } as any);
            }
            sent++;
          } catch (err: any) {
            failed++;
            const desc = String(err?.description || err?.message || "");
            if (
              desc.includes("blocked") ||
              desc.includes("user is deactivated") ||
              desc.includes("chat not found")
            ) {
              try {
                await markUserBlocked(uid);
              } catch {}
            }
            logger.warn({ err: desc, uid }, "Broadcast send failed");
          }
        })
      );
      if (i + BATCH_SIZE < userIds.length) {
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    }

    clearUserState(ownerId);
    await safeReply(
      ctx,
      `✅ <b>Broadcast ပြီးပါပြီ!</b>\n\n` +
        `📤 အောင်မြင်: <b>${sent}</b>\n` +
        `❌ မအောင်မြင်: <b>${failed}</b>\n` +
        `👥 စုစုပေါင်း: <b>${total}</b>`,
      { parse_mode: "HTML" }
    );
  });

  // Handle owner sending broadcast content (text or photo)
  async function handleBroadcastContent(ctx: any) {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    const msg = ctx.message;
    if (!msg) return false;

    if (state.action === "broadcast_wait_content") {
      const photo = msg.photo?.[msg.photo.length - 1];
      if (photo) {
        updateUserState(userId, {
          action: "broadcast_preview",
          broadcastPhotoFileId: photo.file_id,
          broadcastText: msg.caption || "",
          broadcastEntities: msg.caption_entities || undefined,
        });
      } else if (typeof msg.text === "string" && msg.text.trim()) {
        updateUserState(userId, {
          action: "broadcast_preview",
          broadcastPhotoFileId: undefined,
          broadcastText: msg.text,
          broadcastEntities: msg.entities || undefined,
        });
      } else {
        await safeReply(ctx, "❌ စာ သို့မဟုတ် ပုံသာ ပို့ပေးပါ။");
        return true;
      }
      await showBroadcastPreview(ctx);
      return true;
    }

    if (state.action === "broadcast_wait_button_label") {
      const label = msg.text?.trim();
      if (!label) {
        await safeReply(ctx, "❌ Button label ရိုက်ပေးပါ။");
        return true;
      }
      updateUserState(userId, {
        action: "broadcast_wait_button_url",
        broadcastPendingButtonLabel: label,
      });
      await safeReply(
        ctx,
        `🔗 <b>Button URL</b>\n\nButton အတွက် link (URL) ကို ပို့ပေးပါ။\n<blockquote>ဥပမာ: https://t.me/yourchannel</blockquote>`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [dangerCallback("❌ ပယ်ဖျက်ရန်", "broadcast_cancel")],
          ]),
        }
      );
      return true;
    }

    if (state.action === "broadcast_wait_button_url") {
      const url = msg.text?.trim();
      if (!url || !/^https?:\/\/|^tg:\/\//i.test(url)) {
        await safeReply(
          ctx,
          "❌ မှန်ကန်တဲ့ URL ပို့ပေးပါ (https://... သို့မဟုတ် tg://...)"
        );
        return true;
      }
      const label = state.broadcastPendingButtonLabel || "Open";
      const buttons = [...(state.broadcastButtons || []), { label, url }];
      updateUserState(userId, {
        action: "broadcast_preview",
        broadcastButtons: buttons,
        broadcastPendingButtonLabel: undefined,
      });
      await showBroadcastPreview(ctx);
      return true;
    }

    return false;
  }

  async function showBroadcastPreview(ctx: any) {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    const text = state.broadcastText || "";
    const entities = state.broadcastEntities;
    const photoId = state.broadcastPhotoFileId;
    const buttons = state.broadcastButtons || [];

    const previewMarkup = buttons.length
      ? {
          inline_keyboard: buttons.map((b) => [
            { text: b.label, url: b.url, style: "success" } as any,
          ]),
        }
      : undefined;

    await safeReply(ctx, "👁 <b>Preview</b>", { parse_mode: "HTML" });

    try {
      if (photoId) {
        await ctx.telegram.sendPhoto(ctx.chat.id, photoId, {
          caption: text || undefined,
          caption_entities: text ? entities : undefined,
          reply_markup: previewMarkup,
        } as any);
      } else if (text && text.trim()) {
        await ctx.telegram.sendMessage(ctx.chat.id, text, {
          entities,
          reply_markup: previewMarkup,
          link_preview_options: { is_disabled: true },
        } as any);
      } else {
        await safeReply(
          ctx,
          "⚠️ ပြသရန် content မရှိပါ။ ပြန်စတင်ရန် Cancel နှိပ်ပါ။"
        );
      }
    } catch (err) {
      logger.error({ err }, "Broadcast preview failed");
      await safeReply(ctx, "⚠️ Preview ပြ၍ မရပါ — format ပြန်စစ်ပေးပါ။");
    }

    const counts = await getUserCount();
    await safeReply(
      ctx,
      `👥 ပို့ရမည့် user: <b>${counts.active}</b> ယောက်\n🔘 Button: <b>${buttons.length}</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [successCallback("📤 Broadcast ပို့ရန်", "broadcast_send")],
          [primaryCallback("➕ Button ထည့်ရန်", "broadcast_add_button")],
          [dangerCallback("❌ ပယ်ဖျက်ရန်", "broadcast_cancel")],
        ]),
      }
    );
  }

  // Expose to message handlers below
  (bot as any).__handleBroadcastContent = handleBroadcastContent;

  // ===== Document handler for restore =====
  bot.on("document", async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return;
    const state = getUserState(userId);
    if (state.action !== "waiting_restore_file") return;

    const doc = ctx.message.document;
    if (!doc) return;

    try {
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const text = await res.text();
      const data = JSON.parse(text);
      const result = await importAllData(data);
      clearUserState(userId);
      await safeReply(
        ctx,
        `✅ *Restore အောင်မြင်ပါပြီ!*\n\n` +
          `📚 Manhwa: *${result.channels}*\n` +
          `⚙️ Settings: *${result.bot_settings}*\n` +
          `🛒 Purchases: *${result.purchases}*\n` +
          `👥 Users: *${result.users}*`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      logger.error({ err }, "Restore failed");
      clearUserState(userId);
      const msg = err instanceof Error ? err.message : String(err);
      await safeReply(ctx, `❌ Restore မအောင်မြင်ပါ: ${msg}`);
    }
  });

  // ===== Help =====
  bot.action("help", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrReply(
      ctx,
      "📖 *အသုံးပြုနည်း*\n\n" +
        "1️⃣ Manhwaစာရင်းမှ ကြိုက်သောကားကို ရွေးပါ\n" +
        "2️⃣ Review ကြည့်ပြီး ဝယ်ယူရန် နှိပ်ပါ\n" +
        "3️⃣ ငွေပေးချေမှု နည်းလမ်း ရွေးပါ (Wave / KPay)\n" +
        "4️⃣ ပြေစာ Screenshot ပို့ပါ\n" +
        "5️⃣ Owner မှ အတည်ပြုပြီးနောက် Channel Invite Link ရပါမည်\n\n" +
        "❓ အကူအညီ လိုအပ်ပါက Admin ကို ဆက်သွယ်ပါ",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [successUrl("📞 Admin ကို ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
          [
            primaryCallback("📚 Manhwaစာရင်း", "back_to_list"),
            primaryCallback("🏠 ပင်မ", "back_to_start"),
          ],
        ]),
      }
    );
  });

  // ===== Back to start (home) =====
  bot.action("back_to_start", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch {}
    await showStartScreen(ctx);
  });

  // ===== Show manhwa list (separate button) =====
  bot.action("show_manhwa_list", async (ctx) => {
    await ctx.answerCbQuery();
    const channels = await getAllActiveChannels();
    if (channels.length === 0) {
      await editOrReply(ctx, "Manhwaများ မရှိသေးပါ။ မကြာမီ ထည့်သွင်းပါမည် 😊");
      return;
    }
    await editOrReply(
      ctx,
      "🌷 <blockquote>ကြိုက်နှစ်သက်သော Manhwaကို ရွေးပါ</blockquote>",
      { parse_mode: "HTML", ...getManhwaListKeyboard(channels) }
    );
  });

  // ===== About bot =====
  bot.action("about_bot", async (ctx) => {
    await ctx.answerCbQuery();
    await editOrReply(
      ctx,
      "🌸 <b>Manhwa Store Bot</b> 🌸\n" +
        "<blockquote>" +
        "💗 မြန်မာဘာသာဖြင့် Manhwa များ ဝယ်ယူနိုင်သော Bot\n" +
        "🌷 Wave Pay နှင့် KPay ဖြင့် ငွေပေးချေနိုင်သည်\n" +
        "💌 ငွေပေးပြီးပါက One-time Invite Link ရရှိမည်\n" +
        "🎀 လုံခြုံစိတ်ချစွာ ဝယ်ယူနိုင်သည်" +
        "</blockquote>",
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [successUrl("💌 Admin ကို ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
          [primaryCallback("🏠 ပင်မ စာမျက်နှာ", "back_to_start")],
        ]),
      }
    );
  });

  // ===== Payment help =====
  bot.action(/^pay_help_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    await editOrReply(
      ctx,
      "ℹ️ *ငွေပေးချေနည်း လမ်းညွှန်*\n\n" +
        "1️⃣ Wave Pay (သို့) KPay ထဲမှ တစ်ခု ရွေးပါ\n" +
        "2️⃣ ပြသထားသော ဖုန်းနံပါတ်/နာမည်သို့ ငွေလွှဲပါ\n" +
        "3️⃣ လွှဲပြီးနောက် Screenshot ကို ပြန်ပို့ပါ\n" +
        "4️⃣ Owner အတည်ပြုပြီးနောက် Channel Link ရပါမည်\n\n" +
        "⚠️ Screenshot မထင်ရှားပါက ပြန်ပို့ခိုင်းနိုင်သည်",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [primaryCallback("🔙 ငွေပေးနည်း ရွေးရန်", `buy_${channelDbId}`)],
          [successUrl("📞 Admin ကို ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
        ]),
      }
    );
  });

  // ===== Back to manhwa list =====
  bot.action("back_to_list", async (ctx) => {
    await ctx.answerCbQuery();
    clearUserState(ctx.from.id);
    const channels = await getAllActiveChannels();
    if (channels.length > 0) {
      try {
        await ctx.editMessageText(
          "🌷 <blockquote>ကြိုက်နှစ်သက်သော Manhwaကို ရွေးပါ</blockquote>",
          { parse_mode: "HTML", ...getManhwaListKeyboard(channels) }
        );
      } catch {
        await safeReply(
          ctx,
          "🌷 <blockquote>ကြိုက်နှစ်သက်သော Manhwaကို ရွေးပါ</blockquote>",
          { parse_mode: "HTML", ...getManhwaListKeyboard(channels) }
        );
      }
    } else {
      await safeReply(ctx, "Manhwaများ မရှိသေးပါ။");
    }
  });

  // ===== Manhwa selection (User flow) =====
  bot.action(/^manhwa_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) {
      await safeReply(ctx, "Manhwa မတွေ့ပါ။");
      return;
    }

    setUserState(ctx.from.id, {
      selectedManhwa: channel.manhwa_title,
      selectedChannelId: channel.channel_id,
    });

    const text =
      `📖 <b>${escHtml(channel.manhwa_title)}</b>\n` +
      (channel.description
        ? `<blockquote expandable>${escHtml(channel.description)}</blockquote>\n`
        : "") +
      `💰 ဈေးနှုန်း: <b>${channel.price.toLocaleString()} ကျပ်</b>`;

    const botUsername = ctx.botInfo?.username || null;
    if (channel.review_photo_url) {
      try {
        await editOrReplyPhoto(ctx, channel.review_photo_url, text, {
          parse_mode: "HTML",
          ...getManhwaDetailKeyboard(channel.id, botUsername),
        });
        return;
      } catch (err) {
        logger.error({ err }, "Failed to send review photo");
      }
    }
    await editOrReply(ctx, text, {
      parse_mode: "HTML",
      ...getManhwaDetailKeyboard(channel.id, botUsername),
    });
  });

  // ===== Buy button =====
  bot.action(/^buy_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) {
      await editOrReply(ctx, "Manhwa မတွေ့ပါ။");
      return;
    }
    await editOrReply(ctx, `💳 *${escMd(channel.manhwa_title)}* အတွက် ငွေပေးချေမှုနည်းလမ်း ရွေးပါ:`, {
      parse_mode: "Markdown",
      ...getPaymentKeyboard(channel.id),
    });
  });

  // ===== Wave Pay =====
  bot.action(/^pay_wave_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) return;

    const purchase = await createPurchase({
      user_id: String(ctx.from.id),
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      channel_id: channel.channel_id,
      payment_method: "wave",
    });

    setUserState(ctx.from.id, {
      action: "waiting_screenshot",
      selectedManhwa: channel.manhwa_title,
      selectedChannelId: channel.channel_id,
      paymentMethod: "wave",
      purchaseId: purchase.id,
    });

    await editOrReply(
      ctx,
      `💳 <b>Wave Pay ဖြင့် ငွေပေးချေရန်</b>\n` +
        `<blockquote expandable>` +
        `📖 Manhwa: <b>${escHtml(channel.manhwa_title)}</b>\n` +
        `💰 ငွေပမာဏ: <b>${channel.price.toLocaleString()} ကျပ်</b>\n` +
        `📱 Wave Pay နံပါတ်:09793251923 \n` +
        `👤 အမည်: Than Htike Aung\n` +
        `📸 ဒီနေရာမှာ ငွေလဲပီးပါက ပြေစာပို့ပေးပါ` +
        `</blockquote>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [successUrl("💌 Admin ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
          [primaryCallback("🔙 ငွေပေးနည်း ပြောင်းရန်", `buy_${channelDbId}`)],
        ]),
      }
    );
  });

  // ===== KPay =====
  bot.action(/^pay_kpay_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) return;

    const purchase = await createPurchase({
      user_id: String(ctx.from.id),
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      channel_id: channel.channel_id,
      payment_method: "kpay",
    });

    setUserState(ctx.from.id, {
      action: "waiting_screenshot",
      selectedManhwa: channel.manhwa_title,
      selectedChannelId: channel.channel_id,
      paymentMethod: "kpay",
      purchaseId: purchase.id,
    });

    await editOrReply(
      ctx,
      `💎 <b>KPay ဖြင့် ငွေပေးချေရန်</b>\n` +
        `<blockquote expandable>` +
        `📖 Manhwa: <b>${escHtml(channel.manhwa_title)}</b>\n` +
        `💰 ငွေပမာဏ: <b>${channel.price.toLocaleString()} ကျပ်</b>\n` +
        `📱 KPay နံပါတ်: <code>${escHtml(KPAY_PHONE)}</code>\n` +
        `👤 အမည်: <b>${escHtml(KPAY_NAME)}</b>\n` +
        `📸 ဒီနေရာမှာ ငွေလဲပီးပါက ပြေစာပို့ပေးပါ` +
        `</blockquote>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            copyButton("📋 ဖုန်းနံပါတ် Copy", KPAY_PHONE),
            copyButton("📋 အမည် Copy", KPAY_NAME),
          ],
          [successUrl("💌 Admin ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
          [primaryCallback("🔙 ငွေပေးနည်း ပြောင်းရန်", `buy_${channelDbId}`)],
        ]),
      }
    );
  });

  // ===== Owner: Confirm Purchase =====
  bot.action(/^confirm_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) {
      await ctx.answerCbQuery("Permission မရှိပါ။");
      return;
    }
    await ctx.answerCbQuery("Processing...");

    const purchaseId = parseInt(ctx.match[1], 10);
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      await safeReply(ctx, "Purchase မတွေ့ပါ။");
      return;
    }
    if (purchase.status !== "pending") {
      await safeReply(ctx, `ဤ Purchase ကို လုပ်ဆောင်ပြီးသား: ${purchase.status}`);
      return;
    }

    try {
      const channelIdNum = parseInt(purchase.channel_id, 10);
      const inviteResult = await bot.telegram.createChatInviteLink(channelIdNum, {
        member_limit: 1,
        name: `Purchase #${purchaseId}`,
      });

      const inviteLink = inviteResult.invite_link;
      await confirmPurchase(purchaseId, inviteLink);

      const userIdNum = parseInt(purchase.user_id, 10);

      // First: send "Thank You" message (quoting style — sent first so it appears above)
      await bot.telegram.sendMessage(
        userIdNum,
        `🫶🏻 Thank You For Supporting 🌷`,
        {}
      );

      // Second: send the invite link message
      const userMessage =
        `✅ *မင်္ဂလာပါ လူကြီးမင်း!*\n\n` +
        `လူကြီးမင်း Paid ဝင်လိုက်သော Manhwaရဲ့\n` +
        `🔗 *1 Invite Link*\n` +
        `(တစ်ဦးတစ်ယောက်သာ ဝင်လို့ရသော Link ဖြစ်ပါသဖြင့် မည်သူ့မှ မျှဝေပါနှင့်)\n\n` +
        `Link နှိပ်ပြီး တန်းဝင်ပေးပါ 👇\n\n` +
        `${inviteLink}\n\n` +
        `⚠️ တန်းဝင်ပါ - Link တစ်ခါသာ အသုံးပြုနိုင်ပါ`;

      await bot.telegram.sendMessage(userIdNum, userMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📞 Admin ကို ဆက်သွယ်ရန်", url: `tg://user?id=${OWNER_ID}`, style: "success" } as any],
          ],
        },
      });

      const originalCaption =
        (ctx.callbackQuery.message as { caption?: string; text?: string } | undefined)?.caption ||
        (ctx.callbackQuery.message as { text?: string } | undefined)?.text ||
        "";

      try {
        if ((ctx.callbackQuery.message as any)?.caption !== undefined) {
          await ctx.editMessageCaption(
            originalCaption + `\n\n✅ Confirmed!\n${inviteLink}`
          );
        } else {
          await ctx.editMessageText(
            originalCaption + `\n\n✅ Confirmed!\n${inviteLink}`
          );
        }
      } catch {
        await safeReply(ctx, `✅ Confirmed!\n${inviteLink}`);
      }
    } catch (err) {
      logger.error({ err }, "Error creating invite link");
      await safeReply(
        ctx,
        `❌ Invite link ထုတ်ရာတွင် အမှားဖြစ်သည်။\n\n` +
          `**လိုအပ်ချက်:**\n` +
          `• Bot သည် Channel ၏ Admin ဖြစ်ရမည်\n` +
          `• "Invite Users via Link" permission ရှိရမည်\n\n` +
          `Error: ${String(err)}`
      );
    }
  });

  // ===== Owner: Cancel Purchase =====
  bot.action(/^cancel_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) {
      await ctx.answerCbQuery("Permission မရှိပါ။");
      return;
    }
    await ctx.answerCbQuery("Cancelled");

    const purchaseId = parseInt(ctx.match[1], 10);
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      await safeReply(ctx, "Purchase မတွေ့ပါ။");
      return;
    }

    await cancelPurchase(purchaseId);

    try {
      await bot.telegram.sendMessage(
        parseInt(purchase.user_id, 10),
        `❌ Purchase #${purchaseId} ကို ပယ်ဖျက်လိုက်ပါသည်။\nမေးခွန်းများ ရှိပါက Admin ကို ဆက်သွယ်ပါ။`
      );
    } catch (err) {
      logger.error({ err }, "Failed to notify user of cancellation");
    }

    const originalCaption =
      (ctx.callbackQuery.message as { caption?: string; text?: string } | undefined)?.caption ||
      (ctx.callbackQuery.message as { text?: string } | undefined)?.text ||
      "";

    try {
      if ((ctx.callbackQuery.message as any)?.caption !== undefined) {
        await ctx.editMessageCaption(originalCaption + "\n\n❌ Cancelled by owner.");
      } else {
        await ctx.editMessageText(originalCaption + "\n\n❌ Cancelled by owner.");
      }
    } catch {
      await safeReply(ctx, "❌ Cancelled.");
    }
  });

  // =====================================
  // ===== ADMIN PANEL ACTIONS ===========
  // =====================================

  bot.action("admin_panel", async (ctx) => {
    if (!isOwner(ctx.from.id)) {
      await ctx.answerCbQuery("Permission မရှိပါ။");
      return;
    }
    await ctx.answerCbQuery();
    await showAdminPanel(ctx);
  });

  bot.action("admin_close", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery("ပိတ်လိုက်ပါပြီ");
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
  });

  bot.action(/^cancel_action_(.+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery("Cancelled");
    clearUserState(ctx.from.id);
    const returnTo = ctx.match[1];
    if (returnTo === "admin_panel") {
      await showAdminPanel(ctx);
    }
  });

  // ===== Add Manhwa =====
  bot.action("admin_add_manhwa", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    setUserState(ctx.from.id, { action: "add_step_channel" });
    try {
      await ctx.editMessageText(
        `➕ *Manhwa အသစ်ထည့်ရန် (Step 1/5)*\n\n` +
          `Channel ID ပို့ပါ\n` +
          `*သို့မဟုတ်* Channel ထဲက message တစ်ခုကို Forward လုပ်ပါ\n\n` +
          `_ဥပမာ Channel ID: -1001234567890_\n\n` +
          `⚠️ Bot ကို Channel ထဲ Admin အဖြစ် ထည့်ထားရန် မမေ့ပါနှင့်`,
        { parse_mode: "Markdown", ...getCancelKeyboard() }
      );
    } catch {
      await safeReply(
        ctx,
        `➕ *Manhwa အသစ်ထည့်ရန်*\n\nChannel ID ပို့ပါ သို့မဟုတ် Channel က message တစ်ခု Forward လုပ်ပါ`,
        { parse_mode: "Markdown", ...getCancelKeyboard() }
      );
    }
  });

  // ===== Manage Manhwa =====
  bot.action("admin_manage_manhwa", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    clearUserState(ctx.from.id);
    const channels = await getAllActiveChannels();
    if (channels.length === 0) {
      try {
        await ctx.editMessageText(
          "📋 *Manhwa စာရင်း*\n\nManhwa မရှိသေးပါ။ ➕ ဖြင့် ထည့်ပေးပါ။",
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [successCallback("➕ Manhwa ထည့်ရန်", "admin_add_manhwa")],
              [primaryCallback("🔙 Admin Panel", "admin_panel")],
            ]),
          }
        );
      } catch {
        await safeReply(ctx, "Manhwa မရှိသေးပါ။");
      }
      return;
    }

    try {
      await ctx.editMessageText(
        `📋 *Manhwa စာရင်း*\n\nစီမံခန့်ခွဲမည့် Manhwaကို ရွေးပါ:`,
        { parse_mode: "Markdown", ...getAdminManhwaListKeyboard(channels) }
      );
    } catch {
      await safeReply(ctx, `📋 Manhwa စာရင်း:`, getAdminManhwaListKeyboard(channels));
    }
  });

  bot.action(/^admin_edit_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) {
      await safeReply(ctx, "Channel မတွေ့ပါ။");
      return;
    }

    const text =
      `📖 *${escMd(channel.manhwa_title)}*\n\n` +
      `🆔 Channel ID: \`${channel.channel_id}\`\n` +
      `📛 Channel Name: ${escMd(channel.channel_name)}\n` +
      `💰 ဈေးနှုန်း: ${channel.price.toLocaleString()} ကျပ်\n` +
      `🖼️ Cover: ${channel.cover_photo_url ? "✅" : "❌"}\n` +
      `📸 Review: ${channel.review_photo_url ? "✅" : "❌"}\n` +
      `📝 ဖော်ပြချက်: ${channel.description ? "✅" : "❌"}`;

    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...getAdminEditManhwaKeyboard(channelDbId),
      });
    } catch {
      await safeReply(ctx, text, {
        parse_mode: "Markdown",
        ...getAdminEditManhwaKeyboard(channelDbId),
      });
    }
  });

  bot.action(/^edit_title_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    setUserState(ctx.from.id, { action: "edit_title", editChannelId: String(channelDbId) });
    await safeReply(ctx, "Manhwaအမည် အသစ် ရိုက်ပါ:", getCancelKeyboard());
  });

  bot.action(/^edit_price_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    setUserState(ctx.from.id, { action: "edit_price", editChannelId: String(channelDbId) });
    await safeReply(ctx, "ဈေးနှုန်း အသစ် (ကျပ်) ရိုက်ပါ:", getCancelKeyboard());
  });

  bot.action(/^edit_cover_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    setUserState(ctx.from.id, { action: "edit_cover", editChannelId: String(channelDbId) });
    await safeReply(ctx, "Cover Photo အသစ် ပို့ပါ:", getCancelKeyboard());
  });

  bot.action(/^edit_review_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    setUserState(ctx.from.id, { action: "edit_review", editChannelId: String(channelDbId) });
    await safeReply(ctx, "Review Photo အသစ် ပို့ပါ:", getCancelKeyboard());
  });

  bot.action(/^edit_desc_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    setUserState(ctx.from.id, { action: "edit_desc", editChannelId: String(channelDbId) });
    await safeReply(ctx, "ဖော်ပြချက် အသစ် ရိုက်ပါ:", getCancelKeyboard());
  });

  bot.action(/^delete_manhwa_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) return;
    try {
      await ctx.editMessageText(
        `🗑️ *${escMd(channel.manhwa_title)}* ကို ဖျက်မည်လား?\n\nဤ Manhwa ကို User စာရင်းမှ ဖယ်ထုတ်ပါမည်။`,
        { parse_mode: "Markdown", ...getDeleteConfirmKeyboard(channelDbId) }
      );
    } catch {
      await safeReply(ctx, `${channel.manhwa_title} ကို ဖျက်မည်လား?`, getDeleteConfirmKeyboard(channelDbId));
    }
  });

  bot.action(/^delete_confirm_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery("ဖျက်ပြီး");
    const channelDbId = parseInt(ctx.match[1], 10);
    const channel = await getChannelById(channelDbId);
    if (!channel) return;
    await removeChannel(channel.channel_id);
    try {
      await ctx.editMessageText(
        `✅ *${escMd(channel.manhwa_title)}* ကို ဖျက်ပြီးပါပြီ။`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [primaryCallback("🔙 Admin Panel", "admin_panel")],
          ]),
        }
      );
    } catch {
      await safeReply(ctx, "✅ ဖျက်ပြီးပါပြီ။");
    }
  });

  // ===== Welcome Settings =====
  bot.action("admin_welcome", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    clearUserState(ctx.from.id);
    const photo = await getBotSetting("welcome_photo_url");
    const caption = await getBotSetting("welcome_caption");
    const captionPreview = caption
      ? escMd(caption.slice(0, 200)) + (caption.length > 200 ? "..." : "")
      : "(မထည့်ရသေး)";
    const text =
      `🎨 *Welcome Settings*\n\n` +
      `🖼️ Photo: ${photo ? "✅ ထည့်ထားပြီး" : "❌ မထည့်ရသေး"}\n` +
      `📝 Caption:\n${captionPreview}`;

    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...getWelcomeSettingsKeyboard(),
      });
    } catch {
      await safeReply(ctx, text, { parse_mode: "Markdown", ...getWelcomeSettingsKeyboard() });
    }
  });

  bot.action("set_welcome_photo", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    setUserState(ctx.from.id, { action: "set_welcome_photo" });
    await safeReply(ctx, "🖼️ Welcome Photo ကို ပို့ပါ:", getCancelKeyboard());
  });

  bot.action("set_welcome_caption", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    setUserState(ctx.from.id, { action: "set_welcome_caption" });
    await safeReply(ctx, "📝 Welcome Caption (စာသား) ရိုက်ပါ:", getCancelKeyboard());
  });

  bot.action("preview_welcome", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery("Preview...");
    const photo = await getBotSetting("welcome_photo_url");
    const caption = (await getBotSetting("welcome_caption")) || "မင်္ဂလာပါ!";
    const entities = parseEntities(await getBotSetting("welcome_caption_entities"));
    if (photo) {
      try {
        await ctx.replyWithPhoto(photo, {
          caption,
          ...(entities ? { caption_entities: entities } : {}),
        });
      } catch {
        await safeReply(ctx, caption, entities ? { entities } : undefined);
        await safeReply(ctx, "(Photo error)");
      }
    } else {
      await safeReply(ctx, caption, entities ? { entities } : undefined);
    }
  });

  // ===== Main Channel Settings =====
  bot.action("admin_mainchannel", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    clearUserState(ctx.from.id);
    const link = await getBotSetting("main_channel_link");
    const name = await getBotSetting("main_channel_name");
    const text =
      `📢 *Main Channel Settings*\n\n` +
      `🔗 Link: ${link ? `\`${link}\`` : "(မထည့်ရသေး)"}\n` +
      `📛 Name: ${name ? `*${escMd(name)}*` : "(မထည့်ရသေး)"}`;

    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...getMainChannelSettingsKeyboard(),
      });
    } catch {
      await safeReply(ctx, text, { parse_mode: "Markdown", ...getMainChannelSettingsKeyboard() });
    }
  });

  bot.action("set_main_link", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    setUserState(ctx.from.id, { action: "set_main_link" });
    await safeReply(
      ctx,
      "🔗 Main Channel Link ပို့ပါ\n\n_ဥပမာ: https://t.me/yourchannel_",
      { parse_mode: "Markdown", ...getCancelKeyboard() }
    );
  });

  bot.action("remove_main_channel", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery("ဖယ်ရှားပြီး");
    await deleteBotSetting("main_channel_link");
    await deleteBotSetting("main_channel_name");
    await safeReply(ctx, "✅ Main Channel ဖယ်ရှားပြီးပါပြီ။", Markup.inlineKeyboard([
      [primaryCallback("🔙 Admin Panel", "admin_panel")],
    ]));
  });

  // ===== Purchases =====
  bot.action("admin_purchases", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    const purchases = await getRecentPurchases(10);
    if (purchases.length === 0) {
      try {
        await ctx.editMessageText("📊 *Purchase Records*\n\nMagic မရှိသေးပါ။", {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[primaryCallback("🔙 Admin Panel", "admin_panel")]]),
        });
      } catch {
        await safeReply(ctx, "Purchase မရှိသေးပါ။");
      }
      return;
    }
    const lines = purchases.map((p) => {
      const status = p.status === "confirmed" ? "✅" : p.status === "cancelled" ? "❌" : "⏳";
      const user = p.username ? `@${p.username}` : p.first_name || p.user_id;
      return `${status} #${p.id} | ${user} | ${p.payment_method.toUpperCase()}`;
    });
    const text = `📊 *နောက်ဆုံး Purchases (${purchases.length})*\n\n${lines.join("\n")}`;
    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[primaryCallback("🔙 Admin Panel", "admin_panel")]]),
      });
    } catch {
      await safeReply(ctx, text, { parse_mode: "Markdown" });
    }
  });

  // ===== Add Manhwa: Confirm step =====
  bot.action("confirm_add_manhwa", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery("Saving...");
    const state = getUserState(ctx.from.id);
    if (!state.draftChannelId || !state.draftManhwaTitle || state.draftPrice === undefined) {
      await safeReply(ctx, "Data မပြည့်စုံပါ။ Cancel ပြီး ပြန်စပါ။");
      return;
    }
    await addChannel({
      channel_id: state.draftChannelId,
      channel_name: state.draftChannelName || state.draftManhwaTitle,
      manhwa_title: state.draftManhwaTitle,
      price: state.draftPrice,
      cover_photo_url: state.draftCoverFileId,
      review_photo_url: state.draftReviewFileId,
      description: state.draftDescription,
    });
    clearUserState(ctx.from.id);
    await safeReply(
      ctx,
      `✅ *${state.draftManhwaTitle}* ထည့်ပြီးပါပြီ!`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [successCallback("➕ နောက်တစ်ခုထည့်ရန်", "admin_add_manhwa")],
          [primaryCallback("🔙 Admin Panel", "admin_panel")],
        ]),
      }
    );
  });

  // ===== Skip actions for add manhwa =====
  bot.action("skip_cover", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    updateUserState(ctx.from.id, { action: "add_step_review" });
    await safeReply(
      ctx,
      `📸 *Step 4/5: Review Photo*\n\nReview Photo ကို ပို့ပါ\n(User က Manhwa မဝယ်ခင် ပြသမည်)`,
      { parse_mode: "Markdown", ...getSkipCancelKeyboard("skip_review") }
    );
  });

  bot.action("skip_review", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    updateUserState(ctx.from.id, { action: "add_step_description" });
    await safeReply(
      ctx,
      `📝 *Step 5/5: ဖော်ပြချက်*\n\nManhwa ဖော်ပြချက် ရိုက်ပါ\n(ဥပမာ: ဇာတ်လမ်း အကျဉ်းချုပ်)`,
      { parse_mode: "Markdown", ...getSkipCancelKeyboard("skip_description") }
    );
  });

  bot.action("skip_description", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.answerCbQuery();
    await showAddManhwaSummary(ctx);
  });

  async function showAddManhwaSummary(ctx: any) {
    const state = getUserState(ctx.from.id);
    const text =
      `📋 *သိမ်းမည့် အချက်အလက်များ*\n\n` +
      `🆔 Channel ID: \`${state.draftChannelId}\`\n` +
      `📛 Channel Name: ${escMd(state.draftChannelName) || "(Manhwa title နှင့် တူ)"}\n` +
      `📖 Manhwa Title: *${escMd(state.draftManhwaTitle)}*\n` +
      `💰 ဈေးနှုန်း: ${state.draftPrice?.toLocaleString()} ကျပ်\n` +
      `🖼️ Cover: ${state.draftCoverFileId ? "✅" : "❌"}\n` +
      `📸 Review: ${state.draftReviewFileId ? "✅" : "❌"}\n` +
      `📝 ဖော်ပြချက်: ${state.draftDescription ? `\n${escMd(state.draftDescription)}` : "❌"}\n\n` +
      `သိမ်းမည်လား?`;
    await safeReply(ctx, text, { parse_mode: "Markdown", ...getAddManhwaConfirmKeyboard() });
  }

  // ===== Photo handler (welcome, cover, review, screenshot) =====
  bot.on("photo", async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);

    // Broadcast intercept (owner only)
    if (
      isOwner(userId) &&
      state.action === "broadcast_wait_content"
    ) {
      const handler = (bot as any).__handleBroadcastContent;
      if (handler && (await handler(ctx))) return;
    }

    const photo = ctx.message.photo;
    const fileId = photo[photo.length - 1].file_id;

    // Owner: forwarded channel post during add_step_channel
    if (isOwner(userId) && state.action === "add_step_channel") {
      const msg = ctx.message as any;
      if (msg.forward_from_chat) {
        const channelId = String(msg.forward_from_chat.id);
        const channelName = msg.forward_from_chat.title || null;
        updateUserState(userId, {
          action: "add_step_title",
          draftChannelId: channelId,
          draftChannelName: channelName || undefined,
        });
        await safeReply(
          ctx,
          `✅ Channel ချိတ်ဆက်ပြီး!\n` +
            `📛 Channel: ${escMd(channelName) || channelId}\n` +
            `🆔 ID: \`${channelId}\`\n\n` +
            `📖 *Step 2/5: Manhwa အမည်*\n\nManhwa အမည် ရိုက်ပါ:`,
          { parse_mode: "Markdown", ...getCancelKeyboard() }
        );
        return;
      }
    }

    // Owner: setting welcome photo
    if (isOwner(userId) && state.action === "set_welcome_photo") {
      await setBotSetting("welcome_photo_url", fileId);
      clearUserState(userId);
      await safeReply(ctx, "✅ Welcome Photo သိမ်းပြီး!", Markup.inlineKeyboard([
        [primaryCallback("🔙 Welcome Settings", "admin_welcome")],
      ]));
      return;
    }

    // Owner: setting cover photo for new manhwa (add flow)
    if (isOwner(userId) && state.action === "add_step_cover") {
      updateUserState(userId, { draftCoverFileId: fileId, action: "add_step_review" });
      await safeReply(
        ctx,
        `✅ Cover Photo သိမ်းပြီး!\n\n📸 *Step 4/5: Review Photo*\n\nReview Photo ပို့ပါ`,
        { parse_mode: "Markdown", ...getSkipCancelKeyboard("skip_review") }
      );
      return;
    }

    // Owner: setting review photo (add flow)
    if (isOwner(userId) && state.action === "add_step_review") {
      updateUserState(userId, { draftReviewFileId: fileId, action: "add_step_description" });
      await safeReply(
        ctx,
        `✅ Review Photo သိမ်းပြီး!\n\n📝 *Step 5/5: ဖော်ပြချက်*\n\nဖော်ပြချက် ရိုက်ပါ`,
        { parse_mode: "Markdown", ...getSkipCancelKeyboard("skip_description") }
      );
      return;
    }

    // Owner: edit existing cover
    if (isOwner(userId) && state.action === "edit_cover") {
      const channelDbId = parseInt(state.editChannelId!, 10);
      await updateChannel(channelDbId, { cover_photo_url: fileId });
      clearUserState(userId);
      await safeReply(ctx, "✅ Cover Photo ပြောင်းပြီး!", Markup.inlineKeyboard([
        [primaryCallback("🔙 Manhwa Edit", `admin_edit_${channelDbId}`)],
      ]));
      return;
    }

    // Owner: edit existing review
    if (isOwner(userId) && state.action === "edit_review") {
      const channelDbId = parseInt(state.editChannelId!, 10);
      await updateChannel(channelDbId, { review_photo_url: fileId });
      clearUserState(userId);
      await safeReply(ctx, "✅ Review Photo ပြောင်းပြီး!", Markup.inlineKeyboard([
        [primaryCallback("🔙 Manhwa Edit", `admin_edit_${channelDbId}`)],
      ]));
      return;
    }

    // User: payment screenshot
    if (state.action === "waiting_screenshot") {
      const purchaseId = state.purchaseId;
      if (!purchaseId) {
        await safeReply(ctx, "Session မတွေ့ပါ။ /start ထပ်နှိပ်ပါ။");
        return;
      }

      await updatePurchaseScreenshot(purchaseId, fileId);

      const channel = state.selectedChannelId
        ? await getChannelByChannelId(state.selectedChannelId)
        : null;
      const manhwaTitle = channel?.manhwa_title || state.selectedManhwa || "Unknown";

      await safeReply(
        ctx,
        `✅ ပြေစာ ရရှိပါပြီ!\n\nOwner မှ စစ်ဆေးပြီးနောက် Channel Invite Link ပေးပို့ပါမည်။\nခဏ စောင့်ဆိုင်းပါ 🙏`,
        getBackToListKeyboard()
      );

      const userMention = ctx.from.username
        ? `@${escMd(ctx.from.username)}`
        : `[${escMd(ctx.from.first_name || "User")}](tg://user?id=${userId})`;

      const fullName = `${ctx.from.first_name || "N/A"}${ctx.from.last_name ? " " + ctx.from.last_name : ""}`;

      const ownerMsg =
        `🛍️ *Purchase Request*\n\n` +
        `📖 Manhwa: *${escMd(manhwaTitle)}*\n` +
        `💳 ငွေပေးချေမှု: *${state.paymentMethod === "kpay" ? "KPay" : "Wave Pay"}*\n` +
        `💰 ဈေးနှုန်း: *${channel?.price?.toLocaleString() || "N/A"} ကျပ်*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `👤 User: ${userMention}\n` +
        `🆔 User ID: \`${userId}\`\n` +
        `📛 အမည်: ${escMd(fullName)}\n` +
        `📢 Channel ID: \`${state.selectedChannelId || "N/A"}\`\n` +
        `🧾 Purchase ID: #${purchaseId}\n` +
        `━━━━━━━━━━━━━━━━`;

      try {
        await bot.telegram.sendPhoto(OWNER_ID, fileId, {
          caption: ownerMsg,
          parse_mode: "Markdown",
          ...getOwnerConfirmKeyboard(purchaseId),
        });
      } catch (err) {
        logger.error({ err }, "Failed to send screenshot to owner");
      }

      clearUserState(userId);
    }
  });

  // ===== Forwarded messages: extract channel ID for "Add Manhwa" flow =====
  // Telegraf 4 exposes forward info on `ctx.message` but types vary.
  // We'll handle both in the text/photo handlers via message inspection.

  // ===== Text handler (multi-step flows) =====
  bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    const text = ctx.message.text;

    if (text.startsWith("/")) return;

    if (!isOwner(userId)) return;

    // ===== Broadcast intercept =====
    if (
      state.action === "broadcast_wait_content" ||
      state.action === "broadcast_wait_button_label" ||
      state.action === "broadcast_wait_button_url"
    ) {
      const handler = (bot as any).__handleBroadcastContent;
      if (handler && (await handler(ctx))) return;
    }

    // ===== Add Manhwa Flow =====
    if (state.action === "add_step_channel") {
      // Check if forwarded from a channel
      const msg = ctx.message as any;
      let channelId: string | null = null;
      let channelName: string | null = null;

      if (msg.forward_from_chat) {
        channelId = String(msg.forward_from_chat.id);
        channelName = msg.forward_from_chat.title || null;
      } else {
        const trimmed = text.trim();
        if (/^-?\d+$/.test(trimmed)) {
          channelId = trimmed;
        }
      }

      if (!channelId) {
        await safeReply(
          ctx,
          "❌ Channel ID မှန်ကန်စွာ ပို့ပါ\n\n_ဥပမာ: -1001234567890_\nသို့မဟုတ် Channel ထဲက message တစ်ခုကို forward လုပ်ပါ",
          { parse_mode: "Markdown", ...getCancelKeyboard() }
        );
        return;
      }

      // Try to fetch channel info from Telegram if not from forward
      if (!channelName) {
        try {
          const chat = await bot.telegram.getChat(parseInt(channelId, 10));
          if ("title" in chat) channelName = chat.title;
        } catch (err) {
          logger.warn({ err, channelId }, "Could not fetch channel info");
        }
      }

      updateUserState(userId, {
        action: "add_step_title",
        draftChannelId: channelId,
        draftChannelName: channelName || undefined,
      });

      await safeReply(
        ctx,
        `✅ Channel ချိတ်ဆက်ပြီး!\n` +
          `📛 Channel: ${escMd(channelName) || channelId}\n\n` +
          `📖 *Step 2/5: Manhwa အမည်*\n\nManhwa အမည် ရိုက်ပါ:\n(ဥပမာ: Solo Leveling)`,
        { parse_mode: "Markdown", ...getCancelKeyboard() }
      );
      return;
    }

    if (state.action === "add_step_title") {
      updateUserState(userId, { action: "add_step_price", draftManhwaTitle: text.trim() });
      await safeReply(
        ctx,
        `✅ Manhwaအမည်: *${escMd(text.trim())}*\n\n💰 *Step 3/5: ဈေးနှုန်း*\n\nဈေးနှုန်း (ကျပ်) ရိုက်ပါ:\n(ဥပမာ: 3000)`,
        { parse_mode: "Markdown", ...getCancelKeyboard() }
      );
      return;
    }

    if (state.action === "add_step_price") {
      const price = parseInt(text.trim().replace(/,/g, ""), 10);
      if (isNaN(price) || price < 0) {
        await safeReply(ctx, "❌ မှန်ကန်သော ဂဏန်း ရိုက်ပါ (ဥပမာ: 3000):", getCancelKeyboard());
        return;
      }
      updateUserState(userId, { action: "add_step_cover", draftPrice: price });
      await safeReply(
        ctx,
        `✅ ဈေးနှုန်း: *${price.toLocaleString()} ကျပ်*\n\n🖼️ *Step 4/6: Cover Photo*\n\nCover Photo ပို့ပါ\n(သို့မဟုတ် Skip နှိပ်ပါ)`,
        { parse_mode: "Markdown", ...getSkipCancelKeyboard("skip_cover") }
      );
      return;
    }

    if (state.action === "add_step_description") {
      updateUserState(userId, { draftDescription: text.trim() });
      await showAddManhwaSummary(ctx);
      return;
    }

    // ===== Edit existing Manhwa =====
    if (state.action === "edit_title" && state.editChannelId) {
      const channelDbId = parseInt(state.editChannelId, 10);
      await updateChannel(channelDbId, { manhwa_title: text.trim() });
      clearUserState(userId);
      await safeReply(ctx, "✅ Manhwaအမည် ပြောင်းပြီး!", Markup.inlineKeyboard([
        [primaryCallback("🔙 Manhwa Edit", `admin_edit_${channelDbId}`)],
      ]));
      return;
    }

    if (state.action === "edit_price" && state.editChannelId) {
      const price = parseInt(text.trim().replace(/,/g, ""), 10);
      if (isNaN(price) || price < 0) {
        await safeReply(ctx, "❌ မှန်ကန်သော ဂဏန်း ရိုက်ပါ:", getCancelKeyboard());
        return;
      }
      const channelDbId = parseInt(state.editChannelId, 10);
      await updateChannel(channelDbId, { price });
      clearUserState(userId);
      await safeReply(ctx, "✅ ဈေးနှုန်း ပြောင်းပြီး!", Markup.inlineKeyboard([
        [primaryCallback("🔙 Manhwa Edit", `admin_edit_${channelDbId}`)],
      ]));
      return;
    }

    if (state.action === "edit_desc" && state.editChannelId) {
      const channelDbId = parseInt(state.editChannelId, 10);
      await updateChannel(channelDbId, { description: text.trim() });
      clearUserState(userId);
      await safeReply(ctx, "✅ ဖော်ပြချက် ပြောင်းပြီး!", Markup.inlineKeyboard([
        [primaryCallback("🔙 Manhwa Edit", `admin_edit_${channelDbId}`)],
      ]));
      return;
    }

    // ===== Welcome Caption (preserve formatting via entities) =====
    if (state.action === "set_welcome_caption") {
      await setBotSetting("welcome_caption", text);
      const ents = (ctx.message as { entities?: any[] } | undefined)?.entities;
      if (ents && ents.length > 0) {
        await setBotSetting("welcome_caption_entities", JSON.stringify(ents));
      } else {
        await deleteBotSetting("welcome_caption_entities");
      }
      clearUserState(userId);
      await safeReply(ctx, "✅ Welcome Caption သိမ်းပြီး! (formatting ပါ ထိန်းထားသည်)", Markup.inlineKeyboard([
        [primaryCallback("👁️ Preview", "preview_welcome")],
        [primaryCallback("🔙 Welcome Settings", "admin_welcome")],
      ]));
      return;
    }

    // ===== Main Channel: Step 1 = link =====
    if (state.action === "set_main_link") {
      const link = text.trim();
      if (!link.startsWith("http") && !link.startsWith("@")) {
        await safeReply(
          ctx,
          "❌ မှန်ကန်သော Link ပို့ပါ (ဥပမာ: https://t.me/yourchannel)",
          getCancelKeyboard()
        );
        return;
      }
      updateUserState(userId, { action: "set_main_name", mainChannelLink: link });
      await safeReply(
        ctx,
        `✅ Link: ${link}\n\n📛 Main Channel ၏ Display Name ရိုက်ပါ:`,
        getCancelKeyboard()
      );
      return;
    }

    if (state.action === "set_main_name") {
      const name = text.trim();
      const link = state.mainChannelLink;
      if (!link) {
        await safeReply(ctx, "❌ Link မရှိပါ။ ပြန်စပါ။");
        clearUserState(userId);
        return;
      }
      await setBotSetting("main_channel_link", link);
      await setBotSetting("main_channel_name", name);
      clearUserState(userId);
      await safeReply(
        ctx,
        `✅ Main Channel သတ်မှတ်ပြီး!\n🔗 ${link}\n📛 ${name}`,
        Markup.inlineKeyboard([[primaryCallback("🔙 Admin Panel", "admin_panel")]])
      );
      return;
    }
  });

  // ===== Handle forwarded message at "add channel" step (when user just forwards w/o text) =====
  // Telegraf groups forwards as messages too. The text handler above checks forward_from_chat
  // but if forwarded message is media without text, we handle it here.
  bot.on("message", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !isOwner(userId)) return next();

    const state = getUserState(userId);
    if (state.action !== "add_step_channel") return next();

    const msg = ctx.message as any;
    if (!msg.forward_from_chat) return next();

    const channelId = String(msg.forward_from_chat.id);
    const channelName = msg.forward_from_chat.title || null;

    updateUserState(userId, {
      action: "add_step_title",
      draftChannelId: channelId,
      draftChannelName: channelName || undefined,
    });

    await safeReply(
      ctx,
      `✅ Channel ချိတ်ဆက်ပြီး!\n` +
        `📛 Channel: ${escMd(channelName) || channelId}\n` +
        `🆔 ID: \`${channelId}\`\n\n` +
        `📖 *Step 2/5: Manhwa အမည်*\n\nManhwa အမည် ရိုက်ပါ:`,
      { parse_mode: "Markdown", ...getCancelKeyboard() }
    );
  });

  // ===== Auto-revoke 1-time invite link after use =====
  bot.on("chat_member", async (ctx) => {
    try {
      const upd = ctx.update.chat_member;
      const newStatus = upd.new_chat_member?.status;
      const oldStatus = upd.old_chat_member?.status;
      const inviteLink = upd.invite_link?.invite_link;
      const chatId = upd.chat?.id;
      if (!inviteLink || !chatId) return;

      const justJoined =
        (oldStatus === "left" || oldStatus === "kicked") &&
        (newStatus === "member" ||
          newStatus === "restricted" ||
          newStatus === "administrator" ||
          newStatus === "creator");
      if (!justJoined) return;

      const purchase = await getPurchaseByInviteLink(inviteLink);
      if (!purchase) return;

      try {
        await ctx.telegram.revokeChatInviteLink(chatId, inviteLink);
        logger.info(
          { chatId, inviteLink, purchaseId: purchase.id, userId: upd.new_chat_member.user.id },
          "Auto-revoked 1-time invite link after user joined"
        );
      } catch (err) {
        logger.warn({ err, chatId, inviteLink }, "Failed to revoke invite link");
      }
    } catch (err) {
      logger.error({ err }, "chat_member handler error");
    }
  });

  // ===== Track when bot itself is added/removed from a channel =====
  bot.on("my_chat_member", async (ctx) => {
    try {
      const upd = ctx.update.my_chat_member;
      logger.info(
        {
          chatId: upd.chat.id,
          chatTitle: (upd.chat as { title?: string }).title,
          oldStatus: upd.old_chat_member?.status,
          newStatus: upd.new_chat_member?.status,
        },
        "my_chat_member update"
      );
    } catch (err) {
      logger.error({ err }, "my_chat_member handler error");
    }
  });

  // ===== Owner: Unmute user (from notification button) =====
  bot.action(/^owner_unmute_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) { await ctx.answerCbQuery("Permission မရှိပါ"); return; }
    await ctx.answerCbQuery("Unmuting...");
    const targetId = ctx.match[1];
    await unmuteUser(targetId);
    const user = await getBotUserById(targetId);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || targetId;
    try {
      await bot.telegram.sendMessage(
        parseInt(targetId, 10),
        `✅ Mute ပြေပြီ! Bot ကို ပြန်အသုံးပြုနိုင်ပါပြီ။`
      );
    } catch {}
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
    await safeReply(ctx, `✅ ${escHtml(name)} (<code>${targetId}</code>) Unmute ပြီး`, { parse_mode: "HTML" });
  });

  // ===== Owner: Ban user (from notification button) =====
  bot.action(/^owner_ban_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) { await ctx.answerCbQuery("Permission မရှိပါ"); return; }
    await ctx.answerCbQuery("Banning...");
    const targetId = ctx.match[1];
    await banUser(targetId);
    const user = await getBotUserById(targetId);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || targetId;
    try {
      await bot.telegram.sendMessage(
        parseInt(targetId, 10),
        `🚫 Bot အသုံးပြုခွင့် ပိတ်ပါပြီ။ Admin ကို ဆက်သွယ်ပါ။`
      );
    } catch {}
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: "✅ Unban", callback_data: `owner_unban_${targetId}` }]],
      });
    } catch {}
    await safeReply(ctx, `🚫 ${escHtml(name)} (<code>${targetId}</code>) Banned`, { parse_mode: "HTML" });
  });

  // ===== Owner: Unban user (from notification button) =====
  bot.action(/^owner_unban_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) { await ctx.answerCbQuery("Permission မရှိပါ"); return; }
    await ctx.answerCbQuery("Unbanning...");
    const targetId = ctx.match[1];
    await unbanUser(targetId);
    const user = await getBotUserById(targetId);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || targetId;
    try {
      await bot.telegram.sendMessage(
        parseInt(targetId, 10),
        `✅ Ban ပြေပြီ! Bot ကို ပြန်အသုံးပြုနိုင်ပါပြီ။ Credits 100 ပြန်ဖြည့်ပေးပါပြီ။`
      );
    } catch {}
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
    await safeReply(ctx, `✅ ${escHtml(name)} (<code>${targetId}</code>) Unbanned`, { parse_mode: "HTML" });
  });

  // ===== Owner Commands: /ban /unban /unmute by User ID =====
  bot.command("ban", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const parts = (ctx.message as any).text?.split(/\s+/);
    const targetId = parts?.[1]?.trim();
    if (!targetId || !/^\d+$/.test(targetId)) {
      await safeReply(ctx, "Usage: /ban USER_ID");
      return;
    }
    await banUser(targetId);
    const user = await getBotUserById(targetId);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || targetId;
    try {
      await bot.telegram.sendMessage(
        parseInt(targetId, 10),
        `🚫 Bot အသုံးပြုခွင့် ပိတ်ပါပြီ။ Admin ကို ဆက်သွယ်ပါ။`
      );
    } catch {}
    await safeReply(ctx, `🚫 ${escHtml(name)} (<code>${targetId}</code>) Banned`, { parse_mode: "HTML" });
  });

  bot.command("unban", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const parts = (ctx.message as any).text?.split(/\s+/);
    const targetId = parts?.[1]?.trim();
    if (!targetId || !/^\d+$/.test(targetId)) {
      await safeReply(ctx, "Usage: /unban USER_ID");
      return;
    }
    await unbanUser(targetId);
    const user = await getBotUserById(targetId);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || targetId;
    try {
      await bot.telegram.sendMessage(
        parseInt(targetId, 10),
        `✅ Ban ပြေပြီ! Bot ကို ပြန်အသုံးပြုနိုင်ပါပြီ။ Credits 100 ပြန်ဖြည့်ပေးပါပြီ။`
      );
    } catch {}
    await safeReply(ctx, `✅ ${escHtml(name)} (<code>${targetId}</code>) Unbanned & Credits reset`, { parse_mode: "HTML" });
  });

  bot.command("unmute", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const parts = (ctx.message as any).text?.split(/\s+/);
    const targetId = parts?.[1]?.trim();
    if (!targetId || !/^\d+$/.test(targetId)) {
      await safeReply(ctx, "Usage: /unmute USER_ID");
      return;
    }
    await unmuteUser(targetId);
    const user = await getBotUserById(targetId);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || targetId;
    try {
      await bot.telegram.sendMessage(
        parseInt(targetId, 10),
        `✅ Mute ပြေပြီ! Bot ကို ပြန်အသုံးပြုနိုင်ပါပြီ။`
      );
    } catch {}
    await safeReply(ctx, `✅ ${escHtml(name)} (<code>${targetId}</code>) Unmuted`, { parse_mode: "HTML" });
  });
}
