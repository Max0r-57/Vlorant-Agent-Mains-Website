/**
 * 落点图案：不同英雄的技能在地图上的覆盖范围和持续时间。
 *
 * 目前只做了炼狱的燃烧弹（直径 9 米，持续 7.5 秒）；
 * 其他英雄开启「落点参照」时显示通用的落点标记，现场演练时不做落点倒计时。
 * 以后要给其他英雄加图案，在下面的表里加一行即可。
 */
export interface LandingSpec {
  /** 技能名称 */
  label: string
  /** 覆盖范围直径（游戏内米） */
  diameter: number
  /** 持续时间（秒），现场演练时倒计时 */
  duration: number
  /** 图案颜色 */
  color: string
}

const SPECS: Record<string, LandingSpec> = {
  brimstone: { label: '燃烧弹', diameter: 9, duration: 7.5, color: '#ff4d2e' },
}

export function landingSpec(agentId: string): LandingSpec | undefined {
  return SPECS[agentId]
}
