import { Markup } from "telegraf";
import type { Channel } from "./db.js";

export function getStartKeyboard(
  mainChannelLink: string | null,
  mainChannelName: string,
  ownerId: number,
  isOwner: boolean
) {
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  if (mainChannelLink) {
    buttons.push([Markup.button.url(`📢 ${mainChannelName}`, mainChannelLink)]);
  }

  buttons.push([
    Markup.button.callback("❓ အကူအညီ", "help"),
    Markup.button.url("📞 ဆက်သွယ်ရန်", `tg://user?id=${ownerId}`),
  ]);

  if (isOwner) {
    buttons.push([Markup.button.callback("🔧 Admin Panel", "admin_panel")]);
  }

  return Markup.inlineKeyboard(buttons);
}

export function getManhwaListKeyboard(channels: Channel[]) {
  const buttons = channels.map((ch) => [
    Markup.button.callback(`📖 ${ch.manhwa_title}`, `manhwa_${ch.id}`),
  ]);
  return Markup.inlineKeyboard(buttons);
}

export function getManhwaDetailKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🛒 ဝယ်ယူရန်", `buy_${channelDbId}`)],
    [Markup.button.callback("🔙 နောက်သို့", "back_to_list")],
  ]);
}

export function getPaymentKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💳 Wave Pay", `pay_wave_${channelDbId}`)],
    [Markup.button.callback("📱 KPay", `pay_kpay_${channelDbId}`)],
    [Markup.button.callback("🔙 နောက်သို့", `manhwa_${channelDbId}`)],
  ]);
}

export function getOwnerConfirmKeyboard(purchaseId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Confirmed", `confirm_${purchaseId}`),
      Markup.button.callback("❌ Cancel", `cancel_${purchaseId}`),
    ],
  ]);
}

export function getBackToListKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🔙 ဇာတ်ကားစာရင်းသို့", "back_to_list")],
  ]);
}

// ===== Admin Keyboards =====

export function getAdminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Manhwa အသစ်ထည့်ရန်", "admin_add_manhwa")],
    [Markup.button.callback("📋 Manhwa စီမံခန့်ခွဲရန်", "admin_manage_manhwa")],
    [Markup.button.callback("🎨 Welcome Settings", "admin_welcome")],
    [Markup.button.callback("📢 Main Channel", "admin_mainchannel")],
    [Markup.button.callback("📊 Purchase Records", "admin_purchases")],
    [Markup.button.callback("❌ ပိတ်ရန်", "admin_close")],
  ]);
}

export function getCancelKeyboard(returnTo: string = "admin_panel") {
  return Markup.inlineKeyboard([
    [Markup.button.callback("❌ Cancel", `cancel_action_${returnTo}`)],
  ]);
}

export function getSkipCancelKeyboard(skipAction: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("⏭️ Skip", skipAction),
      Markup.button.callback("❌ Cancel", "cancel_action_admin_panel"),
    ],
  ]);
}

export function getAdminManhwaListKeyboard(channels: Channel[]) {
  const buttons = channels.map((ch) => [
    Markup.button.callback(
      `📖 ${ch.manhwa_title} (${ch.price} Ks)`,
      `admin_edit_${ch.id}`
    ),
  ]);
  buttons.push([Markup.button.callback("🔙 Admin Panel", "admin_panel")]);
  return Markup.inlineKeyboard(buttons);
}

export function getAdminEditManhwaKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏️ ဇာတ်ကားအမည် ပြောင်းရန်", `edit_title_${channelDbId}`)],
    [Markup.button.callback("💰 ဈေးနှုန်း ပြောင်းရန်", `edit_price_${channelDbId}`)],
    [Markup.button.callback("🖼️ Cover Photo ပြောင်းရန်", `edit_cover_${channelDbId}`)],
    [Markup.button.callback("📸 Review Photo ပြောင်းရန်", `edit_review_${channelDbId}`)],
    [Markup.button.callback("📝 ဖော်ပြချက် ပြောင်းရန်", `edit_desc_${channelDbId}`)],
    [Markup.button.callback("🗑️ ဖျက်ရန်", `delete_manhwa_${channelDbId}`)],
    [Markup.button.callback("🔙 Manhwa List", "admin_manage_manhwa")],
  ]);
}

export function getDeleteConfirmKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ ဖျက်မည်", `delete_confirm_${channelDbId}`),
      Markup.button.callback("❌ မဖျက်ပါ", `admin_edit_${channelDbId}`),
    ],
  ]);
}

export function getWelcomeSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🖼️ Welcome Photo သတ်မှတ်ရန်", "set_welcome_photo")],
    [Markup.button.callback("📝 Welcome Caption ပြောင်းရန်", "set_welcome_caption")],
    [Markup.button.callback("👁️ Preview ကြည့်ရန်", "preview_welcome")],
    [Markup.button.callback("🔙 Admin Panel", "admin_panel")],
  ]);
}

export function getMainChannelSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🔗 Channel Link သတ်မှတ်ရန်", "set_main_link")],
    [Markup.button.callback("🗑️ Main Channel ဖယ်ရှားရန်", "remove_main_channel")],
    [Markup.button.callback("🔙 Admin Panel", "admin_panel")],
  ]);
}

export function getAddManhwaConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ သိမ်းမည်", "confirm_add_manhwa"),
      Markup.button.callback("❌ Cancel", "cancel_action_admin_panel"),
    ],
  ]);
}
