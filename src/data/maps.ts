/**
 * 地图配置
 *
 * 新增地图：把俯瞰图放进 src/assets/maps/，文件名与 id 一致（如 bind.webp，png / jpg 也可以），
 * 然后在下面的列表里加一行即可。数组顺序就是下拉菜单里的顺序。
 * 地图预览图（地图选择栏和下拉菜单的背景）放进 src/assets/map-previews/，同样以 id 命名，没有时用俯瞰图代替。
 */
export interface MapDef {
  id: string
  /** 中文名 */
  name: string
  /** 英文名（可选，仅用于展示和搜索） */
  en?: string
  /** 俯瞰图地址（自动根据 id 匹配） */
  image: string
  /** 预览图地址（地图选择栏的背景，自动根据 id 匹配；没有预览图时为 undefined） */
  preview?: string
  /** 图片宽度对应的游戏内距离（米），不填则使用 DEFAULT_MAP_WIDTH_METERS */
  widthMeters?: number
}

/**
 * 地图比例尺（用于燃烧弹范围、路径长度和现场演练）。
 *
 * 地图图片都是 1024 × 1024 像素、比例相同。以亚海悬城为参照：图片下方中间那个房间
 * （参考图里红线的位置，y ≈ 738）两侧墙之间 20 米，在图片上是 144.5 像素（x 从 497.5 到 642），
 * 所以 1 米 ≈ 7.2 像素，整张图片宽 1024 ÷ 144.5 × 20 ≈ 141.7 米。
 * 如果某张地图的比例不同，在下面的列表里给它单独加上 widthMeters 即可
 * （在那张图上量一段已知长度：widthMeters = 1024 ÷ 像素长度 × 米数）。
 */
export const DEFAULT_MAP_WIDTH_METERS = 141.7

const MAP_LIST: Omit<MapDef, 'image' | 'preview'>[] = [
  { id: 'ascent', name: '亚海悬城', en: 'Ascent' },
  { id: 'haven', name: '隐世修所', en: 'Haven' },
  { id: 'split', name: '霓虹町', en: 'Split' },
  { id: 'lotus', name: '莲华古城', en: 'Lotus' },
  { id: 'sunset', name: '日落之城', en: 'Sunset' },
  { id: 'abyss', name: '幽邃地窟', en: 'Abyss' },
  { id: 'tianshu', name: '天枢云阙' },
  { id: 'bind', name: '源工重镇', en: 'Bind' },
  { id: 'breeze', name: '微风岛屿', en: 'Breeze' },
  { id: 'fracture', name: '裂变峡谷', en: 'Fracture' },
  { id: 'pearl', name: '深海明珠', en: 'Pearl' },
  { id: 'corrode', name: '盐海矿镇', en: 'Corrode' },
]

const images = import.meta.glob<string>('../assets/maps/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

function stemOf(path: string) {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
}

const previews = import.meta.glob<string>('../assets/map-previews/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const imageById = new Map(Object.entries(images).map(([path, url]) => [stemOf(path), url]))
const previewById = new Map(Object.entries(previews).map(([path, url]) => [stemOf(path), url]))

export const MAPS: MapDef[] = MAP_LIST.filter((m) => imageById.has(m.id)).map((m) => ({
  ...m,
  image: imageById.get(m.id)!,
  preview: previewById.get(m.id),
}))

export const MAP_BY_ID = new Map(MAPS.map((m) => [m.id, m]))

export const DEFAULT_MAP_ID = MAPS[0]?.id ?? ''

export function mapName(id: string) {
  return MAP_BY_ID.get(id)?.name ?? '未知地图'
}

export function mapWidthMeters(id: string) {
  return MAP_BY_ID.get(id)?.widthMeters ?? DEFAULT_MAP_WIDTH_METERS
}
