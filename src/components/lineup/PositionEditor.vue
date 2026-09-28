<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MAPS, MAP_BY_ID } from '@/data/maps'
import { useLayer } from '@/composables/useLayer'
import { useMarkerPopover } from '@/composables/useMarkerPopover'
import { findNearestGroup, groupByPosition, posKey, type MarkerGroup } from '@/lib/positions'
import { useLineups } from '@/stores/lineups'
import { MARKER_PX, usePrefs } from '@/stores/prefs'
import type { Lineup, Position } from '@/types'
import Icon from '@/components/common/Icon.vue'
import MapPicker from '@/components/common/MapPicker.vue'
import MapCanvas from '@/components/map/MapCanvas.vue'
import MapMarker from '@/components/map/MapMarker.vue'
import MarkerPopover from '@/components/map/MarkerPopover.vue'

/**
 * 详情页的位置编辑：
 * - 地图上显示同一英雄在该地图的全部 Lineup，当前 Lineup 为黄色；
 * - 拖动黄色圆点修改位置；拖到其他圆点附近松开会吸附并合并到同一位置；
 * - 当前 Lineup 位于多个 Lineup 的位置（黑点）时，从黑点上按住拖动即可把它单独拖出来；
 * - 也可以双击地图任意处直接移动过去。
 */
const props = defineProps<{
  lineup: Lineup
  agentId: string
}>()
const emit = defineEmits<{ detail: [id: string] }>()

const mapId = defineModel<string>('mapId', { required: true })
const pos = defineModel<Position>('pos', { required: true })

const store = useLineups()
const { prefs } = usePrefs()
const canvas = ref<InstanceType<typeof MapCanvas>>()
const markerPx = computed(() => MARKER_PX[prefs.markerSize])
const snapPx = computed(() => Math.max(14, markerPx.value + 2))

const map = computed(() => MAP_BY_ID.get(mapId.value) ?? MAPS[0]!)

/** 同一地图、同一英雄的其他 Lineup */
const others = computed(() =>
  store.lineups.filter(
    (l) => l.id !== props.lineup.id && l.mapId === mapId.value && l.agentId === props.agentId,
  ),
)
const groups = computed(() => groupByPosition(others.value))
const mapCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) if (l.agentId === props.agentId) m.set(l.mapId, (m.get(l.mapId) ?? 0) + 1)
  return m
})

// ---------- 拖动 ----------
const dragging = ref(false)
const dragPos = ref<Position | null>(null)
const snapKey = ref<string | null>(null)
let drag: { x: number; y: number; moved: boolean; fromStack: MarkerGroup<Lineup> | null } | null = null

const activeKey = computed(() => posKey(pos.value))
/** 当前 Lineup 所在的「多 Lineup 位置」（不拖动时） */
const activeGroup = computed(() =>
  dragging.value ? undefined : groups.value.find((g) => g.key === activeKey.value),
)
const snapGroup = computed(() => (snapKey.value ? groups.value.find((g) => g.key === snapKey.value) : undefined))
const displayPos = computed<Position>(() => {
  if (dragging.value) return snapGroup.value ?? dragPos.value ?? pos.value
  return pos.value
})
const stackCount = computed(() => (activeGroup.value ? activeGroup.value.items.length : 0))

function startDrag(e: PointerEvent, fromStack: MarkerGroup<Lineup> | null = null) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  pop.close()
  drag = { x: e.clientX, y: e.clientY, moved: false, fromStack }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!drag || !canvas.value) return
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
  drag.moved = true
  dragging.value = true
  const { pos: p } = canvas.value.clientToPos(e.clientX, e.clientY)
  dragPos.value = p
  snapKey.value = findNearestGroup(groups.value, p, snapPx.value, canvas.value.pxPerUnit())?.key ?? null
}

function onDragEnd(e: PointerEvent) {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  const d = drag
  drag = null
  if (!d) return
  if (d.moved && e.type !== 'pointercancel') {
    const target = snapGroup.value ?? dragPos.value
    if (target) pos.value = { x: target.x, y: target.y }
  } else if (!d.moved && d.fromStack) {
    // 单击黑点（未拖动）：查看这个位置的所有 Lineup
    pop.pin(d.fromStack.key, props.lineup.id)
  }
  dragging.value = false
  dragPos.value = null
  snapKey.value = null
}

