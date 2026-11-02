import { toRaw } from 'vue'
import { plainAnnotations } from '@/lib/annotations'
import { plainLanding, plainRoutes, sanitizeRoutes } from '@/lib/paths'
import type { Lineup, LineupType, StoredImage } from '@/types'
import { getDB } from './database'

/*
 * IndexedDB 只能保存可结构化克隆的普通对象，Vue 的响应式代理（Proxy）会导致 DataCloneError，
 * 所以写入前统一转成普通对象。
 */
function plainLineup(l: Lineup): Lineup {
  // 直接从数据库读出的旧数据可能还是 paths 字段（还没有 routes），保存时转成新格式
  const { paths: legacyPaths, ...raw } = toRaw(l) as Lineup & { paths?: unknown }
  return {
    ...raw,
    imageIds: [...toRaw(raw.imageIds)],
    landing: plainLanding(raw.landing),
    routes: raw.routes ? plainRoutes(toRaw(raw.routes)) : sanitizeRoutes(undefined, legacyPaths),
    bug: raw.bug === true,
    invalid: raw.invalid === true,
  }
}

function plainType(t: LineupType): LineupType {
  return { ...toRaw(t) }
}

function plainImage(img: StoredImage): StoredImage {
  const raw = toRaw(img)
  const plain: StoredImage = {
    id: raw.id,
    blob: toRaw(raw.blob),
    thumb: toRaw(raw.thumb),
    width: raw.width,
    height: raw.height,
    createdAt: raw.createdAt,
  }
  if (raw.kind === 'video') {
    plain.kind = 'video'
    plain.duration = raw.duration ?? 0
  }
  if (raw.annotations?.length) plain.annotations = plainAnnotations(raw.annotations)
  if (raw.crop) plain.crop = { x: raw.crop.x, y: raw.crop.y, w: raw.crop.w, h: raw.crop.h }
  return plain
}

/*
 * iPhone / iPad 上的浏览器（都是 Safari 的 WebKit 内核）有时不能把文件数据直接写进 IndexedDB，
 * 会报「Error preparing Blob/File data to be stored in object store」：
 * 例如导入备份时直接引用压缩包里的一段（文件切片），或者上传时选中的原文件。
 * 先按原样写入（电脑上大视频不用整个读进内存）；失败时把图片 / 视频读进内存换成普通 Blob，再写一次。
 */
async function inMemoryBlob(b: Blob): Promise<Blob> {
  return new Blob([await b.arrayBuffer()], { type: b.type })
}

async function inMemoryImage(img: StoredImage): Promise<StoredImage> {
  const raw = toRaw(img)
  return { ...raw, blob: await inMemoryBlob(toRaw(raw.blob)), thumb: await inMemoryBlob(toRaw(raw.thumb)) }
}

/** write 失败时（事务已整个回滚），把 images 的数据读进内存后重试一次 */
export async function withImageFallback<T>(
  images: readonly StoredImage[],
  write: (images: readonly StoredImage[]) => Promise<T>,
): Promise<T> {
  try {
    return await write(images)
  } catch (e) {
    if (!images.length) throw e
    const copies: StoredImage[] = []
    for (const img of images) copies.push(await inMemoryImage(img))
    return await write(copies)
  }
}

/**
 * 发出一组写入请求并等待全部完成。某个请求同步抛出异常（例如数据不能保存）时也照样收集其余请求，
 * 事务回滚后它们的失败都有人处理，不会变成「未处理的 Promise」。
 */
export function allRequests(requests: readonly (() => Promise<unknown>)[]) {
  return Promise.all(
    requests.map((r) => {
      try {
        return r()
      } catch (e) {
        return Promise.reject(e)
      }
    }),
  )
}

type AnyTx = { done: Promise<void>; abort(): void }

/**
 * 在事务里执行 run：出错时主动回滚（写入请求同步抛出的异常不会自动回滚事务），
 * 保证要么全部写入、要么什么都没写。
 */
export async function inTransaction<T extends AnyTx, R>(tx: T, run: (tx: T) => Promise<R>): Promise<R> {
  // 事务失败时 tx.done 会 reject；先接上处理，避免在 run 出错时变成未处理的 Promise
  const done = tx.done
  done.catch(() => {})
  try {
    const result = await run(tx)
    await done
    return result
  } catch (e) {
    try {
      tx.abort()
    } catch {
      // 事务已经结束（已回滚）
    }
    throw e
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
  await withImageFallback(newImages, (imgs) =>
    inTransaction(db.transaction(['lineups', 'images'], 'readwrite'), async (tx) => {
      const images = tx.objectStore('images')
      await allRequests([
        () => tx.objectStore('lineups').put(plainLineup(lineup)),
        ...imgs.map((img) => () => images.put(plainImage(img))),
        ...removedImageIds.map((id) => () => images.delete(id)),
      ])
    }),
  )
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

/** 修改已保存的图片（例如保存标注后更新标注和缩略图） */
export async function putImage(img: StoredImage) {
  const db = await getDB()
  await withImageFallback([img], async ([i]) => {
    await db.put('images', plainImage(i!))
  })
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

/** 统计图片 / 视频占用（用于设置页展示）；count 包含视频，videos 是其中视频的数量 */
export async function imageStats() {
  const db = await getDB()
  let count = 0
  let videos = 0
  let bytes = 0
  let cursor = await db.transaction('images').store.openCursor()
  while (cursor) {
    count++
    if (cursor.value.kind === 'video') videos++
    bytes += (cursor.value.blob?.size ?? 0) + (cursor.value.thumb?.size ?? 0)
    cursor = await cursor.continue()
  }
  return { count, videos, bytes }
}
