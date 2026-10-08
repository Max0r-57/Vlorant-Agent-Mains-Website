import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as repo from '@/db/repo'
import { applyBackup, type ParsedBackup } from '@/db/backup'
import { plainAnnotations, renderAnnotatedThumb } from '@/lib/annotations'
import { refreshImages, releaseAllImages, releaseImages } from '@/lib/imageCache'
import { newId } from '@/lib/id'
import { plainLanding, plainPaths, sanitizeLanding, sanitizePaths } from '@/lib/paths'
import type { Annotation, Lineup, LineupDraft, LineupType, StoredImage } from '@/types'

/** 首次使用时自动创建的类型，之后可以在设置里改名、改色或删除 */
export const DEFAULT_TYPES: Pick<LineupType, 'name' | 'color'>[] = [
  { name: '燃烧弹', color: '#ff5a36' },
  { name: '烟雾', color: '#a78bfa' },
  { name: '其他技巧', color: '#34d399' },
]

/** 新建类型时的预设颜色（黄色留给详情页的「当前 Lineup」标记） */
export const TYPE_COLORS = [
  '#ff4655',
  '#ff7a1a',
  '#f59e0b',
  '#a3e635',
  '#34d399',
  '#2dd4bf',
  '#38bdf8',
  '#3b82f6',
  '#a78bfa',
  '#e879f9',
  '#f472b6',
  '#94a3b8',
]

const FALLBACK_TYPE = { name: '未分类', color: '#94a3b8' }

/** 旧版本保存的 Lineup 没有落点和路径字段，读取时补上默认值 */
function normalizeLineup(l: Lineup): Lineup {
  const landing = sanitizeLanding(l.landing)
  const paths = sanitizePaths(l.paths)
  return { ...l, landing, paths }
}

