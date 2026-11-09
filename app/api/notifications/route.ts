import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'

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
  const notifications = await db.collection('notifications')
    .find({ recipientUsername: user.username })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray()
  return NextResponse.json({
    notifications: notifications.map(({ _id, ...notification }) => ({ id: String(_id), ...notification })),
  })
}

export async function PATCH(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ message: 'Login required' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (typeof body?.id !== 'string' || !ObjectId.isValid(body.id)) {
    return NextResponse.json({ message: 'A valid notification id is required' }, { status: 400 })
  }
  const db = await getDb()
  const result = await db.collection('notifications').updateOne(
    { _id: new ObjectId(body.id), recipientUsername: user.username },
    { $set: { read: true, readAt: new Date() } },
  )
  if (!result.matchedCount) return NextResponse.json({ message: 'Notification not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
