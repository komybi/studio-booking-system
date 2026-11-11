import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getDb } from '@/lib/db'
import { findNextAvailableTime, getAvailableStudios, getReservationConflicts, reservationSlots, studioCNewsReservations, studioNames, timeInMinutes, type ScheduledBooking } from '@/lib/bookingAvailability'
import { isStudioAdmin } from '@/lib/userRoles'

async function currentUser() {
  const token = (await cookies()).get('studioflow_session')?.value
  if (!token) return null
  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token, expiresAt: { $gt: new Date() } })
  return session ? db.collection('users').findOne({ _id: session.userId }) : null
}

export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  if (!isStudioAdmin(user.role)) return NextResponse.json({ message: 'Studio Admin access required' }, { status: 403 })
  const url = new URL(request.url)
  const date = url.searchParams.get('date') ?? ''
  const startTime = url.searchParams.get('startTime') ?? ''
  const endTime = url.searchParams.get('endTime') ?? ''
  const studio = url.searchParams.get('studio') ?? ''
  const id = url.searchParams.get('id') ?? undefined
  const start = timeInMinutes(startTime)
  const end = timeInMinutes(endTime)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || start === null || end === null || end <= start || !studioNames.includes(studio)) {
    return NextResponse.json({ message: 'A valid date, time range, and studio are required' }, { status: 400 })
  }
  const db = await getDb()
  const records = [...await db.collection('bookings').find({ date }).toArray() as ScheduledBooking[], ...studioCNewsReservations(date)]
  const conflicts = getReservationConflicts(records, studio, start, end, id)
  const availableStudios = getAvailableStudios(records, studio, start, end)
  const nextAvailableTime = findNextAvailableTime(records, studio, start, end - start)
  const conflictSlots = conflicts.flatMap((record) => {
    const conflictStart = timeInMinutes(record.startTime ?? '')
    const conflictEnd = timeInMinutes(record.endTime ?? '')
    return conflictStart === null || conflictEnd === null ? [] : reservationSlots(date, studio, conflictStart, conflictEnd)
  })
  return NextResponse.json({
    conflicts: conflicts.map((record) => ({
      title: record.title ?? 'Maintenance window',
      studio: record.studio,
      date,
      startTime: record.startTime,
      endTime: record.endTime,
      status: record.status,
      type: record.recordType === 'maintenance' ? 'Maintenance' : 'Booking',
      requestedBy: 'requestedBy' in record ? record.requestedBy : undefined,
    })),
    availableStudios,
    nextAvailableTime,
    conflictSlots,
  })
}
