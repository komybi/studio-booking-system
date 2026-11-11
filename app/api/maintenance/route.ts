import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { ensureReservationIndex, getReservationConflicts, reservationSlots, studioNames, timeInMinutes, type ScheduledBooking } from '@/lib/bookingAvailability'
import { canViewCalendar, isStudioAdmin } from '@/lib/userRoles'

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
  if (!canViewCalendar(user.role)) return NextResponse.json({ maintenance: [] })
  const db = await getDb()
  const maintenance = await db.collection('bookings').find({ recordType: 'maintenance' }).sort({ date: 1 }).limit(300).toArray()
  return NextResponse.json({ maintenance: maintenance.map(({ _id, ...item }) => ({ id: String(_id), ...item })) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  if (!isStudioAdmin(user.role)) return NextResponse.json({ message: 'Studio Admin access required' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Invalid maintenance request' }, { status: 400 })

  const maintenance = {
    title: String(body.title ?? '').trim() || 'Maintenance window',
    date: String(body.date ?? ''),
    startTime: String(body.startTime ?? ''),
    endTime: String(body.endTime ?? ''),
    studio: String(body.studio ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
    status: 'Maintenance',
    recordType: 'maintenance',
    requestedBy: user.username,
    createdAt: new Date(),
    reservationSlots: [] as string[],
  }
  const start = timeInMinutes(maintenance.startTime)
  const end = timeInMinutes(maintenance.endTime)
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(maintenance.date) ? new Date(`${maintenance.date}T00:00:00.000Z`) : null
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== maintenance.date
    || start === null || end === null || end <= start || !studioNames.includes(maintenance.studio)) {
    return NextResponse.json({ message: 'Enter a valid studio, date, and end time after the start time' }, { status: 400 })
  }

  const db = await getDb()
  await ensureReservationIndex(db)
  const dayRecords = await db.collection('bookings').find({ date: maintenance.date }).toArray() as ScheduledBooking[]
  const conflicts = getReservationConflicts(dayRecords, maintenance.studio, start, end)
  if (conflicts.length) {
    return NextResponse.json({
      message: `Maintenance conflicts with ${conflicts.map((item) => `${item.title ?? 'Maintenance window'} (${item.startTime}–${item.endTime}, ${item.status})`).join('; ')}. Existing reservations were not changed.`,
      conflicts: conflicts.map((item) => ({
        title: item.title,
        startTime: item.startTime,
        endTime: item.endTime,
        status: item.status,
        requestedBy: 'requestedBy' in item ? item.requestedBy : undefined,
      })),
    }, { status: 409 })
  }

  maintenance.reservationSlots = reservationSlots(maintenance.date, maintenance.studio, start, end)
  try {
    const result = await db.collection('bookings').insertOne(maintenance)
    await db.collection('bookingAudit').insertOne({
      bookingId: String(result.insertedId),
      action: 'maintenance-created',
      actor: user.username,
      at: new Date(),
    })
    return NextResponse.json({ maintenance: { id: String(result.insertedId), ...maintenance } }, { status: 201 })
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
    return NextResponse.json({ message: 'This studio time was just reserved. Refresh the schedule and choose another slot.' }, { status: 409 })
  }
}

export async function DELETE(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  if (!isStudioAdmin(user.role)) return NextResponse.json({ message: 'Studio Admin access required' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (typeof body?.id !== 'string' || !ObjectId.isValid(body.id)) {
    return NextResponse.json({ message: 'A valid maintenance window id is required' }, { status: 400 })
  }
  const db = await getDb()
  const id = new ObjectId(body.id)
  const existing = await db.collection('bookings').findOne({ _id: id, recordType: 'maintenance' })
  if (!existing) return NextResponse.json({ message: 'Maintenance window not found' }, { status: 404 })
  await db.collection('bookings').deleteOne({ _id: id, recordType: 'maintenance' })
  await db.collection('bookingAudit').insertOne({
    bookingId: String(id),
    action: 'maintenance-removed',
    actor: user.username,
    at: new Date(),
    details: { title: existing.title, studio: existing.studio, date: existing.date },
  })
  return NextResponse.json({ ok: true })
}
