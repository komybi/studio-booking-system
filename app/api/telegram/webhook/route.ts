import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendTelegramMessage, telegramConfigured, telegramWebhookSecret } from '@/lib/telegram'

export async function POST(request: Request) {
  if (!telegramConfigured() || request.headers.get('x-telegram-bot-api-secret-token') !== telegramWebhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const update = await request.json().catch(() => null)
  const message = update?.message
  const chatId = message?.chat?.id
  const text = typeof message?.text === 'string' ? message.text.trim() : ''
  if (!chatId || !text.startsWith('/start')) return NextResponse.json({ ok: true })

  try {
    const code = text.split(/\s+/)[1] ?? ''
    const db = await getDb()
    const users = db.collection('users')
    const user = code ? await users.findOne({ telegramLinkCode: code, telegramLinkExpiresAt: { $gt: new Date() } }) : null
    if (!user) {
      await sendTelegramMessage(chatId, 'To receive booking notifications, open the Studio Booking System and tap "Connect Telegram".')
      return NextResponse.json({ ok: true })
    }
    await users.updateOne({ _id: user._id }, { $set: { telegramChatId: chatId }, $unset: { telegramLinkCode: '', telegramLinkExpiresAt: '' } })
    await sendTelegramMessage(chatId, `Connected, ${user.name || user.username}. You will get your studio booking notifications here.`)
  } catch (error) {
    console.error('[telegram] Webhook handling failed', error)
  }
  return NextResponse.json({ ok: true })
}
