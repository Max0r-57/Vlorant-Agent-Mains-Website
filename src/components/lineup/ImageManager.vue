<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { imagesFromDataTransfer, isImageFile, processImage } from '@/lib/image'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import Icon from '@/components/common/Icon.vue'
import { newEditableKey, toSource, type EditableImage } from './editableImages'
import StoredImageTile from './StoredImageTile.vue'

/**
 * 图片管理：点击 / 拖入 / 粘贴（Ctrl+V）上传多张图片，拖动排序，第一张为预览图（封面）。
 */
const props = withDefaults(
  defineProps<{
    compact?: boolean
    /** 在整个页面监听粘贴（新建面板、详情页使用） */
    listenPaste?: boolean
    title?: string
  }>(),
  { listenPaste: true, title: '' },
)
const images = defineModel<EditableImage[]>({ required: true })

const { prefs } = usePrefs()
const ui = useUi()
const fileInput = ref<HTMLInputElement>()
const dropActive = ref(false)
const dragKey = ref<string | null>(null)
const dropIndex = ref<number | null>(null)

// ---------- 添加图片 ----------
function patch(key: string, next: Partial<EditableImage>) {
  images.value = images.value.map((i) => (i.key === key ? { ...i, ...next } : i))
}

async function addFiles(files: File[]) {
  const valid = files.filter(isImageFile)
  if (valid.length < files.length) ui.toast('已忽略非图片文件', { kind: 'info' })
  if (!valid.length) return
  const added = valid.map((file) => ({
    file,
    item: {
      key: newEditableKey(),
      previewUrl: URL.createObjectURL(file),
      status: 'processing',
    } satisfies EditableImage,
  }))
  images.value = [...images.value, ...added.map((a) => a.item)]
  await Promise.all(
    added.map(async ({ file, item }) => {
      try {
        const processed = await processImage(file, {
          compress: prefs.compressImages,
          maxSide: prefs.maxImageSide,
          quality: prefs.imageQuality,
        })
        if (!images.value.some((i) => i.key === item.key)) return // 处理期间已被删除
        const oldPreview = item.previewUrl
        patch(item.key, {
          draft: markRaw(processed),
          previewUrl: URL.createObjectURL(processed.thumb),
          fullUrl: URL.createObjectURL(processed.blob),
          status: 'ready',
        })
        URL.revokeObjectURL(oldPreview!)
      } catch (e) {
        patch(item.key, { status: 'error', error: e instanceof Error ? e.message : '处理失败' })
      }
    }),
  )
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function onPaste(e: ClipboardEvent) {
  const files = imagesFromDataTransfer(e.clipboardData)
  if (!files.length) return
  const target = e.target as HTMLElement | null
  // 在文本框里粘贴文字时不拦截
  const inText = target?.closest('input, textarea, [contenteditable]')
  if (inText && e.clipboardData?.types.includes('text/plain')) return
  e.preventDefault()
  addFiles(files)
  ui.toast(`已从剪贴板添加 ${files.length} 张图片`, { kind: 'info' })
}

onMounted(() => {
  if (props.listenPaste) window.addEventListener('paste', onPaste)
})

// ---------- 释放临时 URL ----------
const urlsByKey = new Map<string, string[]>()
watch(
  images,
  (list) => {
    const alive = new Set(list.map((i) => i.key))
    for (const i of list) {
      const urls = [i.previewUrl, i.fullUrl].filter((u): u is string => !!u)
      if (urls.length) urlsByKey.set(i.key, urls)
    }
    for (const [key, urls] of urlsByKey) {
      if (!alive.has(key)) {
        urls.forEach((u) => URL.revokeObjectURL(u))
        urlsByKey.delete(key)
      }
    }
  },
  { deep: false, immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  for (const urls of urlsByKey.values()) urls.forEach((u) => URL.revokeObjectURL(u))
  urlsByKey.clear()
})

// ---------- 排序 / 删除 ----------
function remove(key: string) {
  images.value = images.value.filter((i) => i.key !== key)
}

function makeCover(key: string) {
  const item = images.value.find((i) => i.key === key)
  if (!item) return
  images.value = [item, ...images.value.filter((i) => i.key !== key)]
}

function move(key: string, to: number) {
  const list = [...images.value]
  const from = list.findIndex((i) => i.key === key)
  if (from < 0) return
  const [item] = list.splice(from, 1)
  list.splice(to > from ? to - 1 : to, 0, item!)
  images.value = list
}

function onTileDragStart(e: DragEvent, key: string) {
  dragKey.value = key
  e.dataTransfer?.setData('text/x-lineup-image', key)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onTileDragOver(e: DragEvent, index: number) {
  if (!dragKey.value) return
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropIndex.value = e.clientX < rect.left + rect.width / 2 ? index : index + 1
}

function onDragEnd() {
  dragKey.value = null
  dropIndex.value = null
}

function onZoneDragOver(e: DragEvent) {
  if (dragKey.value) return
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault()
    dropActive.value = true
  }
}

function onZoneDrop(e: DragEvent) {
  dropActive.value = false
  if (dragKey.value) {
    e.preventDefault()
    if (dropIndex.value !== null) move(dragKey.value, dropIndex.value)
    onDragEnd()
    return
  }
  const files = imagesFromDataTransfer(e.dataTransfer)
  if (files.length) {
    e.preventDefault()
    addFiles(files)
  }
}

function openViewer(index: number) {
  const sources = images.value.map(toSource)
  const valid = sources.filter((s): s is NonNullable<typeof s> => !!s)
  const target = sources[index]
  ui.openLightbox(valid, target ? valid.indexOf(target) : 0, props.title)
}

defineExpose({ addFiles, openPicker: () => fileInput.value?.click() })
</script>

<template>
  <div
    class="images"
    :class="{ compact, 'drop-active': dropActive, empty: !images.length }"
    @dragover="onZoneDragOver"
    @dragleave.self="dropActive = false"
    @drop="onZoneDrop"
  >
    <TransitionGroup tag="div" name="tile" class="grid">
      <div
        v-for="(img, i) in images"
        :key="img.key"
        class="tile"
        :class="{
          dragging: dragKey === img.key,
          'drop-before': dropIndex === i && dragKey !== img.key,
          'drop-after': dropIndex === i + 1 && i === images.length - 1,
        }"
        draggable="true"
        @dragstart="onTileDragStart($event, img.key)"
        @dragover="onTileDragOver($event, i)"
        @dragend="onDragEnd"
      >
        <button type="button" class="tile-img" :aria-label="`查看第 ${i + 1} 张图片`" @click="openViewer(i)">
          <StoredImageTile v-if="img.storedId" :id="img.storedId" />
          <img v-else-if="img.previewUrl" :src="img.previewUrl" alt="" draggable="false" />
        </button>
        <span v-if="i === 0" class="cover-badge">预览图</span>
        <span v-if="img.status === 'processing'" class="state">处理中…</span>
        <span v-else-if="img.status === 'error'" class="state error" :title="img.error">处理失败</span>
        <div class="tile-actions">
          <button
            v-if="i !== 0"
            type="button"
            class="tile-btn"
            title="设为预览图"
            aria-label="设为预览图"
            @click="makeCover(img.key)"
          >
            <Icon name="star" :size="14" />
          </button>
          <button type="button" class="tile-btn danger" title="移除" aria-label="移除图片" @click="remove(img.key)">
            <Icon name="x" :size="14" />
          </button>
        </div>
      </div>
      <button key="__add" type="button" class="add" @click="fileInput?.click()">
        <Icon name="upload" :size="compact ? 18 : 22" />
        <span class="add-title">{{ images.length ? '继续添加' : '上传图片' }}</span>
        <span class="add-hint">点击选择 · 拖入 · <span class="kbd">Ctrl</span>+<span class="kbd">V</span> 粘贴</span>
      </button>
    </TransitionGroup>
    <p v-if="images.length > 1" class="tip">拖动图片调整顺序，第一张会作为预览图</p>
    <input ref="fileInput" class="sr-only" type="file" accept="image/*" multiple @change="onPick" />
  </div>
