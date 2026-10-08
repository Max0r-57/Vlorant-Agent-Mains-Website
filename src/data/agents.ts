/**
 * 英雄配置
 *
 * 新增英雄：在下面的列表里加一行，并把图片放进
 *   src/assets/agents/avatars/<id>.webp   （头像，正方形）
 *   src/assets/agents/portraits/<id>.webp （全身像，透明背景，可选）
 * 支持 png / jpg / webp。缺少头像时会用全身像顶部代替。
 */
export type AgentRole = 'controller' | 'duelist' | 'initiator' | 'sentinel'

export const ROLE_ORDER: AgentRole[] = ['controller', 'duelist', 'initiator', 'sentinel']

export const ROLE_LABEL: Record<AgentRole, string> = {
  controller: '控场者',
  duelist: '决斗者',
  initiator: '先锋',
  sentinel: '哨卫',
}

export interface AgentDef {
  id: string
  name: string
  en: string
  role: AgentRole
  avatar?: string
  portrait?: string
}

const AGENT_LIST: Omit<AgentDef, 'avatar' | 'portrait'>[] = [
  // 控场者
  { id: 'brimstone', name: '炼狱', en: 'Brimstone', role: 'controller' },
  { id: 'viper', name: '蝰蛇', en: 'Viper', role: 'controller' },
  { id: 'omen', name: '幽影', en: 'Omen', role: 'controller' },
  { id: 'astra', name: '星隧', en: 'Astra', role: 'controller' },
  { id: 'harbor', name: '海神', en: 'Harbor', role: 'controller' },
  { id: 'clove', name: '暮蝶', en: 'Clove', role: 'controller' },
  { id: 'miks', name: '迷核', en: 'Miks', role: 'controller' },
  // 决斗者
  { id: 'phoenix', name: '不死鸟', en: 'Phoenix', role: 'duelist' },
  { id: 'jett', name: '捷风', en: 'Jett', role: 'duelist' },
  { id: 'reyna', name: '芮娜', en: 'Reyna', role: 'duelist' },
  { id: 'raze', name: '雷兹', en: 'Raze', role: 'duelist' },
  { id: 'yoru', name: '夜露', en: 'Yoru', role: 'duelist' },
  { id: 'neon', name: '霓虹', en: 'Neon', role: 'duelist' },
  { id: 'iso', name: '壹决', en: 'Iso', role: 'duelist' },
  { id: 'waylay', name: '幻棱', en: 'Waylay', role: 'duelist' },
  // 先锋
  { id: 'sova', name: '猎枭', en: 'Sova', role: 'initiator' },
  { id: 'breach', name: '铁臂', en: 'Breach', role: 'initiator' },
  { id: 'skye', name: '斯凯', en: 'Skye', role: 'initiator' },
  { id: 'kayo', name: 'KO', en: 'KAY/O', role: 'initiator' },
  { id: 'fade', name: '黑梦', en: 'Fade', role: 'initiator' },
  { id: 'gekko', name: '盖可', en: 'Gekko', role: 'initiator' },
  { id: 'tejo', name: '钛狐', en: 'Tejo', role: 'initiator' },
  // 哨卫
  { id: 'sage', name: '贤者', en: 'Sage', role: 'sentinel' },
  { id: 'cypher', name: '零', en: 'Cypher', role: 'sentinel' },
  { id: 'killjoy', name: '奇乐', en: 'Killjoy', role: 'sentinel' },
  { id: 'chamber', name: '尚勃勒', en: 'Chamber', role: 'sentinel' },
  { id: 'deadlock', name: '钢索', en: 'Deadlock', role: 'sentinel' },
  { id: 'vyse', name: '维斯', en: 'Vyse', role: 'sentinel' },
  { id: 'veto', name: '禁灭', en: 'Veto', role: 'sentinel' },
]

function byStem(files: Record<string, string>) {
  return new Map(
    Object.entries(files).map(([path, url]) => [
      path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, ''),
      url,
    ]),
  )
}

const avatars = byStem(
  import.meta.glob<string>('../assets/agents/avatars/*.{png,jpg,jpeg,webp}', {
    eager: true,
    import: 'default',
  }),
)
const portraits = byStem(
  import.meta.glob<string>('../assets/agents/portraits/*.{png,jpg,jpeg,webp}', {
    eager: true,
    import: 'default',
  }),
)

export const AGENTS: AgentDef[] = AGENT_LIST.map((a) => ({
  ...a,
  avatar: avatars.get(a.id),
  portrait: portraits.get(a.id),
}))

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]))

/** 炼狱专精，默认选中炼狱 */
export const DEFAULT_AGENT_ID = 'brimstone'

export function agentName(id: string) {
  return AGENT_BY_ID.get(id)?.name ?? '未知英雄'
}
