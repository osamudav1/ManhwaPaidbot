import { Markup } from "telegraf";
import type { Channel } from "./db.js";

export type ButtonStyle = "primary" | "success" | "danger";

function withStyle<T extends object>(btn: T, style: ButtonStyle): T {
  return Object.assign({}, btn, { style }) as T;
}

export function successCallback(text: string, data: string) {
  return withStyle(Markup.button.callback(text, data), "success");
}
export function dangerCallback(text: string, data: string) {
  return withStyle(Markup.button.callback(text, data), "danger");
}
export function primaryCallback(text: string, data: string) {
  return withStyle(Markup.button.callback(text, data), "primary");
}
export function primaryUrl(text: string, url: string) {
  return withStyle(Markup.button.url(text, url), "primary");
}
export function successUrl(text: string, url: string) {
  return withStyle(Markup.button.url(text, url), "success");
}

export function copyButton(text: string, value: string) {
  return { text, copy_text: { text: value }, style: "primary" } as any;
}

export function getStartKeyboard(
  mainChannelLink: string | null,
  mainChannelName: string,
  ownerId: number,
  isOwner: boolean,
  botUsername?: string | null
) {
  const buttons: any[][] = [];

  if (mainChannelLink) {
    buttons.push([primaryUrl(`📢 ${mainChannelName}`, mainChannelLink)]);
  }

  buttons.push([
    primaryCallback("✅ အကူအညီ", "help"),
    successUrl("🟢 ဆက်သွယ်ရန်", `tg://user?id=${ownerId}`),
  ]);

  buttons.push([
    primaryCallback("📚 ဇာတ်ကားများ", "show_manhwa_list"),
    primaryCallback("⭐ အကြောင်း", "about_bot"),
  ]);

  if (botUsername) {
    buttons.push([
      primaryUrl(
        "📤 မိတ်ဆွေကို မျှဝေရန်",
        `https://t.me/share/url?url=https://t.me/${botUsername}&text=${encodeURIComponent(
          "Manhwa ဝယ်ယူရန် ဤ Bot ကို စမ်းကြည့်ပါ 👇"
        )}`
      ),
    ]);
  }

  if (isOwner) {
    buttons.push([successCallback("🔧 Admin Panel", "admin_panel")]);
  }

  return Markup.inlineKeyboard(buttons);
}

export function getManhwaListKeyboard(channels: Channel[]) {
  const buttons: any[][] = channels.map((ch) => [
    primaryCallback(`📖 ${ch.manhwa_title}`, `manhwa_${ch.id}`),
  ]);
  buttons.push([primaryCallback("🏠 ပင်မ စာမျက်နှာ", "back_to_start")]);
  return Markup.inlineKeyboard(buttons);
}

export function getManhwaDetailKeyboard(channelDbId: number, botUsername?: string | null) {
  const buttons: any[][] = [
    [successCallback("✅ ဝယ်ယူရန်", `buy_${channelDbId}`)],
  ];
  if (botUsername) {
    buttons.push([
      primaryUrl(
        "📤 မိတ်ဆွေကို မျှဝေရန်",
        `https://t.me/share/url?url=https://t.me/${botUsername}&text=${encodeURIComponent(
          "Manhwa ဝယ်ယူရန် ဤ Bot ကို စမ်းကြည့်ပါ 👇"
        )}`
      ),
    ]);
  }
  buttons.push([
    primaryCallback("🔙 နောက်သို့", "back_to_list"),
    primaryCallback("🏠 ပင်မ", "back_to_start"),
  ]);
  return Markup.inlineKeyboard(buttons);
}

export function getPaymentKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [successCallback("💳 Wave Pay", `pay_wave_${channelDbId}`)],
    [successCallback("💎 KPay", `pay_kpay_${channelDbId}`)],
    [primaryCallback("ℹ️ ငွေပေးနည်း ကြည့်ရန်", `pay_help_${channelDbId}`)],
    [primaryCallback("🔙 နောက်သို့", `manhwa_${channelDbId}`)],
  ]);
}

export function getAfterPaymentKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [primaryCallback("🔙 ငွေပေးနည်း ပြောင်းရန်", `buy_${channelDbId}`)],
    [primaryCallback("🏠 ပင်မ စာမျက်နှာ", "back_to_start")],
  ]);
}

