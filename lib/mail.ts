export function getMailFrom() {
  const configuredFrom = process.env.MAIL_FROM?.trim() ?? ''
  if (configuredFrom.includes('@')) return configuredFrom
  return `${configuredFrom || 'Studio Booking System'} <${process.env.SMTP_USER}>`
}
