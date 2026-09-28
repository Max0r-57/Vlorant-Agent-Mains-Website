import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DB_NAME, resetDBConnection } from '@/db/database'
import { parseBackup } from '@/db/backup'
import {
  autoBackupFileName,
  autoBackupsToPrune,
  localDateKey,
  parseBackupFileName,
} from '@/lib/backupFiles'
import { useAutoBackup } from '@/stores/autoBackup'
import { useLineups } from '@/stores/lineups'
import type { StoredImage } from '@/types'

// ---------- 模拟浏览器的文件夹句柄（只实现用到的接口） ----------
interface FakeEntry {
  blob: Blob
  lastModified: number
}

class FakeWritable {
  private chunks: Blob[] = []
  constructor(
    private dir: FakeDir,
    private name: string,
  ) {}
  async write(data: Blob) {
    this.chunks.push(data)
  }
  async close() {
    this.dir.files.set(this.name, { blob: new Blob(this.chunks), lastModified: Date.now() })
  }
  async abort() {}
}

class FakeDir {
  readonly kind = 'directory'
  files = new Map<string, FakeEntry>()
  perm: PermissionState = 'granted'
  failWith: string | null = null
  constructor(public name = 'Lineup备份') {}
  async queryPermission() {
    return this.perm
  }
  async requestPermission() {
    return this.perm
  }
  fileHandle(name: string) {
    const files = this.files
    const dir = this
    return {
      kind: 'file' as const,
      name,
      async getFile() {
        const f = files.get(name)!
        return new File([f.blob], name, { lastModified: f.lastModified })
      },
      async createWritable() {
        return new FakeWritable(dir, name)
      },
    }
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (this.failWith) throw new DOMException('模拟失败', this.failWith)
    if (!this.files.has(name) && !opts?.create) throw new DOMException('不存在', 'NotFoundError')
    return this.fileHandle(name)
  }
  async removeEntry(name: string) {
    this.files.delete(name)
  }
  async *values() {
    for (const name of [...this.files.keys()]) yield this.fileHandle(name)
  }
  put(name: string) {
    this.files.set(name, { blob: new Blob(['x']), lastModified: 1 })
  }
}

function asHandle(dir: FakeDir) {
  return dir as unknown as FileSystemDirectoryHandle
}

function fakeImage(id: string): StoredImage {
  const blob = new Blob([new Uint8Array(64).fill(9)], { type: 'image/webp' })
  return { id, blob, thumb: blob, width: 640, height: 360, createdAt: Date.now() }
}

async function addLineup(name = 'A 点燃烧弹', images: StoredImage[] = []) {
  const store = useLineups()
  return store.createLineup(
    { name, typeId: store.sortedTypes[0]!.id, agentId: 'brimstone', mapId: 'ascent', x: 100, y: 200, note: '' },
    images,
  )
}

beforeEach(async () => {
  await resetDBConnection()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  setActivePinia(createPinia())
  await useLineups().init()
})

describe('backup file naming', () => {
  it('names one automatic backup per local day', () => {
    const d = new Date(2026, 8, 3, 23, 59)
    expect(localDateKey(d)).toBe('2026-09-03')
    expect(autoBackupFileName(d)).toBe('lineup-auto-2026-09-03.zip')
    expect(parseBackupFileName('lineup-auto-2026-09-03.zip')).toEqual({
      name: 'lineup-auto-2026-09-03.zip',
      kind: 'auto',
      date: '2026-09-03',
    })
    expect(parseBackupFileName('lineup-backup-20260903-1405.zip')).toMatchObject({
      kind: 'manual',
      date: '2026-09-03',
      time: '14:05',
    })
    expect(parseBackupFileName('lineup-auto-2026-09-03 (1).zip')).toBeNull()
    expect(parseBackupFileName('照片.zip')).toBeNull()
  })

  it('prunes only old automatic backups and never today', () => {
    const names = [
      'lineup-auto-2026-09-01.zip',
      'lineup-auto-2026-09-05.zip',
      'lineup-auto-2026-09-03.zip',
      'lineup-auto-2026-09-04.zip',
      'lineup-backup-20260801-1200.zip',
      '备注.txt',
    ]
    expect(autoBackupsToPrune(names, 2, '2026-09-05').sort()).toEqual([
      'lineup-auto-2026-09-01.zip',
      'lineup-auto-2026-09-03.zip',
    ])
    expect(autoBackupsToPrune(names, 0, '2026-09-05')).toEqual([])
    // 今天的文件即使超出保留数量也不会被删
    expect(autoBackupsToPrune(['lineup-auto-2026-09-05.zip', 'lineup-auto-2026-09-09.zip'], 1, '2026-09-05')).toEqual([])
  })
})

