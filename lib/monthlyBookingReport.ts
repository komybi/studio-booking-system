import { jsPDF } from 'jspdf'

type BookingReportRow = {
  id: string
  title: string
  department: string
  date: string
  startTime: string
  endTime: string
  studio?: string
  priority: string
  urgencyReason?: string
  status: string
  requestedBy: string
  requesterName?: string
  requesterEmail?: string
  phoneNumber?: string
  responsiblePerson?: string
  responsibleEmail?: string
  guest?: string
  guestCount?: number
  presenterName?: string
  presenterPhone?: string
  broadcastType?: string
  createdAt?: string | Date
  reviewedBy?: string
  reviewedByName?: string
  reviewedAt?: string | Date
}

const columns: { label: string; width: number; value: (booking: BookingReportRow) => string }[] = [
  { label: 'Booking ID', width: 1.2, value: (booking) => booking.id },
  { label: 'Program', width: 1.6, value: (booking) => booking.title },
  { label: 'Requester', width: 1.2, value: (booking) => booking.requesterName || booking.requestedBy },
  { label: 'Username / email', width: 1.4, value: (booking) => [booking.requestedBy, booking.requesterEmail].filter(Boolean).join(' / ') },
  { label: 'Department', width: 0.9, value: (booking) => booking.department },
  { label: 'Studio', width: 0.8, value: (booking) => booking.studio || '—' },
  { label: 'Date', width: 1, value: (booking) => booking.date },
  { label: 'Time', width: 0.9, value: (booking) => `${booking.startTime} - ${booking.endTime}` },
  { label: 'Priority', width: 0.7, value: (booking) => booking.priority },
  { label: 'Urgency reason', width: 1.4, value: (booking) => booking.urgencyReason || '—' },
  { label: 'Responsible person', width: 1.2, value: (booking) => [booking.responsiblePerson, booking.responsibleEmail].filter(Boolean).join(' / ') || '—' },
  { label: 'Status', width: 0.8, value: (booking) => booking.status },
  { label: 'Approved by', width: 1.1, value: (booking) => booking.reviewedByName || booking.reviewedBy || '—' },
  { label: 'Reviewed at', width: 1, value: (booking) => booking.reviewedAt ? new Date(booking.reviewedAt).toLocaleString() : '—' },
  { label: 'Request created', width: 1, value: (booking) => booking.createdAt ? new Date(booking.createdAt).toLocaleString() : '—' },
  { label: 'Phone', width: 1, value: (booking) => booking.phoneNumber || '—' },
  { label: 'Guest / count', width: 1, value: (booking) => [booking.guest, booking.guestCount === undefined ? '' : `Count: ${booking.guestCount}`].filter(Boolean).join(' / ') || '—' },
  { label: 'Presenter / phone', width: 1.2, value: (booking) => [booking.presenterName, booking.presenterPhone].filter(Boolean).join(' / ') || '—' },
  { label: 'Broadcast type', width: 1, value: (booking) => booking.broadcastType || '—' },
  { label: 'Urgency reason', width: 1.4, value: (booking) => booking.urgencyReason || '—' },
]

export function downloadMonthlyBookingReportPdf({
  monthLabel,
  monthKey,
  bookings,
  counts,
}: {
  monthLabel: string
  monthKey: string
  bookings: BookingReportRow[]
  counts: { approved: number; pending: number; rejected: number }
}) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 28
  const tableWidth = pageWidth - margin * 2
  const totalColumnWeight = columns.reduce((total, column) => total + column.width, 0)
  const columnWidths = columns.map((column) => tableWidth * column.width / totalColumnWeight)
  const fontSize = 7
  const lineHeight = 8
  let y = margin

  const drawHeader = (continued = false) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.text(`Studio Booking System - ${monthLabel} Report${continued ? ' (continued)' : ''}`, margin, y + 15)
    y += 26
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Approved: ${counts.approved}    Pending: ${counts.pending}    Rejected: ${counts.rejected}    Total: ${bookings.length}`, margin, y + 10)
    y += 20
  }

  const drawTableHeader = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(fontSize)
    const wrapped = columns.map((column, index) => pdf.splitTextToSize(column.label, columnWidths[index] - 8))
    const rowHeight = Math.max(20, ...wrapped.map((lines) => lines.length * lineHeight + 8))
    let x = margin
    wrapped.forEach((lines, index) => {
      pdf.setFillColor(232, 238, 245)
      pdf.setDrawColor(205, 214, 225)
      pdf.rect(x, y, columnWidths[index], rowHeight, 'FD')
      pdf.setTextColor(34, 51, 72)
      pdf.text(lines, x + 4, y + 5 + lineHeight)
      x += columnWidths[index]
    })
    y += rowHeight
  }

  drawHeader()
  drawTableHeader()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(fontSize)

  if (!bookings.length) {
    pdf.text('No bookings were recorded for this month.', margin, y + 14)
  } else {
    bookings.forEach((booking, rowIndex) => {
      const wrapped = columns.map((column, index) => pdf.splitTextToSize(column.value(booking), columnWidths[index] - 8))
      const rowHeight = Math.max(20, ...wrapped.map((lines) => lines.length * lineHeight + 8))
      if (y + rowHeight > pageHeight - margin) {
        pdf.addPage()
        y = margin
        drawHeader(true)
        drawTableHeader()
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(fontSize)
      }

      let x = margin
      wrapped.forEach((lines, index) => {
        pdf.setFillColor(rowIndex % 2 === 0 ? 255 : 247, rowIndex % 2 === 0 ? 255 : 249, rowIndex % 2 === 0 ? 255 : 252)
        pdf.setDrawColor(220, 226, 234)
        pdf.rect(x, y, columnWidths[index], rowHeight, 'FD')
        pdf.setTextColor(35, 48, 65)
        pdf.text(lines, x + 4, y + 5 + lineHeight)
        x += columnWidths[index]
      })
      y += rowHeight
    })
  }

  pdf.save(`studio-booking-report-${monthKey}.pdf`)
}
