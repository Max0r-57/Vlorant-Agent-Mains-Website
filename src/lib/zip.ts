import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

/**
 * 读写 .zip（备份文件用），不需要把整个压缩包读进内存：
 * - 写入：图片、视频本身已经是压缩格式，原样存放（不压缩），直接引用原来的 Blob，不复制数据；
 *   文本（backup.json）用 deflate 压缩。压缩包超过 4 GB 时自动使用 ZIP64 格式。
 * - 读取：先读压缩包末尾的目录，需要哪个文件再切出对应的那一段；
 *   不压缩的文件（图片、视频）直接返回 Blob 切片，大文件也不会整体载入内存。
 */

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_END = 0x06054b50
const SIG_END64 = 0x06064b50
const SIG_LOCATOR64 = 0x07064b50
const MAX16 = 0xffff
const MAX32 = 0xffffffff
/** 文件名是 UTF-8 */
const FLAG_UTF8 = 0x0800

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crcUpdate(crc: number, data: Uint8Array) {
  let c = crc
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return c
}

export function crc32(data: Uint8Array) {
  return (crcUpdate(MAX32, data) ^ MAX32) >>> 0
}

/** 分段读取，避免大文件一次性载入内存 */
const CHUNK = 4 * 1024 * 1024

async function crc32OfBlob(blob: Blob) {
  let c = MAX32
  for (let pos = 0; pos < blob.size; pos += CHUNK) {
    c = crcUpdate(c, new Uint8Array(await blob.slice(pos, pos + CHUNK).arrayBuffer()))
  }
  return (c ^ MAX32) >>> 0
}

function setU64(v: DataView, at: number, n: number) {
  v.setUint32(at, n % 2 ** 32, true)
  v.setUint32(at + 4, Math.floor(n / 2 ** 32), true)
}

function getU64(v: DataView, at: number) {
  return v.getUint32(at, true) + v.getUint32(at + 4, true) * 2 ** 32
}

function dosDateTime(d: Date) {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107)
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export interface ZipInput {
  /** 压缩包里的路径，用 / 分隔目录 */
  name: string
  /** 图片、视频直接给 Blob（原样存放）；文本给 Uint8Array */
  data: Blob | Uint8Array
  /** 用 deflate 压缩（只对 Uint8Array 有效） */
  compress?: boolean
}

/**
 * 生成 .zip。
 * zip64Threshold 只用于测试：超过这个大小 / 偏移就按 ZIP64 写，默认是 ZIP 格式本身的 4 GB 上限。
 */
export async function createZip(inputs: readonly ZipInput[], opts: { zip64Threshold?: number } = {}): Promise<Blob> {
  const limit = opts.zip64Threshold ?? MAX32
  const { time, date } = dosDateTime(new Date())
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const input of inputs) {
    const name = strToU8(input.name)
    const flags = /[^\x20-\x7e]/.test(input.name) ? FLAG_UTF8 : 0
    let body: Blob | Uint8Array
    let method = 0
    let size: number
    let crc: number
    if (input.data instanceof Uint8Array) {
      size = input.data.length
      crc = crc32(input.data)
      body = input.data
      if (input.compress) {
        body = deflateSync(input.data, { level: 6 })
        method = 8
      }
    } else {
      size = input.data.size
      crc = await crc32OfBlob(input.data)
      body = input.data
    }
    const csize = body instanceof Uint8Array ? body.length : body.size
    // 任何一个数值放不进 4 字节，就把大小和偏移都写进 ZIP64 扩展字段
    const z64 = size >= limit || csize >= limit || offset >= limit
    const version = z64 ? 45 : 20

    const localExtra = z64 ? 20 : 0
    const local = new Uint8Array(30 + name.length + localExtra)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, SIG_LOCAL, true)
    lv.setUint16(4, version, true)
    lv.setUint16(6, flags, true)
    lv.setUint16(8, method, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, z64 ? MAX32 : csize, true)
    lv.setUint32(22, z64 ? MAX32 : size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, localExtra, true)
    local.set(name, 30)
    if (z64) {
      const p = 30 + name.length
      lv.setUint16(p, 0x0001, true)
      lv.setUint16(p + 2, 16, true)
      setU64(lv, p + 4, size)
      setU64(lv, p + 12, csize)
    }

    const centralExtra = z64 ? 28 : 0
    const cen = new Uint8Array(46 + name.length + centralExtra)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, SIG_CENTRAL, true)
    cv.setUint16(4, version, true)
    cv.setUint16(6, version, true)
    cv.setUint16(8, flags, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, z64 ? MAX32 : csize, true)
    cv.setUint32(24, z64 ? MAX32 : size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, centralExtra, true)
    cv.setUint32(42, z64 ? MAX32 : offset, true)
    cen.set(name, 46)
    if (z64) {
      const p = 46 + name.length
      cv.setUint16(p, 0x0001, true)
      cv.setUint16(p + 2, 24, true)
      setU64(cv, p + 4, size)
      setU64(cv, p + 12, csize)
      setU64(cv, p + 20, offset)
    }

    parts.push(local as Uint8Array<ArrayBuffer>, body as Blob | Uint8Array<ArrayBuffer>)
    central.push(cen)
    offset += local.length + csize
  }

  const cdOffset = offset
  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const count = inputs.length
  parts.push(...(central as Uint8Array<ArrayBuffer>[]))
  const z64 = cdOffset >= limit || cdSize >= limit || count >= MAX16
  if (z64) {
    const rec = new Uint8Array(56 + 20)
    const rv = new DataView(rec.buffer)
    rv.setUint32(0, SIG_END64, true)
    setU64(rv, 4, 44)
    rv.setUint16(12, 45, true)
    rv.setUint16(14, 45, true)
    setU64(rv, 24, count)
    setU64(rv, 32, count)
    setU64(rv, 40, cdSize)
    setU64(rv, 48, cdOffset)
    rv.setUint32(56, SIG_LOCATOR64, true)
    setU64(rv, 64, cdOffset + cdSize)
    rv.setUint32(72, 1, true)
    parts.push(rec)
  }
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, SIG_END, true)
  ev.setUint16(8, z64 ? MAX16 : count, true)
  ev.setUint16(10, z64 ? MAX16 : count, true)
  ev.setUint32(12, z64 ? MAX32 : cdSize, true)
  ev.setUint32(16, z64 ? MAX32 : cdOffset, true)
  parts.push(end)
  return new Blob(parts, { type: 'application/zip' })
}

