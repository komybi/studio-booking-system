import { jsPDF } from 'jspdf'

type BookingReportRow = {
  title: string
  department: string
  date: string
  startTime: string
  endTime: string
  status: string
  requestedBy: string
}

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
  const pdf = new jsPDF()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const textWidth = pdf.internal.pageSize.getWidth() - 28
  const lineHeight = 6
  let y = 18

  const writeLine = (text: string) => {
    const lines = pdf.splitTextToSize(text, textWidth)
    if (y + lines.length * lineHeight > pageHeight - 14) {
      pdf.addPage()
      y = 18
    }
    pdf.text(lines, 14, y)
    y += lines.length * lineHeight
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  writeLine('Studio Booking System - Monthly Report')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  writeLine(monthLabel)
  y += 4
  writeLine(`Approved: ${counts.approved}    Pending: ${counts.pending}    Rejected: ${counts.rejected}`)
  y += 4
  writeLine(`Requests: ${bookings.length}`)
  y += 8
  pdf.setFont('helvetica', 'bold')
  writeLine('Request details')
  pdf.setFont('helvetica', 'normal')

  if (!bookings.length) {
    writeLine('No requests were recorded for this month.')
  } else {
    for (const [index, booking] of bookings.entries()) {
      y += 2
      pdf.setFont('helvetica', 'bold')
      writeLine(`${index + 1}. ${booking.title} - ${booking.status}`)
      pdf.setFont('helvetica', 'normal')
      writeLine(`${booking.department} | Requested by: ${booking.requestedBy}`)
      writeLine(`Scheduled: ${booking.date}, ${booking.startTime}-${booking.endTime}`)
    }
  }

  pdf.save(`studio-booking-report-${monthKey}.pdf`)
}
