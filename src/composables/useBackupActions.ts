import { describeFsError } from '@/lib/fsAccess'
import { useAutoBackup, type BackupOutcome } from '@/stores/autoBackup'
import { useUi } from '@/stores/ui'

/** 自动备份相关的操作 + 结果提示，设置页和页面顶部的提醒共用 */
export function useBackupActions() {
  const ab = useAutoBackup()
  const ui = useUi()

  function report(r: BackupOutcome, successText?: string) {
    if (r.ok) {
      ui.toast(successText ?? `已备份到「${ab.folderName}」：${r.file}`)
      return
    }
    switch (r.reason) {
      case 'empty':
        ui.toast('还没有任何 Lineup，暂时不需要备份', { kind: 'info' })
        break
      case 'permission':
        ui.toast('需要先允许网站访问备份文件夹', { kind: 'info' })
        break
      case 'busy':
        ui.toast('正在备份中，请稍等', { kind: 'info' })
        break
      case 'error':
        ui.toast(`备份失败：${r.error}`, { kind: 'error' })
        break
      case 'disabled':
        break
    }
  }

  /** 重新授权并补上还没备份的修改（必须由点击触发） */
  async function authorizeAndBackup() {
    const ok = await ab.authorize()
    if (!ok) {
      ui.toast('没有获得访问权限。如果之前选择了「不允许」，请在设置中重新选择备份文件夹', { kind: 'error', duration: 7000 })
      return false
    }
    if (ab.dirty) report(await ab.backupNow())
    else ui.toast('已允许访问备份文件夹')
    return true
  }

  /** 重新选择文件夹后立即备份一次（文件夹丢失、权限被拒绝时使用） */
  async function reconnectAndBackup() {
    try {
      const existing = await ab.connect()
      if (!existing) return false
      report(await ab.backupNow(), `已改为备份到「${ab.folderName}」`)
      return true
    } catch (e) {
      ui.toast(`无法使用这个文件夹：${describeFsError(e)}`, { kind: 'error' })
      return false
    }
  }

  return { report, authorizeAndBackup, reconnectAndBackup }
}
