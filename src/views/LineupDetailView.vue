<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { AGENT_BY_ID } from '@/data/agents'
import { MAP_BY_ID } from '@/data/maps'
import { formatDateTime } from '@/lib/format'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import type { Lineup, Position } from '@/types'
import AgentPicker from '@/components/common/AgentPicker.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import Icon from '@/components/common/Icon.vue'
import TypePicker from '@/components/common/TypePicker.vue'
import ImageManager from '@/components/lineup/ImageManager.vue'
import PositionEditor from '@/components/lineup/PositionEditor.vue'
import {
  collectForSave,
  fromStored,
  hasPendingImages,
  type EditableImage,
} from '@/components/lineup/editableImages'

/** Lineup 详情页：查看并编辑名字、类型、英雄、图片、备注、地图和位置 */
const route = useRoute()
const router = useRouter()
const store = useLineups()
const ui = useUi()

const id = computed(() => String(route.params.id))
const lineup = computed(() => store.lineupById.get(id.value))

interface Form {
  name: string
  typeId: string | null
  agentId: string
  mapId: string
  pos: Position
  note: string
}
const form = reactive<Form>({ name: '', typeId: null, agentId: '', mapId: '', pos: { x: 0, y: 0 }, note: '' })
const images = ref<EditableImage[]>([])
const baseline = ref('')
const saving = ref(false)
const tried = ref(false)
let skipGuard = false

function snapshot() {
  return JSON.stringify({
    name: form.name,
    typeId: form.typeId,
    agentId: form.agentId,
    mapId: form.mapId,
    x: form.pos.x,
    y: form.pos.y,
    note: form.note,
    images: images.value.map((i) => i.storedId ?? i.key),
  })
}

function load(l: Lineup | undefined) {
  if (!l) return
  form.name = l.name
  form.typeId = l.typeId
  form.agentId = l.agentId
  form.mapId = l.mapId
  form.pos = { x: l.x, y: l.y }
  form.note = l.note
  images.value = fromStored(l.imageIds)
  tried.value = false
  baseline.value = snapshot()
}

// 首次进入、或从一个 Lineup 跳到另一个时加载表单
watch(id, () => load(lineup.value), { immediate: true })

const dirty = computed(() => !!lineup.value && baseline.value !== snapshot())
const nameError = computed(() => (tried.value && !form.name.trim() ? '名字不能为空' : ''))
const processing = computed(() => hasPendingImages(images.value))
const agent = computed(() => AGENT_BY_ID.get(form.agentId))
const mapName = computed(() => MAP_BY_ID.get(form.mapId)?.name ?? '')

async function save() {
  const l = lineup.value
  if (!l || saving.value) return
  tried.value = true
  if (!form.name.trim() || !form.typeId) return
  if (processing.value) {
    ui.toast('图片还在处理中，请稍等', { kind: 'info' })
    return
  }
  saving.value = true
  try {
    const saved = await store.updateLineup(
      l.id,
      {
        name: form.name.trim(),
        typeId: form.typeId,
        agentId: form.agentId,
        mapId: form.mapId,
        x: form.pos.x,
        y: form.pos.y,
        note: form.note.trim(),
      },
      collectForSave(images.value),
    )
    load(saved)
    ui.toast('已保存修改')
  } catch (e) {
    ui.toast(e instanceof Error ? `保存失败：${e.message}` : '保存失败', { kind: 'error' })
  } finally {
    saving.value = false
  }
}

function revert() {
  load(lineup.value)
}

