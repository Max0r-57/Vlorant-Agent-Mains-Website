/**
 * 数据模型
 *
 * Lineup 的 color 由它所属的「类型」决定：类型 = 用户自建的分类标签（名字 + 颜色），
 * 修改类型颜色后，所有该类型的 Lineup 会一起变色。
 */

/** 地图坐标的精度：位置以 0–POS_MAX 的整数保存（万分比），与图片分辨率无关 */
export const POS_MAX = 10000

export interface Position {
  x: number
  y: number
}

export interface Lineup extends Position {
  id: string
  name: string
  /** 类型（标签）id */
  typeId: string
  agentId: string
  mapId: string
  /** 图片 id 列表，第一张是预览图（封面） */
  imageIds: string[]
  note: string
  /** 创建时间 createDate（毫秒时间戳） */
  createdAt: number
  updatedAt: number
}

export interface LineupType {
  id: string
  name: string
  /** 十六进制颜色，如 #ff5a36 */
  color: string
  /** 排序用，越小越靠前 */
  order: number
  createdAt: number
}

/** IndexedDB 里保存的图片：压缩后的原图 + 缩略图 */
export interface StoredImage {
  id: string
  blob: Blob
  thumb: Blob
  width: number
  height: number
  createdAt: number
}

/** 新建 / 编辑时，尚未写入数据库的图片 */
export type NewImage = StoredImage

export type LineupDraft = Omit<Lineup, 'id' | 'createdAt' | 'updatedAt' | 'imageIds'>

/** 图片来源：已保存的图片用 id，未保存的用临时 URL */
export type ImageSource = { kind: 'stored'; id: string } | { kind: 'url'; url: string }
