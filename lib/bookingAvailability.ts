import type { ObjectId } from 'mongodb'

export const studioNames = ['Studio A', 'Studio B', 'Studio C', 'Studio D']

export type ScheduledBooking = {
  _id?: ObjectId
  id?: string
  recordType?: string
  date?: string
  studio?: string
  startTime?: string
  endTime?: string
  status?: string
  title?: string
}

export function timeInMinutes(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function reservationSlots(date: string, studio: string, start: number, end: number) {
  return Array.from({ length: end - start }, (_, minute) => `${date}|${studio}|${start + minute}`)
}

export function isBlockingReservation(booking: ScheduledBooking) {
  return booking.recordType === 'maintenance'
    ? booking.status === 'Maintenance'
    : booking.status === 'Pending' || booking.status === 'Approved'
}

export function getReservationConflicts(
  bookings: ScheduledBooking[],
  studio: string,
  start: number,
  end: number,
  excludeId?: string,
) {
  return bookings.filter((booking) => {
    if (booking.studio !== studio || !isBlockingReservation(booking)) return false
    if (excludeId && String(booking._id ?? booking.id) === excludeId) return false
    const reservedStart = timeInMinutes(booking.startTime ?? '')
    const reservedEnd = timeInMinutes(booking.endTime ?? '')
    return reservedStart !== null && reservedEnd !== null && start < reservedEnd && end > reservedStart
  })
}

export function findNextAvailableTime(bookings: ScheduledBooking[], studio: string, start: number, duration: number) {
  const reservations = bookings
    .filter((booking) => booking.studio === studio && isBlockingReservation(booking))
    .map((booking) => ({ start: timeInMinutes(booking.startTime ?? ''), end: timeInMinutes(booking.endTime ?? '') }))
    .filter((booking): booking is { start: number; end: number } => booking.start !== null && booking.end !== null && booking.end > booking.start)
    .sort((left, right) => left.start - right.start)

  let candidate = start
  while (candidate + duration <= 24 * 60) {
    const conflict = reservations.find((booking) => candidate < booking.end && candidate + duration > booking.start)
    if (!conflict) return { startTime: formatTime(candidate), endTime: formatTime(candidate + duration) }
    candidate = conflict.end
  }
  return null
}

export function getAvailableStudios(bookings: ScheduledBooking[], studio: string, start: number, end: number) {
  return studioNames.filter((candidate) => candidate !== studio && getReservationConflicts(bookings, candidate, start, end).length === 0)
}

type ReservationDatabase = Awaited<ReturnType<typeof import('@/lib/db').getDb>>

let reservationIndexReady: Promise<void> | null = null

export async function ensureReservationIndex(db: ReservationDatabase) {
  if (!reservationIndexReady) {
    reservationIndexReady = (async () => {
      const bookings = db.collection('bookings')
      await bookings.createIndex({ reservationSlots: 1 }, { unique: true, sparse: true })
      const records = await bookings.find({ status: { $in: ['Pending', 'Approved', 'Maintenance'] } }).toArray() as ScheduledBooking[]
      const reserved = new Map<string, Set<number>>()
      for (const record of records) {
        const start = timeInMinutes(record.startTime ?? '')
        const end = timeInMinutes(record.endTime ?? '')
        const id = String(record._id ?? record.id ?? '')
        if (!id || !record.date || !record.studio || start === null || end === null || end <= start) continue
        const slots = reservationSlots(record.date, record.studio, start, end)
        const reservationKey = `${record.date}|${record.studio}`
        const occupied = reserved.get(reservationKey) ?? new Set<number>()
        const overlaps = Array.from({ length: end - start }, (_, minute) => start + minute).some((minute) => occupied.has(minute))
        if (overlaps) {
          console.error(`[booking-availability] Existing reservation overlap found for ${record.studio} on ${record.date}; record ${id} was not changed.`)
          continue
        }
        try {
          await bookings.updateOne({ _id: record._id }, { $set: { reservationSlots: slots } })
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error
          console.error(`[booking-availability] Existing reservation overlap found for ${record.studio} on ${record.date}; record ${id} was not changed.`)
          continue
        }
        for (let minute = start; minute < end; minute += 1) occupied.add(minute)
        reserved.set(reservationKey, occupied)
      }
    })().catch((error) => {
      reservationIndexReady = null
      throw error
    })
  }
  await reservationIndexReady
}
