<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import type { PathEditor } from '@/composables/usePathEditor'
import { moveModeLabel, moveSpeed } from '@/data/movement'
import { polylineLength, type MapMetric } from '@/lib/geometry'
import { pathName } from '@/lib/paths'
import { formatDuration } from '@/lib/rehearsal'
import Icon from '@/components/common/Icon.vue'
import MoveModePicker from './MoveModePicker.vue'

/**
 * 路径编辑面板（首页放在导览栏位置，详情页停靠在地图左侧）：
 * 顶部是当前路径的名称（点击可改名），下面是行走方式和序号、「重画该路径」，
 * 然后是全部路径的列表，最下面是「完成路径编辑」和「退出路径编辑模式」。
 */
const props = withDefaults(
  defineProps<{
    editor: PathEditor
    metric: MapMetric
    /** 正在编辑的 Lineup 名称 */
    context?: string
    variant?: 'sidebar' | 'dock'
  }>(),
  { context: '', variant: 'sidebar' },
)
const emit = defineEmits<{ finish: []; exit: [] }>()

const ed = props.editor

const isPending = computed(() => ed.selectedId === null)
const index = computed(() => (isPending.value ? ed.pendingOrder - 1 : ed.selectedIndex))
const title = computed(() =>
  isPending.value ? pathName(ed.pending, ed.pendingOrder - 1) : pathName(ed.current!, ed.selectedIndex),
)
const mode = computed(() => (isPending.value ? ed.pending.mode : (ed.current?.mode ?? '')))
const modeError = computed(() => ed.tried && !isPending.value && !mode.value)

const stats = computed(() =>
  ed.paths.map((p) => {
    const length = polylineLength(p.points, props.metric)
    return { length, time: p.mode ? length / moveSpeed(p.mode) : null }
  }),
)
const totals = computed(() => {
  let length = 0
  let time = 0
  let complete = true
  for (const s of stats.value) {
    length += s.length
    if (s.time === null) complete = false
    else time += s.time
  }
  return { length, time, complete }
})
const current = computed(() => (isPending.value ? null : stats.value[ed.selectedIndex]))

// ---------- 名称：点击标题编辑 ----------
const editingTitle = ref(false)
const titleDraft = ref('')
const titleInput = ref<HTMLInputElement>()

async function editTitle() {
  titleDraft.value = title.value
  editingTitle.value = true
  await nextTick()
  titleInput.value?.select()
}
function commitTitle() {
  if (!editingTitle.value) return
  ed.setName(ed.selectedId, titleDraft.value)
  editingTitle.value = false
}
useLayer(editingTitle, () => (editingTitle.value = false))
watch(
  () => ed.selectedId,
  () => (editingTitle.value = false),
)

function setOrder(e: Event) {
  if (!ed.current) return
  ed.setOrder(ed.current.id, Number((e.target as HTMLSelectElement).value))
}
</script>

