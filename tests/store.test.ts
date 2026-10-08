import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { strToU8, zipSync } from 'fflate'
import { useLineups } from '@/stores/lineups'
import { resetDBConnection, DB_NAME, getDB } from '@/db/database'
import { exportBackup, parseBackup } from '@/db/backup'
import * as repo from '@/db/repo'
import type { Annotation, Lineup, LineupPath, StoredImage } from '@/types'

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
    expect(counts).toEqual({ types: 3, lineups: 1, images: 1, videos: 0 })

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

const samplePaths: LineupPath[] = [
  { id: 'p1', name: '', mode: 'knife', points: [{ x: 100, y: 100 }, { x: 800, y: 100 }] },
  { id: 'p2', name: '静步进点', mode: 'walk', points: [{ x: 800, y: 100 }, { x: 800, y: 500 }, { x: 900, y: 600 }] },
]

describe('landing reference and paths', () => {
  it('saves landing and paths, including reactive proxies from the forms', async () => {
    const store = useLineups()
    await store.init()
    const typeId = store.sortedTypes[0]!.id
    // 首页新建面板里的落点和路径都是响应式对象
    const draft = reactive({
      name: '带路径',
      typeId,
      agentId: 'brimstone',
      mapId: 'ascent',
      x: 800,
      y: 100,
      note: '',
      landing: { x: 1200, y: 300, delay: 2.5 },
      paths: samplePaths,
    })
    const l = await store.createLineup(draft, [])
    let fromDb = (await repo.loadAll()).lineups[0]!
    expect(fromDb.landing).toEqual({ x: 1200, y: 300, delay: 2.5 })
    expect(fromDb.paths).toEqual(samplePaths)

    // 详情页修改：换落点、删掉一条路径
    const form = reactive({ landing: { x: 10, y: 20, delay: null }, paths: [samplePaths[1]!] })
    await store.updateLineup(l.id, form)
    fromDb = (await repo.loadAll()).lineups[0]!
    expect(fromDb.landing).toEqual({ x: 10, y: 20, delay: null })
    expect(fromDb.paths.map((p) => p.id)).toEqual(['p2'])

    // 只改名字时保留落点和路径；关掉落点参照时存为 null
    await store.updateLineup(l.id, { name: '改名' })
    expect(store.lineupById.get(l.id)?.paths).toHaveLength(1)
    await store.updateLineup(l.id, { landing: null })
    expect((await repo.loadAll()).lineups[0]!.landing).toBeNull()
  })

  it('reads lineups saved by older versions without landing / paths', async () => {
    const old = {
      id: 'lu_old',
      name: '旧数据',
      typeId: 'type_x',
      agentId: 'brimstone',
      mapId: 'ascent',
      x: 1,
      y: 2,
      imageIds: [],
      note: '',
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Lineup
    const db = await getDB()
    await db.put('lineups', old)
    const store = useLineups()
    await store.init()
    const l = store.lineupById.get('lu_old')!
    expect(l.landing).toBeNull()
    expect(l.paths).toEqual([])
  })

  it('round-trips landing and paths through a backup', async () => {
    const store = useLineups()
    await store.init()
    await store.createLineup(
      {
        name: '备份路径',
        typeId: store.sortedTypes[0]!.id,
        agentId: 'brimstone',
        mapId: 'ascent',
        x: 800,
        y: 100,
        note: '',
        landing: { x: 5, y: 6, delay: 1.5 },
        paths: samplePaths,
      },
      [],
    )
    const { blob } = await exportBackup()
    await store.clearAll()
    await store.importBackup(await parseBackup(blob), 'replace')
    expect(store.lineups[0]).toMatchObject({ landing: { x: 5, y: 6, delay: 1.5 }, paths: samplePaths })
  })

  it('imports version 1 backups (before landing / paths existed)', async () => {
    const json = {
      format: 'valorant-lineup-notebook',
      version: 1,
      exportedAt: 1,
      types: [{ id: 't1', name: '燃烧弹', color: '#ff5a36', order: 0, createdAt: 1 }],
      lineups: [
        { id: 'l1', name: 'v1', typeId: 't1', agentId: 'brimstone', mapId: 'ascent', x: 1, y: 1, imageIds: [], note: '', createdAt: 1, updatedAt: 1 },
      ],
      images: [],
    }
    const zipped = zipSync({ 'backup.json': strToU8(JSON.stringify(json)) })
    const parsed = await parseBackup(new Blob([zipped as Uint8Array<ArrayBuffer>]))
    expect(parsed.lineups[0]).toMatchObject({ landing: null, paths: [] })
  })

  it('refuses backups from a newer site version', async () => {
    const zipped = zipSync({
      'backup.json': strToU8(JSON.stringify({ format: 'valorant-lineup-notebook', version: 99, lineups: [] })),
    })
    await expect(parseBackup(new Blob([zipped as Uint8Array<ArrayBuffer>]))).rejects.toThrow('更新版本')
  })
})

function fakeVideo(id: string, bytes = 500): StoredImage {
  return {
    id,
    kind: 'video',
    duration: 12.5,
    blob: new Blob([new Uint8Array(bytes).fill(5)], { type: 'video/mp4' }),
    thumb: new Blob([new Uint8Array(8).fill(4)], { type: 'image/webp' }),
    width: 1280,
    height: 720,
    createdAt: Date.now(),
  }
}

const sampleAnnotations: Annotation[] = [
  { id: 'a1', type: 'pen', color: '#ff4655', size: 12, points: [10, 10, 50, 60, 90, 20] },
  { id: 'a2', type: 'ellipse', color: '#ffd23f', size: 8, x: 100, y: 100, w: 200, h: 120 },
  { id: 'a3', type: 'arrow', color: '#3d9bff', size: 8, x1: 0, y1: 0, x2: 300, y2: 200 },
  { id: 'a4', type: 'text', color: '#ffffff', size: 60, x: 400, y: 300, text: '站这里\n跳投' },
]

describe('videos and annotations', () => {
  it('round-trips videos and image annotations through a backup', async () => {
    const store = useLineups()
    await store.init()
    const image = { ...fakeImage('img_n'), annotations: sampleAnnotations }
    await store.createLineup(
      { name: '视频', typeId: store.sortedTypes[0]!.id, agentId: 'brimstone', mapId: 'ascent', x: 1, y: 1, note: '' },
      [fakeVideo('vid_1'), image],
    )
    const { blob, counts, external } = await exportBackup()
    expect(counts).toMatchObject({ images: 1, videos: 1 })
    expect(external).toEqual([])

    await store.clearAll()
    const parsed = await parseBackup(blob)
    expect(parsed.missingImages).toBe(0)
    await store.importBackup(reactive(parsed), 'replace')
    const video = await repo.getImage('vid_1')
    expect(video).toMatchObject({ kind: 'video', duration: 12.5, width: 1280, height: 720 })
    expect(video!.blob.type).toBe('video/mp4')
    expect(video!.blob.size).toBe(500)
    expect((await repo.getImage('img_n'))!.annotations).toEqual(sampleAnnotations)
    expect(store.lineups[0]!.imageIds).toEqual(['vid_1', 'img_n'])
  })

  it('reads videos kept outside the zip only from safe paths', async () => {
    const store = useLineups()
    await store.init()
    await store.createLineup(
      { name: '外部视频', typeId: store.sortedTypes[0]!.id, agentId: 'brimstone', mapId: 'ascent', x: 1, y: 1, note: '' },
      [fakeVideo('vid_2', 300)],
    )
    const { blob, external } = await exportBackup({ externalVideos: true })
    expect(external.map((f) => f.path)).toEqual(['videos/vid_2.mp4'])

    // 没有提供视频文件夹：视频被跳过，并单独统计
    const alone = await parseBackup(blob)
    expect(alone.images).toHaveLength(0)
    expect(alone.missingExternal).toBe(1)
    expect(alone.lineups[0]!.imageIds).toEqual([])

    const asked: string[] = []
    const withFolder = await parseBackup(blob, {
      readExternal: async (path) => {
        asked.push(path)
        return new Blob([new Uint8Array(300)])
      },
    })
    expect(asked).toEqual(['videos/vid_2.mp4'])
    expect(withFolder.images[0]).toMatchObject({ id: 'vid_2', kind: 'video' })
    expect(withFolder.images[0]!.blob.type).toBe('video/mp4')

    // 备份里被改过的路径不会去读取
    const evil = {
      format: 'valorant-lineup-notebook',
      version: 3,
      types: [],
      lineups: [],
      images: [
        { id: 'x', kind: 'video', external: true, file: 'videos/../../secret.mp4', mime: 'video/mp4', thumbFile: 't' },
        { id: 'y', kind: 'video', external: true, file: '../outside.mp4', mime: 'video/mp4', thumbFile: 't' },
      ],
    }
    asked.length = 0
    const parsed = await parseBackup(new Blob([zipSync({ 'backup.json': strToU8(JSON.stringify(evil)) })]), {
      readExternal: async (path) => {
        asked.push(path)
        return null
      },
    })
    expect(asked).toEqual([])
    expect(parsed.missingExternal).toBe(2)
  })

  it('saves annotations with a regenerated thumbnail and keeps the original image', async () => {
    const store = useLineups()
    await store.init()
    const original = fakeImage('img_m')
    await store.createLineup(
      { name: '标注', typeId: store.sortedTypes[0]!.id, agentId: 'brimstone', mapId: 'ascent', x: 1, y: 1, note: '' },
      [original, fakeVideo('vid_3')],
    )
    const newThumb = new Blob([new Uint8Array(20).fill(1)], { type: 'image/webp' })
    const calls: number[] = []
    await store.annotateImage('img_m', reactive([...sampleAnnotations]), async (img, list) => {
      calls.push(list.length)
      expect(img.width).toBe(1920)
      return newThumb
    })
    expect(calls).toEqual([4])
    const saved = (await repo.getImage('img_m'))!
    expect(saved.annotations).toEqual(sampleAnnotations)
    expect(saved.thumb.size).toBe(20)
    expect(saved.blob.size).toBe(original.blob.size)

    // 清除全部标注
    await store.annotateImage('img_m', [], async () => newThumb)
    expect((await repo.getImage('img_m'))!.annotations).toBeUndefined()
    await expect(store.annotateImage('vid_3', sampleAnnotations, async () => newThumb)).rejects.toThrow('视频')
    await expect(store.annotateImage('nope', [], async () => newThumb)).rejects.toThrow()
  })
})
