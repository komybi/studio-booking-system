import { createHash } from 'crypto'

const apiBase = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN)

export const telegramWebhookSecret = () => createHash('sha256').update(`webhook:${process.env.TELEGRAM_BOT_TOKEN}`).digest('hex').slice(0, 48)

async function callTelegram(method: string, payload?: Record<string, unknown>) {
  const response = await fetch(`${apiBase()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(`Telegram ${method} failed: ${data?.description ?? response.status}`)
  return data.result
}

let botUsername: string | undefined

export async function getTelegramBotUsername() {
  if (!botUsername) botUsername = String((await callTelegram('getMe')).username)
  return botUsername
}

export async function ensureTelegramWebhook(requestUrl: string) {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const url = new URL('/api/telegram/webhook', productionHost ? `https://${productionHost}` : requestUrl).toString()
  const info = await callTelegram('getWebhookInfo')
  if (info.url === url) return
  await callTelegram('setWebhook', { url, secret_token: telegramWebhookSecret(), allowed_updates: ['message'] })
}

export function sendTelegramMessage(chatId: number | string, text: string) {
  return callTelegram('sendMessage', { chat_id: chatId, text })
}