async function remove() {
  const l = lineup.value
  if (!l) return
  const ok = await ui.confirm({
    title: `删除「${l.name}」？`,
    message: '这个 Lineup 和它的所有图片都会被永久删除，无法恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await store.deleteLineup(l.id)
  ui.toast('已删除')
  skipGuard = true
  goBack()
}

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push({ name: 'dict' })
}

function showOnMap() {
  const l = lineup.value
  if (!l) return
  router.push({ name: 'home', query: { focus: l.id } })
}

function openOther(otherId: string) {
  router.push({ name: 'lineup', params: { id: otherId } })
}

// ---------- 离开前提醒保存 ----------
async function confirmLeave() {
  if (skipGuard || !dirty.value) return true
  return ui.confirm({
    title: '有未保存的修改',
    message: '离开后，本次修改（包括新上传的图片）将会丢失。',
    confirmText: '放弃修改并离开',
    cancelText: '继续编辑',
    danger: true,
  })
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onKeydown)
})

// 备注输入框随内容自动增高
const noteEl = ref<HTMLTextAreaElement>()
function autoGrow() {
  const el = noteEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(120, el.scrollHeight + 2)}px`
}
watch(
  () => form.note,
  () => nextTick(autoGrow),
  { immediate: true },
)
</script>

<template>
  <div class="detail-page">
    <header class="topbar">
      <div class="topbar-inner">
        <button type="button" class="btn btn-ghost btn-icon" aria-label="返回" title="返回" @click="goBack">
          <Icon name="arrowLeft" :size="18" />
        </button>
        <RouterLink :to="{ name: 'home' }" class="home-link" title="回到地图">
          <BrandMark compact />
        </RouterLink>
        <nav class="crumbs" aria-label="位置">
          <RouterLink :to="{ name: 'dict' }">Lineup 字典</RouterLink>
          <Icon name="chevronRight" :size="14" />
          <span class="ellipsis current">{{ lineup?.name ?? '未找到' }}</span>
        </nav>
        <div v-if="lineup" class="actions">
          <span v-if="dirty" class="dirty-tag">
            <i />
            未保存
          </span>
          <button v-if="dirty" type="button" class="btn btn-ghost" @click="revert">撤销修改</button>
          <button type="button" class="btn btn-danger" @click="remove">
            <Icon name="trash" :size="16" />
            删除
          </button>
          <button type="button" class="btn btn-primary" :disabled="!dirty || saving || processing" @click="save">
            <Icon name="save" :size="16" />
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </header>

    <main v-if="lineup" class="content">
      <section class="card head-card">
        <img v-if="agent?.portrait" class="portrait" :src="agent.portrait" alt="" draggable="false" />
        <div class="head-main">
          <span class="eyebrow">Lineup · {{ mapName }}</span>
          <input
            v-model="form.name"
            class="name-input"
            :class="{ 'is-invalid': nameError }"
            maxlength="60"
            placeholder="Lineup 名字"
            aria-label="名字"
          />
          <span v-if="nameError" class="field-error">{{ nameError }}</span>
          <div class="meta-grid">
            <div class="field">
              <span class="field-label">类型</span>
              <TypePicker v-model="form.typeId" />
            </div>
            <div class="field">
              <span class="field-label">英雄</span>
              <AgentPicker :model-value="form.agentId" @update:model-value="(v) => v && (form.agentId = v)" />
            </div>
            <div class="field static">
              <span class="field-label">创建时间</span>
              <span class="static-value tabular">{{ formatDateTime(lineup.createdAt) }}</span>
            </div>
            <div class="field static">
              <span class="field-label">最后修改</span>
              <span class="static-value tabular">{{ formatDateTime(lineup.updatedAt) }}</span>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-outline map-link" @click="showOnMap">
          <Icon name="pin" :size="16" />
          在首页地图中查看
        </button>
      </section>

      <section class="card">
        <header class="card-head">
          <h2>图片</h2>
          <span class="count tabular">{{ images.length }}</span>
          <span class="card-hint">第一张为预览图 · 拖动排序 · 点击查看大图 · 支持 Ctrl+V 粘贴截图</span>
        </header>
        <ImageManager v-model="images" :title="form.name" />
      </section>

      <section class="card">
        <header class="card-head">
          <h2>备注</h2>
        </header>
        <textarea
          ref="noteEl"
          v-model="form.note"
          class="textarea note"
          maxlength="2000"
          placeholder="站位、瞄点、出手时机、注意事项……"
          @input="autoGrow"
        />
      </section>

      <section class="card">
        <header class="card-head">
          <h2>地图位置</h2>
          <span class="card-hint">显示 {{ agent?.name }} 在该地图的全部 Lineup，黄色为当前 Lineup</span>
        </header>
        <PositionEditor
          v-model:map-id="form.mapId"
          v-model:pos="form.pos"
          :lineup="lineup"
          :agent-id="form.agentId"
          @detail="openOther"
        />
      </section>

      <p class="shortcut"><span class="kbd">Ctrl</span> + <span class="kbd">S</span> 快速保存</p>
    </main>

    <main v-else class="content missing">
      <Icon name="alert" :size="28" />
      <h1>找不到这个 Lineup</h1>
      <p>它可能已经被删除了。</p>
      <RouterLink :to="{ name: 'dict' }" class="btn btn-primary">返回 Lineup 字典</RouterLink>
    </main>
  </div>
</template>

<style scoped>
.detail-page {
  height: 100%;
  overflow-y: auto;
  background:
    radial-gradient(1200px 500px at 80% -10%, rgb(255 70 85 / 0.07), transparent 60%),
    var(--bg);
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--line);
  background: rgb(13 20 25 / 0.9);
  backdrop-filter: blur(10px);
}
.topbar-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 1160px;
  height: 56px;
  margin: 0 auto;
  padding: 0 20px;
}
.home-link {
  display: flex;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-3);
  font-size: 13px;
}
.crumbs a {
  color: var(--text-2);
  white-space: nowrap;
}
.crumbs a:hover {
  color: var(--text);
}
.crumbs .current {
  color: var(--text);
  font-weight: 600;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.dirty-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--gold);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.dirty-tag i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gold);
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1160px;
  margin: 0 auto;
  padding: 20px 20px 48px;
}
.card {
  position: relative;
  padding: 18px 20px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-elev);
}
.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin-bottom: 14px;
}
.card-head h2 {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.count {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
}
.card-hint {
  color: var(--text-3);
  font-size: 12px;
}

.head-card {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  overflow: hidden;
  padding-right: 200px;
}
.portrait {
  position: absolute;
  right: 20px;
  top: -30px;
  width: 190px;
  opacity: 0.35;
  pointer-events: none;
  mask-image: linear-gradient(180deg, #000 45%, transparent 95%);
}
.head-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.name-input {
  width: 100%;
  padding: 4px 8px;
  margin-left: -8px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.name-input:hover {
  border-color: var(--line-strong);
}
.name-input:focus {
  outline: none;
  border-color: var(--cyan-dim);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--cyan-soft);
}
.name-input.is-invalid {
  border-color: var(--danger);
}
.meta-grid {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(150px, 200px) auto auto;
  gap: 12px 20px;
  align-items: end;
  margin-top: 6px;
}
.static-value {
  display: flex;
  align-items: center;
  height: 36px;
  color: var(--text-2);
  font-size: 13px;
  white-space: nowrap;
}
.map-link {
  position: absolute;
  right: 20px;
  bottom: 20px;
}
.note {
  min-height: 120px;
  resize: none;
  overflow: hidden;
}
.shortcut {
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
.missing {
  align-items: center;
  padding-top: 120px;
  color: var(--text-2);
  text-align: center;
}
.missing :deep(.icon) {
  color: var(--danger);
}
.missing h1 {
  color: var(--text);
  font-size: 20px;
}

@media (max-width: 900px) {
  .head-card {
    padding-right: 20px;
  }
  .portrait {
    display: none;
  }
  .map-link {
    position: static;
    align-self: flex-start;
  }
  .head-card {
    flex-direction: column;
  }
  .meta-grid {
    grid-template-columns: 1fr 1fr;
  }
  .crumbs {
    display: none;
  }
}
@media (max-width: 560px) {
  .actions .btn-danger span,
  .home-link {
    display: none;
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
