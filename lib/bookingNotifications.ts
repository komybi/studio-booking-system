import nodemailer from 'nodemailer'
import { getMailFrom } from '@/lib/mail'
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram'

type Database = Awaited<ReturnType<typeof import('@/lib/db').getDb>>

type NotificationInput = {
  eventKey: string
  recipientUsername: string
  title: string
  message: string
  bookingId: string
  href: string
  email?: string
  emailSubject: string
  emailText: string
}

export async function publishBookingNotification(db: Database, input: NotificationInput) {
  const notifications = db.collection('notifications')
  await notifications.createIndex({ dedupeKey: 1 }, { unique: true, sparse: true })
  const dedupeKey = `${input.eventKey}:${input.recipientUsername}`
  let notification = await notifications.findOne({ dedupeKey })

  if (!notification) {
    try {
      await notifications.insertOne({
        dedupeKey,
        eventKey: input.eventKey,
        recipientUsername: input.recipientUsername,
        title: input.title,
        message: input.message,
        bookingId: input.bookingId,
        href: input.href,
        createdAt: new Date(),
        read: false,
        emailStatus: 'queued',
        telegramStatus: 'queued',
      })
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
    }
    notification = await notifications.findOne({ dedupeKey })
  }

  if (notification) await deliverTelegram(db, dedupeKey, input)

  if (!notification || notification.emailStatus !== 'queued') return { created: Boolean(notification), emailStatus: notification?.emailStatus ?? 'unknown' }
  if (!input.email || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.MAIL_FROM) {
    await notifications.updateOne({ dedupeKey, emailStatus: 'queued' }, { $set: { emailStatus: 'skipped' } })
    return { created: true, emailStatus: 'skipped' }
  }

  const claim = await notifications.updateOne(
    { dedupeKey, emailStatus: 'queued' },
    { $set: { emailStatus: 'sending', emailClaimedAt: new Date() } },
  )
  if (!claim.modifiedCount) return { created: true, emailStatus: 'sending' }

  const port = Number(process.env.SMTP_PORT || 587)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  })

  try {
    await transporter.sendMail({
      from: getMailFrom(),
      to: input.email,
      subject: input.emailSubject,
      text: input.emailText,
    })
    await notifications.updateOne({ dedupeKey, emailStatus: 'sending' }, { $set: { emailStatus: 'sent', emailSentAt: new Date() } })
    return { created: true, emailStatus: 'sent' }
  } catch (error) {
    console.error('[booking-notifications] Email delivery failed', error)
    await notifications.updateOne({ dedupeKey, emailStatus: 'sending' }, { $set: { emailStatus: 'failed', emailFailedAt: new Date() } })
    return { created: true, emailStatus: 'failed' }
  }
}

async function deliverTelegram(db: Database, dedupeKey: string, input: NotificationInput) {
  const notifications = db.collection('notifications')
  const recipient = telegramConfigured() ? await db.collection('users').findOne({ username: input.recipientUsername }, { projection: { telegramChatId: 1 } }) : null
  if (!recipient?.telegramChatId) {
    await notifications.updateOne({ dedupeKey, telegramStatus: 'queued' }, { $set: { telegramStatus: 'skipped' } })
    return
  }
  const claim = await notifications.updateOne({ dedupeKey, telegramStatus: 'queued' }, { $set: { telegramStatus: 'sending' } })
  if (!claim.modifiedCount) return
  try {
    await sendTelegramMessage(recipient.telegramChatId, `${input.title}\n\n${input.message}`)
    await notifications.updateOne({ dedupeKey, telegramStatus: 'sending' }, { $set: { telegramStatus: 'sent', telegramSentAt: new Date() } })
  } catch (error) {
    console.error('[booking-notifications] Telegram delivery failed', error)
    await notifications.updateOne({ dedupeKey, telegramStatus: 'sending' }, { $set: { telegramStatus: 'failed', telegramFailedAt: new Date() } })
  }
}
