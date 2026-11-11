import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { ensureReservationIndex, findNextAvailableTime, getAvailableStudios, getReservationConflicts, reservationSlots, studioNames, timeInMinutes, type ScheduledBooking } from '@/lib/bookingAvailability'
import { publishBookingNotification } from '@/lib/bookingNotifications'

async function currentUser() {
  const token = (await cookies()).get('studioflow_session')?.value
  if (!token) return null
  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token, expiresAt: { $gt: new Date() } })
  return session ? db.collection('users').findOne({ _id: session.userId }) : null
}

function isAdmin(user: Record<string, unknown>) {
  return typeof user.role === 'string' && user.role.toLowerCase().startsWith('admin')
}

function bookingSummary(booking: ScheduledBooking & Record<string, unknown>) {
  return {
    title: booking.title ?? 'Maintenance window',
    studio: booking.studio,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
    type: booking.recordType === 'maintenance' ? 'Maintenance' : 'Booking',
  }
}

async function notifyAdmins(db: Awaited<ReturnType<typeof getDb>>, booking: Record<string, any>, bookingId: string, url: URL) {
  const users = await db.collection('users').find({}, { projection: { username: 1, name: 1, email: 1, role: 1 } }).toArray()
  const admins = users.filter((candidate) =>
    typeof candidate.role === 'string' && candidate.role.toLowerCase().startsWith('admin') && typeof candidate.username === 'string',
  )
  const responsible = users.find((candidate) =>
    typeof candidate.username === 'string'
    && (candidate.username === booking.responsiblePerson || candidate.name === booking.responsiblePerson
      || (typeof booking.responsibleEmail === 'string' && candidate.email?.toLowerCase() === booking.responsibleEmail.toLowerCase())),
  )
  const recipients = new Map(admins.map((admin) => [admin.username, admin]))
  if (responsible?.username) recipients.set(responsible.username, responsible)
  if (typeof booking.responsibleEmail === 'string' && booking.responsibleEmail
    && !Array.from(recipients.values()).some((recipient) =>
      typeof recipient.email === 'string' && recipient.email.toLowerCase() === booking.responsibleEmail.toLowerCase(),
    )) {
    const recipientUsername = `responsible:${booking.responsibleEmail.toLowerCase()}`
    recipients.set(recipientUsername, { username: recipientUsername, email: booking.responsibleEmail })
  }
  const href = new URL('/', url)
  href.searchParams.set('booking', bookingId)
  const time = `${booking.startTime}–${booking.endTime}`
  const reason = booking.priority === 'Urgent' ? `\nUrgency reason: ${booking.urgencyReason}` : ''
  const requester = booking.requesterName || booking.requestedBy
  return Promise.all(Array.from(recipients.values()).map((admin) => publishBookingNotification(db, {
    eventKey: `booking-submitted:${bookingId}`,
    recipientUsername: admin.username,
    title: booking.priority === 'Urgent' ? 'Urgent booking needs review' : 'New booking request',
    message: `${booking.title} · ${booking.department} · ${booking.studio} · ${booking.date} ${time} · Requested by ${requester}${reason}`,
    bookingId,
    href: href.toString(),
    email: typeof admin.email === 'string' ? admin.email : undefined,
    emailSubject: `${booking.priority === 'Urgent' ? 'URGENT: ' : ''}Studio booking request: ${booking.title}`,
    emailText: [
      `Program: ${booking.title}`,
      `Department: ${booking.department}`,
      `Studio: ${booking.studio}`,
      `Date and time: ${booking.date} ${time}`,
      `Priority: ${booking.priority}`,
      `Urgency reason: ${booking.urgencyReason || 'Not applicable'}`,
      `Requester: ${requester}`,
      `Requester email: ${booking.requesterEmail || 'Not provided'}`,
      `Responsible person: ${booking.responsiblePerson}`,
      `Responsible email: ${booking.responsibleEmail || 'Not provided'}`,
      `Phone: ${booking.phoneNumber}`,
      `Review: ${href.toString()}`,
    ].join('\n'),
  })))
}