export function getOwnerConfirmKeyboard(purchaseId: number) {
  return Markup.inlineKeyboard([
    [
      successCallback("✅ Confirmed", `confirm_${purchaseId}`),
      dangerCallback("❌ Cancel", `cancel_${purchaseId}`),
    ],
    [primaryCallback("📊 Purchase Records", "admin_purchases")],
  ]);
}

export function getBackToListKeyboard() {
  return Markup.inlineKeyboard([
    [primaryCallback("📚 ဇာတ်ကားစာရင်းသို့", "back_to_list")],
    [primaryCallback("🏠 ပင်မ စာမျက်နှာ", "back_to_start")],
  ]);
}

// ===== Admin Keyboards =====

export function getAdminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [successCallback("➕ Manhwa အသစ်ထည့်ရန်", "admin_add_manhwa")],
    [primaryCallback("📋 Manhwa စီမံခန့်ခွဲရန်", "admin_manage_manhwa")],
    [primaryCallback("🎨 Welcome Settings", "admin_welcome")],
    [primaryCallback("📢 Main Channel", "admin_mainchannel")],
    [primaryCallback("📊 Purchase Records", "admin_purchases")],
    [dangerCallback("❌ ပိတ်ရန်", "admin_close")],
  ]);
}

export function getCancelKeyboard(returnTo: string = "admin_panel") {
  return Markup.inlineKeyboard([
    [dangerCallback("❌ Cancel", `cancel_action_${returnTo}`)],
  ]);
}

export function getSkipCancelKeyboard(skipAction: string) {
  return Markup.inlineKeyboard([
    [
      primaryCallback("⏭️ Skip", skipAction),
      dangerCallback("❌ Cancel", "cancel_action_admin_panel"),
    ],
  ]);
}

export function getAdminManhwaListKeyboard(channels: Channel[]) {
  const buttons: any[][] = channels.map((ch) => [
    primaryCallback(`📖 ${ch.manhwa_title} (${ch.price} Ks)`, `admin_edit_${ch.id}`),
  ]);
  buttons.push([primaryCallback("🔙 Admin Panel", "admin_panel")]);
  return Markup.inlineKeyboard(buttons);
}

export function getAdminEditManhwaKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [primaryCallback("✏️ ဇာတ်ကားအမည် ပြောင်းရန်", `edit_title_${channelDbId}`)],
    [primaryCallback("💰 ဈေးနှုန်း ပြောင်းရန်", `edit_price_${channelDbId}`)],
    [primaryCallback("🖼️ Cover Photo ပြောင်းရန်", `edit_cover_${channelDbId}`)],
    [primaryCallback("📸 Review Photo ပြောင်းရန်", `edit_review_${channelDbId}`)],
    [primaryCallback("📝 ဖော်ပြချက် ပြောင်းရန်", `edit_desc_${channelDbId}`)],
    [dangerCallback("🗑️ ဖျက်ရန်", `delete_manhwa_${channelDbId}`)],
    [primaryCallback("🔙 Manhwa List", "admin_manage_manhwa")],
  ]);
}

export function getDeleteConfirmKeyboard(channelDbId: number) {
  return Markup.inlineKeyboard([
    [
      dangerCallback("✅ ဖျက်မည်", `delete_confirm_${channelDbId}`),
      successCallback("❌ မဖျက်ပါ", `admin_edit_${channelDbId}`),
    ],
  ]);
}

export function getWelcomeSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [primaryCallback("🖼️ Welcome Photo သတ်မှတ်ရန်", "set_welcome_photo")],
    [primaryCallback("📝 Welcome Caption ပြောင်းရန်", "set_welcome_caption")],
    [primaryCallback("👁️ Preview ကြည့်ရန်", "preview_welcome")],
    [primaryCallback("🔙 Admin Panel", "admin_panel")],
  ]);
}

export function getMainChannelSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [primaryCallback("🔗 Channel Link သတ်မှတ်ရန်", "set_main_link")],
    [dangerCallback("🗑️ Main Channel ဖယ်ရှားရန်", "remove_main_channel")],
    [primaryCallback("🔙 Admin Panel", "admin_panel")],
  ]);
}

export function getAddManhwaConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      successCallback("✅ သိမ်းမည်", "confirm_add_manhwa"),
      dangerCallback("❌ Cancel", "cancel_action_admin_panel"),
    ],
  ]);
}
