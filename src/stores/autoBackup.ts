import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef, toRaw } from 'vue'
import { exportBackup, parseBackup, readBackupSummary } from '@/db/backup'
import { deleteMeta, getMeta, setMeta } from '@/db/repo'
import { BACKUP_GUIDE_URL } from '@/data/links'
import {
  BACKUP_README_NAME,
  autoBackupFileName,
  autoBackupsToPrune,
  backupReadme,
  localDateKey,
  parseBackupFileName,
  type BackupFileInfo,
} from '@/lib/backupFiles'
import * as fsa from '@/lib/fsAccess'
import { useLineups } from './lineups'

/**
 * 自动备份到本地文件夹
 *
 * - 用户选择一个文件夹后，每次新增 / 修改 / 删除 Lineup 或类型，稍等几秒就把全部数据
 *   打包写进 lineup-auto-<日期>.zip（每天一个文件，当天的修改覆盖当天的文件），
 *   并按设置只保留最近若干天的自动备份。
 * - 文件夹的访问句柄保存在 IndexedDB 里，下次打开网站自动继续使用；
 *   浏览器可能要求重新授权，这时界面上会出现「允许访问」的提示。
 * - 没有任何 Lineup 时不会写入，避免空数据覆盖之前的备份。
 * - 「清空所有数据」会同时关闭自动备份（备份文件夹里的文件不会被删除）。
 */

const META_KEY = 'autoBackup'
const DEBOUNCE_MS = 3000
export const KEEP_DAY_OPTIONS = [3, 7, 14, 30, 0] as const
const DEFAULT_KEEP_DAYS = 7

interface StoredConfig {
  dir: FileSystemDirectoryHandle
  keepDays: number
  lastBackupAt: number | null
  lastFile: string | null
  lastCount: number | null
  lastError: string | null
  lastErrorCode: string | null
  dirty: boolean
}

export interface FolderBackup extends BackupFileInfo {
  size: number
  lastModified: number
}

export type BackupOutcome =
  | { ok: true; file: string; lineups: number }
  | { ok: false; reason: 'disabled' | 'empty' | 'permission' | 'busy' | 'error'; error?: string }

/** 会改变数据、需要重新备份的操作 */
const MUTATIONS = new Set([
  'createLineup',
  'updateLineup',
  'deleteLineup',
  'createType',
  'updateType',
  'moveType',
  'deleteType',
  'importBackup',
])

