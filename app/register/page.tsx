'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'admin', phoneNumber: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [bootstrapAvailable, setBootstrapAvailable] = useState<boolean | null>(null)
  const [bootstrapError, setBootstrapError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/auth?resource=bootstrap', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok || typeof data?.canInitialize !== 'boolean') {
          throw new Error(data?.message || 'Unable to check initial account setup.')
        }
        if (active) setBootstrapAvailable(data.canInitialize)
      })
      .catch((error: unknown) => {
        if (!active) return
        setBootstrapError(error instanceof Error ? error.message : 'Unable to check initial account setup.')
      })
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setSuccess(false)
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', ...form }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return setMessage(data.message || `Registration failed (${response.status}).`)
      setSuccess(true)
      setMessage(data.emailSent ? 'Account created. Login details were sent by email.' : data.emailError ? `Account created, but email delivery failed: ${data.emailError}` : data.temporaryPassword ? `Account created. Temporary password: ${data.temporaryPassword}` : 'Account created successfully.')
      setForm({ name: '', username: '', email: '', password: '', role: 'admin', phoneNumber: '' })
    } catch {
      setMessage('Unable to reach the server. Please try again.')
    }
  }

  return <main className="auth-shell"><div className="auth-brand-lockup"><img className="auth-logo-image" src="/ena-logo.png" alt="ENA Reliable News Source" /></div><h1 className="auth-title">Initial System Administrator</h1><p className="auth-subtitle">Studio Booking System</p><div className="auth-card">{bootstrapAvailable === true ? <form onSubmit={submit} className="auth-form"><label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Username<input required minLength={3} autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label><label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Phone number<input required type="tel" value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} /></label><label>Password<div className="password-field"><input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label><label>Account role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">Admin</option></select></label>{message && <div className={`form-message ${success ? 'success-message' : ''}`} role="status">{message}</div>}<button className="primary-button" type="submit">Create account</button></form> : <p className="auth-subtitle" role={bootstrapError ? 'alert' : 'status'}>{bootstrapError || (bootstrapAvailable === false ? 'Initial setup is complete. Contact a System Admin to create an account.' : 'Checking initial account setup…')}</p>}<a className="auth-link" href="/">Back to login</a></div></main>
}
