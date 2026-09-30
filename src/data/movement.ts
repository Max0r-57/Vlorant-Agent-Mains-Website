/**
 * 行走方式与移动速度（米 / 秒），用于路径追踪和现场演练。
 *
 * - 持刀跑 6.75、持战神 / 奥丁跑 5.13、静步 3.8（任何武器）
 * - 其余武器的奔跑速度取自官方 Wiki：https://wiki.playvalorant.com/en-us/Weapons
 *
 * 数组顺序就是下拉菜单里的顺序（同类武器按商店价格排列）。
 * 游戏更新调整了速度时，直接改这里的数字即可。
 */
export interface MoveMode {
  id: string
  /** 显示名称，如「持刀跑」 */
  label: string
  /** 移动速度（米 / 秒） */
  speed: number
}

export interface MoveModeGroup {
  label: string
  modes: MoveMode[]
}

function run(id: string, weapon: string, speed: number): MoveMode {
  return { id, label: `持${weapon}跑`, speed }
}

export const MOVE_MODE_GROUPS: MoveModeGroup[] = [
  {
    label: '常用',
    modes: [run('knife', '刀', 6.75), { id: 'walk', label: '静步', speed: 3.8 }],
  },
  {
    label: '手枪',
    modes: [
      run('classic', '标配', 5.73),
      run('shorty', '短炮', 5.4),
      run('frenzy', '狂怒', 5.73),
      run('ghost', '鬼魅', 5.73),
      run('bandit', '追猎', 5.4),
      run('sheriff', '正义', 5.4),
    ],
  },
  {
    label: '冲锋枪',
    modes: [run('stinger', '蜂刺', 5.73), run('spectre', '骇灵', 5.73)],
  },
  {
    label: '霰弹枪',
    modes: [run('bucky', '雄鹿', 5.06), run('judge', '判官', 5.06)],
  },
  {
    label: '步枪',
    modes: [
      run('bulldog', '獠犬', 5.4),
      run('guardian', '戍卫', 5.4),
      run('phantom', '幻影', 5.4),
      run('vandal', '狂徒', 5.4),
      run('warden', '悍狼', 5.4),
    ],
  },
  {
    label: '狙击枪',
    modes: [run('marshal', '飞将', 5.4), run('outlaw', '莽侠', 5.4), run('operator', '冥驹', 5.13)],
  },
  {
    label: '机枪',
    modes: [run('ares', '战神', 5.13), run('odin', '奥丁', 5.13)],
  },
]

export const MOVE_MODES: MoveMode[] = MOVE_MODE_GROUPS.flatMap((g) => g.modes)

export const MOVE_MODE_BY_ID = new Map(MOVE_MODES.map((m) => [m.id, m]))

/** 持刀跑：数据异常（没有行走方式）时的兜底速度 */
export const FALLBACK_SPEED = 6.75

export function moveModeLabel(id: string) {
  return MOVE_MODE_BY_ID.get(id)?.label ?? ''
}

export function moveSpeed(id: string) {
  return MOVE_MODE_BY_ID.get(id)?.speed ?? FALLBACK_SPEED
}
