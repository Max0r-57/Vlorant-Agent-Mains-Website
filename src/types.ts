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

/** 媒体类型；旧数据没有这个字段，都是图片 */
export type MediaKind = 'image' | 'video'

/**
 * IndexedDB 里保存的图片 / 视频（都放在 images 表里，Lineup.imageIds 引用）：
 * 图片是压缩后的原图 + 缩略图；视频是原文件 + 截取的一帧画面（缩略图）。
 */
export interface StoredImage {
  id: string
  /** 原图 / 视频文件 */
  blob: Blob
  /** 缩略图（视频为封面）；图片有标注时，标注会画进缩略图里 */
  thumb: Blob
  /** 原图 / 视频画面的像素尺寸 */
  width: number
  height: number
  createdAt: number
  /** 不填表示图片 */
  kind?: MediaKind
  /** 视频时长（秒） */
  duration?: number
  /** 图片上的标注（原图像素坐标），原图本身不会被修改 */
  annotations?: Annotation[]
}

/** 新建 / 编辑时，尚未写入数据库的图片 */
export type NewImage = StoredImage

/** 新建 / 修改时提交的字段；落点和路径可以省略（默认没有） */
export type LineupDraft = Omit<Lineup, 'id' | 'createdAt' | 'updatedAt' | 'imageIds' | 'landing' | 'paths'> &
  Partial<Pick<Lineup, 'landing' | 'paths'>>

/**
 * 查看器里的媒体来源：已保存的用 id（类型、尺寸、标注从数据库读取）；
 * 未保存的草稿用临时 URL，并附带这些信息。
 */
export type ImageSource =
  | { kind: 'stored'; id: string }
  | {
      kind: 'url'
      url: string
      /** 缩略图 / 视频封面 */
      thumb?: string
      media?: MediaKind
      width?: number
      height?: number
      annotations?: readonly Annotation[]
    }

/** 图片标注（坐标为原图像素），见 src/lib/annotations.ts */
export interface AnnotationBase {
  id: string
  color: string
  /** 线宽（原图像素）；文字为字号 */
  size: number
}

/** 手动圈画：points 为 [x0, y0, x1, y1, …] */
export interface PenAnnotation extends AnnotationBase {
  type: 'pen'
  points: number[]
}

/** 圆圈（椭圆）：外接矩形 */
export interface EllipseAnnotation extends AnnotationBase {
  type: 'ellipse'
  x: number
  y: number
  w: number
  h: number
}

/** 箭头：从 (x1, y1) 指向 (x2, y2) */
export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 文本框：(x, y) 为左上角，可以多行 */
export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  x: number
  y: number
  text: string
}

export type Annotation = PenAnnotation | EllipseAnnotation | ArrowAnnotation | TextAnnotation
