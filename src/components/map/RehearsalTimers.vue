<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useLayer } from '@/composables/useLayer'
import { clampSpikeSeconds, formatClock, SPIKE_SECONDS } from '@/lib/rehearsal'
import Icon from '@/components/common/Icon.vue'

/**
 * 现场演练的计时器：正向计时（精确到 0.1 秒）+ 爆能器倒计时，两者都在圆点开始移动时开始、到达终点时暂停。
 * - 爆能器：点数字（或右上角的笔）可以修改演练开始时的剩余时间（默认 45 秒），改完立即生效，之后的演练也沿用；
 * - 大招开关（炼狱：天基光束）：打开后，燃烧弹结束时再倒数大招的持续时间。
 */
const props = defineProps<{
  /** 圆点已经走了多少秒（到达终点后不再增加） */
  elapsed: number
  /** 可以接上的大招名称；为空时不显示大招开关 */
  ultLabel?: string
  /** 大招持续时间（秒） */
  ultSeconds?: number
  /** 大招接在哪个技能后面，如「燃烧弹」 */
  ultAfter?: string
}>()
/** 演练开始时爆能器的剩余时间（秒） */
const spikeStart = defineModel<number>('spikeStart', { default: SPIKE_SECONDS })
const ultimate = defineModel<boolean>('ultimate', { default: false })

const spike = computed(() => Math.max(0, spikeStart.value - props.elapsed))

// ---------- 修改爆能器时间 ----------
const editing = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement>()

async function startEdit() {
  draft.value = String(spikeStart.value)
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  spikeStart.value = clampSpikeSeconds(draft.value)
}

function resetSpike() {
  editing.value = false
  spikeStart.value = SPIKE_SECONDS
}

// Esc 只取消修改，不结束演练
useLayer(editing, () => (editing.value = false))
</script>

<template>
  <div class="timers" role="group" aria-label="现场演练计时" data-map-ui>
    <div class="timer" role="timer">
      <span class="label">
        <Icon name="timer" :size="13" />
        计时
      </span>
      <span class="value tabular">{{ formatClock(elapsed) }}<small>s</small></span>
    </div>

    <div class="timer spike" :class="{ low: spike <= 10, zero: spike <= 0, editing }" role="timer">
      <span class="label">
        <Icon name="spike" :size="13" />
        爆能器
        <button
          v-if="!editing"
          type="button"
          class="icon-btn"
          title="修改演练开始时爆能器的剩余时间"
          aria-label="修改爆能器时间"
          @click="startEdit"
        >
          <Icon name="edit" :size="12" />
        </button>
      </span>
      <!-- novalidate：超出范围或不是 0.5 的倍数时也能提交，由 clampSpikeSeconds 统一处理 -->
      <form v-if="editing" class="edit" novalidate @submit.prevent="commit">
        <label class="edit-label" for="spike-start">开始时剩余</label>
        <span class="edit-row">
          <input
            id="spike-start"
            ref="input"
            v-model="draft"
            class="edit-input tabular"
            type="number"
            inputmode="decimal"
            min="0"
            :max="SPIKE_SECONDS"
            step="0.5"
            aria-label="演练开始时爆能器的剩余秒数"
            @blur="commit"
          />
          <small>秒</small>
          <button type="submit" class="icon-btn ok" title="确定" aria-label="确定" @mousedown.prevent>
            <Icon name="check" :size="13" />
          </button>
        </span>
        <button type="button" class="reset" @mousedown.prevent @click="resetSpike">恢复 {{ SPIKE_SECONDS }} 秒</button>
      </form>
      <template v-else>
        <button type="button" class="value tabular value-btn" title="点击修改演练开始时的剩余时间" @click="startEdit">
          {{ formatClock(spike, 'ceil') }}<small>s</small>
        </button>
        <span v-if="spikeStart !== SPIKE_SECONDS" class="start-note tabular">开始时 {{ spikeStart }} 秒</span>
      </template>
    </div>

    <div v-if="ultLabel" class="timer ult" :class="{ on: ultimate }">
      <span class="label ult-row">
        <Icon name="zap" :size="13" />
        {{ ultLabel }}
        <button
          type="button"
          class="switch"
          role="switch"
          :aria-checked="ultimate"
          :aria-label="`燃烧弹结束后接上${ultLabel}`"
          @click="ultimate = !ultimate"
        />
      </span>
      <span class="ult-note">{{ ultAfter ?? '技能' }}结束后 +{{ ultSeconds ?? 0 }} 秒</span>
    </div>
  </div>
</template>

<style scoped>
.timers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 152px;
}
.timer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 6px 12px 7px;
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--cyan-dim);
  border-radius: var(--r-lg);
  background: rgb(13 20 25 / 0.88);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-card);
}
.label {
  display: flex;
  align-items: center;
  gap: 5px;
  align-self: stretch;
  color: var(--text-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.timer .label :deep(.icon) {
  color: var(--cyan);
}
.value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.02em;
}
.value small,
.edit-row small {
  margin-left: 2px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
}
.value-btn {
  padding: 0;
  border: 0;
  border-radius: var(--r-xs);
  background: none;
  color: inherit;
  text-align: left;
  cursor: text;
}
.value-btn:hover {
  text-decoration: underline dotted var(--text-3);
  text-underline-offset: 4px;
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--text-3);
}
.icon-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}
.timer .icon-btn :deep(.icon) {
  color: inherit;
}
.start-note,
.ult-note {
  color: var(--text-3);
  font-size: 11px;
}
.spike {
  border-left-color: var(--accent);
}
.spike .label > :deep(.icon:first-child) {
  color: var(--accent);
}
.spike.low .value {
  color: #ff7b86;
}
.spike.zero .value {
  color: var(--accent);
}
.edit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 3px;
}
.edit-label {
  color: var(--text-3);
  font-size: 11px;
}
.edit-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.edit-input {
  width: 64px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--cyan-dim);
  border-radius: var(--r-sm);
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
}
.edit-input:focus {
  outline: 2px solid var(--cyan-soft);
}
.icon-btn.ok {
  margin-left: 2px;
  color: var(--cyan);
}
.reset {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--cyan);
  font-size: 11px;
  font-weight: 600;
}
.reset:hover {
  text-decoration: underline;
}
.ult {
  border-left-color: #ffb02e;
}
.ult-row {
  justify-content: flex-start;
}
.ult .label > :deep(.icon) {
  color: #ffb02e;
}
.ult .switch {
  margin-left: auto;
  transform: scale(0.85);
  transform-origin: right center;
}
.ult.on .switch[aria-checked='true'] {
  background: #c9861d;
}
.ult.on .ult-note {
  color: #ffcf7a;
}
</style>
