<script setup lang="ts">
import { computed } from 'vue'
import { TYPE_COLORS } from '@/stores/lineups'

const color = defineModel<string>({ required: true })
const isCustom = computed(() => !TYPE_COLORS.includes(color.value.toLowerCase()))
</script>

<template>
  <div class="colors" role="radiogroup" aria-label="类型颜色">
    <button
      v-for="c in TYPE_COLORS"
      :key="c"
      type="button"
      class="swatch"
      role="radio"
      :aria-checked="color.toLowerCase() === c"
      :aria-label="c"
      :style="{ '--c': c }"
      @click="color = c"
    />
    <label class="swatch custom" :class="{ active: isCustom }" :style="{ '--c': color }" title="自定义颜色">
      <input v-model="color" type="color" aria-label="自定义颜色" />
      <span aria-hidden="true">+</span>
    </label>
  </div>
</template>

<style scoped>
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.swatch {
  position: relative;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--c);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25);
  transition: transform 0.12s var(--ease);
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch[aria-checked='true'],
.swatch.custom.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--c);
}
.custom {
  display: grid;
  place-items: center;
  overflow: hidden;
  cursor: pointer;
  background: conic-gradient(from 0deg, #ff4655, #f59e0b, #a3e635, #2dd4bf, #3b82f6, #a78bfa, #f472b6, #ff4655);
}
.custom.active {
  background: var(--c);
}
.custom span {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
}
.custom.active span {
  display: none;
}
.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
