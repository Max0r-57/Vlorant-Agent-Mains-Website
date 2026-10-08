/**
 * 备份文件的命名与清理规则（纯函数，方便测试）。
 *
 * 自动备份：lineup-auto-2026-09-28.zip —— 每天一个文件，当天的修改都会更新这一个文件。
 * 手动导出：lineup-backup-20260928-1430.zip —— 自动清理永远不会删除手动导出的文件。
 */
const AUTO_RE = /^lineup-auto-(\d{4})-(\d{2})-(\d{2})\.zip$/
const MANUAL_RE = /^lineup-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.zip$/

/** 文件名只用英文字母，避免个别系统 / 网盘同步对中文文件名的兼容问题；内容是中文 */
export const BACKUP_README_NAME = 'lineup-backup-README.txt'

export interface BackupFileInfo {
  name: string
  kind: 'auto' | 'manual'
  /** YYYY-MM-DD */
  date: string
  /** HH:mm，仅手动导出的文件名里有 */
  time?: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** 本地日期 YYYY-MM-DD */
export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function autoBackupFileName(d: Date = new Date()) {
  return `lineup-auto-${localDateKey(d)}.zip`
}

export function parseBackupFileName(name: string): BackupFileInfo | null {
  const auto = AUTO_RE.exec(name)
  if (auto) return { name, kind: 'auto', date: `${auto[1]}-${auto[2]}-${auto[3]}` }
  const manual = MANUAL_RE.exec(name)
  if (manual) {
    return { name, kind: 'manual', date: `${manual[1]}-${manual[2]}-${manual[3]}`, time: `${manual[4]}:${manual[5]}` }
  }
  return null
}

/**
 * 需要删除的旧自动备份：按日期保留最新的 keepDays 个，keepDays <= 0 表示全部保留。
 * 只会返回自动备份文件，且永远不包括今天的文件。
 */
export function autoBackupsToPrune(names: readonly string[], keepDays: number, today: string): string[] {
  if (keepDays <= 0) return []
  const autos = names
    .map(parseBackupFileName)
    .filter((f): f is BackupFileInfo => f?.kind === 'auto')
    .sort((a, b) => b.date.localeCompare(a.date))
  return autos
    .slice(keepDays)
    .filter((f) => f.date !== today)
    .map((f) => f.name)
}

/** 写进备份文件夹的说明文件 */
export function backupReadme(siteUrl: string, guideUrl: string) {
  return [
    '这个文件夹是「无畏契约专精记忆」网站的自动备份文件夹。',
    '',
    '【文件说明】',
    '· lineup-auto-2026-09-28.zip 这类文件是自动备份：每天一个文件，当天的每次修改都会更新当天的文件；',
    '  旧的自动备份只保留最近若干天（天数可以在网站「设置 → 数据备份」里修改）。',
    '· lineup-backup-20260928-1430.zip 这类文件是手动导出的备份，网站不会自动删除它们。',
    '· 每个 zip 都包含当时的全部 Lineup、类型和图片，任意一个都可以单独用来恢复。',
    '· videos 文件夹里是 Lineup 中的视频：视频太大，不放进每天的 zip，每个只保存一次，',
    '  恢复时网站会从这里读取。请不要单独移动或删除这个文件夹。',
    '· 请不要重命名自动备份文件，否则网站无法识别和清理它们。',
    '',
    '【如何恢复】',
    `1. 用电脑上的 Edge 或 Chrome 打开网站：${siteUrl}`,
    '2. 点左下角「设置」→「数据备份」。',
    '3. 在「手动备份与恢复」里点「选择备份文件」，选择这里日期最新的 zip',
    '   （想找回更早的数据，就选更早日期的文件）。',
    '   如果已经开启了自动备份，也可以直接在「自动备份」下面的列表里点「恢复」。',
    '4. 选择「合并导入」（保留网站现有数据，再补回备份里的内容）',
    '   或「覆盖现有数据」（完全恢复成备份时的样子）。',
    '',
    `更详细的说明：${guideUrl}`,
    '',
  ].join('\r\n')
}
