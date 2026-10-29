<script setup lang="ts">
import { computed, ref } from 'vue'
import { LINEUP_FEATURES, type LineupFeature } from '@/lib/filter'
import Dropdown from './Dropdown.vue'
import Icon from './Icon.vue'

/** 功能多选筛选（路径追踪 / 落点 / Bug / 失效），空数组 = 不限 */
const props = defineProps<{ modelValue: LineupFeature[]; counts?: Map<LineupFeature, number> }>()
const emit = defineEmits<{ 'update:modelValue': [value: LineupFeature[]] }>()

const open = ref(false)
const selected = computed(() => new Set(props.modelValue))
const label = computed(() => {
  const list = LINEUP_FEATURES.filter((f) => selected.value.has(f.value))
  if (!list.length) return '全部功能'
  if (list.length === 1) return list[0]!.label
  return `${list[0]!.label} +${list.length - 1}`
})

function toggle(f: LineupFeature) {
  const next = new Set(selected.value)
  if (next.has(f)) next.delete(f)
  else next.add(f)
  emit(
    'update:modelValue',
    LINEUP_FEATURES.filter((x) => next.has(x.value)).map((x) => x.value),
  )
}
</script>

<template>
  <Dropdown v-model:open="open" :width="200">
    <template #trigger="{ toggle: toggleOpen }">
      <button
        type="button"
        class="btn btn-outline filter-btn"
        :class="{ active: modelValue.length, open }"
        :aria-expanded="open"
        @click="toggleOpen"
      >
        <Icon name="sliders" :size="15" />
        <span class="ellipsis">{{ label }}</span>
        <Icon name="chevronDown" :size="14" class="chev" />
      </button>
    </template>
    <template #default>
      <div class="head">
        <span class="eyebrow">按功能筛选</span>
        <button v-if="modelValue.length" type="button" class="link" @click="emit('update:modelValue', [])">
          清除
        </button>
      </div>
      <div class="options">
        <label v-for="f in LINEUP_FEATURES" :key="f.value" class="option" data-dd-item tabindex="-1">
          <input type="checkbox" :checked="selected.has(f.value)" @change="toggle(f.value)" />
          <span class="ellipsis">{{ f.label }}</span>
          <span v-if="counts" class="count tabular">{{ counts.get(f.value) ?? 0 }}</span>
        </label>
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
.filter-btn.active {
  border-color: var(--cyan-dim);
  color: var(--text);
  background: var(--cyan-soft);
}
.chev {
  margin-left: auto;
  color: var(--text-3);
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
</style>
