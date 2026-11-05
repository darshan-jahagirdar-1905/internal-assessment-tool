// CSV export helpers (architecture.md section 9.6).

type Cell = string | number | boolean | null | undefined | Date

// Excel treats a cell starting with = + - @ (or a tab or carriage return) as a
// formula; a leading ' makes it plain text.
function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// A byte-order mark first, so Excel reads the file as UTF-8.
export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// "2026-11-05 16:13" in India time, which Excel reads as a date.
const istFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export function istDateTime(value: Date | null): string {
  if (!value) return ''
  const p = Object.fromEntries(istFormat.formatToParts(value).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}
