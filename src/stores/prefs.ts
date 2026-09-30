import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { DEFAULT_AGENT_ID, AGENT_BY_ID } from '@/data/agents'
import { DEFAULT_MAP_ID, MAP_BY_ID } from '@/data/maps'

export type MarkerSize = 'sm' | 'md' | 'lg'
export type AreaSearchBy = 'landing' | 'position'

export interface Prefs {
  /** 首页当前地图 / 英雄（下次打开时恢复） */
  mapId: string
  agentId: string
  sidebarOpen: boolean
  markerSize: MarkerSize
  /** 上传图片时压缩 */
  compressImages: boolean
  maxImageSide: number
  imageQuality: number
  /** 新建时默认选中上次使用的类型 */
  lastTypeId: string | null
  /** 地图操作提示是否已关闭 */
  hintDismissed: boolean
  /** 在地图空白处显示所选英雄的立绘 */
  showPortrait: boolean
  /** 圈画搜索按落点还是按站位（Lineup 位置）搜索 */
  areaSearchBy: AreaSearchBy
}

const STORAGE_KEY = 'lineup-notebook:prefs'

const DEFAULTS: Prefs = {
  mapId: DEFAULT_MAP_ID,
  agentId: DEFAULT_AGENT_ID,
  sidebarOpen: true,
  markerSize: 'md',
  compressImages: true,
  maxImageSide: 1920,
  imageQuality: 0.85,
  lastTypeId: null,
  hintDismissed: false,
  showPortrait: true,
  areaSearchBy: 'landing',
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<Prefs>) : {}
    const prefs = { ...DEFAULTS, ...saved }
    // 配置里删掉的地图 / 英雄，退回默认值
    if (!MAP_BY_ID.has(prefs.mapId)) prefs.mapId = DEFAULT_MAP_ID
    if (!AGENT_BY_ID.has(prefs.agentId)) prefs.agentId = DEFAULT_AGENT_ID
    if (prefs.areaSearchBy !== 'position') prefs.areaSearchBy = 'landing'
    return prefs
  } catch {
    return { ...DEFAULTS }
  }
}

export const MARKER_PX: Record<MarkerSize, number> = { sm: 12, md: 16, lg: 20 }

export const usePrefs = defineStore('prefs', () => {
  const prefs = reactive<Prefs>(load())

  watch(
    prefs,
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
      } catch {
        // 隐私模式等情况下无法写入，忽略即可
      }
    },
    { deep: true },
  )

  function reset() {
    Object.assign(prefs, DEFAULTS)
  }

  return { prefs, reset }
})
