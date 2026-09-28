<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import { AGENT_BY_ID } from '@/data/agents'
import { MAP_BY_ID } from '@/data/maps'
import { computePosition } from '@/lib/floating'
import { useLineups } from '@/stores/lineups'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import type { Lineup, Position } from '@/types'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import Icon from '@/components/common/Icon.vue'
import TypePicker from '@/components/common/TypePicker.vue'
import ImageManager from './ImageManager.vue'
import { collectForSave, hasPendingImages, type EditableImage } from './editableImages'

/**
 * 新建 Lineup 面板：在地图上双击的位置旁弹出。
 * 英雄、地图、位置自动取自当前选择，无需手动填写。
 */
const props = defineProps<{
  /** 双击位置的屏幕坐标（面板出现在它旁边） */
  anchor: { x: number; y: number }
  mapId: string
  agentId: string
  pos: Position
  /** 相同位置新建时，该位置已有的 Lineup 数量 */
  stackCount?: number
}>()
const emit = defineEmits<{ saved: [lineup: Lineup]; cancel: [] }>()

const store = useLineups()
const { prefs } = usePrefs()
const ui = useUi()

const panel = ref<HTMLElement>()
const nameInput = ref<HTMLInputElement>()
const name = ref('')
const typeId = ref<string | null>(
  prefs.lastTypeId && store.typeById.has(prefs.lastTypeId) ? prefs.lastTypeId : (store.sortedTypes[0]?.id ?? null),
)
const note = ref('')
const images = ref<EditableImage[]>([])
const saving = ref(false)
const tried = ref(false)

const agent = computed(() => AGENT_BY_ID.get(props.agentId))
const map = computed(() => MAP_BY_ID.get(props.mapId))
const nameError = computed(() => (tried.value && !name.value.trim() ? '请填写名字' : ''))
const typeError = computed(() => (tried.value && !typeId.value ? '请选择或新建一个类型' : ''))
const processing = computed(() => hasPendingImages(images.value))
const dirty = computed(() => !!(name.value.trim() || note.value.trim() || images.value.length))

// ---------- 位置 ----------
const style = ref<Record<string, string>>({ left: '-9999px', top: '0px' })
/** 用户拖动过面板后，不再自动定位 */
const manualPos = ref(false)
let dragState: { x: number; y: number } | null = null

function place() {
  if (!panel.value || manualPos.value) return
  const a = { left: props.anchor.x - 10, top: props.anchor.y - 10, width: 20, height: 20 }
  const r = computePosition(a, { width: panel.value.offsetWidth, height: panel.value.offsetHeight }, 'right', {
    offset: 18,
    margin: 12,
  })
  style.value = { left: `${r.left}px`, top: `${r.top}px` }
}

let ro: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  place()
  ro = new ResizeObserver(place)
  if (panel.value) ro.observe(panel.value)
  window.addEventListener('resize', place)
  nameInput.value?.focus()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('resize', place)
})
watch(() => [props.anchor.x, props.anchor.y], place)

// 拖动标题栏移动面板
function onHeadPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button') || !panel.value) return
  const r = panel.value.getBoundingClientRect()
  dragState = { x: e.clientX - r.left, y: e.clientY - r.top }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onHeadPointerMove(e: PointerEvent) {
  if (!dragState || !panel.value) return
  manualPos.value = true
  const w = panel.value.offsetWidth
  const left = Math.min(Math.max(8, e.clientX - dragState.x), window.innerWidth - w - 8)
  const top = Math.min(Math.max(8, e.clientY - dragState.y), window.innerHeight - 60)
  style.value = { left: `${left}px`, top: `${top}px` }
}
function onHeadPointerUp() {
  dragState = null
}

// ---------- 保存 / 取消 ----------
async function save() {
  tried.value = true
  if (!name.value.trim()) {
    nameInput.value?.focus()
    return
  }
  if (!typeId.value || saving.value) return
  if (processing.value) {
    ui.toast('图片还在处理中，请稍等', { kind: 'info' })
    return
  }
  saving.value = true
  try {
    const { newImages } = collectForSave(images.value)
    const lineup = await store.createLineup(
      {
        name: name.value.trim(),
        typeId: typeId.value,
        agentId: props.agentId,
        mapId: props.mapId,
        x: props.pos.x,
        y: props.pos.y,
        note: note.value.trim(),
      },
      newImages,
    )
    prefs.lastTypeId = typeId.value
    emit('saved', lineup)
  } catch (e) {
    ui.toast(e instanceof Error ? `保存失败：${e.message}` : '保存失败', { kind: 'error' })
  } finally {
    saving.value = false
  }
}

