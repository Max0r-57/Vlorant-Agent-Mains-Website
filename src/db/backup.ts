import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate'
import { toRaw } from 'vue'
import { POS_MAX, type Lineup, type LineupType, type StoredImage } from '@/types'
import { extForMime } from '@/lib/image'
import { getDB } from './database'

/**
 * 备份文件格式（.zip）：
 *   backup.json          类型、Lineup 和图片的元数据
 *   images/<id>.<ext>    原图
 *   thumbs/<id>.<ext>    缩略图
 */
export const BACKUP_FORMAT = 'valorant-lineup-notebook'
export const BACKUP_VERSION = 1

interface ImageEntry {
  id: string
  width: number
  height: number
  createdAt: number
  file: string
  mime: string
  thumbFile: string
  thumbMime: string
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
  /** 数据里引用了、但压缩包中缺失的图片数量 */
  missingImages: number
}

function zipAsync(files: Zippable) {
  return new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data))),
  )
}

function unzipAsync(data: Uint8Array, only?: string) {
  return new Promise<Unzipped>((resolve, reject) =>
    unzip(data, only ? { filter: (f) => f.name === only } : {}, (err, files) => (err ? reject(err) : resolve(files))),
  )
}

async function toBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function backupFileName(now = new Date()) {
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `lineup-backup-${d}-${t}.zip`
}

export async function exportBackup() {
  const db = await getDB()
  const tx = db.transaction(['types', 'lineups', 'images'], 'readonly')
  const [types, lineups, images] = await Promise.all([
    tx.objectStore('types').getAll(),
    tx.objectStore('lineups').getAll(),
    tx.objectStore('images').getAll(),
  ])
  await tx.done

  const files: Zippable = {}
  const entries: ImageEntry[] = []
  for (const img of images) {
    const file = `images/${img.id}.${extForMime(img.blob.type)}`
    const thumbFile = `thumbs/${img.id}.${extForMime(img.thumb.type)}`
    // 图片本身已经是压缩格式，不再重复压缩
    files[file] = [await toBytes(img.blob), { level: 0 }]
    files[thumbFile] = [await toBytes(img.thumb), { level: 0 }]
    entries.push({
      id: img.id,
      width: img.width,
      height: img.height,
      createdAt: img.createdAt,
      file,
      mime: img.blob.type,
      thumbFile,
      thumbMime: img.thumb.type,
    })
  }
  const json: BackupJson = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    types,
    lineups,
    images: entries,
  }
  files['backup.json'] = strToU8(JSON.stringify(json, null, 2))
  const data = await zipAsync(files)
  return {
    blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    counts: { types: types.length, lineups: lineups.length, images: images.length },
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

/** 只读取备份的概要（不解压图片），用于列表和提示 */
export async function readBackupSummary(file: Blob) {
  const files = await unzipAsync(await toBytes(file), 'backup.json').catch(() => ({}) as Unzipped)
  const raw = files['backup.json']
  if (!raw) throw new Error('不是有效的备份文件')
  const json = JSON.parse(strFromU8(raw)) as Partial<BackupJson>
  if (json.format !== BACKUP_FORMAT) throw new Error('不是本网站的备份文件')
  return {
    exportedAt: num(json.exportedAt),
    lineups: Array.isArray(json.lineups) ? json.lineups.length : 0,
    types: Array.isArray(json.types) ? json.types.length : 0,
    images: Array.isArray(json.images) ? json.images.length : 0,
  }
}

export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  let files: Unzipped
  try {
    files = await unzipAsync(await toBytes(file))
  } catch {
    throw new Error('无法解压，请确认选择的是本网站导出的 .zip 备份文件')
  }
  const raw = files['backup.json']
  if (!raw) throw new Error('压缩包中没有 backup.json，不是有效的备份文件')
  let json: unknown
  try {
    json = JSON.parse(strFromU8(raw))
  } catch {
    throw new Error('backup.json 已损坏，无法解析')
  }
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
  for (const e of (Array.isArray(json.images) ? json.images : []).filter(isObj)) {
    const id = str(e.id)
    const data = files[str(e.file)]
    if (!id || !data) continue
    const thumbData = files[str(e.thumbFile)] ?? data
    const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: str(e.mime, 'image/webp') })
    const thumb = new Blob([thumbData as Uint8Array<ArrayBuffer>], {
      type: str(e.thumbMime, str(e.mime, 'image/webp')),
    })
    images.push({
      id,
      blob,
      thumb,
      width: num(e.width),
      height: num(e.height),
      createdAt: num(e.createdAt, now),
    })
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
        createdAt,
        updatedAt: num(l.updatedAt, createdAt),
      }
    })

  return { exportedAt: num(json.exportedAt, now), types, lineups, images, missingImages }
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
  const images = toRaw(backup.images).map((i) => ({ ...toRaw(i) }))
  let lineups = toRaw(backup.lineups).map((l) => ({ ...toRaw(l), imageIds: [...toRaw(l).imageIds] }))

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
