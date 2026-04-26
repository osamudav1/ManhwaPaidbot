import { Markup } from "telegraf";
import type { Channel } from "./db.js";

export function getStartKeyboard(mainChannelLink: string | null, mainChannelName: string) {
  const buttons = [
    [Markup.button.url("📞 Contact", "https://t.me/" + (process.env.OWNER_USERNAME || "owner"))],
    [Markup.button.callback("❓ Help", "help")],
  ];

  if (mainChannelLink) {
    buttons.unshift([Markup.button.url(`📢 ${mainChannelName}`, mainChannelLink)]);
  }

  return Markup.inlineKeyboard(buttons);
}

export function getManhwaListKeyboard(channels: Channel[]) {
  const buttons = channels.map((ch) => [
    Markup.button.callback(`📖 ${ch.manhwa_title}`, `manhwa_${ch.manhwa_title}`),
  ]);
  return Markup.inlineKeyboard(buttons);
}

export function getManhwaDetailKeyboard(manhwaTitle: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🛒 ဝယ်ယူရန်", `buy_${manhwaTitle}`)],
    [Markup.button.callback("🔙 နောက်သို့", "back_to_list")],
  ]);
}

export function getPaymentKeyboard(manhwaTitle: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💳 Wave Pay", `pay_wave_${manhwaTitle}`)],
    [Markup.button.callback("📱 KPay", `pay_kpay_${manhwaTitle}`)],
    [Markup.button.callback("🔙 နောက်သို့", `manhwa_${manhwaTitle}`)],
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