</template>

<style scoped>
.images {
  position: relative;
  border-radius: var(--r);
}
.images.drop-active::after {
  content: '松开以添加图片';
  position: absolute;
  inset: -4px;
  display: grid;
  place-items: center;
  border: 2px dashed var(--cyan);
  border-radius: var(--r);
  background: rgb(10 15 19 / 0.85);
  color: var(--cyan);
  font-weight: 700;
  pointer-events: none;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.compact .grid {
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.tile {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: var(--r-sm);
  background: var(--bg);
  box-shadow: 0 0 0 1px var(--line-strong);
  cursor: grab;
}
.tile.dragging {
  opacity: 0.35;
}
.tile.drop-before::before,
.tile.drop-after::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--cyan);
}
.tile.drop-before::before {
  left: -7px;
}
.tile.drop-after::after {
  right: -7px;
}
.tile-img {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: inherit;
  background: none;
  cursor: zoom-in;
}
.tile-img :deep(img),
.tile-img > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-badge {
  position: absolute;
  left: 6px;
  top: 6px;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
}
.state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: rgb(10 15 19 / 0.6);
  color: var(--text-2);
  font-size: 12px;
  pointer-events: none;
}
.state.error {
  color: var(--danger);
}
.tile-actions {
  position: absolute;
  right: 5px;
  top: 5px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s var(--ease);
}
.tile:hover .tile-actions,
.tile:focus-within .tile-actions {
  opacity: 1;
}
@media (hover: none) {
  .tile-actions {
    opacity: 1;
  }
}
.tile-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--r-xs);
  background: rgb(10 15 19 / 0.8);
  color: var(--text);
}
.tile-btn:hover {
  background: var(--surface-3);
}
.tile-btn.danger:hover {
  background: var(--danger);
  color: #fff;
}
.add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  aspect-ratio: 16 / 10;
  padding: 6px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  text-align: center;
  transition:
    border-color 0.15s var(--ease),
    color 0.15s var(--ease),
    background-color 0.15s var(--ease);
}
.add:hover {
  border-color: var(--cyan-dim);
  background: var(--cyan-soft);
  color: var(--cyan);
}
.add-title {
  font-size: 13px;
  font-weight: 600;
}
.add-hint {
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.6;
}
.compact .add-hint {
  display: none;
}
.empty .add {
  grid-column: 1 / -1;
  aspect-ratio: auto;
  min-height: 96px;
}
.empty.compact .add-hint {
  display: block;
}
.tip {
  margin-top: 6px;
  color: var(--text-3);
  font-size: 12px;
}
.tile-move {
  transition: transform 0.2s var(--ease);
}
</style>