// 详情页可以上下滚动，滚动时预览窗口的位置会失效，直接关闭
function onPageScroll(e: Event) {
  // 预览窗口内部的卡片横向滑动也会触发 scroll 事件，需要排除
  if (e.target instanceof Element && e.target.closest('.popover')) return
  if (pop.state.value) pop.close()
}
onMounted(() => window.addEventListener('scroll', onPageScroll, true))

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  window.removeEventListener('scroll', onPageScroll, true)
})

/** 双击地图：把当前 Lineup 移动到该处（靠近其他圆点时同样吸附合并） */
function onMapDblClick(payload: { pos: Position }) {
  if (!canvas.value) return
  const near = findNearestGroup(groups.value, payload.pos, snapPx.value, canvas.value.pxPerUnit())
  pos.value = near ? { x: near.x, y: near.y } : payload.pos
}

/** 从当前位置移出：在附近找一个空位 */
function detach() {
  if (!activeGroup.value || !canvas.value) return
  const ppu = canvas.value.pxPerUnit()
  const step = Math.round((markerPx.value * 2.2) / ppu.x)
  const candidates = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    return {
      x: Math.min(10000, Math.max(0, Math.round(pos.value.x + Math.cos(a) * step))),
      y: Math.min(10000, Math.max(0, Math.round(pos.value.y + Math.sin(a) * step))),
    }
  })
  const free = candidates.find((c) => !findNearestGroup(groups.value, c, snapPx.value, ppu)) ?? candidates[1]!
  pos.value = free
}

// ---------- 预览窗口（其他 Lineup） ----------
const pop = useMarkerPopover()
const viewTick = ref(0)
useLayer(() => !!pop.state.value, pop.close)

const popGroup = computed(() => (pop.state.value ? groups.value.find((g) => g.key === pop.state.value!.key) : undefined))
const popLineups = computed(() => {
  const g = popGroup.value
  if (!g) return []
  // 当前 Lineup 所在的位置：把它也放进列表并标为「当前」
  return g.key === activeKey.value && !dragging.value ? [props.lineup, ...g.items] : g.items
})
const popAnchor = computed(() => {
  void viewTick.value
  const g = popGroup.value
  if (!g || !canvas.value || !canvas.value.isPosVisible(g, 4)) return null
  return canvas.value.posToClient(g)
})

function onMarkerEnter(e: PointerEvent, key: string) {
  if (e.pointerType === 'mouse' && !dragging.value && key !== activeKey.value) pop.hoverEnter(key)
}
function onMarkerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') pop.hoverLeave()
}

const mapPadding = { top: 20, right: 64, bottom: 20, left: 20 }
</script>

