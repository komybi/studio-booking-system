import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getDb } from '@/lib/db'
import { defaultDepartments, departmentKey, normalizeDepartmentName } from '@/lib/departments'
import { isSystemAdmin } from '@/lib/userRoles'

async function getCurrentUser() {
  const token = (await cookies()).get('studioflow_session')?.value
  if (!token) return null

  const db = await getDb()
  const session = await db.collection('sessions').findOne({ token, expiresAt: { $gt: new Date() } })
  if (!session) return null
  return db.collection('users').findOne({ _id: session.userId })
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: 'Please log in first' }, { status: 401 })

    const db = await getDb()
    const [savedDepartments, bookings, users] = await Promise.all([
      db.collection('departments').find({}, { projection: { name: 1 } }).sort({ name: 1 }).toArray(),
      db.collection('bookings').find({}, { projection: { department: 1 } }).toArray(),
      db.collection('users').find({}, { projection: { department: 1 } }).toArray(),
    ])
    const departments = new Map<string, string>()
    const departmentNames = [
      ...defaultDepartments,
      ...savedDepartments.map((item) => item.name),
      ...bookings.map((item) => item.department),
      ...users.map((item) => item.department),
    ]
    for (const name of departmentNames) {
      const normalized = normalizeDepartmentName(name)
      const key = departmentKey(normalized)
      if (key && !departments.has(key)) departments.set(key, normalized)
    }
    return NextResponse.json({ departments: [...departments.values()].sort((left, right) => left.localeCompare(right)) })
  } catch (error) {
    console.error('[departments] Unable to load departments', error)
    return NextResponse.json({ message: 'Unable to load departments.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user || !isSystemAdmin(user.role)) {
      return NextResponse.json({ message: 'System Admin access required' }, { status: user ? 403 : 401 })
    }

    const body = await request.json().catch(() => null)
    const name = normalizeDepartmentName(body?.name)
    if (!name || name.length > 80) {
      return NextResponse.json({ message: 'Enter a department name between 1 and 80 characters.' }, { status: 400 })
    }

    const db = await getDb()
    const departments = db.collection('departments')
    await departments.createIndex({ key: 1 }, { unique: true })
    const key = departmentKey(name)
    const existing = await departments.findOne({ key })
    if (existing) return NextResponse.json({ message: 'That department already exists.' }, { status: 409 })

    try {
      await departments.insertOne({ name, key, createdBy: user.username, createdAt: new Date() })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        return NextResponse.json({ message: 'That department already exists.' }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ ok: true, department: name }, { status: 201 })
  } catch (error) {
    console.error('[departments] Unable to add department', error)
    return NextResponse.json({ message: 'Unable to add department.' }, { status: 500 })
  }
}
