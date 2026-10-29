import { computed, reactive, ref } from 'vue'
import { newId } from '@/lib/id'
import { MAX_ROUTE_NAME, plainPaths, routeName } from '@/lib/paths'
import type { LineupPath, Position } from '@/types'

/**
 * 路径编辑的状态（首页新建 Lineup 和详情页共用），一次编辑一个路径版本：
 * - 版本可以命名（为空时显示「版本 N」），各段路径不单独命名，只选择行走方式；
 * - 还没画线时，编辑的是「下一段待画的路径」，可以先选好行走方式；
 * - 画完一段路径后自动选中它，在开始画下一段之前都可以修改它的行走方式；
 *   也可以点击地图上的路径或列表选中之前的路径；
 * - 「重画该路径」撤销当前路径，编辑框退回上一段路径；没有上一段时停留在待画的路径。
 *   之后画的线会放回原来的位置，并沿用原来的行走方式；
 * - 序号不能重复、上限为已画的路径数：修改序号时与原来占用该序号的路径交换位置。
 */
export interface PendingPath {
  mode: string
  /** 重画时新路径放回的位置（null 表示追加到最后） */
  insertAt: number | null
}

function emptyPending(): PendingPath {
  return { mode: '', insertAt: null }
}

function serialize(name: string, paths: readonly LineupPath[]) {
  return JSON.stringify([name.trim(), paths.map((p) => [p.mode, p.points.map((q) => [q.x, q.y])])])
}

export function createPathEditor() {
  const paths = ref<LineupPath[]>([])
  /** 版本名称（空字符串表示使用默认名称「版本 N」） */
  const name = ref('')
  /** 这个版本是第几个版本（从 0 开始，用于默认名称） */
  const routeIndex = ref(0)
  const pending = ref<PendingPath>(emptyPending())
  /** 当前编辑的路径；null 表示下一段待画的路径 */
  const selectedId = ref<string | null>(null)
  /** 点过「完成」后才标出未填写的行走方式 */
  const tried = ref(false)
  /** 进入编辑时已有的路径数 */
  const initialCount = ref(0)
  const baseline = ref(serialize('', []))

  const selectedIndex = computed(() =>
    selectedId.value ? paths.value.findIndex((p) => p.id === selectedId.value) : -1,
  )
  const current = computed(() => paths.value[selectedIndex.value] ?? null)
  /** 待画路径将来的序号（从 1 开始） */
  const pendingOrder = computed(
    () => Math.min(pending.value.insertAt ?? paths.value.length, paths.value.length) + 1,
  )
  const title = computed(() => routeName({ name: name.value }, routeIndex.value))
  const dirty = computed(() => serialize(name.value, paths.value) !== baseline.value)
  /** 第一段还没选择行走方式的路径（-1 表示都选好了） */
  const firstMissing = computed(() => paths.value.findIndex((p) => !p.mode))

  /**
   * 开始编辑一个版本。
   * initial：已有的路径；select：选中的路径；route：版本名称和它是第几个版本。
   */
  function start(
    initial: readonly LineupPath[],
    select: string | null = null,
    route: { name?: string; index?: number } = {},
  ) {
    paths.value = plainPaths(initial)
    name.value = route.name?.trim() ?? ''
    routeIndex.value = route.index ?? 0
    pending.value = emptyPending()
    selectedId.value = select && paths.value.some((p) => p.id === select) ? select : null
    tried.value = false
    initialCount.value = paths.value.length
    baseline.value = serialize(name.value, paths.value)
  }

  /** 画完一段线：用待画路径的行走方式生成新路径并选中它 */
  function addStroke(points: Position[]) {
    const p = pending.value
    const path: LineupPath = { id: newId('path'), mode: p.mode, points }
    const at = p.insertAt === null ? paths.value.length : Math.min(p.insertAt, paths.value.length)
    paths.value.splice(at, 0, path)
    pending.value = emptyPending()
    selectedId.value = path.id
    return path
  }

  function select(id: string | null) {
    selectedId.value = id && paths.value.some((p) => p.id === id) ? id : null
  }

  /** 修改版本名称；与默认名称「版本 N」相同时按未命名处理 */
  function setName(raw: string) {
    const v = raw.trim().slice(0, MAX_ROUTE_NAME)
    name.value = v === routeName({ name: '' }, routeIndex.value) ? '' : v
  }

  function setMode(id: string | null, mode: string) {
    if (id === null) {
      pending.value.mode = mode
      return
    }
    const p = paths.value.find((q) => q.id === id)
    if (p) p.mode = mode
  }

  /** 修改序号：与原来占用该序号的路径交换位置 */
  function setOrder(id: string, order: number) {
    const i = paths.value.findIndex((p) => p.id === id)
    const j = order - 1
    if (i < 0 || j < 0 || j >= paths.value.length || i === j) return
    const list = [...paths.value]
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    paths.value = list
  }

  /** 重画该路径 */
  function redraw() {
    const i = selectedIndex.value
    if (i < 0) return
    const [removed] = paths.value.splice(i, 1)
    pending.value = { mode: removed!.mode, insertAt: i }
    selectedId.value = i > 0 ? paths.value[i - 1]!.id : null
  }

  /** 删除某段路径（不影响待画路径的信息） */
  function remove(id: string) {
    const i = paths.value.findIndex((p) => p.id === id)
    if (i < 0) return
    paths.value.splice(i, 1)
    const at = pending.value.insertAt
    if (at !== null && at > i) pending.value.insertAt = at - 1
    if (selectedId.value === id) selectedId.value = paths.value[Math.max(0, i - 1)]?.id ?? null
  }

  /** 完成前检查，返回错误信息（并选中第一段有问题的路径）；没有问题返回 null */
  function validate(): string | null {
    tried.value = true
    if (!paths.value.length) return initialCount.value ? null : '请先在地图上画出路径'
    const i = firstMissing.value
    if (i >= 0) {
      selectedId.value = paths.value[i]!.id
      return `请为第 ${i + 1} 段路径选择行走方式`
    }
    return null
  }

  /** 编辑结果（普通对象，可以直接保存） */
  function result() {
    return plainPaths(paths.value)
  }

  return reactive({
    paths,
    name,
    routeIndex,
    title,
    pending,
    selectedId,
    tried,
    initialCount,
    selectedIndex,
    current,
    pendingOrder,
    dirty,
    firstMissing,
    start,
    addStroke,
    select,
    setName,
    setMode,
    setOrder,
    redraw,
    remove,
    validate,
    result,
  })
}

export type PathEditor = ReturnType<typeof createPathEditor>
