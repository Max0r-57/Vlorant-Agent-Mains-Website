<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAPS, MAP_BY_ID } from '@/data/maps'
import Dropdown from './Dropdown.vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    /** null 表示「全部地图」（需要 allowAll） */
    modelValue: string | null
    allowAll?: boolean
    /** 每张地图上的 Lineup 数量（可选，显示在列表右侧） */
    counts?: Map<string, number>
    variant?: 'hero' | 'compact'
  }>(),
  { variant: 'compact' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const open = ref(false)
const current = computed(() => (props.modelValue ? MAP_BY_ID.get(props.modelValue) : undefined))
const total = computed(() => {
  if (!props.counts) return undefined
  let n = 0
  for (const v of props.counts.values()) n += v
  return n
})

function pick(id: string | null, close: () => void) {
  emit('update:modelValue', id)
  close()
}
</script>

<template>
  <Dropdown v-model:open="open" :match-width="variant === 'hero'" :width="variant === 'hero' ? undefined : 300">
    <template #trigger="{ toggle }">
      <button
        v-if="variant === 'hero'"
        type="button"
        class="hero"
        :class="{ open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
      >
        <img
          v-if="current"
          class="hero-bg"
          :class="{ minimap: !current.preview }"
          :src="current.preview ?? current.image"
          alt=""
          draggable="false"
        />
        <span class="hero-text">
          <span class="eyebrow">Map · 地图</span>
          <span class="hero-name">
            {{ current?.name ?? '全部地图' }}
            <small v-if="current?.en">{{ current.en }}</small>
          </span>
        </span>
        <Icon name="chevronDown" class="chev" />
      </button>
      <button
        v-else
        type="button"
        class="compact btn btn-outline"
        :class="{ open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
      >
        <img v-if="current" class="compact-thumb" :src="current.preview ?? current.image" alt="" />
        <Icon v-else name="map" :size="16" />
        <span class="ellipsis">{{ current?.name ?? '全部地图' }}</span>
        <Icon name="chevronDown" :size="16" class="chev" />
      </button>
    </template>

    <template #default="{ close }">
      <div class="list" role="listbox" aria-label="选择地图">
        <button
          v-if="allowAll"
          type="button"
          class="row"
          data-dd-item
          role="option"
          :aria-selected="modelValue === null"
          @click="pick(null, close)"
        >
          <span class="thumb all"><Icon name="layers" :size="20" /></span>
          <span class="row-text">
            <span class="row-name">全部地图</span>
          </span>
          <span v-if="total !== undefined" class="count tabular">{{ total }}</span>
          <Icon v-if="modelValue === null" name="check" :size="16" class="tick" />
        </button>
        <button
          v-for="m in MAPS"
          :key="m.id"
          type="button"
          class="row"
          :class="{ 'has-bg': !!m.preview }"
          data-dd-item
          role="option"
          :aria-selected="modelValue === m.id"
          @click="pick(m.id, close)"
        >
          <img v-if="m.preview" class="row-bg" :src="m.preview" alt="" loading="lazy" draggable="false" />
          <img v-else class="thumb" :src="m.image" alt="" loading="lazy" draggable="false" />
          <span class="row-text">
            <span class="row-name">{{ m.name }}</span>
            <span v-if="m.en" class="row-sub">{{ m.en }}</span>
          </span>
          <span v-if="counts" class="count tabular" :class="{ zero: !counts.get(m.id) }">
            {{ counts.get(m.id) ?? 0 }}
          </span>
          <Icon v-if="modelValue === m.id" name="check" :size="16" class="tick" />
        </button>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 72px;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: var(--map-floor);
  text-align: left;
  transition: border-color 0.15s var(--ease);
}
.hero:hover,
.hero.open {
  border-color: var(--cyan-dim);
}
.hero-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 50%;
  opacity: 0.9;
  pointer-events: none;
  transition: transform 0.3s var(--ease);
}
.hero:hover .hero-bg {
  transform: scale(1.04);
}
/* 没有预览图时用俯瞰图，放大一些只露出中间部分 */
.hero-bg.minimap {
  object-position: 50% 45%;
  transform: scale(1.8);
  opacity: 0.55;
}
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(10 15 19 / 0.9) 0%, rgb(10 15 19 / 0.55) 55%, rgb(10 15 19 / 0.1) 100%);
  pointer-events: none;
}
.hero-text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.hero-name {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.hero-name small {
  margin-left: 6px;
  color: var(--cyan);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.chev {
  position: relative;
  z-index: 1;
  color: var(--text-2);
  transition: transform 0.2s var(--ease);
}
.open .chev {
  transform: rotate(180deg);
}

.compact {
  justify-content: flex-start;
  min-width: 150px;
  max-width: 220px;
  font-weight: 500;
}
.compact .chev {
  margin-left: auto;
}
.compact-thumb {
  width: 30px;
  height: 20px;
  border-radius: var(--r-xs);
  object-fit: cover;
  transform: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
}
.row:hover,
.row:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.row[aria-selected='true'] {
  background: var(--cyan-soft);
}
/* 有预览图的地图：预览图铺满整行作为背景 */
.row.has-bg {
  position: relative;
  min-height: 52px;
  padding: 8px 10px 8px 12px;
  overflow: hidden;
  border: 1px solid transparent;
  background: var(--bg);
}
.row-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.75;
  pointer-events: none;
  transition:
    opacity 0.15s var(--ease),
    transform 0.3s var(--ease);
}
.row.has-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(10 15 19 / 0.92) 0%, rgb(10 15 19 / 0.6) 55%, rgb(10 15 19 / 0.35) 100%);
  pointer-events: none;
}
.row.has-bg > :not(.row-bg) {
  position: relative;
  z-index: 1;
}
.row.has-bg:hover,
.row.has-bg:focus-visible {
  border-color: var(--line-strong);
  background: var(--bg);
}
.row.has-bg:hover .row-bg,
.row.has-bg:focus-visible .row-bg {
  opacity: 1;
  transform: scale(1.04);
}
.row.has-bg[aria-selected='true'] {
  border-color: var(--cyan);
  background: var(--bg);
}
.row.has-bg .row-name {
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
}
.row.has-bg .row-sub {
  color: var(--text-2);
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
}
.row.has-bg .count {
  background: rgb(10 15 19 / 0.8);
}
.thumb {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--r-sm);
  object-fit: cover;
  background: var(--bg);
  border: 1px solid var(--line);
}
.thumb.all {
  display: grid;
  place-items: center;
  color: var(--text-2);
}
.row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.row-name {
  font-weight: 600;
}
.row-sub {
  color: var(--text-3);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.count {
  min-width: 24px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
  text-align: center;
}
.count.zero {
  opacity: 0.5;
}
.tick {
  color: var(--cyan);
}
</style>