function siteUrl() {
  if (typeof location === 'undefined') return ''
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}`
}

export const useAutoBackup = defineStore('autoBackup', () => {
  const supported = fsa.isDirectoryPickerSupported()
  const dir = shallowRef<FileSystemDirectoryHandle | null>(null)
  const keepDays = ref(DEFAULT_KEEP_DAYS)
  const permission = ref<PermissionState>('prompt')
  const lastBackupAt = ref<number | null>(null)
  const lastFile = ref<string | null>(null)
  const lastCount = ref<number | null>(null)
  const lastError = ref<string | null>(null)
  const lastErrorCode = ref<string | null>(null)
  const dirty = ref(false)
  const running = ref(false)
  /** 用户暂时关掉了页面顶部的提醒（有新的修改时会重新出现） */
  const noticeDismissed = ref(false)

  const enabled = computed(() => !!dir.value)
  const folderName = computed(() => dir.value?.name ?? '')
  /** 有修改还没备份，而且需要用户处理（授权或出错） */
  const needsAttention = computed(
    () => enabled.value && dirty.value && !running.value && (permission.value !== 'granted' || !!lastError.value),
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  let changeSeq = 0
  let rerun = false
  let hooked = false

  async function persist() {
    const handle = dir.value
    if (!handle) {
      await deleteMeta(META_KEY)
      return
    }
    const cfg: StoredConfig = {
      dir: toRaw(handle),
      keepDays: keepDays.value,
      lastBackupAt: lastBackupAt.value,
      lastFile: lastFile.value,
      lastCount: lastCount.value,
      lastError: lastError.value,
      lastErrorCode: lastErrorCode.value,
      dirty: dirty.value,
    }
    await setMeta(META_KEY, cfg)
  }

  function clearStatus() {
    lastBackupAt.value = null
    lastFile.value = null
    lastCount.value = null
    lastError.value = null
    lastErrorCode.value = null
  }

  /** 使用某个文件夹（选择文件夹后调用，测试中也直接调用） */
  function attach(handle: FileSystemDirectoryHandle) {
    const changed = dir.value !== handle
    dir.value = markRaw(handle)
    permission.value = 'granted'
    if (changed) clearStatus()
    lastError.value = null
    lastErrorCode.value = null
    noticeDismissed.value = false
  }

  /** 只清理内存中的状态（数据库里的配置由调用方负责） */
  function resetLocal() {
    clearTimeout(timer)
    dir.value = null
    permission.value = 'prompt'
    dirty.value = false
    noticeDismissed.value = false
    clearStatus()
  }

  function hookStore() {
    if (hooked) return
    hooked = true
    useLineups().$onAction(({ name, after }) => {
      // 「清空所有数据」会把数据库连同备份设置一起清掉，这里同步关闭自动备份
      if (name === 'clearAll') after(() => resetLocal())
      else if (MUTATIONS.has(name)) after(() => markDirty())
    })
  }

  function onVisibility() {
    // 切换到其他窗口或关闭页面前，尽快把还没备份的修改写进去
    if (document.visibilityState === 'hidden' && dirty.value && dir.value && permission.value === 'granted') {
      void backupNow()
    }
  }

  async function init() {
    hookStore()
    if (!supported) return
    document.addEventListener('visibilitychange', onVisibility)
    const cfg = await getMeta<StoredConfig>(META_KEY).catch(() => undefined)
    if (!cfg?.dir || typeof cfg.dir.getFileHandle !== 'function') return
    dir.value = markRaw(cfg.dir)
    keepDays.value = cfg.keepDays ?? DEFAULT_KEEP_DAYS
    lastBackupAt.value = cfg.lastBackupAt ?? null
    lastFile.value = cfg.lastFile ?? null
    lastCount.value = cfg.lastCount ?? null
    lastError.value = cfg.lastError ?? null
    lastErrorCode.value = cfg.lastErrorCode ?? null
    dirty.value = !!cfg.dirty
    permission.value = await fsa.queryWritePermission(cfg.dir)
    // 上次关闭网站前有修改没来得及备份
    if (dirty.value && permission.value === 'granted') schedule(1000)
  }

  function schedule(delay = DEBOUNCE_MS) {
    clearTimeout(timer)
    timer = setTimeout(() => void backupNow(), delay)
  }

  function markDirty() {
    if (!dir.value) return
    changeSeq++
    dirty.value = true
    noticeDismissed.value = false
    void persist().catch(() => {})
    schedule()
  }

  async function prune(handle: FileSystemDirectoryHandle, today: string) {
    const names = await fsa.listFileNames(handle, (n) => parseBackupFileName(n)?.kind === 'auto')
    for (const name of autoBackupsToPrune(names, keepDays.value, today)) {
      await fsa.removeFile(handle, name)
    }
  }

  /** 立即备份（自动备份最终也调用这里） */
  async function backupNow(): Promise<BackupOutcome> {
    clearTimeout(timer)
    const handle = dir.value
    if (!handle) return { ok: false, reason: 'disabled' }
    if (running.value) {
      rerun = true
      return { ok: false, reason: 'busy' }
    }
    if (!useLineups().lineups.length) {
      // 没有任何 Lineup：不写入，避免用空数据覆盖之前的备份
      dirty.value = false
      await persist().catch(() => {})
      return { ok: false, reason: 'empty' }
    }
    permission.value = await fsa.queryWritePermission(handle)
    if (permission.value !== 'granted') return { ok: false, reason: 'permission' }

    running.value = true
    const seq = changeSeq
    try {
      const { blob, counts } = await exportBackup()
      const now = new Date()
      const name = autoBackupFileName(now)
      await fsa.writeFile(handle, name, blob)
      // 清理旧备份失败不影响这次备份本身
      await prune(handle, localDateKey(now)).catch(() => {})
      lastBackupAt.value = now.getTime()
      lastFile.value = name
      lastCount.value = counts.lineups
      lastError.value = null
      lastErrorCode.value = null
      // 备份期间如果又有新的修改，保持「未备份」状态，稍后再备份一次
      dirty.value = changeSeq !== seq
      return { ok: true, file: name, lineups: counts.lineups }
    } catch (e) {
      lastError.value = fsa.describeFsError(e)
      lastErrorCode.value = e instanceof Error ? e.name : null
      return { ok: false, reason: 'error', error: lastError.value }
    } finally {
      running.value = false
      await persist().catch(() => {})
      if (rerun || (dirty.value && !lastError.value)) {
        rerun = false
        if (dirty.value) schedule()
      }
    }
  }

  /**
   * 选择文件夹并开启自动备份。
   * 返回文件夹里已有的备份（用于提示恢复）；用户取消选择时返回 null。
   */
  async function connect(): Promise<FolderBackup[] | null> {
    const handle = await fsa.pickDirectory()
    if (!handle) return null
    let perm = await fsa.queryWritePermission(handle)
    if (perm !== 'granted') perm = await fsa.requestWritePermission(handle)
    if (perm !== 'granted') throw new Error('没有获得这个文件夹的写入权限')
    // 在文件夹里放一份说明（写入失败不影响自动备份本身）
    const readme = backupReadme(siteUrl(), BACKUP_GUIDE_URL)
    await fsa
      .writeFile(handle, BACKUP_README_NAME, new Blob(['\uFEFF', readme], { type: 'text/plain;charset=utf-8' }))
      .catch(() => {})
    attach(handle)
    changeSeq++
    dirty.value = true
    await persist()
    return listBackups()
  }

  /** 关闭自动备份（文件夹里已有的备份文件保留） */
  async function disconnect() {
    resetLocal()
    await deleteMeta(META_KEY)
  }

  /** 重新申请访问权限（需要在用户点击时调用） */
  async function authorize() {
    const handle = dir.value
    if (!handle) return false
    permission.value = await fsa.requestWritePermission(handle)
    if (permission.value !== 'granted') return false
    lastError.value = null
    lastErrorCode.value = null
    return true
  }

  async function setKeepDays(days: number) {
    keepDays.value = days
    await persist()
    const handle = dir.value
    if (handle && permission.value === 'granted') {
      await prune(handle, localDateKey(new Date())).catch(() => {})
    }
  }

  /** 文件夹里的备份文件（自动 + 手动），最新的在前 */
  async function listBackups(): Promise<FolderBackup[]> {
    const handle = dir.value
    if (!handle) return []
    const files = await fsa.listFiles(handle, (n) => !!parseBackupFileName(n))
    return files
      .map((f) => ({ ...parseBackupFileName(f.name)!, size: f.size, lastModified: f.lastModified }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.lastModified - a.lastModified)
  }

  async function readBackup(name: string) {
    if (!dir.value) throw new Error('还没有选择备份文件夹')
    return parseBackup(await fsa.readFile(dir.value, name))
  }

  async function readSummary(name: string) {
    if (!dir.value) throw new Error('还没有选择备份文件夹')
    return readBackupSummary(await fsa.readFile(dir.value, name))
  }

  return {
    supported,
    enabled,
    folderName,
    keepDays,
    permission,
    lastBackupAt,
    lastFile,
    lastCount,
    lastError,
    lastErrorCode,
    dirty,
    running,
    noticeDismissed,
    needsAttention,
    init,
    attach,
    connect,
    disconnect,
    authorize,
    backupNow,
    markDirty,
    setKeepDays,
    listBackups,
    readBackup,
    readSummary,
  }
})
