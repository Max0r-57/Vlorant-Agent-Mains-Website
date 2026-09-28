import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Lineup, LineupType, StoredImage } from '@/types'

/**
 * 所有数据都保存在浏览器的 IndexedDB 中（不经过任何服务器）。
 * 换浏览器 / 换电脑前，请在「设置 → 数据备份」中导出备份。
 */
export interface LineupDB extends DBSchema {
  lineups: {
    key: string
    value: Lineup
    indexes: { byMap: string; byAgent: string; byType: string }
  }
  types: {
    key: string
    value: LineupType
  }
  images: {
    key: string
    value: StoredImage
  }
  meta: {
    key: string
    value: unknown
  }
}

export const DB_NAME = 'valorant-lineup-notebook'
export const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<LineupDB>> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<LineupDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const lineups = db.createObjectStore('lineups', { keyPath: 'id' })
          lineups.createIndex('byMap', 'mapId')
          lineups.createIndex('byAgent', 'agentId')
          lineups.createIndex('byType', 'typeId')
          db.createObjectStore('types', { keyPath: 'id' })
          db.createObjectStore('images', { keyPath: 'id' })
          db.createObjectStore('meta')
        }
      },
      blocking() {
        // 另一个标签页需要升级数据库时，主动断开，避免卡住
        dbPromise?.then((db) => db.close())
        dbPromise = null
      },
    }).catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

/** 仅供测试使用：关闭并重置连接 */
export async function resetDBConnection() {
  const p = dbPromise
  dbPromise = null
  if (p) (await p).close()
}
