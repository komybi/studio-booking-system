export const defaultDepartments = ['English', 'Arabic', 'Amharic', 'French', 'Somali']

export function normalizeDepartmentName(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function departmentKey(value: string) {
  return normalizeDepartmentName(value).toLocaleLowerCase('en-US')
}