<template>
  <section class="position-editor">
    <div class="toolbar">
      <div class="field map-field">
        <span class="field-label">所在地图</span>
        <MapPicker
          :model-value="mapId"
          :counts="mapCounts"
          @update:model-value="(v) => v && (mapId = v)"
        />
      </div>
      <p class="help">
        <Icon name="hand" :size="15" />
        <span>
          拖动<b class="gold">黄色圆点</b>调整位置；拖到其他圆点附近松开可<b>合并到同一位置</b>；
          从黑点上按住拖动可把当前 Lineup 单独拖出。也可以<b>双击</b>地图直接移动。
        </span>
      </p>
    </div>

    <div class="map-frame">
      <MapCanvas
        ref="canvas"
        :src="map.image"
        :view-key="map.id"
        :padding="mapPadding"
        wheel-zoom="ctrl"
        @map-dblclick="onMapDblClick"
        @background-click="pop.close()"
        @view-change="viewTick++"
      >
        <template #default="{ at }">
          <template v-for="g in groups" :key="g.key">
            <MapMarker
              v-if="activeGroup && g.key === activeGroup.key"
              variant="active-stack"
              :style="at(g)"
              :count="g.items.length + 1"
              :size="markerPx"
              :selected="pop.state.value?.key === g.key"
              :label="`当前 Lineup 与另外 ${g.items.length} 个位于同一位置，按住拖动可移出`"
              title="按住拖动可把当前 Lineup 移出；单击查看此位置的全部 Lineup"
              @pointerdown="startDrag($event, g)"
            />
            <MapMarker
              v-else
              :variant="g.items.length > 1 ? 'stack' : 'single'"
              :style="at(g)"
              :color="store.typeColor(g.items[0]!.typeId)"
              :count="g.items.length"
              :size="markerPx"
              :snap-target="snapKey === g.key"
              :selected="pop.state.value?.key === g.key"
              :label="g.items.length > 1 ? `此位置有 ${g.items.length} 个 Lineup` : g.items[0]!.name"
              @pointerenter="onMarkerEnter($event, g.key)"
              @pointerleave="onMarkerLeave"
              @click="pop.toggle(g.key)"
            />
          </template>
          <MapMarker
            v-if="!activeGroup"
            variant="active"
            :style="at(displayPos)"
            :size="markerPx + 2"
            :dragging="dragging"
            :label="`${lineup.name}（当前 Lineup），按住拖动调整位置`"
            title="按住拖动调整位置"
            @pointerdown="startDrag($event)"
          />
        </template>

        <template #overlay>
          <div class="hud-zoom" data-map-ui>
            <button type="button" class="btn btn-icon hud-btn" title="放大" aria-label="放大" @click="canvas?.zoomBy(1.5)">
              <Icon name="plus" :size="18" />
            </button>
            <button type="button" class="btn btn-icon hud-btn" title="缩小" aria-label="缩小" @click="canvas?.zoomBy(1 / 1.5)">
              <Icon name="minus" :size="18" />
            </button>
            <button type="button" class="btn btn-icon hud-btn" title="适应窗口" aria-label="适应窗口" @click="canvas?.resetView()">
              <Icon name="fit" :size="17" />
            </button>
          </div>
          <div class="status" data-map-ui>
            <template v-if="dragging && snapGroup">
              <Icon name="layers" :size="15" />
              松开合并到此位置（共 {{ snapGroup.items.length + 1 }} 个 Lineup）
            </template>
            <template v-else-if="dragging">
              <Icon name="move" :size="15" />
              松开放置
            </template>
            <template v-else-if="stackCount">
              <Icon name="layers" :size="15" />
              与另外 {{ stackCount }} 个 Lineup 位于同一位置
              <button type="button" class="btn btn-sm btn-outline" @click="detach">移出到附近</button>
            </template>
            <template v-else>
              <i class="gold-dot" />
              当前位置
              <span class="coords tabular">({{ (pos.x / 100).toFixed(1) }}%, {{ (pos.y / 100).toFixed(1) }}%)</span>
            </template>
          </div>
        </template>
      </MapCanvas>
    </div>

    <MarkerPopover
      v-if="popGroup && popAnchor && !dragging"
      :lineups="popLineups"
      :anchor="popAnchor"
      :radius="markerPx / 2 + 4"
      :focus-id="pop.state.value?.focusId"
      :current-id="lineup.id"
      :show-create="false"
      @enter="pop.popoverEnter()"
      @leave="pop.popoverLeave()"
      @detail="(id) => emit('detail', id)"
    />
  </section>
</template>

<style scoped>
.position-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 20px;
}
.map-field {
  flex: none;
}
.help {
  display: flex;
  flex: 1;
  gap: 8px;
  min-width: 260px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}
.help :deep(.icon) {
  margin-top: 2px;
  color: var(--text-3);
}
.help b {
  color: var(--text);
}
.help b.gold {
  color: var(--gold);
}
.map-frame {
  position: relative;
  height: min(760px, 78vh);
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}
.hud-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hud-btn {
  --btn-bg: rgb(18 27 34 / 0.85);
  backdrop-filter: blur(6px);
}
.status {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 80px);
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: rgb(13 20 25 / 0.88);
  backdrop-filter: blur(6px);
  color: var(--text-2);
  font-size: 12px;
}
.status .btn {
  margin-left: 4px;
}
.gold-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 2px #fff;
}
.coords {
  color: var(--text-3);
}
</style>
