<script setup lang="ts">
import { computed, ref } from 'vue'
import { TYPE_COLORS, useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import type { LineupType } from '@/types'
import ColorPicker from '@/components/common/ColorPicker.vue'
import Icon from '@/components/common/Icon.vue'

/** 类型（标签）管理：改名、改颜色、排序、删除（删除时把 Lineup 转移到其他类型） */
const store = useLineups()
const ui = useUi()

const editingColor = ref<string | null>(null)
const deleting = ref<{ id: string; target: string } | null>(null)
const newName = ref('')
const newColor = ref(TYPE_COLORS[0]!)
const createError = ref('')

const types = computed(() => store.sortedTypes)

async function rename(t: LineupType, e: Event) {
  const input = e.target as HTMLInputElement
  const name = input.value.trim()
  if (name === t.name) return
  try {
    await store.updateType(t.id, { name })
    ui.toast('已重命名')
  } catch (err) {
    input.value = t.name
    ui.toast(err instanceof Error ? err.message : '重命名失败', { kind: 'error' })
  }
}

async function recolor(t: LineupType, color: string) {
  await store.updateType(t.id, { color })
}

async function askDelete(t: LineupType) {
  const count = store.countByType.get(t.id) ?? 0
  if (count === 0) {
    const ok = await ui.confirm({ title: `删除类型「${t.name}」？`, confirmText: '删除', danger: true })
    if (ok) {
      await store.deleteType(t.id, null)
      ui.toast('已删除类型')
    }
    return
  }
  const other = types.value.find((x) => x.id !== t.id)
  if (!other) {
    ui.toast('这是唯一的类型，且仍有 Lineup 在使用，请先新建一个类型', { kind: 'error' })
    return
  }
  deleting.value = { id: t.id, target: other.id }
}

async function confirmDelete() {
  const d = deleting.value
  if (!d) return
  const moved = store.countByType.get(d.id) ?? 0
  await store.deleteType(d.id, d.target)
  deleting.value = null
  ui.toast(`已删除类型，${moved} 个 Lineup 已转移到「${store.typeName(d.target)}」`)
}

async function create() {
  createError.value = ''
  try {
    await store.createType(newName.value, newColor.value)
    newName.value = ''
    const used = new Set(store.types.map((t) => t.color.toLowerCase()))
    newColor.value = TYPE_COLORS.find((c) => !used.has(c)) ?? TYPE_COLORS[0]!
  } catch (e) {
    createError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <section class="s-section">
    <h3 class="s-title">类型管理</h3>
    <p class="s-desc">
      类型就是 Lineup 的分类标签，地图上圆点的颜色代表它的类型。修改颜色会立即应用到所有该类型的 Lineup。
    </p>

    <ul class="type-list">
      <li v-for="(t, i) in types" :key="t.id" class="type-row" :class="{ open: editingColor === t.id || deleting?.id === t.id }">
        <div class="type-main">
          <button
            type="button"
            class="color-btn"
            :style="{ background: t.color }"
            :aria-label="`修改「${t.name}」的颜色`"
            title="修改颜色"
            @click="editingColor = editingColor === t.id ? null : t.id"
          />
          <input
            class="input name"
            :value="t.name"
            maxlength="20"
            :aria-label="`类型名称：${t.name}`"
            @change="rename(t, $event)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <span class="count tabular">{{ store.countByType.get(t.id) ?? 0 }} 个</span>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost btn-icon btn-sm" :disabled="i === 0" title="上移" aria-label="上移" @click="store.moveType(t.id, -1)">
              <Icon name="arrowUp" :size="15" />
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon btn-sm"
              :disabled="i === types.length - 1"
              title="下移"
              aria-label="下移"
              @click="store.moveType(t.id, 1)"
            >
              <Icon name="arrowDown" :size="15" />
            </button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm danger" title="删除" aria-label="删除类型" @click="askDelete(t)">
              <Icon name="trash" :size="15" />
            </button>
          </div>
        </div>

        <div v-if="editingColor === t.id" class="expand">
          <ColorPicker :model-value="t.color" @update:model-value="(c) => recolor(t, c)" />
          <button type="button" class="btn btn-sm btn-outline" @click="editingColor = null">完成</button>
        </div>

        <div v-if="deleting?.id === t.id" class="expand delete-box">
          <Icon name="alert" :size="16" class="warn" />
          <span>有 {{ store.countByType.get(t.id) ?? 0 }} 个 Lineup 使用此类型，删除后转移到</span>
          <select v-model="deleting.target" class="select" aria-label="转移到的类型">
            <option v-for="o in types.filter((x) => x.id !== t.id)" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
          <button type="button" class="btn btn-sm btn-danger" @click="confirmDelete">确认删除</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="deleting = null">取消</button>
        </div>
      </li>
      <li v-if="!types.length" class="empty">还没有任何类型</li>
    </ul>
  </section>

  <section class="s-section">
    <h3 class="s-title">新建类型</h3>
    <form class="create" @submit.prevent="create">
      <div class="create-row">
        <i class="preview-dot" :style="{ background: newColor }" />
        <input v-model="newName" class="input" maxlength="20" placeholder="类型名称，如「信标」「大招」「站位技巧」" />
        <button type="submit" class="btn btn-primary" :disabled="!newName.trim()">
          <Icon name="plus" :size="16" />
          添加
        </button>
      </div>
      <ColorPicker v-model="newColor" />
      <p v-if="createError" class="field-error">{{ createError }}</p>
    </form>
  </section>
</template>

<style scoped>
.type-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.type-row {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
}
.type-row.open {
  border-color: var(--line-strong);
}
.type-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 10px;
}
.color-btn {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #fff;
}
.name {
  flex: 1;
  height: 32px;
  border-color: transparent;
  background: transparent;
  font-weight: 600;
}
.name:hover {
  border-color: var(--line-strong);
}
.count {
  flex: none;
  min-width: 44px;
  color: var(--text-3);
  font-size: 12px;
  text-align: right;
}
.row-actions {
  display: flex;
  gap: 2px;
}
.danger:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
}
.expand {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 12px 40px;
  border-top: 1px dashed var(--line);
}
.delete-box {
  color: var(--text-2);
  font-size: 13px;
}
.warn {
  color: var(--danger);
}
.empty {
  padding: 16px;
  color: var(--text-3);
  text-align: center;
}
.create {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.create-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview-dot {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: 0 0 0 2.5px #fff;
}
</style>