async function conflictResponse(
  reservations: ScheduledBooking[],
  booking: { studio: string; date: string; startTime: string; endTime: string },
  start: number,
  end: number,
  excludeId?: string,
) {
  const conflicts = getReservationConflicts(reservations, booking.studio, start, end, excludeId)
  if (!conflicts.length) return null
  const duration = end - start
  const nextTime = findNextAvailableTime(
    reservations.filter((item) => item.date === booking.date),
    booking.studio,
    start,
    duration,
  )
  const availableStudios = getAvailableStudios(
    reservations.filter((item) => item.date === booking.date),
    booking.studio,
    start,
    end,
  )
  return {
    message: `This time conflicts with ${conflicts.map((item) => {
      const type = item.recordType === 'maintenance' ? 'maintenance' : `${item.status?.toLowerCase()} booking`
      return `${type}: ${item.title ?? 'Maintenance window'} (${item.startTime}–${item.endTime})`
    }).join('; ')}.`,
    conflicts: conflicts.map((item) => bookingSummary(item as ScheduledBooking & Record<string, unknown>)),
    nextAvailableTime: nextTime,
    availableStudios,
  }
}

type BookingDetails = {
  title: string
  department: string
  date: string
  startTime: string
  endTime: string
  priority: 'Urgent' | 'Standard'
  urgencyReason: string
  studio: string
  responsiblePerson: string
  responsibleEmail: string
  phoneNumber: string
  guest: string
  presenterName: string
  presenterPhone: string
  broadcastType: string
  equipment: string
  notes: string
}

function parseBookingDetails(body: Record<string, unknown>):
  | { booking: BookingDetails; start: number; end: number }
  | { error: string } {
  const priority = body.priority === 'Urgent' ? 'Urgent' : body.priority === 'Standard' ? 'Standard' : ''
  if (!priority) return { error: 'Complete all required booking fields with a valid date, time, priority, and studio' }
  const booking: BookingDetails = {
    title: String(body.title ?? '').trim(),
    department: String(body.department ?? '').trim(),
    date: String(body.date ?? ''),
    startTime: String(body.startTime ?? ''),
    endTime: String(body.endTime ?? ''),
    priority,
    urgencyReason: priority === 'Urgent' ? String(body.urgencyReason ?? '').trim() : '',
    studio: String(body.studio ?? '').trim(),
    responsiblePerson: String(body.responsiblePerson ?? '').trim(),
    responsibleEmail: String(body.responsibleEmail ?? '').trim(),
    phoneNumber: String(body.phoneNumber ?? '').trim(),
    guest: String(body.guest ?? '').trim(),
    presenterName: String(body.presenterName ?? '').trim(),
    presenterPhone: String(body.presenterPhone ?? '').trim(),
    broadcastType: String(body.broadcastType ?? '').trim(),
    equipment: String(body.equipment ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
  }
  const start = timeInMinutes(booking.startTime)
  const end = timeInMinutes(booking.endTime)
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(booking.date) ? new Date(`${booking.date}T00:00:00.000Z`) : null
  if (!booking.title || !booking.department || !booking.date || start === null || end === null || !booking.studio || !booking.responsiblePerson || !booking.phoneNumber) {
    return { error: 'Complete all required booking fields with a valid date, time, priority, and studio' }
  }
  if (priority === 'Urgent' && !booking.urgencyReason) return { error: 'A reason is required for urgent bookings' }
  if (booking.responsibleEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.responsibleEmail)) {
    return { error: 'Enter a valid responsible person email address' }
  }
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== booking.date || end <= start) {
    return { error: 'Enter a valid booking date and an end time after the start time' }
  }
  if (!studioNames.includes(booking.studio)) return { error: 'Choose a valid studio' }
  return { booking, start, end }
}

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  const db = await getDb()
  await ensureReservationIndex(db)
  const records = await db.collection('bookings').find({}).sort({ createdAt: -1 }).limit(300).toArray()
  const bookings = records.filter((booking) => booking.recordType !== 'maintenance')
  const maintenance = records.filter((booking) => booking.recordType === 'maintenance')
  const serialize = (records: Record<string, any>[]) => records.map(({ _id, ...record }) => ({ id: String(_id), ...record }))
  return NextResponse.json({ bookings: serialize(bookings), maintenance: serialize(maintenance) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ message: 'Invalid booking request' }, { status: 400 })
  const parsed = parseBookingDetails(body)
  if ('error' in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 })
  const { booking: details, start, end } = parsed
  const priority = details.priority
  const db = await getDb()
  await ensureReservationIndex(db)
  const booking = {
    ...details,
    status: 'Pending',
    requestedBy: user.username,
    requesterName: user.name,
    requesterEmail: user.email,
    recordType: 'booking',
    createdAt: new Date(),
    reservationSlots: [] as string[],
  }

  const sameDayBookings = await db.collection('bookings').find({ date: booking.date }).toArray() as ScheduledBooking[]
  const conflict = await conflictResponse(sameDayBookings, booking, start, end)
  if (conflict) return NextResponse.json(conflict, { status: 409 })

  booking.reservationSlots = reservationSlots(booking.date, booking.studio, start, end)
  let insertedId: ObjectId
  try {
    const result = await db.collection('bookings').insertOne(booking)
    insertedId = result.insertedId as ObjectId
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
    const latest = await db.collection('bookings').find({ date: booking.date }).toArray() as ScheduledBooking[]
    const latestConflict = await conflictResponse(latest, booking, start, end)
    return NextResponse.json(latestConflict ?? { message: 'This time was just reserved. Please choose another time or studio.' }, { status: 409 })
  }

  await db.collection('bookingAudit').insertOne({
    bookingId: String(insertedId),
    action: 'submitted',
    actor: user.username,
    priority,
    at: new Date(),
  })

  const bookingId = String(insertedId)
  const emailResults = priority === 'Urgent'
    ? await notifyAdmins(db, booking, bookingId, new URL(request.url))
    : []
  const resultBooking = { id: bookingId, ...booking }
  return NextResponse.json({
    booking: resultBooking,
    notificationsCreated: emailResults.length,
    emailStatus: priority !== 'Urgent' || !emailResults.length
      ? 'skipped'
      : emailResults.some((result) => result.emailStatus === 'failed')
        ? 'failed'
        : emailResults.some((result) => result.emailStatus === 'skipped')
          ? 'skipped'
          : 'sent',
  }, { status: 201 })
}

