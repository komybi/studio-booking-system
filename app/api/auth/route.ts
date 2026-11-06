import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createHash, randomBytes, randomUUID } from 'crypto'
import nodemailer from 'nodemailer'
import { getDb } from '@/lib/db'
import { getMailFrom } from '@/lib/mail'

const hash = (value: string, salt: string) => createHash('sha256').update(`${salt}:${value}`).digest('hex')
const json = (message: string, status = 400) => NextResponse.json({ message }, { status })
const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM)

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('studioflow_session')?.value
    const db = await getDb()
    const sessions = db.collection('sessions')
    const users = db.collection('users')
    const session = token ? await sessions.findOne({ token, expiresAt: { $gt: new Date() } }) : null
    const currentUser = session ? await users.findOne({ _id: session.userId }) : null
    if (currentUser?.role !== 'admin') return json('Administrator access required', 403)
    const registeredUsers = await users.find({}, { projection: { username: 1, email: 1, name: 1, role: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray()
    return NextResponse.json({ users: registeredUsers.map((item) => ({ username: item.username, email: item.email ?? '', name: item.name, role: item.role, status: 'Active' })) })
  } catch (error) {
    console.error('[v0] User list request failed', error)
    return json('Unable to load registered users.', 500)
  }
}

export async function PATCH(request: Request) {
  try { const body = await request.json(); const db = await getDb(); const cookieStore = await cookies(); const token = cookieStore.get('studioflow_session')?.value; const session = token ? await db.collection('sessions').findOne({ token, expiresAt: { $gt: new Date() } }) : null; const currentUser = session ? await db.collection('users').findOne({ _id: session.userId }) : null; if (currentUser?.role !== 'admin') return json('Administrator access required', 403); const username = String(body.username ?? '').trim().toLowerCase(); const updates = { name: String(body.name ?? '').trim(), email: String(body.email ?? '').trim().toLowerCase(), role: String(body.role ?? 'user') }; await db.collection('users').updateOne({ username }, { $set: updates }); return NextResponse.json({ ok: true }); } catch { return json('Unable to update user.', 500) }
}

export async function DELETE(request: Request) {
  try { const body = await request.json(); const db = await getDb(); const cookieStore = await cookies(); const token = cookieStore.get('studioflow_session')?.value; const session = token ? await db.collection('sessions').findOne({ token, expiresAt: { $gt: new Date() } }) : null; const currentUser = session ? await db.collection('users').findOne({ _id: session.userId }) : null; if (currentUser?.role !== 'admin') return json('Administrator access required', 403); const username = String(body.username ?? '').trim().toLowerCase(); if (username === currentUser.username) return json('You cannot delete your own account.', 400); await db.collection('users').deleteOne({ username }); return NextResponse.json({ ok: true }); } catch { return json('Unable to delete user.', 500) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
  const action = body.action as string
  const db = await getDb()
  const users = db.collection('users')
  const sessions = db.collection('sessions')

  if (action === 'login') {
    const identifier = String(body.username ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const user = await users.findOne({ $or: [{ username: identifier }, { email: identifier }] })
    if (!user || user.passwordHash !== hash(password, user.salt)) return json('Invalid username/email or password', 401)
    const token = randomBytes(32).toString('hex')
    await sessions.insertOne({ token, userId: user._id, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) })
    const normalizedRole = String(user.role).trim().toLowerCase().startsWith('admin') ? 'admin' : 'user'
    const response = NextResponse.json({ user: { username: user.username, role: normalizedRole, roleLabel: user.role, name: user.name } })
    response.cookies.set('studioflow_session', token, { httpOnly: true, sameSite: process.env.NODE_ENV === 'development' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7, path: '/' })
    return response
  }

  if (action === 'logout') {
    const cookieStore = await cookies()
    const token = cookieStore.get('studioflow_session')?.value
    if (token) await sessions.deleteOne({ token })
    const response = NextResponse.json({ ok: true })
    response.cookies.delete('studioflow_session')
    return response
  }

  if (action === 'register') {
    const username = String(body.username ?? '').trim().toLowerCase()
    const email = String(body.email ?? '').trim().toLowerCase()
    const name = String(body.name ?? username).trim()
    const allowedRoles = ['admin', 'user', 'Chief Executive Officer (CEO)', 'Pulse Of Africa Office (POA)', 'Media Technology and Digital Departments', 'Content Department Directors', 'Film Directors', 'Production Director', 'Studio and Digital Media Broadcasting Director', 'Department Team Leaders and Supervisors']
  const requestedRole = allowedRoles.includes(String(body.role)) ? String(body.role) : 'user'
    const cookieStore = await cookies()
    const token = cookieStore.get('studioflow_session')?.value
    const session = token ? await sessions.findOne({ token, expiresAt: { $gt: new Date() } }) : null
    const sessionUser = session ? await users.findOne({ _id: session.userId }) : null
    const existingAdmin = await users.findOne({ role: 'admin' })
    if (requestedRole === 'admin' && existingAdmin && sessionUser?.role !== 'admin') return json('Only an administrator can create admin users', 403)
    if (username.length < 3) return json('Username must be 3+ characters')
    if (!email.includes('@')) return json('A valid email is required')
    if (await users.findOne({ username })) return json('Username already exists', 409)
    if (await users.findOne({ email })) return json('Email already exists', 409)
const suppliedPassword = String(body.password ?? '')
  const temporaryPassword = suppliedPassword.length >= 8 ? suppliedPassword : `Studio-${randomBytes(4).toString('hex')}`
  const salt = randomUUID()
  await users.insertOne({ username, email, name, role: requestedRole, salt, passwordHash: hash(temporaryPassword, salt), mustChangePassword: suppliedPassword.length < 8, createdAt: new Date() })
    let emailSent = false
    if (sessionUser?.role === 'admin' && smtpConfigured()) {
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
      try {
        await transporter.sendMail({
          from: getMailFrom(),
          to: email,
          subject: 'Your Studio Booking System account',
          text: `Hello ${name},\n\nAn administrator created your Studio Booking System account.\n\nUsername: ${username}\nPassword: ${temporaryPassword}\n\nPlease sign in and change your password after your first login.`,
          html: `<p>Hello ${name},</p><p>An administrator created your Studio Booking System account.</p><p><strong>Username:</strong> ${username}<br><strong>Password:</strong> ${temporaryPassword}</p><p>Please sign in and change your password after your first login.</p>`,
        })
        emailSent = true
      } catch (error) {
        console.error('[v0] New user email failed', error)
      }
    }
    return NextResponse.json({ ok: true, emailSent, ...(!emailSent && suppliedPassword.length < 8 ? { temporaryPassword } : {}) })
  }

  if (action === 'change-password') {
    const cookieStore = await cookies()
    const token = cookieStore.get('studioflow_session')?.value
    const session = token ? await sessions.findOne({ token, expiresAt: { $gt: new Date() } }) : null
    if (!session) return json('Login required', 401)
    const password = String(body.password ?? '')
    if (password.length < 8) return json('Password must be 8+ characters')
    const salt = randomUUID()
    await users.updateOne({ _id: session.userId }, { $set: { salt, passwordHash: hash(password, salt), mustChangePassword: false } })
    return NextResponse.json({ ok: true })
  }
    return json('Unknown action')
  } catch (error) {
    console.error('[v0] Auth request failed', error)
    return json('Unable to complete the request. Check the database connection and try again.', 500)
  }
}