<template>
  <aside class="path-panel" :class="variant" aria-label="路径编辑">
    <header class="head">
      <span class="eyebrow">
        <Icon name="route" :size="13" />
        路径编辑
        <template v-if="context">· {{ context }}</template>
      </span>

      <div class="title-row">
        <input
          v-if="editingTitle"
          ref="titleInput"
          v-model="titleDraft"
          class="title-input"
          maxlength="30"
          aria-label="路径名称"
          @keydown.enter.prevent="commitTitle"
          @blur="commitTitle"
        />
        <button v-else type="button" class="title" title="点击修改路径名称" @click="editTitle">
          <span class="ellipsis">{{ title }}</span>
          <Icon name="pen" :size="15" class="title-pen" />
        </button>
        <span v-if="isPending" class="tag">{{ ed.pending.insertAt !== null ? '待重画' : '待画' }}</span>
      </div>

      <div class="fields">
        <div class="field mode-field">
          <span class="field-label">行走方式 <span class="req">*</span></span>
          <MoveModePicker
            :model-value="mode"
            :invalid="modeError"
            @update:model-value="(v) => ed.setMode(ed.selectedId, v)"
          />
        </div>
        <label class="field order-field">
          <span class="field-label">序号</span>
          <select
            class="select"
            :value="index + 1"
            :disabled="isPending || ed.paths.length < 2"
            aria-label="路径序号"
            @change="setOrder"
          >
            <template v-if="isPending">
              <option :value="index + 1">{{ index + 1 }}</option>
            </template>
            <template v-else>
              <option v-for="n in ed.paths.length" :key="n" :value="n">{{ n }}</option>
            </template>
          </select>
        </label>
      </div>
      <p v-if="modeError" class="field-error">请选择这条路径的行走方式</p>
      <p class="current-stat">
        <template v-if="current">
          {{ current.length.toFixed(1) }} 米
          <template v-if="current.time !== null"> · 约 {{ formatDuration(current.time) }}</template>
        </template>
        <template v-else>在地图上按住左键画出这条路径</template>
      </p>

      <button type="button" class="btn btn-outline redraw" :disabled="isPending" @click="ed.redraw()">
        <Icon name="undo" :size="15" />
        重画该路径
      </button>
    </header>

    <section class="list-wrap">
      <div class="list-head">
        <span class="eyebrow">全部路径</span>
        <span class="count tabular">{{ ed.paths.length }}</span>
        <span v-if="ed.paths.length" class="total tabular">
          {{ totals.length.toFixed(1) }} 米
          <template v-if="totals.complete"> · 约 {{ formatDuration(totals.time) }}</template>
        </span>
      </div>
      <ol class="list">
        <li
          v-for="(p, i) in ed.paths"
          :key="p.id"
          class="item"
          :class="{ active: p.id === ed.selectedId, invalid: ed.tried && !p.mode }"
        >
          <button type="button" class="item-main" @click="ed.select(p.id)">
            <span class="num tabular">{{ i + 1 }}</span>
            <span class="item-text">
              <span class="item-name ellipsis">{{ pathName(p, i) }}</span>
              <span class="item-meta">
                {{ p.mode ? moveModeLabel(p.mode) : '未选择行走方式' }}
                <template v-if="stats[i]?.time != null"> · {{ formatDuration(stats[i]!.time!) }}</template>
              </span>
            </span>
          </button>
          <button type="button" class="del" title="删除这条路径" aria-label="删除这条路径" @click="ed.remove(p.id)">
            <Icon name="trash" :size="14" />
          </button>
        </li>
        <li class="item pending" :class="{ active: isPending }">
          <button type="button" class="item-main" @click="ed.select(null)">
            <span class="num tabular">{{ ed.pendingOrder }}</span>
            <span class="item-text">
              <span class="item-name ellipsis">{{ pathName(ed.pending, ed.pendingOrder - 1) }}</span>
              <span class="item-meta">待画 · 在地图上画线添加</span>
            </span>
          </button>
        </li>
      </ol>
      <p class="hint">
        <Icon name="info" :size="14" />
        <span>
          按住<b>左键</b>画线，松开完成一条路径；起点靠近 Lineup 位置或路径终点会<b>自动吸附</b>，可以接着上一条的终点继续画。
          点击路径可修改它的信息。<b>右键 / 空格 + 拖动</b>平移地图。
        </span>
      </p>
    </section>

    <footer class="foot">
      <button type="button" class="btn btn-primary btn-lg btn-block" @click="emit('finish')">
        <Icon name="check" :size="17" />
        完成路径编辑
      </button>
      <button type="button" class="btn btn-outline btn-lg btn-block" @click="emit('exit')">
        <Icon name="x" :size="17" />
        退出路径编辑模式
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.path-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-elev);
}
.path-panel.sidebar {
  width: var(--sidebar-w);
  border-right: 1px solid var(--line);
}
.path-panel.dock {
  width: 300px;
  border-right: 1px solid var(--line);
}
.head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 14px;
  border-bottom: 1px solid var(--line);
  border-top: 2px solid #3d8bff;
}
.head .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  color: #7cb2ff;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.title,
.title-input {
  min-width: 0;
  height: 38px;
  padding: 0 8px;
  margin-left: -8px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  background: transparent;
  color: var(--text);
  text-align: left;
}
.title:hover {
  border-color: var(--line-strong);
}
.title-pen {
  flex: none;
  color: var(--text-3);
}
.title:hover .title-pen {
  color: var(--cyan);
}
.title-input {
  flex: 1;
  border-color: var(--cyan-dim);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 0 0 3px var(--cyan-soft);
  outline: none;
}
.tag {
  flex: none;
  padding: 1px 7px;
  border: 1px dashed rgb(124 178 255 / 0.6);
  border-radius: var(--r-xs);
  color: #7cb2ff;
  font-size: 11px;
  font-weight: 700;
}
.fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px;
  gap: 8px;
}
.order-field .select {
  width: 100%;
  height: 36px;
}
.current-stat {
  margin-top: -2px;
  color: var(--text-3);
  font-size: 12px;
}
.redraw {
  align-self: flex-start;
}

.list-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 12px 12px 10px;
  overflow-y: auto;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}
.count {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}
.total {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  display: flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  transition:
    border-color 0.15s var(--ease),
    background-color 0.15s var(--ease);
}
.item:hover {
  border-color: var(--line-strong);
}
.item.active {
  border-color: #3d8bff;
  background: linear-gradient(90deg, rgb(61 139 255 / 0.14), transparent 75%), var(--surface-2);
}
.item.invalid:not(.active) {
  border-color: rgb(255 92 92 / 0.55);
}
.item.pending {
  border-style: dashed;
  background: transparent;
}
.item-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  background: none;
  text-align: left;
}
.num {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid #3d8bff;
  border-radius: 50%;
  background: var(--bg-elev);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
.item.active .num {
  background: #3d8bff;
  border-color: #fff;
}
.pending .num {
  border-style: dashed;
  color: #7cb2ff;
}
.item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.item-name {
  font-size: 13px;
  font-weight: 700;
}
.item-meta {
  color: var(--text-3);
  font-size: 11px;
}
.item.invalid .item-meta {
  color: var(--danger);
}
.del {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-right: 4px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
}
.del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.hint {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.6;
}
.hint :deep(.icon) {
  margin-top: 3px;
}
.hint b {
  color: var(--text-2);
}
.foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--line);
}
.foot .btn-lg {
  height: 44px;
}
</style>
