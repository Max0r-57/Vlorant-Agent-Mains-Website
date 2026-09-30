<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MAX_LANDING_DELAY, normalizeDelay } from '@/lib/paths'

/**
 * 落点时间输入框（秒，选填，最多一位小数）。
 * 用文本框而不是 number 输入框：输入「2.」这类中间状态时不会被清空。
 */
const props = defineProps<{ modelValue: number | null; id?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const text = ref(props.modelValue === null ? '' : String(props.modelValue))
const invalid = computed(() => !!text.value.trim() && normalizeDelay(text.value) === null)

watch(
  () => props.modelValue,
  (v) => {
    // 外部修改（例如撤销）时同步；自己输入引起的变化不改动文本
    if (normalizeDelay(text.value) !== v) text.value = v === null ? '' : String(v)
  },
)

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  emit('update:modelValue', normalizeDelay(text.value))
}

function onBlur() {
  const v = normalizeDelay(text.value)
  text.value = v === null ? (invalid.value ? text.value : '') : String(v)
}
</script>

<template>
  <span class="delay-input">
    <input
      :id="id"
      class="input"
      :class="{ 'is-invalid': invalid }"
      :value="text"
      inputmode="decimal"
      autocomplete="off"
      maxlength="5"
      placeholder="选填"
      aria-label="落点时间（秒）"
      @input="onInput"
      @blur="onBlur"
    />
    <span class="unit">秒</span>
  </span>
  <span v-if="invalid" class="field-error">请输入 0–{{ MAX_LANDING_DELAY }} 之间的数字</span>
</template>

<style scoped>
.delay-input {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
}
.input {
  padding-right: 30px;
  font-variant-numeric: tabular-nums;
}
.unit {
  position: absolute;
  right: 10px;
  color: var(--text-3);
  font-size: 12px;
  pointer-events: none;
}
</style>
