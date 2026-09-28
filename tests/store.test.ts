import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useLineups } from '@/stores/lineups'
import { resetDBConnection, DB_NAME } from '@/db/database'
import { exportBackup, parseBackup } from '@/db/backup'
import * as repo from '@/db/repo'
import type { StoredImage } from '@/types'

function fakeImage(id: string, bytes = 32): StoredImage {
  return {
    id,
    blob: new Blob([new Uint8Array(bytes).fill(7)], { type: 'image/webp' }),
    thumb: new Blob([new Uint8Array(8).fill(3)], { type: 'image/webp' }),
    width: 1920,
    height: 1080,
    createdAt: Date.now(),
  }
}

beforeEach(async () => {
  await resetDBConnection()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  setActivePinia(createPinia())
})

describe('lineup store', () => {
  it('seeds default types on first run only', async () => {
    const store = useLineups()
    await store.init()
    expect(store.types.map((t) => t.name)).toEqual(['燃烧弹', '烟雾', '其他技巧'])
    for (const t of [...store.types]) await store.deleteType(t.id, null)
    setActivePinia(createPinia())
    const again = useLineups()
    await again.init()
    expect(again.types).toHaveLength(0)
  })

  it('creates, updates and deletes lineups together with their images', async () => {
    const store = useLineups()
    await store.init()
    const molly = store.sortedTypes[0]!
    const l = await store.createLineup(
      { name: 'A 点燃烧弹', typeId: molly.id, agentId: 'brimstone', mapId: 'ascent', x: 100, y: 200, note: '' },
      [fakeImage('img_1'), fakeImage('img_2')],
    )
    expect(l.imageIds).toEqual(['img_1', 'img_2'])
    expect(await repo.getImage('img_1')).toBeTruthy()

    // 删除第一张、新增一张并设为封面
    await store.updateLineup(l.id, { name: '改名' }, { imageIds: ['img_3', 'img_2'], newImages: [fakeImage('img_3')] })
    expect(store.lineupById.get(l.id)?.name).toBe('改名')
    expect(await repo.getImage('img_1')).toBeUndefined()
    expect(await repo.getImage('img_3')).toBeTruthy()

    await store.deleteLineup(l.id)
    expect(store.lineups).toHaveLength(0)
    expect(await repo.getAllImageIds()).toEqual([])
  })

  it('saves data that is wrapped in Vue reactive proxies', async () => {
    const store = useLineups()
    await store.init()
    // 界面里的草稿图片和表单都是响应式对象，直接写入 IndexedDB 会触发 DataCloneError
    const images = reactive([{ draft: fakeImage('img_r') }])
    const l = await store.createLineup(
      reactive({ name: 'reactive', typeId: store.sortedTypes[0]!.id, agentId: 'brimstone', mapId: 'ascent', x: 1, y: 2, note: '' }),
      images.map((i) => i.draft),
    )
    await store.updateLineup(l.id, reactive({ note: '改' }), { imageIds: store.lineupById.get(l.id)!.imageIds, newImages: [] })
    await store.updateType(store.sortedTypes[0]!.id, { color: '#123456' })
    const fromDb = (await repo.loadAll()).lineups[0]!
    expect(fromDb.note).toBe('改')
    expect(fromDb.imageIds).toEqual(['img_r'])
    expect((await repo.getImage('img_r'))?.blob.size).toBe(32)
  })

  it('rejects duplicate type names and reassigns lineups when deleting a type', async () => {
    const store = useLineups()
    await store.init()
    await expect(store.createType(' 燃烧弹 ', '#ffffff')).rejects.toThrow('已存在')
    const custom = await store.createType('信标', '#3b82f6')
    const l = await store.createLineup(
      { name: 'x', typeId: custom.id, agentId: 'brimstone', mapId: 'ascent', x: 1, y: 1, note: '' },
      [],
    )
    await expect(store.deleteType(custom.id, null)).rejects.toThrow()
    const target = store.sortedTypes[0]!.id
    await store.deleteType(custom.id, target)
    expect(store.lineupById.get(l.id)?.typeId).toBe(target)
    const fromDb = (await repo.loadAll()).lineups[0]!
    expect(fromDb.typeId).toBe(target)
  })

  it('round-trips a backup through export / import', async () => {
    const store = useLineups()
    await store.init()
    const t = store.sortedTypes[1]!
    await store.createLineup(
      { name: '备份测试', typeId: t.id, agentId: 'brimstone', mapId: 'haven', x: 4200, y: 5100, note: '备注' },
      [fakeImage('img_a', 100)],
    )
    const { blob, counts } = await exportBackup()
    expect(counts).toEqual({ types: 3, lineups: 1, images: 1 })

    await store.clearAll()
    expect(store.lineups).toHaveLength(0)

    const parsed = await parseBackup(blob)
    expect(parsed.missingImages).toBe(0)
    // 设置页会把解析结果放进响应式状态，同样要能写入
    await store.importBackup(reactive(parsed), 'replace')
    expect(store.lineups).toHaveLength(1)
    const restored = store.lineups[0]!
    expect(restored).toMatchObject({ name: '备份测试', x: 4200, y: 5100, note: '备注', typeId: t.id })
    const img = await repo.getImage('img_a')
    expect(img?.blob.size).toBe(100)
    expect(img?.blob.type).toBe('image/webp')
  })

  it('merges types by name when importing into a fresh browser', async () => {
    const store = useLineups()
    await store.init()
    const smoke = store.sortedTypes.find((t) => t.name === '烟雾')!
    const custom = await store.createType('信标', '#3b82f6')
    await store.createLineup(
      { name: '烟', typeId: smoke.id, agentId: 'brimstone', mapId: 'ascent', x: 10, y: 10, note: '' },
      [],
    )
    await store.createLineup(
      { name: '信标', typeId: custom.id, agentId: 'brimstone', mapId: 'ascent', x: 20, y: 20, note: '' },
      [],
    )
    const { blob } = await exportBackup()

    // 清空后重新生成默认类型（新的 id），模拟换了一个浏览器
    await store.clearAll()
    const freshSmoke = store.sortedTypes.find((t) => t.name === '烟雾')!
    expect(freshSmoke.id).not.toBe(smoke.id)

    await store.importBackup(await parseBackup(blob), 'merge')
    expect(store.types.map((t) => t.name).sort()).toEqual(['信标', '其他技巧', '烟雾', '燃烧弹'].sort())
    const imported = store.lineups.find((l) => l.name === '烟')!
    expect(imported.typeId).toBe(freshSmoke.id)
    const beacon = store.lineups.find((l) => l.name === '信标')!
    expect(store.typeName(beacon.typeId)).toBe('信标')
    // 追加的新类型排在已有类型之后
    expect(store.sortedTypes.at(-1)!.name).toBe('信标')
  })

  it('rejects files that are not backups', async () => {
    await expect(parseBackup(new Blob(['hello']))).rejects.toThrow()
  })
})
