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

/** 落点参照：技能的落点位置（地图坐标）+ 落点时间 */
export interface Landing extends Position {
  /** 落点时间（秒，可不填）：从开始行动到落地所需的时间，现场演练时先倒数这段时间 */
  delay: number | null
}

/** 路径追踪中的一条路径 */
export interface LineupPath {
  id: string
  /** 路径名称；为空时显示默认名称「路径 N」（N 为序号） */
  name: string
  /** 行走方式 id（见 src/data/movement.ts），未选择时为空字符串 */
  mode: string
  /** 沿路径依次经过的点（地图坐标），至少两个 */
  points: Position[]
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
  /** 落点参照，未开启时为 null */
  landing: Landing | null
  /** 行走路径，数组顺序就是序号（第 1 条路径在最前） */
  paths: LineupPath[]
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

/** 新建 / 修改时提交的字段；落点和路径可以省略（默认没有） */
export type LineupDraft = Omit<Lineup, 'id' | 'createdAt' | 'updatedAt' | 'imageIds' | 'landing' | 'paths'> &
  Partial<Pick<Lineup, 'landing' | 'paths'>>

/** 图片来源：已保存的图片用 id，未保存的用临时 URL */
export type ImageSource = { kind: 'stored'; id: string } | { kind: 'url'; url: string }
