import { toRaw } from 'vue'
import type { Lineup, LineupType, StoredImage } from '@/types'
import { getDB } from './database'

/*
 * IndexedDB 只能保存可结构化克隆的普通对象，Vue 的响应式代理（Proxy）会导致 DataCloneError，
 * 所以写入前统一转成普通对象。
 */
function plainLineup(l: Lineup): Lineup {
  const raw = toRaw(l)
  return { ...raw, imageIds: [...toRaw(raw.imageIds)] }
}

function plainType(t: LineupType): LineupType {
  return { ...toRaw(t) }
}

function plainImage(img: StoredImage): StoredImage {
  const raw = toRaw(img)
  return {
    id: raw.id,
    blob: toRaw(raw.blob),
    thumb: toRaw(raw.thumb),
    width: raw.width,
    height: raw.height,
    createdAt: raw.createdAt,
  }
}

export async function loadAll() {
  const db = await getDB()
  const tx = db.transaction(['lineups', 'types'], 'readonly')
  const [lineups, types] = await Promise.all([
    tx.objectStore('lineups').getAll(),
    tx.objectStore('types').getAll(),
  ])
  await tx.done
  return { lineups, types }
}

/**
 * 保存 Lineup，并在同一个事务里写入新图片、删除被移除的图片，
 * 保证 Lineup 引用的图片和数据库里的图片始终一致。
 */
export async function saveLineup(
  lineup: Lineup,
  newImages: StoredImage[] = [],
  removedImageIds: string[] = [],
) {
  const db = await getDB()
  const tx = db.transaction(['lineups', 'images'], 'readwrite')
  const images = tx.objectStore('images')
  await Promise.all([
    tx.objectStore('lineups').put(plainLineup(lineup)),
    ...newImages.map((img) => images.put(plainImage(img))),
    ...removedImageIds.map((id) => images.delete(id)),
  ])
  await tx.done
}

export async function deleteLineup(lineup: Lineup) {
  const db = await getDB()
  const tx = db.transaction(['lineups', 'images'], 'readwrite')
  const images = tx.objectStore('images')
  await Promise.all([
    tx.objectStore('lineups').delete(lineup.id),
    ...lineup.imageIds.map((id) => images.delete(id)),
  ])
  await tx.done
}

export async function putType(type: LineupType) {
  const db = await getDB()
  await db.put('types', plainType(type))
}

export async function putTypes(types: LineupType[]) {
  const db = await getDB()
  const tx = db.transaction('types', 'readwrite')
  await Promise.all(types.map((t) => tx.store.put(plainType(t))))
  await tx.done
}

/** 删除类型；如果有 Lineup 在用，把它们改到 reassignTo 类型 */
export async function deleteType(id: string, reassignTo: string | null, updatedAt: number) {
  const db = await getDB()
  const tx = db.transaction(['types', 'lineups'], 'readwrite')
  const lineups = tx.objectStore('lineups')
  const affected = await lineups.index('byType').getAll(id)
  if (affected.length && !reassignTo) {
    tx.done.catch(() => {})
    tx.abort()
    throw new Error('该类型仍有 Lineup 在使用，请先选择要转移到的类型')
  }
  await Promise.all([
    tx.objectStore('types').delete(id),
    ...affected.map((l) => lineups.put(plainLineup({ ...l, typeId: reassignTo!, updatedAt }))),
  ])
  await tx.done
  return affected.length
}

export async function getImage(id: string) {
  const db = await getDB()
  return db.get('images', id)
}

export async function getAllImageIds() {
  const db = await getDB()
  return db.getAllKeys('images')
}

export async function deleteImages(ids: string[]) {
  if (!ids.length) return
  const db = await getDB()
  const tx = db.transaction('images', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get('meta', key)) as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  const db = await getDB()
  await db.put('meta', value, key)
}

export async function deleteMeta(key: string) {
  const db = await getDB()
  await db.delete('meta', key)
}

export async function clearAll() {
  const db = await getDB()
  const tx = db.transaction(['lineups', 'types', 'images', 'meta'], 'readwrite')
  await Promise.all([
    tx.objectStore('lineups').clear(),
    tx.objectStore('types').clear(),
    tx.objectStore('images').clear(),
    tx.objectStore('meta').clear(),
  ])
  await tx.done
}

/** 统计图片占用（用于设置页展示） */
export async function imageStats() {
  const db = await getDB()
  let count = 0
  let bytes = 0
  let cursor = await db.transaction('images').store.openCursor()
  while (cursor) {
    count++
    bytes += (cursor.value.blob?.size ?? 0) + (cursor.value.thumb?.size ?? 0)
    cursor = await cursor.continue()
  }
  return { count, bytes }
}
