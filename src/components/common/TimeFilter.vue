<script setup lang="ts">
import { computed, ref } from 'vue'
import { TIME_PRESETS, describeTime, isTimeActive, type TimeFilter, type TimePreset } from '@/lib/filter'
import Dropdown from './Dropdown.vue'
import Icon from './Icon.vue'

/** 创建时间筛选：快捷区间 + 自定义起止日期 */
const props = defineProps<{ modelValue: TimeFilter; block?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: TimeFilter] }>()

const open = ref(false)
const active = computed(() => isTimeActive(props.modelValue))
const label = computed(() => describeTime(props.modelValue))

function setPreset(preset: TimePreset) {
  emit('update:modelValue', { ...props.modelValue, preset })
}

function setDate(key: 'from' | 'to', value: string) {
  emit('update:modelValue', { ...props.modelValue, preset: 'custom', [key]: value || undefined })
}
</script>

<template>
  <Dropdown v-model:open="open" :width="248">
    <template #trigger="{ toggle }">
      <button
        type="button"
        class="btn btn-outline filter-btn"
        :class="{ active, open, block }"
        :aria-expanded="open"
        @click="toggle"
      >
        <Icon name="calendar" :size="15" />
        <span class="ellipsis">{{ label }}</span>
        <Icon name="chevronDown" :size="14" class="chev" />
      </button>
    </template>
    <template #default="{ close }">
      <div class="eyebrow head">按创建时间筛选</div>
      <div class="presets" role="radiogroup" aria-label="时间范围">
        <button
          v-for="p in TIME_PRESETS"
          :key="p.value"
          type="button"
          class="preset"
          data-dd-item
          role="radio"
          :aria-checked="modelValue.preset === p.value"
          @click="setPreset(p.value); p.value !== 'custom' && close()"
        >
          {{ p.label }}
          <Icon v-if="modelValue.preset === p.value" name="check" :size="15" class="tick" />
        </button>
      </div>
      <div class="custom" :class="{ dim: modelValue.preset !== 'custom' }">
        <label class="field">
          <span class="field-label">开始日期</span>
          <input
            class="input"
            type="date"
            :value="modelValue.from ?? ''"
            :max="modelValue.to"
            @input="setDate('from', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="field">
          <span class="field-label">结束日期</span>
          <input
            class="input"
            type="date"
            :value="modelValue.to ?? ''"
            :min="modelValue.from"
            @input="setDate('to', ($event.target as HTMLInputElement).value)"
          />
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
.head {
  padding: 4px 6px 8px;
}
.presets {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
}
.preset:hover,
.preset:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.preset[aria-checked='true'] {
  background: var(--cyan-soft);
}
.tick {
  color: var(--cyan);
}
.custom {
  display: grid;
  gap: 8px;
  margin-top: 6px;
  padding: 10px 6px 4px;
  border-top: 1px solid var(--line);
}
.custom.dim {
  opacity: 0.6;
}
</style>