export interface ZipEntry {
  name: string
  /** 0 = 不压缩，8 = deflate */
  method: number
  compressedSize: number
  size: number
  localOffset: number
}

async function readBytes(file: Blob, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

/** 打开的压缩包：entries 是目录，文件内容按需读取 */
export class ZipArchive {
  constructor(
    private readonly file: Blob,
    readonly entries: ReadonlyMap<string, ZipEntry>,
  ) {}

  has(name: string) {
    return this.entries.has(name)
  }

  private async dataStart(e: ZipEntry) {
    const head = await readBytes(this.file, e.localOffset, e.localOffset + 30)
    const v = new DataView(head.buffer)
    if (head.length < 30 || v.getUint32(0, true) !== SIG_LOCAL) throw new Error(`压缩包中的 ${e.name} 已损坏`)
    return e.localOffset + 30 + v.getUint16(26, true) + v.getUint16(28, true)
  }

  /** 文件内容；不压缩的文件直接切片引用原文件，不读进内存。没有这个文件时返回 null */
  async blob(name: string, type = ''): Promise<Blob | null> {
    const e = this.entries.get(name)
    if (!e) return null
    const start = await this.dataStart(e)
    if (start + e.compressedSize > this.file.size) throw new Error(`压缩包中的 ${e.name} 不完整`)
    const raw = this.file.slice(start, start + e.compressedSize, type)
    if (e.method === 0) return raw
    if (e.method === 8) return new Blob([inflateSync(new Uint8Array(await raw.arrayBuffer()))], { type })
    throw new Error(`不支持 ${e.name} 的压缩方式`)
  }

  async bytes(name: string): Promise<Uint8Array | null> {
    const b = await this.blob(name)
    return b ? new Uint8Array(await b.arrayBuffer()) : null
  }
}

/** 读取压缩包目录；不是有效的 zip 时抛出异常 */
export async function openZip(file: Blob): Promise<ZipArchive> {
  const size = file.size
  // 末尾目录（22 字节）+ 最长 65535 字节的注释 + ZIP64 定位（20 字节）
  const tailStart = Math.max(0, size - (22 + MAX16 + 20))
  const tail = await readBytes(file, tailStart, size)
  const tv = new DataView(tail.buffer)
  let e = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === SIG_END) {
      e = i
      break
    }
  }
  if (e < 0) throw new Error('不是有效的 zip 文件')
  let count = tv.getUint16(e + 10, true)
  let cdSize = tv.getUint32(e + 12, true)
  let cdOffset = tv.getUint32(e + 16, true)
  if (e >= 20 && tv.getUint32(e - 20, true) === SIG_LOCATOR64) {
    const at = getU64(tv, e - 20 + 8)
    const rec = await readBytes(file, at, at + 56)
    const rv = new DataView(rec.buffer)
    if (rec.length === 56 && rv.getUint32(0, true) === SIG_END64) {
      count = getU64(rv, 32)
      cdSize = getU64(rv, 40)
      cdOffset = getU64(rv, 48)
    }
  }
  if (cdOffset + cdSize > size) throw new Error('zip 文件不完整')

  const cd = await readBytes(file, cdOffset, cdOffset + cdSize)
  const cv = new DataView(cd.buffer)
  const entries = new Map<string, ZipEntry>()
  let p = 0
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cv.getUint32(p, true) !== SIG_CENTRAL) throw new Error('zip 文件目录已损坏')
    const flags = cv.getUint16(p + 8, true)
    const method = cv.getUint16(p + 10, true)
    let csize = cv.getUint32(p + 20, true)
    let usize = cv.getUint32(p + 24, true)
    const nameLen = cv.getUint16(p + 28, true)
    const extraLen = cv.getUint16(p + 30, true)
    const commentLen = cv.getUint16(p + 32, true)
    let offset = cv.getUint32(p + 42, true)
    const nameEnd = p + 46 + nameLen
    if (nameEnd + extraLen > cd.length) throw new Error('zip 文件目录已损坏')
    const name = strFromU8(cd.subarray(p + 46, nameEnd), !(flags & FLAG_UTF8))
    // ZIP64 扩展字段：只包含原本放不下（写成 0xFFFFFFFF）的那几个数值，顺序固定
    for (let x = nameEnd; x + 4 <= nameEnd + extraLen; ) {
      const id = cv.getUint16(x, true)
      const len = cv.getUint16(x + 2, true)
      if (id === 0x0001) {
        let q = x + 4
        const qEnd = q + len
        if (usize === MAX32 && q + 8 <= qEnd) {
          usize = getU64(cv, q)
          q += 8
        }
        if (csize === MAX32 && q + 8 <= qEnd) {
          csize = getU64(cv, q)
          q += 8
        }
        if (offset === MAX32 && q + 8 <= qEnd) offset = getU64(cv, q)
      }
      x += 4 + len
    }
    if (!name.endsWith('/')) entries.set(name, { name, method, compressedSize: csize, size: usize, localOffset: offset })
    p = nameEnd + extraLen + commentLen
  }
  return new ZipArchive(file, entries)
}
