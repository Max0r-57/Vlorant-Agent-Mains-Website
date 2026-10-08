import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { crc32, createZip, openZip } from '@/lib/zip'

const bytes = (n: number, seed = 1) => {
  const a = new Uint8Array(n)
  for (let i = 0; i < n; i++) a[i] = (i * 31 + seed * 17) & 0xff
  return a
}

async function blobBytes(b: Blob | null) {
  return b ? new Uint8Array(await b.arrayBuffer()) : null
}

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(strToU8('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('round-trips stored blobs and deflated text, and other zip readers can open it', async () => {
    const video = new Blob([bytes(300_000, 3)], { type: 'video/mp4' })
    const json = strToU8(JSON.stringify({ hello: '你好', list: Array.from({ length: 200 }, (_, i) => i) }))
    const zip = await createZip([
      { name: 'backup.json', data: json, compress: true },
      { name: 'videos/v1.mp4', data: video },
      { name: 'thumbs/v1.webp', data: new Blob([bytes(5000, 7)]) },
      { name: '说明.txt', data: strToU8('中文文件名') },
    ])

    const archive = await openZip(zip)
    expect([...archive.entries.keys()]).toEqual(['backup.json', 'videos/v1.mp4', 'thumbs/v1.webp', '说明.txt'])
    expect(archive.entries.get('backup.json')!.method).toBe(8)
    expect(archive.entries.get('videos/v1.mp4')!.method).toBe(0)
    expect(strFromU8((await archive.bytes('backup.json'))!)).toBe(strFromU8(json))
    const v = await archive.blob('videos/v1.mp4', 'video/mp4')
    expect(v!.type).toBe('video/mp4')
    expect(await blobBytes(v)).toEqual(bytes(300_000, 3))
    expect(strFromU8((await archive.bytes('说明.txt'))!)).toBe('中文文件名')
    expect(await archive.blob('missing.png')).toBeNull()

    // 独立实现的解压也能读出同样的内容（CRC、目录都正确）
    const other = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(other['videos/v1.mp4']).toEqual(bytes(300_000, 3))
    expect(strFromU8(other['backup.json']!)).toBe(strFromU8(json))
  })

  it('writes and reads ZIP64 records when sizes or offsets pass the limit', async () => {
    const big = bytes(4096, 5)
    const zip = await createZip(
      [
        { name: 'a.bin', data: new Blob([bytes(100, 1)]) },
        { name: 'b.bin', data: new Blob([big]) },
        { name: 'c.json', data: strToU8('{"ok":true}'), compress: true },
      ],
      { zip64Threshold: 1000 },
    )
    const archive = await openZip(zip)
    expect(archive.entries.get('b.bin')!.size).toBe(4096)
    expect(await blobBytes(await archive.blob('b.bin'))).toEqual(big)
    expect(strFromU8((await archive.bytes('c.json'))!)).toBe('{"ok":true}')
    const other = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(other['b.bin']).toEqual(big)
    expect(strFromU8(other['c.json']!)).toBe('{"ok":true}')
  })

  it('reads zips written by older versions of the site (fflate)', async () => {
    const data = zipSync({
      'images/x.webp': [bytes(2000, 9), { level: 0 }],
      'backup.json': strToU8('{"format":"x"}'),
    })
    const archive = await openZip(new Blob([data]))
    expect(await blobBytes(await archive.blob('images/x.webp'))).toEqual(bytes(2000, 9))
    expect(strFromU8((await archive.bytes('backup.json'))!)).toBe('{"format":"x"}')
  })

  it('rejects files that are not zips', async () => {
    await expect(openZip(new Blob(['not a zip at all']))).rejects.toThrow('不是有效的 zip 文件')
    await expect(openZip(new Blob([]))).rejects.toThrow()
  })
})
