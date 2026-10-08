import { strFromU8, strToU8 } from 'fflate'
import { toRaw } from 'vue'
import { POS_MAX, type Lineup, type LineupType, type StoredImage } from '@/types'
import { plainAnnotations, sanitizeAnnotations } from '@/lib/annotations'
import { extForMime } from '@/lib/image'
import { plainLanding, plainPaths, sanitizeLanding, sanitizePaths } from '@/lib/paths'
import { createZip, openZip, type ZipArchive, type ZipInput } from '@/lib/zip'
import { getDB } from './database'

/**
 * 备份文件格式（.zip）：
 *   backup.json          类型、Lineup 和图片 / 视频的元数据
 *   images/<id>.<ext>    原图
 *   videos/<id>.<ext>    视频
 *   thumbs/<id>.<ext>    缩略图（视频为封面）
 *
 * 版本 2：Lineup 增加了落点参照（landing）和路径（paths）。
 * 版本 3：增加了视频和图片标注（annotations）。
 * 自动备份的压缩包不含视频本身（标记为 external）：视频单独存放在备份文件夹的 videos 子文件夹里，
 * 只写一次，不会每次修改都重写，恢复时再从那里读取。
 * 旧版本的备份仍然可以导入；旧版网站会拒绝导入新版本的备份，避免丢失数据。
 */
export const BACKUP_FORMAT = 'valorant-lineup-notebook'
export const BACKUP_VERSION = 3

interface ImageEntry {
  id: string
  /** 不填表示图片 */
  kind?: 'video'
  width: number
  height: number
  createdAt: number
  /** 压缩包内（external 时为备份文件夹内）的路径 */
  file: string
  mime: string
  thumbFile: string
  thumbMime: string
  duration?: number
  annotations?: unknown[]
  /** 文件不在压缩包里，而在备份文件夹中（自动备份的视频） */
  external?: true
}

interface BackupJson {
  format: string
  version: number
  exportedAt: number
  types: LineupType[]
  lineups: Lineup[]
  images: ImageEntry[]
}

export interface ParsedBackup {
  exportedAt: number
  types: LineupType[]
  lineups: Lineup[]
  images: StoredImage[]
  /** 数据里引用了、但压缩包中缺失的图片 / 视频数量 */
  missingImages: number
  /** 其中保存在自动备份文件夹 videos 子文件夹里、这次没能读到的视频数量 */
  missingExternal: number
}

