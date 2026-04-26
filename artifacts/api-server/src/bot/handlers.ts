import type { Telegraf, Context } from "telegraf";
import { Markup } from "telegraf";
import {
  getAllActiveChannels,
  getChannelByManhwaTitle,
  createPurchase,
  getPurchaseById,
  confirmPurchase,
  cancelPurchase,
  getBotSetting,
  setBotSetting,
  addChannel,
  removeChannel,
  updatePurchaseScreenshot,
} from "./db.js";
import {
  getManhwaListKeyboard,
  getManhwaDetailKeyboard,
  getPaymentKeyboard,
  getOwnerConfirmKeyboard,
  getBackToListKeyboard,
} from "./keyboards.js";
import { getUserState, setUserState, clearUserState } from "./states.js";
import { logger } from "../lib/logger.js";

const OWNER_ID = parseInt(process.env.OWNER_TELEGRAM_ID || "0", 10);
const KPAY_PHONE = process.env.KPAY_PHONE || "";
const KPAY_NAME = process.env.KPAY_NAME || "";

function isOwner(userId: number): boolean {
  return userId === OWNER_ID;
}

export function registerHandlers(bot: Telegraf) {
  // /start command
  bot.start(async (ctx) => {
    try {
      clearUserState(ctx.from.id);
      const welcomeCaption = await getBotSetting("welcome_caption");
      const welcomePhoto = await getBotSetting("welcome_photo_url");
      const mainChannelLink = await getBotSetting("main_channel_link");
      const mainChannelName = (await getBotSetting("main_channel_name")) || "Main Channel";
      const channels = await getAllActiveChannels();

      const inlineButtons: ReturnType<typeof Markup.button.callback>[][] = [];

      if (mainChannelLink) {
        inlineButtons.push([Markup.button.url(`📢 ${mainChannelName}`, mainChannelLink)]);
      }
      inlineButtons.push([
        Markup.button.callback("❓ Help", "help"),
        Markup.button.url("📞 Contact", `tg://user?id=${OWNER_ID}`),
      ]);

      const mainKeyboard = Markup.inlineKeyboard(inlineButtons);
      const caption = welcomeCaption || "မင်္ဂလာပါ! Manhwa Store မှ ကြိုဆိုပါသည်။";

      if (welcomePhoto) {
        try {
          await ctx.replyWithPhoto(welcomePhoto, {
            caption,
            ...mainKeyboard,
          });
        } catch {
          await ctx.reply(caption, mainKeyboard);
        }
      } else {
        await ctx.reply(caption, mainKeyboard);
      }

      if (channels.length > 0) {
        await ctx.reply(
          "📚 ရရှိနိုင်သော Manhwa ဇာတ်ကားများ\n\nကြိုက်နှစ်သက်သော ဇာတ်ကားကို ရွေးချယ်ပါ:",
          getManhwaListKeyboard(channels)
        );
      } else {
        await ctx.reply(
          "ဇာတ်ကားများ မရှိသေးပါ။ မကြာမီ ထည့်သွင်းပါမည်။ နောက်မှ ပြန်စစ်ဆေးပါ 😊"
        );
      }
    } catch (err) {
      logger.error({ err }, "Error in /start handler");
      await ctx.reply("တစ်ခုခု မှားသွားပါသည်။ /start ကို ထပ်ကြိုးစားပါ။");
    }
  });

  // Help callback
  bot.action("help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      "📖 *အသုံးပြုနည်း*\n\n" +
        "1️⃣ ဇာတ်ကားစာရင်းမှ ကြိုက်သောကားကို ရွေးပါ\n" +
        "2️⃣ Review ကြည့်ပြီး ဝယ်ယူရန် နှိပ်ပါ\n" +
        "3️⃣ ငွေပေးချေမှု နည်းလမ်း ရွေးပါ\n" +
        "4️⃣ ပြေစာ Screenshot ပို့ပါ\n" +
        "5️⃣ Owner မှ အတည်ပြုပြီးနောက် Channel Link ရပါမည်\n\n" +
        "❓ အကူအညီ လိုအပ်ပါက Owner ကို ဆက်သွယ်ပါ",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("📞 Owner ကို ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
          [Markup.button.callback("🔙 နောက်သို့", "back_to_list")],
        ]),
      }
    );
  });

  // Back to manhwa list
  bot.action("back_to_list", async (ctx) => {
    await ctx.answerCbQuery();
    clearUserState(ctx.from.id);
    const channels = await getAllActiveChannels();
    if (channels.length > 0) {
      try {
        await ctx.editMessageText(
          "📚 ရရှိနိုင်သော Manhwa ဇာတ်ကားများ\n\nကြိုက်နှစ်သက်သော ဇာတ်ကားကို ရွေးချယ်ပါ:",
          getManhwaListKeyboard(channels)
        );
      } catch {
        await ctx.reply(
          "📚 ရရှိနိုင်သော Manhwa ဇာတ်ကားများ\n\nကြိုက်နှစ်သက်သော ဇာတ်ကားကို ရွေးချယ်ပါ:",
          getManhwaListKeyboard(channels)
        );
      }
    } else {
      await ctx.reply("ဇာတ်ကားများ မရှိသေးပါ။");
    }
  });

  // Manhwa selection
  bot.action(/^manhwa_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const title = ctx.match[1];
    const channel = await getChannelByManhwaTitle(title);
    if (!channel) {
      await ctx.reply("ဇာတ်ကား မတွေ့ပါ။");
      return;
    }

    setUserState(ctx.from.id, {
      selectedManhwa: title,
      selectedChannelId: channel.channel_id,
    });

    const text =
      `📖 *${channel.manhwa_title}*\n\n` +
      (channel.description ? `${channel.description}\n\n` : "") +
      `💰 ဈေးနှုန်း: *${channel.price} ကျပ်*`;

    if (channel.review_photo_url) {
      try {
        await ctx.replyWithPhoto(channel.review_photo_url, {
          caption: text,
          parse_mode: "Markdown",
          ...getManhwaDetailKeyboard(title),
        });
      } catch {
        await ctx.reply(text, { parse_mode: "Markdown", ...getManhwaDetailKeyboard(title) });
      }
    } else {
      await ctx.reply(text, { parse_mode: "Markdown", ...getManhwaDetailKeyboard(title) });
    }
  });

  // Buy button
  bot.action(/^buy_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const title = ctx.match[1];
    await ctx.reply(
      `💳 *${title}* အတွက် ငွေပေးချေမှု နည်းလမ်း ရွေးပါ:`,
      { parse_mode: "Markdown", ...getPaymentKeyboard(title) }
    );
  });

  // Wave Pay selected
  bot.action(/^pay_wave_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const title = ctx.match[1];
    const channel = await getChannelByManhwaTitle(title);
    if (!channel) {
      await ctx.reply("ဇာတ်ကား မတွေ့ပါ။");
      return;
    }

    const purchase = await createPurchase({
      user_id: String(ctx.from.id),
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      channel_id: channel.channel_id,
      payment_method: "wave",
    });

    setUserState(ctx.from.id, {
      action: "waiting_screenshot",
      selectedManhwa: title,
      selectedChannelId: channel.channel_id,
      paymentMethod: "wave",
      purchaseId: purchase.id,
    });

    await ctx.reply(
      `💳 *Wave Pay ဖြင့် ငွေပေးချေရန်*\n\n` +
        `📖 ဇာတ်ကား: *${channel.manhwa_title}*\n` +
        `💰 ငွေပမာဏ: *${channel.price} ကျပ်*\n\n` +
        `Wave Pay ဖုန်းနံပါတ်ရယူရန် Owner ကို ဆက်သွယ်ပါ 👇\n\n` +
        `ငွေလွှဲပြီးပါက ပြေစာ Screenshot ကို ဤဘော့ထဲ ပေးပို့ပါ 📸`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("📞 Owner ကို ဆက်သွယ်ရန်", `tg://user?id=${OWNER_ID}`)],
        ]),
      }
    );
  });

  // KPay selected
  bot.action(/^pay_kpay_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const title = ctx.match[1];
    const channel = await getChannelByManhwaTitle(title);
    if (!channel) {
      await ctx.reply("ဇာတ်ကား မတွေ့ပါ။");
      return;
    }

    const purchase = await createPurchase({
      user_id: String(ctx.from.id),
      username: ctx.from.username || null,
      first_name: ctx.from.first_name || null,
      channel_id: channel.channel_id,
      payment_method: "kpay",
    });

    setUserState(ctx.from.id, {
      action: "waiting_screenshot",
      selectedManhwa: title,
      selectedChannelId: channel.channel_id,
      paymentMethod: "kpay",
      purchaseId: purchase.id,
    });

    await ctx.reply(
      `📱 *KPay ဖြင့် ငွေပေးချေရန်*\n\n` +
        `📖 ဇာတ်ကား: *${channel.manhwa_title}*\n` +
        `💰 ငွေပမာဏ: *${channel.price} ကျပ်*\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `📱 KPay ဖုန်းနံပါတ်: \`${KPAY_PHONE}\`\n` +
        `👤 အမည်: *${KPAY_NAME}*\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `ငွေလွှဲပြီးပါက ပြေစာ Screenshot ကို ဤဘော့ထဲ ပေးပို့ပါ 📸`,
      { parse_mode: "Markdown" }
    );
  });

  // Owner: Confirm purchase
  bot.action(/^confirm_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) {
      await ctx.answerCbQuery("Permission မရှိပါ။");
      return;
    }
    await ctx.answerCbQuery("Processing...");

    const purchaseId = parseInt(ctx.match[1], 10);
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      await ctx.reply("Purchase မတွေ့ပါ။");
      return;
    }
    if (purchase.status !== "pending") {
      await ctx.reply(`ဤ Purchase ကို ပြီးသားဖြစ်ပါသည်: ${purchase.status}`);
      return;
    }

    try {
      const channelIdNum = parseInt(purchase.channel_id, 10);
      const inviteResult = await bot.telegram.createChatInviteLink(channelIdNum, {
        member_limit: 1,
        name: `Manhwa Purchase #${purchaseId}`,
      });

      const inviteLink = inviteResult.invite_link;
      await confirmPurchase(purchaseId, inviteLink);

      const userMessage =
        `✅ *မင်္ဂလာပါ လူကြီးမင်း!*\n\n` +
        `လူကြီးမင်း Paid ဝင်လိုက်သော ဇာတ်ကားရဲ့\n` +
        `🔗 *1 Invite Link*\n` +
        `(တစ်ဦးတစ်ယောက်သာ ဝင်လို့ရသော Link ဖြစ်ပါသဖြင့် မည်သူ့မှ မျှဝေပါနှင့်)\n\n` +
        `Link နှိပ်ပြီး တန်းဝင်ပေးပါ 👇\n\n` +
        `${inviteLink}\n\n` +
        `⚠️ တန်းဝင်ပါ - Link ကုန်ဆုံးပါမည်`;

      await bot.telegram.sendMessage(parseInt(purchase.user_id, 10), userMessage, {
        parse_mode: "Markdown",
      });

      const originalText =
        (ctx.callbackQuery.message as { text?: string } | undefined)?.text || "";
      try {
        await ctx.editMessageText(
          originalText + `\n\n✅ Confirmed! Invite link sent.\n${inviteLink}`
        );
      } catch {
        await ctx.reply(`✅ Confirmed! Invite link: ${inviteLink}`);
      }
    } catch (err) {
      logger.error({ err }, "Error creating invite link");
      await ctx.reply(
        `❌ Invite link ထုတ်ရာတွင် အမှားဖြစ်သည်။\n` +
          `Bot သည် Channel Admin ဖြစ်ရမည်၊ Invite Link permission ရှိရမည်။\n\n` +
          `Error: ${String(err)}`
      );
    }
  });

  // Owner: Cancel purchase
  bot.action(/^cancel_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) {
      await ctx.answerCbQuery("Permission မရှိပါ။");
      return;
    }
    await ctx.answerCbQuery("Cancelled");

    const purchaseId = parseInt(ctx.match[1], 10);
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      await ctx.reply("Purchase မတွေ့ပါ။");
      return;
    }

    await cancelPurchase(purchaseId);

    await bot.telegram.sendMessage(
      parseInt(purchase.user_id, 10),
      `❌ Purchase #${purchaseId} ကို ပယ်ဖျက်လိုက်ပါသည်။\nမေးခွန်းများ ရှိပါက Owner ကို ဆက်သွယ်ပါ။`
    );

    const originalText =
      (ctx.callbackQuery.message as { text?: string } | undefined)?.text || "";
    try {
      await ctx.editMessageText(originalText + "\n\n❌ Cancelled by owner.");
    } catch {
      await ctx.reply("❌ Cancelled.");
    }
  });

  // Handle photo messages
  bot.on("photo", async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);

    // Owner setting welcome photo
    if (isOwner(userId) && state.action === "setting_welcome_photo") {
      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id;
      await setBotSetting("welcome_photo_url", fileId);
      setUserState(userId, { action: "setting_welcome_caption" });
      await ctx.reply("✅ Welcome Photo သိမ်းပြီး!\n\nWelcome Caption ရိုက်ပါ (ဥပမာ: မင်္ဂလာပါ! Store မှ ကြိုဆိုပါသည်):");
      return;
    }

    // User sending payment screenshot
    if (state.action === "waiting_screenshot") {
      const purchaseId = state.purchaseId;
      if (!purchaseId) {
        await ctx.reply("Session မတွေ့ပါ။ /start ကို ထပ်နှိပ်ပါ။");
        return;
      }

      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id;
      await updatePurchaseScreenshot(purchaseId, fileId);

      const channel = state.selectedManhwa
        ? await getChannelByManhwaTitle(state.selectedManhwa)
        : null;
      const manhwaTitle = channel?.manhwa_title || state.selectedManhwa || "Unknown";

      await ctx.reply(
        `✅ ပြေစာ ရရှိပါပြီ!\n\n` +
          `Owner မှ စစ်ဆေးပြီးနောက် Channel Invite Link ပေးပို့ပါမည်။\n` +
          `ခဏ စောင့်ဆိုင်းပါ 🙏`,
        getBackToListKeyboard()
      );

      const userMention =
        ctx.from.username
          ? `@${ctx.from.username}`
          : `[${ctx.from.first_name || "User"}](tg://user?id=${userId})`;

      const ownerMsg =
        `🛍️ *Purchase Request*\n\n` +
        `📖 ဇာတ်ကား: *${manhwaTitle}*\n` +
        `💳 ငွေပေးချေမှု: *${state.paymentMethod === "kpay" ? "KPay" : "Wave Pay"}*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `👤 User: ${userMention}\n` +
        `🆔 User ID: \`${userId}\`\n` +
        `📛 အမည်: ${ctx.from.first_name || "N/A"}${ctx.from.last_name ? " " + ctx.from.last_name : ""}\n` +
        `📢 Channel ID: \`${state.selectedChannelId || "N/A"}\`\n` +
        `🧾 Purchase ID: #${purchaseId}\n` +
        `━━━━━━━━━━━━━━━━`;

      await bot.telegram.sendPhoto(OWNER_ID, fileId, {
        caption: ownerMsg,
        parse_mode: "Markdown",
        ...getOwnerConfirmKeyboard(purchaseId),
      });

      clearUserState(userId);
    }
  });

  // Handle text messages (multi-step owner flows)
  bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    const text = ctx.message.text;

    if (!isOwner(userId)) return;

    if (text.startsWith("/")) return; // commands handled separately

    if (state.action === "adding_channel_step1") {
      // Expecting channel ID
      setUserState(userId, {
        action: "adding_channel_step2",
        selectedChannelId: text.trim(),
      });
      await ctx.reply("Manhwa ဇာတ်ကား အမည် ရိုက်ပါ (ဥပမာ: Solo Leveling):");
    } else if (state.action === "adding_channel_step2") {
      setUserState(userId, {
        ...state,
        action: "adding_channel_step3",
        selectedManhwa: text.trim(),
      });
      await ctx.reply("ဈေးနှုန်း (ကျပ်) ရိုက်ပါ (ဥပမာ: 3000):");
    } else if (state.action === "adding_channel_step3") {
      const price = parseInt(text.trim(), 10);
      if (isNaN(price) || price < 0) {
        await ctx.reply("ကျေးဇူးပြု၍ မှန်ကန်သော ဂဏန်း ရိုက်ပါ (ဥပမာ: 3000):");
        return;
      }
      setUserState(userId, {
        ...state,
        action: "adding_channel_step4",
        purchaseId: price,
      });
      await ctx.reply(
        "ဖော်ပြချက် ရိုက်ပါ (ဥပမာ: ကျော်ကြားသော Manhwa ကားကြီး)\n/skip ရိုက်ပါ ကျော်ဝင်ရန်:"
      );
    } else if (state.action === "adding_channel_step4") {
      const description = text === "/skip" ? null : text.trim();
      const channelId = state.selectedChannelId!;
      const manhwaTitle = state.selectedManhwa!;
      const price = state.purchaseId!;

      let channelName = manhwaTitle;
      try {
        const chat = await bot.telegram.getChat(parseInt(channelId, 10));
        if ("title" in chat) channelName = chat.title;
      } catch {
        channelName = manhwaTitle;
      }

      await addChannel({
        channel_id: channelId,
        channel_name: channelName,
        manhwa_title: manhwaTitle,
        price,
        description: description || undefined,
      });

      clearUserState(userId);
      await ctx.reply(
        `✅ Channel ထည့်ပြီး!\n\n` +
          `📖 ဇာတ်ကား: *${manhwaTitle}*\n` +
          `🆔 Channel ID: \`${channelId}\`\n` +
          `💰 ဈေးနှုန်း: ${price} ကျပ်`,
        { parse_mode: "Markdown" }
      );
    } else if (state.action === "removing_channel") {
      const removed = await removeChannel(text.trim());
      clearUserState(userId);
      await ctx.reply(removed ? "✅ Channel ဖျက်ပြီး!" : "❌ Channel မတွေ့ပါ။");
    } else if (state.action === "setting_welcome_caption") {
      await setBotSetting("welcome_caption", text);
      clearUserState(userId);
      await ctx.reply("✅ Welcome Caption ပြောင်းပြီး!");
    }
  });

  // Admin commands
  bot.command("addchannel", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    setUserState(ctx.from.id, { action: "adding_channel_step1" });
    await ctx.reply(
      `📋 *Channel ထည့်ရန်*\n\n` +
        `ဦးစွာ Channel ID ပေးပို့ပါ\n` +
        `(ဥပမာ: -1001234567890)\n\n` +
        `Channel ID ရှာနည်း:\n` +
        `Bot ကို Channel ထဲ Admin အဖြစ် ထည့်ပြီး @userinfobot ကို message forward လုပ်ပါ`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("setcover", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const args = ctx.message.text.split(" ").slice(1);
    if (args.length < 2) {
      await ctx.reply(
        "Usage: /setcover <channel_id> <photo_url>\n\nExample: /setcover -1001234567890 https://example.com/cover.jpg"
      );
      return;
    }
    const [channelId, photoUrl] = args;
    const { pool: dbPool } = await import("@workspace/db");
    await (dbPool as unknown as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
      "UPDATE channels SET cover_photo_url = $1 WHERE channel_id = $2",
      [photoUrl, channelId]
    );
    await ctx.reply(`✅ Cover photo သတ်မှတ်ပြီး!\nChannel: ${channelId}`);
  });

  bot.command("setreview", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const args = ctx.message.text.split(" ").slice(1);
    if (args.length < 2) {
      await ctx.reply(
        "Usage: /setreview <channel_id> <photo_url>\n\nExample: /setreview -1001234567890 https://example.com/review.jpg"
      );
      return;
    }
    const [channelId, photoUrl] = args;
    const { pool: dbPool } = await import("@workspace/db");
    await (dbPool as unknown as { query: (sql: string, params: unknown[]) => Promise<void> }).query(
      "UPDATE channels SET review_photo_url = $1 WHERE channel_id = $2",
      [photoUrl, channelId]
    );
    await ctx.reply(`✅ Review photo သတ်မှတ်ပြီး!\nChannel: ${channelId}`);
  });

  bot.command("removechannel", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    setUserState(ctx.from.id, { action: "removing_channel" });
    await ctx.reply("ဖျက်မည့် Channel ID ကို ပေးပို့ပါ:");
  });

  bot.command("listchannels", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const channels = await getAllActiveChannels();
    if (channels.length === 0) {
      await ctx.reply("Channel များ မရှိသေးပါ။");
      return;
    }
    const text = channels
      .map(
        (ch, i) =>
          `${i + 1}. *${ch.manhwa_title}*\n   ID: \`${ch.channel_id}\`\n   ဈေးနှုန်း: ${ch.price} ကျပ်`
      )
      .join("\n\n");
    await ctx.reply(`📋 *Channel စာရင်း*\n\n${text}`, { parse_mode: "Markdown" });
  });

  bot.command("setwelcome", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    setUserState(ctx.from.id, { action: "setting_welcome_photo" });
    await ctx.reply(
      "Welcome Photo ကို ပေးပို့ပါ:\n\n(Photo မလိုပါက /skip ရိုက်ပါ)"
    );
  });

  bot.command("skip", async (ctx) => {
    const userId = ctx.from.id;
    const state = getUserState(userId);
    if (isOwner(userId) && state.action === "setting_welcome_photo") {
      setUserState(userId, { action: "setting_welcome_caption" });
      await ctx.reply("Welcome Caption ရိုက်ပါ:");
    } else if (isOwner(userId) && state.action === "adding_channel_step4") {
      // Skip description
      const channelId = state.selectedChannelId!;
      const manhwaTitle = state.selectedManhwa!;
      const price = state.purchaseId!;

      let channelName = manhwaTitle;
      try {
        const chat = await bot.telegram.getChat(parseInt(channelId, 10));
        if ("title" in chat) channelName = chat.title;
      } catch {
        channelName = manhwaTitle;
      }

      await addChannel({
        channel_id: channelId,
        channel_name: channelName,
        manhwa_title: manhwaTitle,
        price,
      });

      clearUserState(userId);
      await ctx.reply(
        `✅ Channel ထည့်ပြီး!\n\n` +
          `📖 ဇာတ်ကား: *${manhwaTitle}*\n` +
          `🆔 Channel ID: \`${channelId}\`\n` +
          `💰 ဈေးနှုန်း: ${price} ကျပ်`,
        { parse_mode: "Markdown" }
      );
    }
  });

  bot.command("setmainchannel", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    const args = ctx.message.text.split(" ").slice(1);
    if (args.length < 2) {
      await ctx.reply(
        "Usage: /setmainchannel <link> <name>\nExample: /setmainchannel https://t.me/mychannel MyChannel"
      );
      return;
    }
    const link = args[0];
    const name = args.slice(1).join(" ");
    await setBotSetting("main_channel_link", link);
    await setBotSetting("main_channel_name", name);
    await ctx.reply(`✅ Main Channel သတ်မှတ်ပြီး!\nLink: ${link}\nName: ${name}`);
  });

  bot.command("adminhelp", async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    await ctx.reply(
      `🔧 *Admin Commands*\n\n` +
        `/addchannel - Manhwa Channel ထည့်ရန်\n` +
        `/removechannel - Channel ဖျက်ရန်\n` +
        `/listchannels - Channel စာရင်းကြည့်ရန်\n` +
        `/setwelcome - Welcome Photo/Caption ပြောင်းရန်\n` +
        `/setmainchannel <link> <name> - Main Channel Link သတ်မှတ်ရန်\n` +
        `/setcover <channel_id> <photo_url> - Cover Photo URL သတ်မှတ်ရန်\n` +
        `/setreview <channel_id> <photo_url> - Review Photo URL သတ်မှတ်ရန်`,
      { parse_mode: "Markdown" }
    );
  });
}