export async function PATCH(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Please log in first' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ message: 'Administrator approval required' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || !ObjectId.isValid(body.id)) {
    return NextResponse.json({ message: 'A valid booking id is required' }, { status: 400 })
  }

  if (body.action === 'edit') {
    const parsed = parseBookingDetails(body)
    if ('error' in parsed) return NextResponse.json({ message: parsed.error }, { status: 400 })
    const db = await getDb()
    await ensureReservationIndex(db)
    const id = new ObjectId(body.id)
    const bookings = db.collection('bookings')
    const existing = await bookings.findOne({ _id: id, recordType: { $ne: 'maintenance' } })
    if (!existing) return NextResponse.json({ message: 'Booking not found' }, { status: 404 })

    const conflict = await conflictResponse(
      await bookings.find({ date: parsed.booking.date }).toArray() as ScheduledBooking[],
      parsed.booking,
      parsed.start,
      parsed.end,
      body.id,
    )
    if (conflict) return NextResponse.json(conflict, { status: 409 })

    const update = {
      ...parsed.booking,
      reservationSlots: reservationSlots(parsed.booking.date, parsed.booking.studio, parsed.start, parsed.end),
      updatedAt: new Date(),
    }
    try {
      const result = await bookings.updateOne(
        { _id: id, recordType: { $ne: 'maintenance' }, status: existing.status },
        { $set: update },
      )
      if (!result.matchedCount) return NextResponse.json({ message: 'This booking changed while you were editing it. Refresh and try again.' }, { status: 409 })
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
      const latestConflict = await conflictResponse(
        await bookings.find({ date: parsed.booking.date }).toArray() as ScheduledBooking[],
        parsed.booking,
        parsed.start,
        parsed.end,
        body.id,
      )
      return NextResponse.json(latestConflict ?? { message: 'This studio time was just reserved. Please choose another time or studio.' }, { status: 409 })
    }

    const changedFields = Object.keys(parsed.booking).filter((key) => existing[key] !== parsed.booking[key as keyof BookingDetails])
    await db.collection('bookingAudit').insertOne({
      bookingId: body.id,
      action: 'edited',
      actor: user.username,
      changedFields,
      at: new Date(),
    })
    return NextResponse.json({ ok: true, booking: { id: body.id, ...existing, ...update } })
  }

  if (!['Approved', 'Rejected'].includes(body.status)) {
    return NextResponse.json({ message: 'A booking decision is required' }, { status: 400 })
  }

  const db = await getDb()
  await ensureReservationIndex(db)
  const id = new ObjectId(body.id)
  const booking = await db.collection('bookings').findOne({ _id: id, recordType: { $ne: 'maintenance' } })
  if (!booking) return NextResponse.json({ message: 'Booking not found' }, { status: 404 })
  if (booking.status === body.status) return NextResponse.json({ ok: true, unchanged: true })
  if (booking.status !== 'Pending') return NextResponse.json({ message: 'This booking has already been reviewed' }, { status: 409 })

  if (body.status === 'Approved') {
    const scheduledBooking = {
      date: String(booking.date ?? ''),
      studio: String(booking.studio ?? ''),
      startTime: String(booking.startTime ?? ''),
      endTime: String(booking.endTime ?? ''),
    }
    const start = timeInMinutes(scheduledBooking.startTime)
    const end = timeInMinutes(scheduledBooking.endTime)
    if (start === null || end === null || end <= start) return NextResponse.json({ message: 'The booking has invalid times and cannot be approved' }, { status: 409 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledBooking.date) || !studioNames.includes(scheduledBooking.studio)) {
      return NextResponse.json({ message: 'The booking has an invalid date or studio and cannot be approved' }, { status: 409 })
    }
    const dayBookings = await db.collection('bookings').find({ date: scheduledBooking.date }).toArray() as ScheduledBooking[]
    const conflict = await conflictResponse(dayBookings, scheduledBooking, start, end, String(booking._id))
    if (conflict) return NextResponse.json({ ...conflict, message: `Cannot approve: ${conflict.message}` }, { status: 409 })
    booking.reservationSlots = booking.reservationSlots ?? reservationSlots(scheduledBooking.date, scheduledBooking.studio, start, end)
  }

  const update: Record<string, unknown> = {
    status: body.status,
    reviewedBy: user.username,
    reviewedAt: new Date(),
  }
  if (body.status === 'Approved' && booking.reservationSlots) update.reservationSlots = booking.reservationSlots
  try {
    const result = await db.collection('bookings').updateOne(
      { _id: id, status: 'Pending' },
      { $set: update },
    )
    if (!result.matchedCount) return NextResponse.json({ message: 'This booking was already reviewed by another administrator' }, { status: 409 })
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
    return NextResponse.json({ message: 'Cannot approve: this studio time is already reserved or unavailable' }, { status: 409 })
  }

  await db.collection('bookingAudit').insertOne({
    bookingId: String(id),
    action: body.status.toLowerCase(),
    actor: user.username,
    at: new Date(),
  })

  const requester = await db.collection('users').findOne({ username: booking.requestedBy }, { projection: { email: 1, name: 1 } })
  const review = body.status === 'Approved' ? 'approved' : 'rejected'
  if (booking.requestedBy) {
    await publishBookingNotification(db, {
      eventKey: `booking-${review}:${String(id)}`,
      recipientUsername: booking.requestedBy,
      title: `Booking ${review}`,
      message: `Your request "${booking.title}" for ${booking.date}, ${booking.startTime}–${booking.endTime} in ${booking.studio} was ${review}.`,
      bookingId: String(id),
      href: '/',
      email: typeof requester?.email === 'string' ? requester.email : undefined,
      emailSubject: `Studio booking ${review}: ${booking.title}`,
      emailText: `Hello ${requester?.name || requester?.email || booking.requestedBy},\n\nYour studio booking request "${booking.title}" was ${review}.\nDate: ${booking.date}\nTime: ${booking.startTime}–${booking.endTime}\nStudio: ${booking.studio}\n\nThis is an automated notification.`,
    })
  }

  return NextResponse.json({ ok: true })
}