export const useLineups = defineStore('lineups', () => {
  const lineups = ref<Lineup[]>([])
  const types = ref<LineupType[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref<string | null>(null)

  const sortedTypes = computed(() =>
    [...types.value].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
  )
  const typeById = computed(() => new Map(types.value.map((t) => [t.id, t])))
  const lineupById = computed(() => new Map(lineups.value.map((l) => [l.id, l])))
  const countByType = computed(() => {
    const m = new Map<string, number>()
    for (const l of lineups.value) m.set(l.typeId, (m.get(l.typeId) ?? 0) + 1)
    return m
  })

  function typeOf(id: string) {
    return typeById.value.get(id)
  }
  function typeName(id: string) {
    return typeById.value.get(id)?.name ?? '未分类'
  }
  function typeColor(id: string) {
    return typeById.value.get(id)?.color ?? FALLBACK_TYPE.color
  }

  function makeType(name: string, color: string, order: number, createdAt = Date.now()): LineupType {
    return { id: newId('type'), name, color, order, createdAt }
  }

  /** 保证每个 Lineup 引用的类型都存在（导入不完整的备份后可能出现） */
  async function repairTypes() {
    const orphans = lineups.value.filter((l) => !typeById.value.has(l.typeId))
    if (!orphans.length) return
    let fallback = types.value.find((t) => t.name === FALLBACK_TYPE.name)
    if (!fallback) {
      fallback = makeType(FALLBACK_TYPE.name, FALLBACK_TYPE.color, types.value.length)
      await repo.putType(fallback)
      types.value = [...types.value, fallback]
    }
    const now = Date.now()
    for (const l of orphans) {
      const fixed = { ...l, typeId: fallback.id, updatedAt: now }
      await repo.saveLineup(fixed)
      replaceLocal(fixed)
    }
  }

  async function load() {
    const data = await repo.loadAll()
    lineups.value = data.lineups.map(normalizeLineup)
    types.value = data.types
    if (!types.value.length && !(await repo.getMeta<boolean>('seeded'))) {
      const now = Date.now()
      const seeded = DEFAULT_TYPES.map((t, i) => makeType(t.name, t.color, i, now + i))
      await repo.putTypes(seeded)
      await repo.setMeta('seeded', true)
      types.value = seeded
    }
    await repairTypes()
  }

  let initPromise: Promise<void> | null = null
  function init() {
    if (!initPromise) {
      status.value = 'loading'
      initPromise = load()
        .then(() => {
          status.value = 'ready'
        })
        .catch((err: unknown) => {
          console.error(err)
          error.value =
            err instanceof Error ? err.message : '无法打开本地数据库（IndexedDB），请检查浏览器设置'
          status.value = 'error'
          initPromise = null
        })
    }
    return initPromise
  }

  function replaceLocal(next: Lineup) {
    const i = lineups.value.findIndex((l) => l.id === next.id)
    if (i >= 0) lineups.value.splice(i, 1, next)
    else lineups.value.push(next)
  }

  async function createLineup(draft: LineupDraft, images: StoredImage[]) {
    const now = Date.now()
    const lineup: Lineup = {
      ...draft,
      id: newId('lu'),
      imageIds: images.map((i) => i.id),
      landing: plainLanding(draft.landing),
      paths: plainPaths(draft.paths),
      createdAt: now,
      updatedAt: now,
    }
    await repo.saveLineup(lineup, images)
    lineups.value.push(lineup)
    return lineup
  }

  /**
   * 更新 Lineup。
   * imageIds：最终的图片顺序（第一张是封面）；newImages：其中新上传、尚未入库的图片。
   */
  async function updateLineup(
    id: string,
    patch: Partial<LineupDraft>,
    images?: { imageIds: string[]; newImages: StoredImage[] },
  ) {
    const old = lineupById.value.get(id)
    if (!old) throw new Error('Lineup 不存在或已被删除')
    const next: Lineup = {
      ...old,
      ...patch,
      imageIds: images ? images.imageIds : old.imageIds,
      landing: plainLanding(patch.landing === undefined ? old.landing : patch.landing),
      paths: plainPaths(patch.paths ?? old.paths),
      updatedAt: Date.now(),
    }
    const removed = images ? old.imageIds.filter((i) => !images.imageIds.includes(i)) : []
    await repo.saveLineup(next, images?.newImages ?? [], removed)
    releaseImages(removed)
    replaceLocal(next)
    return next
  }

  /**
   * 保存图片标注：原图不变，写入标注并重新生成带标注的缩略图。
   * renderThumb 只在测试中替换（测试环境没有 Canvas）。
   */
  async function annotateImage(
    id: string,
    annotations: readonly Annotation[],
    renderThumb: typeof renderAnnotatedThumb = renderAnnotatedThumb,
  ) {
    const img = await repo.getImage(id)
    if (!img) throw new Error('图片不存在或已被删除')
    if (img.kind === 'video') throw new Error('视频不能添加标注')
    const list = plainAnnotations(annotations)
    const thumb = await renderThumb(img, list)
    await repo.putImage({ ...img, thumb, annotations: list })
    refreshImages([id])
  }

  async function deleteLineup(id: string) {
    const old = lineupById.value.get(id)
    if (!old) return
    await repo.deleteLineup(old)
    releaseImages(old.imageIds)
    lineups.value = lineups.value.filter((l) => l.id !== id)
  }

  function normalizeName(name: string) {
    return name.trim().replace(/\s+/g, ' ')
  }

  function assertTypeName(name: string, exceptId?: string) {
    if (!name) throw new Error('请输入类型名称')
    if (name.length > 20) throw new Error('类型名称最多 20 个字')
    const dup = types.value.find(
      (t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase(),
    )
    if (dup) throw new Error(`已存在名为「${dup.name}」的类型`)
  }

  async function createType(rawName: string, color: string) {
    const name = normalizeName(rawName)
    assertTypeName(name)
    const order = Math.max(-1, ...types.value.map((t) => t.order)) + 1
    const type = makeType(name, color, order)
    await repo.putType(type)
    types.value = [...types.value, type]
    return type
  }

  async function updateType(id: string, patch: Partial<Pick<LineupType, 'name' | 'color'>>) {
    const old = typeById.value.get(id)
    if (!old) throw new Error('类型不存在')
    const next = { ...old, ...patch }
    if (patch.name !== undefined) {
      next.name = normalizeName(patch.name)
      assertTypeName(next.name, id)
    }
    await repo.putType(next)
    types.value = types.value.map((t) => (t.id === id ? next : t))
    return next
  }

  /** 调整类型顺序：delta = -1 上移，1 下移 */
  async function moveType(id: string, delta: -1 | 1) {
    const list = [...sortedTypes.value]
    const i = list.findIndex((t) => t.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    const reordered = list.map((t, order) => ({ ...t, order }))
    await repo.putTypes(reordered)
    types.value = reordered
  }

  async function deleteType(id: string, reassignTo: string | null) {
    const now = Date.now()
    await repo.deleteType(id, reassignTo, now)
    types.value = types.value.filter((t) => t.id !== id)
    if (reassignTo) {
      lineups.value = lineups.value.map((l) =>
        l.typeId === id ? { ...l, typeId: reassignTo, updatedAt: now } : l,
      )
    }
  }

  async function importBackup(backup: ParsedBackup, mode: 'merge' | 'replace') {
    await applyBackup(backup, mode)
    releaseAllImages()
    await load()
  }

  async function clearAll() {
    await repo.clearAll()
    releaseAllImages()
    await load()
  }

  /** 删除没有被任何 Lineup 引用的图片，返回删除数量 */
  async function cleanupImages() {
    const used = new Set(lineups.value.flatMap((l) => l.imageIds))
    const all = await repo.getAllImageIds()
    const unused = all.filter((id) => !used.has(id))
    await repo.deleteImages(unused)
    releaseImages(unused)
    return unused.length
  }

  return {
    lineups,
    types,
    status,
    error,
    sortedTypes,
    typeById,
    lineupById,
    countByType,
    typeOf,
    typeName,
    typeColor,
    init,
    createLineup,
    updateLineup,
    annotateImage,
    deleteLineup,
    createType,
    updateType,
    moveType,
    deleteType,
    importBackup,
    clearAll,
    cleanupImages,
  }
})
