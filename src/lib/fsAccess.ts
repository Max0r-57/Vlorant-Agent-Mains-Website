/**
 * 对 File System Access API 的简单封装：选择文件夹、检查 / 申请权限、读写文件。
 * 目前只有电脑版 Edge / Chrome 等 Chromium 浏览器支持。
 */

export function isDirectoryPickerSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function' &&
    window.isSecureContext !== false
  )
}

/** 打开文件夹选择框；用户取消时返回 null */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({ id: 'lineup-auto-backup', mode: 'readwrite', startIn: 'documents' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

export async function queryWritePermission(handle: FileSystemHandle): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted'
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'prompt'
  }
}

/** 申请写入权限（必须在用户点击等操作中调用，否则浏览器不会弹出授权窗口） */
export async function requestWritePermission(handle: FileSystemHandle): Promise<PermissionState> {
  if (!handle.requestPermission) return 'granted'
  try {
    return await handle.requestPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/** 写入文件：浏览器会先写到临时文件，关闭时再替换，写到一半失败不会损坏原文件 */
export async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob) {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(data)
    await writable.close()
  } catch (e) {
    await writable.abort().catch(() => {})
    throw e
  }
}

export async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<File> {
  const fileHandle = await dir.getFileHandle(name)
  return fileHandle.getFile()
}

export async function removeFile(dir: FileSystemDirectoryHandle, name: string) {
  await dir.removeEntry(name)
}

export interface DirFile {
  name: string
  size: number
  lastModified: number
}

/** 列出文件夹里（不含子文件夹）名字符合条件的文件名 */
export async function listFileNames(dir: FileSystemDirectoryHandle, filter: (name: string) => boolean) {
  const names: string[] = []
  for await (const handle of dir.values()) {
    if (handle.kind === 'file' && filter(handle.name)) names.push(handle.name)
  }
  return names
}

/** 列出文件夹里（不含子文件夹）名字符合条件的文件，附带大小和修改时间 */
export async function listFiles(dir: FileSystemDirectoryHandle, filter: (name: string) => boolean): Promise<DirFile[]> {
  const files: DirFile[] = []
  for await (const handle of dir.values()) {
    if (handle.kind !== 'file' || !filter(handle.name)) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    files.push({ name: handle.name, size: file.size, lastModified: file.lastModified })
  }
  return files
}

/** 把文件操作的异常转成用户看得懂的提示 */
export function describeFsError(e: unknown): string {
  if (e instanceof DOMException || (e instanceof Error && 'name' in e)) {
    switch ((e as DOMException).name) {
      case 'NotFoundError':
        return '找不到备份文件夹，它可能被移动、重命名或删除了，请重新选择文件夹'
      case 'NotAllowedError':
      case 'SecurityError':
        return '没有写入备份文件夹的权限'
      case 'QuotaExceededError':
        return '磁盘空间不足，无法写入备份'
      case 'NoModificationAllowedError':
      case 'InvalidStateError':
        return '备份文件正被其他程序占用，请稍后重试'
    }
  }
  return e instanceof Error ? e.message : String(e)
}
