function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** 2026-09-28 */
export function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 2026-09-28 14:05 */
export function formatDateTime(ts: number) {
  const d = new Date(ts)
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 今年的日期省略年份：09-28 14:05 */
export function formatShort(ts: number, now = Date.now()) {
  const d = new Date(ts)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return sameYear ? md : `${d.getFullYear()}-${md}`
}

/** 本地日期字符串 YYYY-MM-DD（用于 <input type="date">） */
export function toDateInput(ts: number) {
  return formatDate(ts)
}

/** YYYY-MM-DD → 当天 00:00 的本地时间戳 */
export function parseDateInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}
