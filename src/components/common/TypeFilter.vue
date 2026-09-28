<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLineups } from '@/stores/lineups'
import Dropdown from './Dropdown.vue'
import Icon from './Icon.vue'

/** 类型多选筛选，空数组 = 全部类型 */
const props = defineProps<{ modelValue: string[]; counts?: Map<string, number>; block?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const store = useLineups()
const open = ref(false)

const selected = computed(() => new Set(props.modelValue))
const label = computed(() => {
  const types = store.sortedTypes.filter((t) => selected.value.has(t.id))
  if (!types.length) return '全部类型'
  if (types.length === 1) return types[0]!.name
  return `${types[0]!.name} +${types.length - 1}`
})
const firstColor = computed(
  () => store.sortedTypes.find((t) => selected.value.has(t.id))?.color ?? null,
)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  // 保持和类型列表一致的顺序
  emit(
    'update:modelValue',
    store.sortedTypes.filter((t) => next.has(t.id)).map((t) => t.id),
  )
}
</script>

<template>
  <Dropdown v-model:open="open" :width="240">
    <template #trigger="{ toggle: toggleOpen }">
      <button
        type="button"
        class="btn btn-outline filter-btn"
        :class="{ active: modelValue.length, open, block }"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        <i v-if="firstColor" class="dot" :style="{ background: firstColor }" />
        <Icon v-else name="tag" :size="15" />
        <span class="ellipsis">{{ label }}</span>
        <Icon name="chevronDown" :size="14" class="chev" />
      </button>
    </template>
    <template #default>
      <div class="head">
        <span class="eyebrow">按类型筛选</span>
        <button v-if="modelValue.length" type="button" class="link" @click="emit('update:modelValue', [])">
          清除
        </button>
      </div>
      <div class="options">
        <label v-for="t in store.sortedTypes" :key="t.id" class="option" data-dd-item tabindex="-1">
          <input type="checkbox" :checked="selected.has(t.id)" @change="toggle(t.id)" />
          <i class="dot" :style="{ background: t.color }" />
          <span class="ellipsis">{{ t.name }}</span>
          <span v-if="counts" class="count tabular">{{ counts.get(t.id) ?? 0 }}</span>
        </label>
        <p v-if="!store.types.length" class="empty">还没有任何类型</p>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.filter-btn {
  justify-content: flex-start;
  max-width: 180px;
  font-weight: 500;
}
.filter-btn.block {
  width: 100%;
  max-width: none;
}
.filter-btn.active {
  border-color: var(--cyan-dim);
  color: var(--text);
  background: var(--cyan-soft);
}
.chev {
  margin-left: auto;
  color: var(--text-3);
}
.dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px #fff;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
}
.link {
  border: 0;
  background: none;
  color: var(--cyan);
  font-size: 12px;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.option:hover,
.option:focus-within,
.option:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.option input {
  accent-color: var(--cyan-dim);
  margin: 0;
}
.count {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}
.empty {
  padding: 8px;
  color: var(--text-3);
  font-size: 13px;
}
</style>