describe('auto backup store', () => {
  it('does not write a backup while there are no lineups', async () => {
    const ab = useAutoBackup()
    const dir = new FakeDir()
    ab.attach(asHandle(dir))
    const r = await ab.backupNow()
    expect(r).toEqual({ ok: false, reason: 'empty' })
    expect([...dir.files.keys()]).toEqual([])
  })

  it('writes a daily zip that contains everything needed to restore', async () => {
    const ab = useAutoBackup()
    const dir = new FakeDir()
    ab.attach(asHandle(dir))
    await addLineup('A 点燃烧弹', [fakeImage('img_1'), fakeImage('img_2')])

    const r = await ab.backupNow()
    const name = autoBackupFileName(new Date())
    expect(r).toEqual({ ok: true, file: name, lineups: 1 })
    expect(ab.lastFile).toBe(name)
    expect(ab.dirty).toBe(false)

    const restored = await parseBackup(dir.files.get(name)!.blob)
    expect(restored.lineups.map((l) => l.name)).toEqual(['A 点燃烧弹'])
    expect(restored.images.map((i) => i.id).sort()).toEqual(['img_1', 'img_2'])
    expect(restored.types).toHaveLength(3)

    // 同一天再次备份会更新同一个文件，而不是生成新文件
    await addLineup('B 点烟')
    await ab.backupNow()
    expect([...dir.files.keys()]).toEqual([name])
    expect((await parseBackup(dir.files.get(name)!.blob)).lineups).toHaveLength(2)
  })

  it('marks changes made through the lineup store as needing a backup', async () => {
    const ab = useAutoBackup()
    await ab.init()
    const dir = new FakeDir()
    ab.attach(asHandle(dir))
    expect(ab.dirty).toBe(false)

    const l = await addLineup()
    expect(ab.dirty).toBe(true)
    await ab.backupNow()
    expect(ab.dirty).toBe(false)

    await useLineups().updateLineup(l.id, { note: '改了备注' })
    expect(ab.dirty).toBe(true)
    await ab.backupNow()
    const saved = await parseBackup(dir.files.get(autoBackupFileName(new Date()))!.blob)
    expect(saved.lineups[0]!.note).toBe('改了备注')
  })

  it('keeps the configured number of automatic backups and leaves other files alone', async () => {
    const ab = useAutoBackup()
    const dir = new FakeDir()
    for (const d of ['01', '02', '03', '04', '05']) dir.put(`lineup-auto-2020-01-${d}.zip`)
    dir.put('lineup-backup-20200101-1200.zip')
    dir.put('我的笔记.txt')
    ab.attach(asHandle(dir))
    await ab.setKeepDays(2)
    await addLineup()
    await ab.backupNow()

    expect([...dir.files.keys()].sort()).toEqual(
      [autoBackupFileName(new Date()), 'lineup-auto-2020-01-05.zip', 'lineup-backup-20200101-1200.zip', '我的笔记.txt'].sort(),
    )
    const listed = await ab.listBackups()
    expect(listed.map((f) => f.kind)).toEqual(['auto', 'auto', 'manual'])
  })

  it('waits for permission instead of failing silently', async () => {
    const ab = useAutoBackup()
    const dir = new FakeDir()
    ab.attach(asHandle(dir))
    await addLineup()
    ab.markDirty()
    dir.perm = 'prompt'

    expect(await ab.backupNow()).toEqual({ ok: false, reason: 'permission' })
    expect(ab.needsAttention).toBe(true)
    expect(dir.files.size).toBe(0)

    dir.perm = 'granted'
    expect(await ab.authorize()).toBe(true)
    expect((await ab.backupNow()).ok).toBe(true)
    expect(ab.needsAttention).toBe(false)
  })

  it('reports a missing folder so the user can pick it again', async () => {
    const ab = useAutoBackup()
    const dir = new FakeDir()
    ab.attach(asHandle(dir))
    await addLineup()
    ab.markDirty()
    dir.failWith = 'NotFoundError'

    const r = await ab.backupNow()
    expect(r.ok).toBe(false)
    expect(ab.lastErrorCode).toBe('NotFoundError')
    expect(ab.lastError).toContain('找不到备份文件夹')
    expect(ab.needsAttention).toBe(true)
  })

  it('turns itself off when all data is cleared', async () => {
    const ab = useAutoBackup()
    await ab.init()
    const dir = new FakeDir()
    ab.attach(asHandle(dir))
    await addLineup()
    await ab.backupNow()

    await useLineups().clearAll()
    expect(ab.enabled).toBe(false)
    // 备份文件夹里的文件原样保留
    expect(dir.files.size).toBe(1)
  })
})