/** 自动备份时单独保存的视频：path 是相对备份文件夹的路径（videos/<id>.<ext>） */
export interface ExternalFile {
  path: string
  blob: Blob
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function backupFileName(now = new Date()) {
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `lineup-backup-${d}-${t}.zip`
}

/**
 * 导出全部数据。
 * externalVideos：视频不放进压缩包，而是通过返回值 external 交给调用方单独保存（自动备份使用）。
 */
export async function exportBackup(opts: { externalVideos?: boolean } = {}) {
  const db = await getDB()
  const tx = db.transaction(['types', 'lineups', 'images'], 'readonly')
  const [types, lineups, images] = await Promise.all([
    tx.objectStore('types').getAll(),
    tx.objectStore('lineups').getAll(),
    tx.objectStore('images').getAll(),
  ])
  await tx.done

  // 图片、视频本身已经是压缩格式，原样放进压缩包（不复制数据，大视频也不会占用额外内存）
  const files: ZipInput[] = []
  const external: ExternalFile[] = []
  const entries: ImageEntry[] = []
  let videos = 0
  for (const img of images) {
    const video = img.kind === 'video'
    if (video) videos++
    const file = `${video ? 'videos' : 'images'}/${img.id}.${extForMime(img.blob.type)}`
    const thumbFile = `thumbs/${img.id}.${extForMime(img.thumb.type)}`
    const entry: ImageEntry = {
      id: img.id,
      width: img.width,
      height: img.height,
      createdAt: img.createdAt,
      file,
      mime: img.blob.type,
      thumbFile,
      thumbMime: img.thumb.type,
    }
    if (video) {
      entry.kind = 'video'
      entry.duration = img.duration ?? 0
    }
    if (img.annotations?.length) entry.annotations = plainAnnotations(img.annotations)
    if (video && opts.externalVideos) {
      entry.external = true
      external.push({ path: file, blob: img.blob })
    } else {
      files.push({ name: file, data: img.blob })
    }
    files.push({ name: thumbFile, data: img.thumb })
    entries.push(entry)
  }
  const json: BackupJson = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    types,
    lineups,
    images: entries,
  }
  files.unshift({ name: 'backup.json', data: strToU8(JSON.stringify(json, null, 2)), compress: true })
  return {
    blob: await createZip(files),
    counts: { types: types.length, lineups: lineups.length, images: images.length - videos, videos },
    external,
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function str(v: unknown, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clampPos(v: unknown) {
  return Math.min(POS_MAX, Math.max(0, Math.round(num(v, POS_MAX / 2))))
}

async function readJson(zip: ZipArchive): Promise<unknown> {
  const raw = await zip.bytes('backup.json').catch(() => null)
  if (!raw) throw new Error('压缩包中没有 backup.json，不是有效的备份文件')
  try {
    return JSON.parse(strFromU8(raw))
  } catch {
    throw new Error('backup.json 已损坏，无法解析')
  }
}

/** 只读取备份的概要（不读取图片、视频），用于列表和提示 */
export async function readBackupSummary(file: Blob) {
  const zip = await openZip(file).catch(() => null)
  if (!zip) throw new Error('不是有效的备份文件')
  const json = (await readJson(zip)) as Partial<BackupJson>
  if (!isObj(json) || json.format !== BACKUP_FORMAT) throw new Error('不是本网站的备份文件')
  const media = Array.isArray(json.images) ? json.images.filter(isObj) : []
  const videos = media.filter((e) => e.kind === 'video').length
  return {
    exportedAt: num(json.exportedAt),
    lineups: Array.isArray(json.lineups) ? json.lineups.length : 0,
    types: Array.isArray(json.types) ? json.types.length : 0,
    images: media.length - videos,
    videos,
  }
}

/** 备份引用的、存放在压缩包外（自动备份文件夹 videos 子文件夹）的文件路径 */
export async function readExternalPaths(file: Blob): Promise<string[]> {
  const json = await readJson(await openZip(file))
  if (!isObj(json) || !Array.isArray(json.images)) return []
  return json.images.filter(isObj).filter((e) => e.external === true).map((e) => str(e.file))
}

/**
 * 读取备份文件。
 * readExternal：读取存放在压缩包外的视频（从自动备份文件夹恢复时提供），读不到时返回 null。
 */
export async function parseBackup(
  file: Blob,
  opts: { readExternal?: (path: string) => Promise<Blob | null> } = {},
): Promise<ParsedBackup> {
  let zip: ZipArchive
  try {
    zip = await openZip(file)
  } catch {
    throw new Error('无法解压，请确认选择的是本网站导出的 .zip 备份文件')
  }
  const json = await readJson(zip)
  if (!isObj(json) || json.format !== BACKUP_FORMAT) throw new Error('不是本网站的备份文件')
  if (num(json.version) > BACKUP_VERSION) {
    throw new Error('备份文件来自更新版本的网站，请先更新网站后再导入')
  }

  const now = Date.now()
  const types: LineupType[] = (Array.isArray(json.types) ? json.types : [])
    .filter(isObj)
    .filter((t) => typeof t.id === 'string' && t.id)
    .map((t, i) => ({
      id: str(t.id),
      name: str(t.name, '未命名类型'),
      color: /^#[0-9a-f]{6}$/i.test(str(t.color)) ? str(t.color) : '#94a3b8',
      order: num(t.order, i),
      createdAt: num(t.createdAt, now),
    }))

  const images: StoredImage[] = []
  let missingExternal = 0
  for (const e of (Array.isArray(json.images) ? json.images : []).filter(isObj)) {
    const id = str(e.id)
    if (!id) continue
    const video = e.kind === 'video'
    const mime = str(e.mime, video ? 'video/mp4' : 'image/webp')
    let blob: Blob | null = null
    if (e.external === true) {
      // 只接受 videos/<文件名> 这样的路径，不允许跳到备份文件夹以外
      const path = str(e.file)
      if (/^videos\/[\w.-]+$/.test(path) && !path.includes('..') && opts.readExternal) {
        blob = await opts.readExternal(path).catch(() => null)
      }
      if (blob) blob = blob.slice(0, blob.size, mime)
      else missingExternal++
    } else {
      blob = await zip.blob(str(e.file), mime).catch(() => null)
    }
    if (!blob) continue
    // 缺少缩略图时：图片用原图代替；视频没有封面就跳过
    const thumb =
      (await zip.blob(str(e.thumbFile), str(e.thumbMime, 'image/webp')).catch(() => null)) ?? (video ? null : blob)
    if (!thumb) continue
    const img: StoredImage = {
      id,
      blob,
      thumb,
      width: num(e.width),
      height: num(e.height),
      createdAt: num(e.createdAt, now),
    }
    if (video) {
      img.kind = 'video'
      img.duration = Math.max(0, num(e.duration))
    } else {
      const annotations = sanitizeAnnotations(e.annotations)
      if (annotations.length) img.annotations = annotations
    }
    images.push(img)
  }
  const imageIds = new Set(images.map((i) => i.id))

  let missingImages = 0
  const lineups: Lineup[] = (Array.isArray(json.lineups) ? json.lineups : [])
    .filter(isObj)
    .filter((l) => typeof l.id === 'string' && l.id)
    .map((l) => {
      const refs = (Array.isArray(l.imageIds) ? l.imageIds : []).filter(
        (v): v is string => typeof v === 'string',
      )
      const kept = refs.filter((id) => imageIds.has(id))
      missingImages += refs.length - kept.length
      const createdAt = num(l.createdAt, now)
      return {
        id: str(l.id),
        name: str(l.name, '未命名 Lineup'),
        typeId: str(l.typeId),
        agentId: str(l.agentId),
        mapId: str(l.mapId),
        x: clampPos(l.x),
        y: clampPos(l.y),
        imageIds: kept,
        note: str(l.note),
        landing: sanitizeLanding(l.landing),
        paths: sanitizePaths(l.paths),
        createdAt,
        updatedAt: num(l.updatedAt, createdAt),
      }
    })

  return { exportedAt: num(json.exportedAt, now), types, lineups, images, missingImages, missingExternal }
}

/**
 * 写入备份。
 * merge：与现有数据合并，id 相同的记录以备份为准；
 *        名字相同的类型视为同一个类型（例如在新浏览器里导入时，默认类型不会重复出现）。
 * replace：先清空现有数据，再写入备份。
 */
export async function applyBackup(input: ParsedBackup, mode: 'merge' | 'replace') {
  // 界面上可能把解析结果放进了响应式状态，写入 IndexedDB 前取回原始对象
  const backup = toRaw(input)
  const types = toRaw(backup.types).map((t) => ({ ...toRaw(t) }))
  const images = toRaw(backup.images).map((item) => {
    const i = { ...toRaw(item) }
    if (i.annotations) i.annotations = plainAnnotations(i.annotations)
    return i
  })
  let lineups = toRaw(backup.lineups).map((l) => {
    const raw = toRaw(l)
    return { ...raw, imageIds: [...toRaw(raw.imageIds)], landing: plainLanding(raw.landing), paths: plainPaths(raw.paths) }
  })

  const db = await getDB()
  const tx = db.transaction(['types', 'lineups', 'images'], 'readwrite')
  const typesStore = tx.objectStore('types')
  const lineupStore = tx.objectStore('lineups')
  const imageStore = tx.objectStore('images')
  let typesToPut = types

  if (mode === 'replace') {
    await Promise.all([typesStore.clear(), lineupStore.clear(), imageStore.clear()])
  } else {
    // 类型：id 相同则覆盖；名字相同则并入已有类型；否则追加到末尾
    const existingTypes = await typesStore.getAll()
    const ids = new Set(existingTypes.map((t) => t.id))
    const byName = new Map(existingTypes.map((t) => [t.name.trim().toLowerCase(), t]))
    let order = Math.max(-1, ...existingTypes.map((t) => t.order))
    const remap = new Map<string, string>()
    typesToPut = []
    for (const t of types) {
      if (ids.has(t.id)) {
        typesToPut.push(t)
        continue
      }
      const same = byName.get(t.name.trim().toLowerCase())
      if (same) remap.set(t.id, same.id)
      else typesToPut.push({ ...t, order: ++order })
    }
    if (remap.size) lineups = lineups.map((l) => ({ ...l, typeId: remap.get(l.typeId) ?? l.typeId }))

    // 被覆盖的 Lineup 原来引用、但备份里不再引用的图片需要清掉
    const existing = await Promise.all(lineups.map((l) => lineupStore.get(l.id)))
    const keep = new Set(lineups.flatMap((l) => l.imageIds))
    const stale = existing.flatMap((l) => l?.imageIds ?? []).filter((id) => !keep.has(id))
    await Promise.all(stale.map((id) => imageStore.delete(id)))
  }
  await Promise.all([
    ...typesToPut.map((t) => typesStore.put(t)),
    ...images.map((i) => imageStore.put(i)),
    ...lineups.map((l) => lineupStore.put(l)),
  ])
  await tx.done
}
