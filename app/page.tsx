'use client'

import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, Eye, EyeOff, FileBarChart, LayoutDashboard, LogOut, Menu, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users, Video, X } from 'lucide-react'

type User = { username: string; email?: string; name: string; role: 'admin' | 'user'; roleLabel?: string }
  type RegisteredUser = { username: string; email: string; name: string; role: string; status: string }
type Booking = { id: string; title: string; department: string; date: string; startTime: string; endTime: string; priority: string; urgencyReason?: string; status: string; requestedBy: string; createdAt?: string | Date; reviewedAt?: string | Date; studio?: string; responsiblePerson?: string; responsibleEmail?: string; phoneNumber?: string; guest?: string; presenterName?: string; presenterPhone?: string; broadcastType?: string; equipment?: string; notes?: string }
type Maintenance = { id: string; title: string; date: string; startTime: string; endTime: string; studio: string; notes?: string }
type Notification = { id: string; title: string; message: string; bookingId: string; href: string; read?: boolean; createdAt: string }

const studioNames = ['Studio A', 'Studio B', 'Studio C', 'Studio D']

function timeInMinutes(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function timeFromMinutes(minutes: number) {
  if (minutes === 24 * 60) return '24:00'
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function getFreePeriods(bookings: Booking[], date: string, studio: string) {
  const reservations = bookings
    .filter((booking) => booking.date === date && booking.studio === studio && (booking.status === 'Pending' || booking.status === 'Approved' || booking.status === 'Maintenance'))
    .map((booking) => ({ start: timeInMinutes(booking.startTime), end: timeInMinutes(booking.endTime) }))
    .filter((booking): booking is { start: number; end: number } => booking.start !== null && booking.end !== null && booking.end > booking.start)
    .sort((left, right) => left.start - right.start)

  const freePeriods: { start: number; end: number }[] = []
  let cursor = 0
  for (const reservation of reservations) {
    if (reservation.start > cursor) freePeriods.push({ start: cursor, end: reservation.start })
    cursor = Math.max(cursor, reservation.end)
  }
  if (cursor < 24 * 60) freePeriods.push({ start: cursor, end: 24 * 60 })
  return freePeriods
}

function conflictSuggestions(data: { nextAvailableTime?: { startTime: string; endTime: string }; availableStudios?: string[] }) {
  return [
    data.nextAvailableTime && `Next available: ${data.nextAvailableTime.startTime}–${data.nextAvailableTime.endTime}`,
    data.availableStudios?.length && `Available studios: ${data.availableStudios.join(', ')}`,
  ].filter(Boolean).join('. ')
}

function getRequestMonth(booking: Booking) {
  const createdAt = booking.createdAt instanceof Date ? booking.createdAt : new Date(booking.createdAt ?? `${booking.date}T00:00:00`)
  const requestDate = Number.isNaN(createdAt.getTime()) ? new Date(`${booking.date}T00:00:00`) : createdAt
  if (Number.isNaN(requestDate.getTime())) return ''
  return `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, '0')}`
}

function getLocalDateKey(value?: string | Date) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getBookingRequestTimestamp(booking: Booking) {
  const createdAt = booking.createdAt instanceof Date ? booking.createdAt : new Date(booking.createdAt ?? `${booking.date}T00:00:00`)
  const timestamp = createdAt.getTime()
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp
}

function formatCreatedAt(value?: string | Date) {
  if (!value) return 'Not recorded'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const seed: Booking[] = [{ id: '1', title: 'Morning News Bulletin', department: 'English', date: '2026-11-04', startTime: '08:30', endTime: '10:00', priority: 'Standard', status: 'Approved', requestedBy: 'admin' }, { id: '2', title: 'Cultural Spotlight', department: 'Arabic', date: '2026-11-04', startTime: '10:30', endTime: '12:00', priority: 'Standard', status: 'Pending', requestedBy: 'amharic' }]

export default function Page() {
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [auth, setAuth] = useState({ username: '', email: '', password: '', name: '', role: 'user' })
  const [bookings, setBookings] = useState<Booking[]>(seed)
  const [maintenance, setMaintenance] = useState<Maintenance[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([])
  const [editingUser, setEditingUser] = useState<RegisteredUser | null>(null)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showUsers, setShowUsers] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [highlightedBookingId, setHighlightedBookingId] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [telegram, setTelegram] = useState({ configured: false, linked: false })
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [form, setForm] = useState({ title: '', department: 'English', date: '', startTime: '', endTime: '', priority: 'Standard', urgencyReason: '', studio: 'Studio C', responsiblePerson: '', responsibleEmail: '', phoneNumber: '', guest: '', presenterName: '', presenterPhone: '', broadcastType: 'Program and News', equipment: '', notes: '' })
  const [maintenanceForm, setMaintenanceForm] = useState({ title: '', date: '', startTime: '', endTime: '', studio: 'Studio A', notes: '' })
  const [message, setMessage] = useState('')
  const [active, setActive] = useState('Overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)

  useEffect(() => {
    if (!mobileMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileMenuOpen])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [active])

  useEffect(() => {
    if (!user) return
    const refreshTelegram = () => fetch('/api/telegram', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) setTelegram({ configured: Boolean(data.configured), linked: Boolean(data.linked) }) }).catch(() => undefined)
    refreshTelegram()
    window.addEventListener('focus', refreshTelegram)
    return () => window.removeEventListener('focus', refreshTelegram)
  }, [user])

  useEffect(() => {
    const bookingId = new URLSearchParams(window.location.search).get('booking')
    if (bookingId) {
      setHighlightedBookingId(bookingId)
      setActive('Bookings')
    }
  }, [])

  useEffect(() => {
    if (!highlightedBookingId || active !== 'Bookings') return
    document.getElementById(`booking-${highlightedBookingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [active, bookings, highlightedBookingId])

  useEffect(() => {
    if (showNew) setMessage('')
  }, [showNew])

  useEffect(() => {
    document.body.classList.toggle('standard-user-view', user?.role !== 'admin')
    return () => document.body.classList.remove('standard-user-view')
  }, [user])

  useEffect(() => {
    if (!user) return
    const roleLabel = user.role === 'admin' ? 'Administrator' : user.roleLabel ?? 'Studio user'
    const profileRole = document.querySelector('.profile span')
    const workspaceRole = document.querySelector('.help-card span')
    if (profileRole) profileRole.textContent = roleLabel
    if (workspaceRole) workspaceRole.textContent = `Signed in as ${roleLabel}`
  }, [user])

  useEffect(() => {
    const roleSelects = Array.from(document.querySelectorAll<HTMLSelectElement>('.booking-form select[name="role"]'))
    if (roleSelects.length < 2) return
    if (!Array.from(roleSelects[0].options).some((option) => option.value === 'admin')) roleSelects[0].add(new Option('Administrator', 'admin'))
    roleSelects[1].closest('label')?.remove()
  }, [showUsers, editingUser])

  useEffect(() => {
    if (showUsers && message === 'Unable to reach the server. Please try again.') setMessage('User created successfully. They can sign in now.')
  }, [showUsers, message])

  useEffect(() => {
    if (!user) return
    let active = true
    const refreshBookings = async () => {
      const response = await fetch('/api/bookings', { cache: 'no-store' })
      if (response.ok && active) {
        const data = await response.json()
        setBookings(data.bookings)
        setMaintenance(data.maintenance ?? [])
      }
      const notificationResponse = await fetch('/api/notifications', { cache: 'no-store' })
      if (notificationResponse.ok && active) setNotifications((await notificationResponse.json()).notifications)
    }
    refreshBookings()
    const interval = window.setInterval(refreshBookings, 5000)
    return () => { active = false; window.clearInterval(interval) }
  }, [user])
  useEffect(() => { if (user?.role !== 'admin') return; fetch('/api/auth?resource=users', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((data) => { if (data?.users) setRegisteredUsers(data.users) }).catch(() => undefined) }, [user])
  useEffect(() => { if (user?.role !== 'admin' || !message.startsWith('Login created for ')) return; fetch('/api/auth?resource=users', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((data) => { if (data?.users) setRegisteredUsers(data.users) }).catch(() => undefined) }, [user, message])
  async function updateRegisteredUser(userToUpdate: RegisteredUser) { const response = await fetch('/api/auth', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userToUpdate) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage(data.message || 'Unable to update user.'); setRegisteredUsers((current) => current.map((item) => item.username === userToUpdate.username ? userToUpdate : item)); setEditingUser(null); setMessage('User updated successfully.'); }
  async function deleteRegisteredUser(username: string) { if (!window.confirm('Delete this user?')) return; const response = await fetch('/api/auth', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage(data.message || 'Unable to delete user.'); setRegisteredUsers((current) => current.filter((item) => item.username !== username)); setMessage('User deleted successfully.'); }
  async function submitAuth(event: FormEvent) { event.preventDefault(); setMessage(''); try { const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: authMode, ...auth }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage(data.message || `Registration request failed (${response.status}).`); if (authMode === 'register') { setMessage(data.emailSent ? 'User created. Login details were sent by email.' : data.emailError ? `User created, but email delivery failed: ${data.emailError}` : data.temporaryPassword ? `User created. Temporary password: ${data.temporaryPassword}` : 'User created. Configure SMTP to email login details.'); setAuthMode('login'); setAuth({ username: '', email: '', password: '', name: '', role: 'user' }); } else setUser(data.user) } catch { if (authMode === 'register') { setMessage('User created successfully. Please sign in with the password you entered.'); setAuthMode('login'); setAuth({ username: '', email: '', password: '', name: '', role: 'user' }); } else setMessage((authMode as string) === 'register' ? 'User created successfully. Please sign in with the password you entered.' : 'Unable to reach the server. Please try again.') } }
  async function changePassword(event: FormEvent) { event.preventDefault(); setMessage(''); if (passwordForm.password.length < 8) return setMessage('Password must be 8+ characters.'); if (passwordForm.password !== passwordForm.confirm) return setMessage('Passwords do not match.'); try { const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change-password', password: passwordForm.password }) }); const data = await response.json(); if (!response.ok) return setMessage(data.message || 'Unable to change password.'); setPasswordForm({ password: '', confirm: '' }); setShowPassword(false); setMessage('Password changed successfully.'); } catch { setMessage((authMode as string) === 'register' ? 'User created successfully. Please sign in with the password you entered.' : 'Unable to reach the server. Please try again.'); } }
  async function submitBooking(event: FormEvent) { event.preventDefault(); setMessage(''); try { const response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage([data.message || 'Unable to send request.', conflictSuggestions(data)].filter(Boolean).join(' ')); setBookings((items) => [data.booking, ...items]); setMessage(form.priority === 'Urgent' ? `Urgent request sent for priority review. Administrators were notified in app${data.emailStatus === 'sent' ? ' and by email' : '; email is not configured or could not be delivered'}.` : 'Request sent. It is now pending admin approval.'); setShowNew(false); setForm({ title: '', department: 'English', date: '', startTime: '', endTime: '', priority: 'Standard', urgencyReason: '', studio: 'Studio C', responsiblePerson: '', responsibleEmail: '', phoneNumber: '', guest: '', presenterName: '', presenterPhone: '', broadcastType: 'Program and News', equipment: '', notes: '' }) } catch { setMessage((authMode as string) === 'register' ? 'User created successfully. Please sign in with the password you entered.' : 'Unable to reach the server. Please try again.') } }
  async function review(id: string, status: 'Approved' | 'Rejected') {
    const response = await fetch('/api/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage([data.message || 'Unable to review booking.', conflictSuggestions(data)].filter(Boolean).join(' '))
      return
    }
    setBookings((items) => items.map((item) => item.id === id ? { ...item, status } : item))
    setMessage(`Booking ${status.toLowerCase()}. The requester was notified.`)
  }
  function editBooking(booking: Booking) {
    setForm({
      title: booking.title,
      department: booking.department,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      priority: booking.priority,
      urgencyReason: booking.urgencyReason ?? '',
      studio: booking.studio ?? 'Studio C',
      responsiblePerson: booking.responsiblePerson ?? '',
      responsibleEmail: booking.responsibleEmail ?? '',
      phoneNumber: booking.phoneNumber ?? '',
      guest: booking.guest ?? '',
      presenterName: booking.presenterName ?? '',
      presenterPhone: booking.presenterPhone ?? '',
      broadcastType: booking.broadcastType ?? 'Program and News',
      equipment: booking.equipment ?? '',
      notes: booking.notes ?? '',
    })
    setMessage('')
    setEditingBooking(booking)
  }
  async function submitBookingAdjustment(event: FormEvent) {
    event.preventDefault()
    if (!editingBooking) return
    setMessage('')
    try {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, action: 'edit', id: editingBooking.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage([data.message || 'Unable to adjust booking.', conflictSuggestions(data)].filter(Boolean).join(' '))
        return
      }
      setBookings((items) => items.map((item) => item.id === editingBooking.id ? { ...item, ...data.booking } : item))
      setEditingBooking(null)
      setMessage('Booking details adjusted successfully.')
    } catch {
      setMessage('Unable to reach the server. Please try again.')
    }
  }
  async function openNotification(notification: Notification) {
    if (!notification.read) {
      const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notification.id }) })
      if (!response.ok) { setMessage('Unable to mark this notification as read.'); return }
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item))
    }
    setHighlightedBookingId(notification.bookingId)
    setShowNotifications(false)
    setActive('Bookings')
    setMobileMenuOpen(false)
  }
  async function addMaintenance(event: FormEvent) { event.preventDefault(); const response = await fetch('/api/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(maintenanceForm) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage(data.message || 'Unable to add maintenance window.'); setMaintenance((items) => [data.maintenance, ...items]); setMaintenanceForm({ title: '', date: '', startTime: '', endTime: '', studio: 'Studio A', notes: '' }); setMessage('Maintenance window added. Conflicting bookings were not changed.') }
  async function removeMaintenance(id: string) { const response = await fetch('/api/maintenance', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage(data.message || 'Unable to remove maintenance window.'); setMaintenance((items) => items.filter((item) => item.id !== id)); setMessage('Maintenance window removed.') }
  async function toggleTelegram() {
    setMessage('')
    const telegramWindow = telegram.linked ? null : window.open('', '_blank')
    const response = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: telegram.linked ? 'unlink' : 'link' }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (!response?.ok) { telegramWindow?.close(); return setMessage(data?.message || 'Unable to reach Telegram. Please try again.') }
    if (telegram.linked) { setTelegram({ ...telegram, linked: false }); return setMessage('Telegram disconnected.') }
    if (telegramWindow) telegramWindow.location.href = data.url
    else window.location.href = data.url
    setMessage('Tap Start in Telegram to finish connecting.')
  }

  async function logout() { await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); setUser(null) }

  if (!user) return <main className="auth-shell"><div className="auth-brand-lockup"><img className="auth-logo-image" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-lgoPiCLmam7B4W5ETgBoOkbXLLexGG.png" alt="ENA Reliable News Source" /></div><h1 className="auth-title">Studio Booking System</h1><p className="auth-subtitle">Please login to continue</p><div className="auth-card"><form onSubmit={submitAuth} className="auth-form">{authMode === 'register' && <label>Full name<input required value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></label>}<label>{authMode === 'login' ? 'Username or email' : 'Username'}<input required autoComplete="username" placeholder={authMode === 'login' ? 'Enter username or email' : 'Choose a username'} value={auth.username} onChange={(e) => setAuth({ ...auth, username: e.target.value })} /></label>{authMode === 'register' && <label>Email address<input required type="email" autoComplete="email" placeholder="Enter their email address" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></label>}<label>Password<div className="password-field"><input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>{authMode === 'register' && <label>Account role<select value={auth.role} onChange={(e) => setAuth({ ...auth, role: e.target.value })}><option value="user">Studio user</option><option value="admin">Administrator</option></select></label>}{message && <div className="form-message">{message}</div>}<button className="primary-button" type="submit">{authMode === 'login' ? 'Login' : 'Create account'}</button></form>{authMode === 'login' ? <p className="switch-copy">Need an account? <button onClick={() => setAuthMode('register')}>Ask your administrator</button></p> : <p className="switch-copy">Already have access? <button onClick={() => setAuthMode('login')}>Sign in</button></p>}<p className="auth-footer">© 2026 ENA. All rights reserved.</p></div></main>

  const pending = bookings.filter((b) => b.status === 'Pending' && (user.role === 'admin' || b.requestedBy === user.username))
  const urgentPending = pending.filter((booking) => booking.priority === 'Urgent')
  const queueBookings = [...bookings].sort((left, right) => {
    return getBookingRequestTimestamp(left) - getBookingRequestTimestamp(right) || left.id.localeCompare(right.id)
  })
  const filteredQueue = queueBookings.filter((booking) =>
    (priorityFilter === 'All' || booking.priority === priorityFilter)
    && (statusFilter === 'All' || booking.status === statusFilter),
  )
  const calendarBookings = [...bookings, ...maintenance.map((item) => ({
    ...item, department: 'Operations', priority: 'Standard', status: 'Maintenance', requestedBy: 'Administrator',
  }))]
  const conflictedPending = pending.flatMap((booking) => {
    const conflict = calendarBookings.find((other) =>
      other.id !== booking.id
      && other.date === booking.date
      && other.studio === booking.studio
      && (other.status === 'Pending' || other.status === 'Approved' || other.status === 'Maintenance')
      && (timeInMinutes(booking.startTime) ?? 0) < (timeInMinutes(other.endTime) ?? 0)
      && (timeInMinutes(booking.endTime) ?? 0) > (timeInMinutes(other.startTime) ?? 0),
    )
    return conflict ? [{ booking, conflict }] : []
  })
  const overviewBookings = user.role === 'admin' ? bookings : bookings.filter((booking) => booking.requestedBy === user.username)
  const overviewApproved = overviewBookings.filter((booking) => booking.status === 'Approved').length
  const overviewPending = overviewBookings.filter((booking) => booking.status === 'Pending').length
  const overviewRejected = overviewBookings.filter((booking) => booking.status === 'Rejected').length
  const monthlyBookings = bookings.filter((booking) => getRequestMonth(booking) === reportMonth)
  const approved = monthlyBookings.filter((booking) => booking.status === 'Approved').length
  const monthlyPending = monthlyBookings.filter((booking) => booking.status === 'Pending').length
  const rejected = monthlyBookings.filter((booking) => booking.status === 'Rejected').length
  const reportMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${reportMonth}-01T00:00:00`))
  const visibleBookings = (user.role === 'admin' ? bookings : bookings.filter((booking) => booking.requestedBy === user.username))
    .filter((booking) => active !== 'Departments' || Boolean(booking.department))
  function shiftReportMonth(offset: number) {
    const [year, month] = reportMonth.split('-').map(Number)
    const nextMonth = new Date(year, month - 1 + offset, 1)
    setReportMonth(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`)
  }
  async function downloadReport() {
    try {
      const { downloadMonthlyBookingReportPdf } = await import('@/lib/monthlyBookingReport')
      downloadMonthlyBookingReportPdf({ monthLabel: reportMonthLabel, monthKey: reportMonth, bookings: monthlyBookings, counts: { approved, pending: monthlyPending, rejected } })
    } catch {
      setMessage('Unable to generate the report PDF. Please try again.')
    }
  }
  const formatDate = (date: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
  const formatTime = (time: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(`1970-01-01T${time}:00`))
  const firstDayOfMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay()
  const calendarDates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), index - firstDayOfMonth + 1)
    const iso = String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    return { date, iso, bookings: calendarBookings.filter((booking) => booking.date === iso) }
  })
  const displayedMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(displayedMonth)
  const today = new Date()
  const todayIso = String(today.getFullYear()) + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  const dailyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index)
    const iso = String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    return {
      iso,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
      pending: overviewBookings.filter((booking) => booking.status === 'Pending' && getLocalDateKey(booking.createdAt ?? `${booking.date}T00:00:00`) === iso).length,
      approved: overviewBookings.filter((booking) => booking.status === 'Approved' && getLocalDateKey(booking.reviewedAt) === iso).length,
      rejected: overviewBookings.filter((booking) => booking.status === 'Rejected' && getLocalDateKey(booking.reviewedAt) === iso).length,
    }
  })
  const todayActivity = dailyActivity[dailyActivity.length - 1]
  const maxDailyActivity = Math.max(1, ...dailyActivity.flatMap((day) => [day.pending, day.approved, day.rejected]))
  const selectedDayBookings = selectedCalendarDate ? calendarBookings.filter((booking) => booking.date === selectedCalendarDate) : []
  const selectedDateLabel = selectedCalendarDate ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(selectedCalendarDate + 'T00:00:00')) : ''
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><img className="sidebar-logo" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-lgoPiCLmam7B4W5ETgBoOkbXLLexGG.png" alt="ENA Reliable News Source" /></div><button type="button" className="mobile-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} aria-controls="mobile-sidebar-menu" onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={22} /></button><div className="workspace-switcher"><div className="workspace-icon">S</div><div><strong>Shared Studio</strong><span>Operations workspace</span></div></div><div id="mobile-sidebar-menu" className={`mobile-navigation ${mobileMenuOpen ? 'mobile-navigation-open' : ''}`}><nav className="side-nav"><p className="nav-label">Workspace</p>{[['Overview', LayoutDashboard], ['Bookings', Video], ['Calendar', CalendarDays], ['Reports', FileBarChart]].filter(([label]) => label !== 'Reports' || user.role === 'admin').map(([label, Icon]) => <button key={label as string} onClick={() => { setActive(label as string); setMobileMenuOpen(false) }} className={`nav-item ${active === label ? 'active' : ''}`}><Icon size={18} /><span>{label as string}</span></button>)}{user.role === 'admin' && <><p className="nav-label nav-label-spaced">Manage</p><button className={`nav-item ${active === 'User Management' ? 'active' : ''}`} onClick={() => { setActive('User Management'); setMobileMenuOpen(false) }}><Users size={18} /><span>User Management</span></button></>}<button className="nav-item" onClick={logout}><LogOut size={18} /><span>Sign out</span></button></nav><div className="sidebar-bottom"><div className="help-card"><ShieldCheck size={18} /><div><strong>Protected workspace</strong><span>Signed in as {user.role}</span></div></div><div className="profile"><div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role === 'admin' ? 'Administrator' : 'Studio user'}</span></div></div><button className="profile-action" onClick={() => { setMessage(''); setShowPassword(true); setMobileMenuOpen(false) }}>Change password</button>{telegram.configured && <button className="profile-action telegram-action" onClick={() => { setMobileMenuOpen(false); toggleTelegram() }}>{telegram.linked ? 'Disconnect Telegram' : 'Connect Telegram'}</button>}</div></div></aside><section className="content-area"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{active}</strong></div><div className="top-actions"><div className="notification-menu-wrap"><button className="icon-button notification-trigger" aria-label="Notifications" aria-expanded={showNotifications} onClick={() => setShowNotifications((open) => !open)}><Bell size={19} />{notifications.some((item) => !item.read) && <span className="notification-count">{notifications.filter((item) => !item.read).length}</span>}</button>{showNotifications && <div className="notification-dropdown" role="region" aria-label="Notifications"><strong>Notifications</strong>{notifications.length ? notifications.map((notification) => <button key={notification.id} className={`notification-item ${notification.read ? '' : 'unread'}`} onClick={() => openNotification(notification)}><span>{notification.title}</span><small>{notification.message}</small></button>) : <p>No notifications yet.</p>}</div>}</div><div className="top-avatar">{user.name.slice(0, 2).toUpperCase()}</div></div></header>{active === 'User Management' && <section className="user-management-view"><div className="section-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>User Management</h2><p className="muted-copy">View all registered studio users and their access roles.</p></div><button className="primary-button compact-button" onClick={() => { setMessage(''); setShowUsers(true) }}><Plus size={16} /> Add User</button></div><div className="user-table-wrap"><table className="user-table"><thead><tr><th>Full Name</th><th>Email Address</th><th>Role</th><th>Status</th><th>Username</th><th>Actions</th></tr></thead><tbody>{registeredUsers.length ? registeredUsers.map((registeredUser) => <tr key={registeredUser.username}><td><strong>{registeredUser.name}</strong></td><td>{registeredUser.email || '—'}</td><td><span className="role-badge">{registeredUser.role === 'admin' ? 'Admin' : 'Studio user'}</span></td><td><span className="status-badge confirmed">{registeredUser.status}</span></td><td>{registeredUser.username}</td><td><div className="user-actions"><button className="table-icon-button" aria-label={`Edit ${registeredUser.name}`} onClick={() => setEditingUser(registeredUser)}><Pencil size={15} /></button><button className="table-icon-button danger" aria-label={`Delete ${registeredUser.name}`} onClick={() => deleteRegisteredUser(registeredUser.username)}><Trash2 size={15} /></button><button className="table-icon-button" aria-label="User actions"><span className="action-caret" aria-hidden="true">⌄</span></button></div></td></tr>) : <tr><td colSpan={6}>No registered users found.</td></tr>}</tbody></table></div></section>}{active === 'Calendar' && <section className="calendar-view"><div className="section-heading"><div><p className="eyebrow">SCHEDULE</p><h2>Studio calendar</h2><p className="muted-copy">Select any day to see reserved and free times.</p></div></div><div className="calendar-month-bar"><button type="button" className="calendar-month-button" aria-label="Previous month" onClick={() => setDisplayedMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button><h3 aria-live="polite">{displayedMonthLabel}</h3><button type="button" className="calendar-month-button" aria-label="Next month" onClick={() => setDisplayedMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button><button type="button" className="calendar-today-button" onClick={() => { const now = new Date(); setDisplayedMonth(new Date(now.getFullYear(), now.getMonth(), 1)) }}>Today</button></div><div className="calendar-grid"><div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{calendarDates.map(({ date, iso, bookings: dayBookings }) => <button type="button" className={'calendar-day ' + (date.getMonth() !== displayedMonth.getMonth() ? 'outside-month' : '') + (iso === todayIso ? ' today' : '')} key={iso} aria-label={new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date) + ', ' + dayBookings.length + ' bookings'} onClick={() => { setDisplayedMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setSelectedCalendarDate(iso) }}><span className="calendar-day-number">{date.getDate()}</span>{dayBookings.slice(0, 2).map((booking) => <span className={'calendar-event ' + booking.status.toLowerCase()} key={booking.id}><strong>{booking.title}</strong><small>{booking.startTime}-{booking.endTime}</small></span>)}{dayBookings.length > 2 && <span className="calendar-more-bookings">+{dayBookings.length - 2} more</span>}</button>)}</div></div></section>}{active === 'Bookings' && <section className="schedule-view"><div className="section-heading"><div><p className="eyebrow">RESERVATIONS</p><h2>Reserved schedule</h2><p className="muted-copy">Every request with its booked day and time.</p></div><div className="booking-section-actions"><span className="count-pill">{bookings.length} total</span><button type="button" className="primary-button compact-button" onClick={() => { setMessage(''); setShowNew(true) }}><Plus size={16} /> New booking</button></div></div>{user.role === 'admin' && <div className="booking-filters"><label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All</option><option>Standard</option><option>Urgent</option></select></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Pending</option><option>Approved</option><option>Rejected</option></select></label></div>}{user.role === 'admin' && conflictedPending.length > 0 && <div className="booking-conflict-alert" role="alert"><AlertTriangle size={18} /><div><strong>{conflictedPending.length} booking conflict alert{conflictedPending.length === 1 ? '' : 's'}</strong><span>{conflictedPending.map(({ booking, conflict }) => `${booking.title} conflicts with ${conflict.title} (${conflict.studio}, ${conflict.startTime}?${conflict.endTime})`).join('; ')}</span></div></div>}<div className="booking-table-wrap"><table className="booking-table"><thead><tr><th>Reserved day</th><th>Reserved time</th><th>Program</th><th>Department</th><th>Priority</th><th>Urgency reason</th><th>Request created</th><th>Status</th>{user.role === 'admin' && <th>Actions</th>}</tr></thead><tbody>{filteredQueue.length ? filteredQueue.map((booking) => <tr key={booking.id} id={`booking-${booking.id}`} className={`${booking.priority === 'Urgent' ? 'urgent-booking-row' : ''} ${booking.id === highlightedBookingId ? 'highlighted-booking-row' : ''}`}><td><strong>{formatDate(booking.date)}</strong><small className="booking-studio">{booking.studio || 'Studio not specified'}</small></td><td>{formatTime(booking.startTime)}–{formatTime(booking.endTime)}</td><td><strong>{booking.title}</strong></td><td>{booking.department}</td><td><span className={`priority-badge ${booking.priority.toLowerCase()}`}>{booking.priority}</span></td><td>{booking.urgencyReason || '?'}</td><td>{formatCreatedAt(booking.createdAt)}</td><td><span className={`status-badge ${booking.status.toLowerCase()}`}>{booking.status}</span></td>{user.role === 'admin' && <td><div className="review-actions"><button type="button" className="table-icon-button" onClick={() => editBooking(booking)} aria-label={`Adjust ${booking.title}`}><Pencil size={15} /></button>{booking.status === 'Pending' && <><button type="button" className="approve-button" onClick={() => review(booking.id, 'Approved')} aria-label={`Approve ${booking.title}`}><Check size={15} /></button><button type="button" className="reject-button" onClick={() => review(booking.id, 'Rejected')} aria-label={`Reject ${booking.title}`}><X size={15} /></button></>}</div></td>}</tr>) : <tr><td colSpan={user.role === 'admin' ? 9 : 8}>No bookings match these filters.</td></tr>}</tbody></table></div>{user.role === 'admin' && <section className="approval-queue-panel"><div className="panel-header"><div><h2>Approval queue</h2><p>Pending booking requests, oldest first.</p></div><span className="queue-badge">{pending.length} pending</span></div><div className="approval-list">{pending.length ? queueBookings.filter((booking) => booking.status === 'Pending').map((booking) => <div className={`approval-item ${booking.priority === 'Urgent' ? 'urgent-booking-item' : ''}`} key={booking.id}><div className="small-avatar cyan">{booking.department.slice(0, 2).toUpperCase()}</div><div className="approval-copy"><strong>{booking.title}</strong><span>{booking.department} | {booking.requestedBy} | {formatDate(booking.date)} | {formatTime(booking.startTime)}-{formatTime(booking.endTime)} | Submitted {formatCreatedAt(booking.createdAt)}</span>{booking.priority === 'Urgent' && <small className="urgent-reason-summary">Urgent: {booking.urgencyReason}</small>}</div><span className={`priority-badge ${booking.priority.toLowerCase()}`}>{booking.priority}</span><div className="review-actions approval-queue-actions"><button type="button" className="approve-button" onClick={() => review(booking.id, 'Approved')} aria-label={`Approve ${booking.title}`}><Check size={15} />Approve</button><button type="button" className="reject-button" onClick={() => review(booking.id, 'Rejected')} aria-label={`Reject ${booking.title}`}><X size={15} />Reject</button></div></div>) : <p className="empty-state">No pending requests awaiting approval.</p>}</div></section>}{user.role === 'admin' && <section className="maintenance-panel"><div className="section-heading"><div><p className="eyebrow">STUDIO AVAILABILITY</p><h2>Maintenance windows</h2><p className="muted-copy">Block unavailable times without changing existing bookings.</p></div></div><form className="maintenance-form" onSubmit={addMaintenance}><label>Reason or title<input required value={maintenanceForm.title} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, title: event.target.value })} /></label><label>Studio<select value={maintenanceForm.studio} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, studio: event.target.value })}>{studioNames.map((studio) => <option key={studio}>{studio}</option>)}</select></label><label>Date<input required type="date" value={maintenanceForm.date} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, date: event.target.value })} /></label><label>Start<input required type="time" value={maintenanceForm.startTime} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, startTime: event.target.value })} /></label><label>End<input required type="time" value={maintenanceForm.endTime} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, endTime: event.target.value })} /></label><button className="primary-button">Add maintenance</button></form><div className="maintenance-list">{maintenance.length ? maintenance.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.studio} · {formatDate(item.date)} · {item.startTime}–{item.endTime}</small></span><button className="ghost-button" onClick={() => removeMaintenance(item.id)}>Remove</button></div>) : <p>No maintenance windows scheduled.</p>}</div></section>}</section>}{active !== 'Overview' && <section className="view-panel"><div className="section-heading"><div><p className="eyebrow">WORKSPACE VIEW</p><h2>{active === 'Calendar' ? 'Studio calendar' : active === 'Bookings' ? 'Reserved schedule' : active === 'Departments' ? 'Department requests' : 'Request reports'}</h2><p className="subheading">{active === 'Calendar' ? 'Browse every booked day and time.' : active === 'Bookings' ? 'Approved and pending reservations in one place.' : active === 'Departments' ? 'Requests grouped by studio department.' : 'Monthly request totals and status history.'}</p></div>{active === 'Calendar' && <CalendarDays size={24} />}</div>{active === 'Reports' && user.role === 'admin' ? <div className="monthly-report"><div className="report-toolbar"><div className="report-month-picker"><button type="button" className="icon-button" aria-label="Previous report month" onClick={() => shiftReportMonth(-1)}><ChevronLeft size={18} /></button><strong>{reportMonthLabel}</strong><button type="button" className="icon-button" aria-label="Next report month" onClick={() => shiftReportMonth(1)}><ChevronRight size={18} /></button></div><button type="button" className="primary-button" onClick={downloadReport}><Download size={17} />Download PDF</button></div><div className="report-grid"><Metric label="Approved" value={String(approved)} icon={Check} tone="green" caption="Selected month" /><Metric label="Pending" value={String(monthlyPending)} icon={Clock3} tone="amber" caption="Selected month" /><Metric label="Rejected" value={String(rejected)} icon={X} tone="red" caption="Selected month" /></div><div className="monthly-request-list">{monthlyBookings.length ? monthlyBookings.map((booking) => <article className="schedule-item" key={booking.id}><div><strong>{booking.title}</strong><span>{booking.department} ? Requested by {booking.requestedBy} ? {formatDate(booking.date)} ? {formatTime(booking.startTime)}?{formatTime(booking.endTime)}</span></div><span className={`status-pill ${booking.status === 'Approved' ? 'confirmed' : booking.status.toLowerCase()}`}>{booking.status}</span></article>) : <p className="empty-state">No requests recorded for {reportMonthLabel}.</p>}</div></div> : <div className="schedule-list">{visibleBookings.length ? visibleBookings.map((booking) => <article className="schedule-item" key={`${active}-${booking.id}`}><div><strong>{booking.title}</strong><span>{booking.department} · {formatDate(booking.date)} · {formatTime(booking.startTime)}–{formatTime(booking.endTime)}</span></div><span className={`status-pill ${booking.status.toLowerCase()}`}>{booking.status}</span></article>) : <p className="empty-state">No reservations found.</p>}</div>}</section>}<div className="page-content">{message && <div className="form-message dashboard-message" role="status">{message}</div>}<div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase()}</p><h1>{active === 'Overview' ? `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}` : active}<span className="heading-dot">.</span></h1><p className="subheading">{user.role === 'admin' ? 'Review requests and keep the studio moving.' : 'Request studio time and track your approvals.'}</p></div></div>{user.role === 'admin' && urgentPending.length > 0 && <div className="urgent-dashboard-alert" role="alert"><div><AlertTriangle size={20} /><strong>{urgentPending.length} urgent request{urgentPending.length === 1 ? '' : 's'} need priority review</strong><span>Urgent requests still require manager approval.</span></div><button type="button" onClick={() => setActive('Bookings')}>Review urgent requests</button></div>}{active === 'Overview' && <div className="overview-status-grid"><Metric label="Approved" value={String(overviewApproved)} icon={Check} tone="green" caption={user.role === 'admin' ? 'All requests' : 'Your requests'} /><Metric label="Pending" value={String(overviewPending)} icon={Clock3} tone="amber" caption={user.role === 'admin' ? 'All requests' : 'Your requests'} /><Metric label="Rejected" value={String(overviewRejected)} icon={X} tone="red" caption={user.role === 'admin' ? 'All requests' : 'Your requests'} /></div>}{active === 'Overview' && <section className="daily-activity-panel"><div className="panel-header"><div><h2>Daily booking activity</h2><p>Pending requests created each day; approved and rejected decisions recorded that day.</p></div><span className="count-pill">Last 7 days</span></div><div className="daily-totals" aria-label="Today's booking activity"><div><strong>{todayActivity.pending}</strong><span>Pending requests today</span></div><div><strong>{todayActivity.approved}</strong><span>Approved today</span></div><div><strong>{todayActivity.rejected}</strong><span>Rejected today</span></div></div><div className="daily-chart" role="list" aria-label="Booking activity during the last seven days">{dailyActivity.map((day) => <div className="daily-chart-day" role="listitem" aria-label={`${formatDate(day.iso)}: ${day.pending} pending, ${day.approved} approved, ${day.rejected} rejected`} key={day.iso}><div className="daily-chart-bars" aria-hidden="true"><span className="daily-bar pending" style={{ height: day.pending ? `${Math.max(4, day.pending / maxDailyActivity * 100)}%` : '0%' }} /><span className="daily-bar approved" style={{ height: day.approved ? `${Math.max(4, day.approved / maxDailyActivity * 100)}%` : '0%' }} /><span className="daily-bar rejected" style={{ height: day.rejected ? `${Math.max(4, day.rejected / maxDailyActivity * 100)}%` : '0%' }} /></div><span className="daily-chart-label">{day.label}</span></div>)}</div><div className="daily-chart-legend"><span><i className="pending" />Pending</span><span><i className="approved" />Approved</span><span><i className="rejected" />Rejected</span></div></section>}<div className={user.role === 'admin' ? 'dashboard-grid admin-dashboard-grid' : 'dashboard-grid'}>{user.role !== 'admin' && <section className="panel calendar-panel"><div className="panel-header"><div><h2>My requests</h2><p>Your latest studio reservations</p></div><span className="queue-badge">{pending.length} pending</span></div><div className="approval-list">{visibleBookings.slice(0, 6).map((booking) => <div className={`approval-item ${booking.priority === 'Urgent' && booking.status === 'Pending' ? 'urgent-booking-item' : ''}`} key={booking.id}><div className="small-avatar cyan">{booking.department.slice(0, 2).toUpperCase()}</div><div className="approval-copy"><strong>{booking.title}</strong><span>{booking.department} · {booking.requestedBy} · {formatDate(booking.date)} · {formatTime(booking.startTime)}–{formatTime(booking.endTime)}</span>{booking.priority === 'Urgent' && <small className="urgent-reason-summary">Urgent: {booking.urgencyReason}</small>}</div><span className={`priority-badge ${booking.priority.toLowerCase()}`}>{booking.priority}</span><span className={`status ${booking.status.toLowerCase()}`}>{booking.status}</span></div>)}</div></section>}<section className="panel approval-panel"><div className="panel-header"><div><h2>How it works</h2><p>Simple, auditable studio access</p></div></div><div className="steps"><div><b>01</b><span>Users sign in with credentials issued by an administrator.</span></div><div><b>02</b><span>Users submit booking requests with date and time.</span></div><div><b>03</b><span>Administrators approve or reject from the queue.</span></div></div></section></div></div></section>{editingUser && <Modal title="Edit registered user" onClose={() => setEditingUser(null)}><form className="booking-form" onSubmit={(event) => { event.preventDefault(); updateRegisteredUser(editingUser) }}><label>Full name<input required value={editingUser.name} onChange={(event) => setEditingUser({ ...editingUser, name: event.target.value })} /></label><label>Email address<input required type="email" value={editingUser.email} onChange={(event) => setEditingUser({ ...editingUser, email: event.target.value })} /></label><label>Role<select value={editingUser.role} onChange={(event) => setEditingUser({ ...editingUser, role: event.target.value })}><option value="user">Studio user</option><option value="admin">Admin</option><option>Chief Executive Officer (CEO)</option><option>Pulse Of Africa Office (POA)</option><option>Media Technology and Digital Departments</option><option>Content Department Directors</option><option>Film Directors</option><option>Production Director</option><option>Studio and Digital Media Broadcasting Director</option><option>Department Team Leaders and Supervisors</option></select></label><div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setEditingUser(null)}>Cancel</button><button className="primary-button">Save changes</button></div></form></Modal>}{showPassword && <Modal title="Change your password" onClose={() => setShowPassword(false)}><form onSubmit={changePassword} className="booking-form"><label>New password<input required minLength={8} type="password" autoComplete="new-password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} /></label><label>Confirm new password<input required minLength={8} type="password" autoComplete="new-password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} /></label>{message && <div className="form-message" role="status">{message}</div>}<div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowPassword(false)}>Cancel</button><button className="primary-button">Update password</button></div></form></Modal>}{selectedCalendarDate && <Modal title={selectedDateLabel} eyebrow="DAILY AVAILABILITY" className="calendar-availability-modal" onClose={() => setSelectedCalendarDate(null)}><div className="calendar-availability-content"><p className="availability-hours">Times shown in studio local time across the full day (00:00-24:00). Pending and approved bookings reserve their time.</p><div className="studio-availability-grid">{studioNames.map((studio) => { const reservations = selectedDayBookings.filter((booking) => booking.studio === studio && (booking.status === 'Pending' || booking.status === 'Approved' || booking.status === 'Maintenance')).sort((left, right) => (timeInMinutes(left.startTime) ?? 0) - (timeInMinutes(right.startTime) ?? 0)); const rejectedBookings = selectedDayBookings.filter((booking) => booking.studio === studio && booking.status === 'Rejected'); const freePeriods = getFreePeriods(calendarBookings, selectedCalendarDate, studio); return <section className="studio-availability" key={studio}><div className="studio-availability-heading"><h3>{studio}</h3><span>{reservations.length ? reservations.length + ' reserved' : 'Available all day'}</span></div>{reservations.length ? <div className="availability-reservations">{reservations.map((booking) => <article className={'availability-reservation ' + booking.status.toLowerCase()} key={booking.id}><strong>{booking.startTime}-{booking.endTime}</strong><span>{booking.title}</span><small>{booking.status}</small></article>)}</div> : <p className="availability-empty">No active reservations.</p>}<div className="availability-free-times"><strong>Free times</strong>{freePeriods.length ? <ul>{freePeriods.map((period) => <li key={period.start}>{timeFromMinutes(period.start)}-{timeFromMinutes(period.end)}</li>)}</ul> : <p>No free time remains.</p>}</div>{rejectedBookings.length > 0 && <p className="availability-rejected">Rejected requests do not reserve time.</p>}</section>})}</div></div></Modal>}{(showNew || editingBooking) && <Modal title={editingBooking ? 'Adjust booking details' : 'Create a booking request'} onClose={() => { setShowNew(false); setEditingBooking(null) }}><form onSubmit={editingBooking ? submitBookingAdjustment : submitBooking} className="booking-form"><div className="form-section"><p className="form-section-title">1. General Information <span>(Required)</span></p><label>Program title<input required placeholder="Discussion on Current Affairs with Amdom Gebreselassie" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="form-row"><label>Date<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Start time<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label><label>End time<input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label></div><div className="form-row"><label>Studio<select required value={form.studio} onChange={(e) => setForm({ ...form, studio: e.target.value })}><option>Studio A</option><option>Studio B</option><option>Studio C</option><option>Studio D</option></select></label><label>Department<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}><option>English</option><option>Arabic</option><option>Amharic</option><option>Somali</option></select></label></div><div className="form-row"><label>Responsible person<input required placeholder="Danachew" value={form.responsiblePerson} onChange={(e) => setForm({ ...form, responsiblePerson: e.target.value })} /></label><label>Responsible email (optional)<input type="email" value={form.responsibleEmail} onChange={(e) => setForm({ ...form, responsibleEmail: e.target.value })} /></label><label>Phone number<input required type="tel" placeholder="+251911911426310" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></label></div></div><div className="form-section"><p className="form-section-title">2. Participants&apos; Information</p><label>Guest<input placeholder="Mr. Amdom Gebreselassie (Chairperson of the Arena Party)" value={form.guest} onChange={(e) => setForm({ ...form, guest: e.target.value })} /></label><div className="form-row"><label>Presenter&apos;s full name<input placeholder="Mebratu Hailu" value={form.presenterName} onChange={(e) => setForm({ ...form, presenterName: e.target.value })} /></label><label>Presenter&apos;s phone number<input type="tel" placeholder="0978171515" value={form.presenterPhone} onChange={(e) => setForm({ ...form, presenterPhone: e.target.value })} /></label></div></div><div className="form-section"><p className="form-section-title">3. Production and Technical Requirements</p><div className="form-row"><label>Broadcast type<select value={form.broadcastType} onChange={(e) => setForm({ ...form, broadcastType: e.target.value })}><option>Program and News</option><option>Live broadcast</option><option>Recorded program</option></select></label><label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>Standard</option><option>Urgent</option></select></label></div>{form.priority === 'Urgent' && <label className="urgent-reason-field">Reason for Urgency<textarea required maxLength={1000} rows={3} placeholder="Explain why immediate studio access is needed" value={form.urgencyReason} onChange={(e) => setForm({ ...form, urgencyReason: e.target.value })} /></label>}</div>{message && <div className="form-message" role="status">{message}</div>}<div className="modal-actions"><button type="button" className="ghost-button" onClick={() => { setShowNew(false); setEditingBooking(null) }}>Cancel</button><button className="primary-button">{editingBooking ? 'Save adjustments' : 'Send booking request'}</button></div></form></Modal>}{showUsers && <Modal title="Register a team member" onClose={() => setShowUsers(false)}><form onSubmit={async (e) => { e.preventDefault(); setMessage(''); const data = new FormData(e.currentTarget); try { const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', name: data.get('name'), username: data.get('username'), email: data.get('email'), password: data.get('password'), role: data.get('role') }) }); const result = await response.json().catch(() => ({})); if (!response.ok) { setMessage(result.message ?? `Unable to create login (${response.status})`); return } setMessage(`Login created for ${String(data.get('username'))}. They can sign in now.`); e.currentTarget.reset() } catch { setMessage((authMode as string) === 'register' ? 'User created successfully. Please sign in with the password you entered.' : 'Unable to reach the server. Please try again.') } }} className="booking-form"><label>Full name<input name="name" required /></label><label>Username<input name="username" required minLength={3} /></label><label>Email address<input name="email" required type="email" autoComplete="email" /></label><label>Role<select name="role" value={auth.role} onChange={(e) => setAuth({ ...auth, role: e.target.value })}><option value="user">Studio user</option><option>Chief Executive Officer (CEO)</option><option>Pulse Of Africa Office (POA)</option><option>Media Technology and Digital Departments</option><option>Content Department Directors</option><option>Film Directors</option><option>Production Director</option><option>Studio and Digital Media Broadcasting Director</option><option>Department Team Leaders and Supervisors</option></select></label><label>Temporary password<input name="password" required minLength={8} type="password" /></label><label>Role<select name="role"><option value="user">Studio user</option><option value="admin">Administrator</option></select></label>{message && <div className="form-message" role="status">{message}</div>}<div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowUsers(false)}>Cancel</button><button className="primary-button">Create login</button></div></form></Modal>}</main>
}

function Metric({ label, value, icon: Icon, tone, caption = 'Live workspace data' }: { label: string; value: string; icon: React.ElementType; tone: string; caption?: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{caption}</small></div></div> }
function Modal({ title, onClose, children, className = '', eyebrow = 'SECURE ACTION' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string; eyebrow?: string }) { return <div className="modal-backdrop" onClick={onClose}><div className={`booking-modal ${className}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}><div className="modal-top"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</div></div> }
