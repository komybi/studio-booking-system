import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import nodemailer from 'nodemailer'
import { getDb } from '@/lib/db'
import { getMailFrom } from '@/lib/mail'

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
  const db = await getDb()
  const query = {}
  const bookings = await db.collection('bookings').find(query).sort({ createdAt: -1 }).limit(100).toArray()
  return NextResponse.json({ bookings: bookings.map(({ _id, ...booking }) => ({ id: String(_id), ...booking })) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  const body = await request.json()
  const db = await getDb()
  const booking = { title: String(body.title ?? '').trim(), department: String(body.department ?? ''), date: String(body.date ?? ''), startTime: String(body.startTime ?? ''), endTime: String(body.endTime ?? ''), priority: body.priority === 'Urgent' ? 'Urgent' : 'Standard', studio: String(body.studio ?? '').trim(), responsiblePerson: String(body.responsiblePerson ?? '').trim(), phoneNumber: String(body.phoneNumber ?? '').trim(), guest: String(body.guest ?? '').trim(), presenterName: String(body.presenterName ?? '').trim(), presenterPhone: String(body.presenterPhone ?? '').trim(), broadcastType: String(body.broadcastType ?? '').trim(), equipment: String(body.equipment ?? '').trim(), notes: String(body.notes ?? '').trim(), status: 'Pending', requestedBy: user.username, createdAt: new Date() }
  if (!booking.title || !booking.date || !booking.startTime || !booking.studio || !booking.responsiblePerson || !booking.phoneNumber) return NextResponse.json({ message: 'Complete all required booking fields' }, { status: 400 })
  const result = await db.collection('bookings').insertOne(booking)
  return NextResponse.json({ booking: { id: String(result.insertedId), ...booking } }, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Please log in first' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ message: 'Administrator approval required' }, { status: 403 })
  const { id, status } = await request.json()
  const db = await getDb()
  const { ObjectId } = await import('mongodb')
  const booking = await db.collection('bookings').findOne({ _id: new ObjectId(id) })
  if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 })
  if (booking.status === status) return NextResponse.json({ ok: true, emailSent: false })
  await db.collection('bookings').updateOne({ _id: booking._id }, { $set: { status, reviewedBy: user.username, reviewedAt: new Date() } })

  let emailSent = false
  if (status === 'Approved' && booking.requestedBy) {
    const requester = await db.collection('users').findOne({ username: booking.requestedBy }, { projection: { email: 1, name: 1 } })
    if (requester?.email && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM) {
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
      try {
        await transporter.sendMail({ from: getMailFrom(), to: requester.email, subject: `Studio booking approved: ${booking.title}`, text: `Hello ${requester.name || requester.email},\n\nYour studio booking request “${booking.title}” has been approved.\nDate: ${booking.date}\nTime: ${booking.startTime}${booking.endTime ? `–${booking.endTime}` : ''}\nStudio: ${booking.studio}\n\nThis is an automated notification.`, html: `<p>Hello ${requester.name || requester.email},</p><p>Your studio booking request <strong>${booking.title}</strong> has been approved.</p><p><strong>Date:</strong> ${booking.date}<br><strong>Time:</strong> ${booking.startTime}${booking.endTime ? `–${booking.endTime}` : ''}<br><strong>Studio:</strong> ${booking.studio}</p><p>This is an automated notification.</p>` })
        emailSent = true
      } catch (error) {
        console.error('[v0] Approval email failed', error)
      }
    }
  }
  return NextResponse.json({ ok: true, emailSent })
}
