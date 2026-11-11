import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getDb } from '@/lib/db'
import { isSystemAdmin } from '@/lib/userRoles'

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
  if (!isSystemAdmin(user.role)) return NextResponse.json({ message: 'System Admin access required' }, { status: 403 })

  const logs = await (await getDb()).collection('bookingAudit')
    .find({})
    .sort({ at: -1 })
    .limit(500)
    .toArray()

  return NextResponse.json({
    logs: logs.map(({ _id, ...log }) => ({ id: String(_id), ...log })),
  })
}
