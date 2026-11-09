import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { getDb } from '@/lib/db'
import { ensureTelegramWebhook, getTelegramBotUsername, telegramConfigured } from '@/lib/telegram'

async function currentUser() {
  const token = (await cookies()).get('studioflow_session')?.value
  if (!token) return null
  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token, expiresAt: { $gt: new Date() } })
  return session ? db.collection('users').findOne({ _id: session.userId }) : null
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  return NextResponse.json({ configured: telegramConfigured(), linked: Boolean(user.telegramChatId) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  if (!telegramConfigured()) return NextResponse.json({ message: 'Telegram notifications are not configured.' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const db = await getDb()

  if (body.action === 'unlink') {
    await db.collection('users').updateOne({ _id: user._id }, { $unset: { telegramChatId: '' } })
    return NextResponse.json({ ok: true })
  }

  try {
    const code = randomBytes(16).toString('hex')
    await db.collection('users').updateOne({ _id: user._id }, { $set: { telegramLinkCode: code, telegramLinkExpiresAt: new Date(Date.now() + 15 * 60 * 1000) } })
    await ensureTelegramWebhook(request.url)
    return NextResponse.json({ url: `https://t.me/${await getTelegramBotUsername()}?start=${code}` })
  } catch (error) {
    console.error('[telegram] Unable to start linking', error)
    return NextResponse.json({ message: 'Unable to reach Telegram. Please try again.' }, { status: 502 })
  }
}
