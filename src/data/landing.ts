/**
 * 落点图案：不同英雄的技能在地图上的覆盖范围和持续时间。
 *
 * 目前只做了炼狱的燃烧弹（直径 2 米，持续 7.5 秒）；
 * 其他英雄开启「落点参照」时显示通用的落点标记，现场演练时不做落点倒计时。
 * 以后要给其他英雄加图案，在下面的表里加一行即可。
 *
 * 调整红圈大小：只改下面的 diameter（单位是游戏内的米，可以写小数，如 3.5）。
 * 地图上显示的大小 = diameter ÷ 地图宽度米数（src/data/maps.ts 的 DEFAULT_MAP_WIDTH_METERS，142）× 地图当前显示宽度，
 * 换算到 1065 像素宽的原始地图图片上：1 米 = 7.5 像素。
 * 例如想让红圈在原图上直径约 30 像素，就填 30 ÷ 7.5 = 4。
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
  brimstone: { label: '燃烧弹', diameter: 2, duration: 7.5, color: '#ff4d2e' },
}

export function landingSpec(agentId: string): LandingSpec | undefined {
  return SPECS[agentId]
}
