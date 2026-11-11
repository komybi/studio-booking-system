export const appRoles = [
  { value: 'admin', label: 'Admin' },
  { value: 'studio_admin', label: 'Studio Admin' },
  { value: 'department_head', label: 'Department Head' },
  { value: 'principal', label: 'Principal' },
  { value: 'viewer', label: 'Studio User (Viewer)' },
] as const

export type AppRole = (typeof appRoles)[number]['value']

export function normalizeAppRole(role: unknown): AppRole {
  const normalized = String(role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'admin' || (normalized.startsWith('admin') && normalized !== 'admin')) return 'admin'
  if (normalized === 'studio_admin') return 'studio_admin'
  if (normalized === 'department_head' || normalized === 'department_team_leaders_and_supervisors') return 'department_head'
  if (normalized === 'principal' || normalized === 'principals') return 'principal'
  return 'viewer'
}

export function appRoleLabel(role: unknown): string {
  const raw = String(role ?? '').trim()
  const canonical = appRoles.find((item) => item.value === raw)
  if (canonical) return canonical.label
  if (raw.toLowerCase() === 'user') return 'Studio User (Viewer)'
  if (raw.toLowerCase().replace(/[\s-]+/g, '_') === 'department_team_leaders_and_supervisors') return 'Department Head'
  return raw || 'Studio User (Viewer)'
}

export function isSystemAdmin(role: unknown): boolean {
  return normalizeAppRole(role) === 'admin'
}

export function isStudioAdmin(role: unknown): boolean {
  return normalizeAppRole(role) === 'studio_admin'
}

export function canViewAllBookings(role: unknown): boolean {
  const normalized = normalizeAppRole(role)
  return normalized === 'admin' || normalized === 'studio_admin'
}

export function canViewCalendar(role: unknown): boolean {
  const normalized = normalizeAppRole(role)
  return normalized === 'studio_admin' || normalized === 'department_head' || normalized === 'principal'
}
