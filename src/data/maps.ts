/**
 * 地图配置
 *
 * 新增地图：把俯瞰图放进 src/assets/maps/，文件名与 id 一致（如 bind.png），
 * 然后在下面的列表里加一行即可。数组顺序就是下拉菜单里的顺序。
 */
export interface MapDef {
  id: string
  /** 中文名 */
  name: string
  /** 英文名（可选，仅用于展示和搜索） */
  en?: string
  /** 图片地址（自动根据 id 匹配） */
  image: string
  /** 图片宽度对应的游戏内距离（米），不填则使用 DEFAULT_MAP_WIDTH_METERS */
  widthMeters?: number
}

/**
 * 地图比例尺（用于燃烧弹范围、路径长度和现场演练）。
 *
 * 以亚海悬城 B 大厅为参照：两侧墙之间 20 米，在 1065 像素宽的地图图片上约 150 像素，
 * 所以整张图片宽约 1065 ÷ 150 × 20 = 142 米。其他地图沿用同一比例；
 * 如果某张地图的比例不同，在下面的列表里给它单独加上 widthMeters 即可。
 */
export const DEFAULT_MAP_WIDTH_METERS = 142

const MAP_LIST: Omit<MapDef, 'image'>[] = [
  { id: 'ascent', name: '亚海悬城', en: 'Ascent' },
  { id: 'haven', name: '隐世修所', en: 'Haven' },
  { id: 'split', name: '霓虹町', en: 'Split' },
  { id: 'lotus', name: '莲华古城', en: 'Lotus' },
  { id: 'sunset', name: '日落之城', en: 'Sunset' },
  { id: 'abyss', name: '幽邃地窟', en: 'Abyss' },
  { id: 'tianshu', name: '天枢云阙' },
]

const images = import.meta.glob<string>('../assets/maps/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

function stemOf(path: string) {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
}

const imageById = new Map(Object.entries(images).map(([path, url]) => [stemOf(path), url]))

export const MAPS: MapDef[] = MAP_LIST.filter((m) => imageById.has(m.id)).map((m) => ({
  ...m,
  image: imageById.get(m.id)!,
}))

export const MAP_BY_ID = new Map(MAPS.map((m) => [m.id, m]))

export const DEFAULT_MAP_ID = MAPS[0]?.id ?? ''

export function mapName(id: string) {
  return MAP_BY_ID.get(id)?.name ?? '未知地图'
}

export function mapWidthMeters(id: string) {
  return MAP_BY_ID.get(id)?.widthMeters ?? DEFAULT_MAP_WIDTH_METERS
}