async function cancel() {
  if (dirty.value) {
    const ok = await ui.confirm({
      title: '放弃这个 Lineup？',
      message: '已填写的内容和图片不会被保存。',
      confirmText: '放弃',
      danger: true,
    })
    if (!ok) return
  }
  emit('cancel')
}

useLayer(() => true, cancel)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    save()
  }
}
</script>

<template>
  <Teleport to="body">
    <section
      ref="panel"
      class="create-panel"
      :style="style"
      role="dialog"
      aria-label="新建 Lineup"
      @keydown="onKeydown"
    >
      <header
        class="head"
        @pointerdown="onHeadPointerDown"
        @pointermove="onHeadPointerMove"
        @pointerup="onHeadPointerUp"
        @pointercancel="onHeadPointerUp"
      >
        <div class="head-text">
          <span class="eyebrow">New Lineup</span>
          <h2>新建 Lineup</h2>
        </div>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="关闭" @click="cancel">
          <Icon name="x" :size="18" />
        </button>
      </header>

      <div class="context">
        <span class="chip">
          <AgentAvatar :agent-id="agentId" :size="18" />
          {{ agent?.name }}
        </span>
        <span class="chip">
          <Icon name="map" :size="14" />
          {{ map?.name }}
        </span>
        <span v-if="stackCount" class="chip stack">
          <Icon name="layers" :size="14" />
          与 {{ stackCount }} 个 Lineup 同位置
        </span>
      </div>

      <form class="body" @submit.prevent="save">
        <label class="field">
          <span class="field-label">名字 <span class="req">*</span></span>
          <input
            ref="nameInput"
            v-model="name"
            class="input"
            :class="{ 'is-invalid': nameError }"
            maxlength="60"
            placeholder="例如：A 点默认包点燃烧弹"
          />
          <span v-if="nameError" class="field-error">{{ nameError }}</span>
        </label>

        <div class="field">
          <span class="field-label">类型 <span class="req">*</span><span class="field-hint">可在下拉菜单中新建</span></span>
          <TypePicker v-model="typeId" :invalid="!!typeError" />
          <span v-if="typeError" class="field-error">{{ typeError }}</span>
        </div>

        <div class="field">
          <span class="field-label">图片<span class="field-hint">第一张为预览图</span></span>
          <ImageManager v-model="images" compact :title="name || '新建 Lineup'" />
        </div>

        <label class="field">
          <span class="field-label">备注</span>
          <textarea
            v-model="note"
            class="textarea"
            rows="3"
            maxlength="2000"
            placeholder="站位、瞄点、出手时机、注意事项……"
          />
        </label>
      </form>

      <footer class="foot">
        <span class="shortcut"><span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> 保存</span>
        <button type="button" class="btn btn-ghost" @click="cancel">取消</button>
        <button type="button" class="btn btn-primary" :disabled="saving || processing" @click="save">
          <Icon name="check" :size="16" />
          {{ saving ? '保存中…' : processing ? '处理图片中…' : '保存' }}
        </button>
      </footer>
    </section>
  </Teleport>
</template>

<style scoped>
.create-panel {
  position: fixed;
  z-index: var(--z-panel);
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  max-height: calc(100dvh - 24px);
  border: 1px solid var(--line-strong);
  border-top: 2px solid var(--accent);
  border-radius: var(--r-lg);
  background: var(--bg-elev);
  box-shadow: var(--shadow-pop);
  animation: panel-in 0.16s var(--ease);
}
@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 10px 8px 16px;
  cursor: move;
  touch-action: none;
}
.head h2 {
  font-size: 16px;
  font-weight: 800;
}
.context {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 9px 0 4px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
}
.chip :deep(.icon) {
  margin-left: 4px;
}
.chip.stack {
  border-color: rgb(120 251 231 / 0.35);
  color: var(--cyan);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 4px 16px 16px;
  overflow-y: auto;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
}
.shortcut {
  margin-right: auto;
  color: var(--text-3);
  font-size: 11px;
}
@media (max-width: 640px) {
  .shortcut {
    display: none;
  }
}
</style>
