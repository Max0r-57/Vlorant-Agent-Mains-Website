<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { backupFileName, exportBackup, parseBackup, type ParsedBackup } from '@/db/backup'
import { imageStats } from '@/db/repo'
import { formatBytes, formatDateTime } from '@/lib/format'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import Icon from '@/components/common/Icon.vue'

/** 数据管理：存储占用、导出 / 导入备份、清理图片、清空数据 */
const store = useLineups()
const ui = useUi()

const LAST_EXPORT_KEY = 'lineup-notebook:lastExport'

const images = ref<{ count: number; bytes: number } | null>(null)
const quota = ref<{ usage: number; quota: number } | null>(null)
const persisted = ref<boolean | null>(null)
const lastExport = ref<number | null>(readLastExport())
const busy = ref<'' | 'export' | 'import' | 'cleanup' | 'clear'>('')
const fileInput = ref<HTMLInputElement>()
const pending = shallowRef<{ file: string; data: ParsedBackup } | null>(null)

function readLastExport() {
  try {
    const v = Number(localStorage.getItem(LAST_EXPORT_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

async function refresh() {
  images.value = await imageStats()
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    quota.value = { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  }
  if (navigator.storage?.persisted) persisted.value = await navigator.storage.persisted()
}
onMounted(refresh)

async function requestPersist() {
  if (!navigator.storage?.persist) return
  persisted.value = await navigator.storage.persist()
  ui.toast(persisted.value ? '已开启持久化存储' : '浏览器拒绝了持久化请求（常见于未经常访问的网站），请记得定期导出备份', {
    kind: persisted.value ? 'success' : 'info',
  })
}

async function doExport() {
  busy.value = 'export'
  try {
    const { blob, counts } = await exportBackup()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName()
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    lastExport.value = Date.now()
    try {
      localStorage.setItem(LAST_EXPORT_KEY, String(lastExport.value))
    } catch {
      /* 忽略 */
    }
    ui.toast(`已导出 ${counts.lineups} 个 Lineup、${counts.images} 张图片`)
  } catch (e) {
    ui.toast(e instanceof Error ? `导出失败：${e.message}` : '导出失败', { kind: 'error' })
  } finally {
    busy.value = ''
  }
}

async function onPickBackup(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = 'import'
  try {
    pending.value = { file: file.name, data: await parseBackup(file) }
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '无法读取备份文件', { kind: 'error' })
  } finally {
    busy.value = ''
  }
}

async function doImport(mode: 'merge' | 'replace') {
  const p = pending.value
  if (!p) return
  if (mode === 'replace') {
    const ok = await ui.confirm({
      title: '覆盖当前全部数据？',
      message: `当前的 ${store.lineups.length} 个 Lineup 和所有类型都会被删除，并替换为备份中的内容。此操作无法撤销。`,
      confirmText: '覆盖导入',
      danger: true,
    })
    if (!ok) return
  }
  busy.value = 'import'
  try {
    await store.importBackup(p.data, mode)
    pending.value = null
    ui.toast(`导入完成：${p.data.lineups.length} 个 Lineup`)
    await refresh()
  } catch (e) {
    ui.toast(e instanceof Error ? `导入失败：${e.message}` : '导入失败', { kind: 'error' })
  } finally {
    busy.value = ''
  }
}

async function cleanup() {
  busy.value = 'cleanup'
  try {
    const n = await store.cleanupImages()
    ui.toast(n ? `已清理 ${n} 张未使用的图片` : '没有需要清理的图片')
    await refresh()
  } finally {
    busy.value = ''
  }
}

async function clearAll() {
  const ok = await ui.confirm({
    title: '清空所有数据？',
    message: `将永久删除全部 ${store.lineups.length} 个 Lineup、所有图片和自定义类型，建议先导出备份。此操作无法撤销。`,
    confirmText: '全部清空',
    danger: true,
  })
  if (!ok) return
  busy.value = 'clear'
  try {
    await store.clearAll()
    ui.toast('已清空所有数据')
    await refresh()
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="s-section">
    <h3 class="s-title">存储情况</h3>
    <p class="s-desc">
      所有数据只保存在<b>当前浏览器</b>中（IndexedDB），不会上传到任何服务器。
      换电脑、换浏览器或清除浏览器数据前，请先导出备份。
    </p>
    <div class="stats">
      <div class="stat">
        <span class="stat-value tabular">{{ store.lineups.length }}</span>
        <span class="stat-label">Lineup</span>
      </div>
      <div class="stat">
        <span class="stat-value tabular">{{ store.types.length }}</span>
        <span class="stat-label">类型</span>
      </div>
      <div class="stat">
        <span class="stat-value tabular">{{ images?.count ?? '—' }}</span>
        <span class="stat-label">图片</span>
      </div>
      <div class="stat">
        <span class="stat-value tabular">{{ images ? formatBytes(images.bytes) : '—' }}</span>
        <span class="stat-label">图片占用</span>
      </div>
    </div>
    <div v-if="quota && quota.quota" class="quota">
      <div class="bar"><i :style="{ width: `${Math.max(0.5, (quota.usage / quota.quota) * 100)}%` }" /></div>
      <span class="s-row-hint tabular">浏览器已用 {{ formatBytes(quota.usage) }} / 可用约 {{ formatBytes(quota.quota) }}</span>
    </div>
    <div v-if="persisted !== null" class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">
          持久化存储
          <span class="badge" :class="persisted ? 'ok' : 'warn'">{{ persisted ? '已开启' : '未开启' }}</span>
        </span>
        <span class="s-row-hint">开启后，浏览器在磁盘空间不足时不会自动清除本网站的数据</span>
      </div>
      <button v-if="!persisted" type="button" class="btn btn-outline btn-sm" @click="requestPersist">申请开启</button>
    </div>
  </section>

  <section class="s-section">
    <h3 class="s-title">备份与恢复</h3>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">导出备份</span>
        <span class="s-row-hint">
          打包为一个 .zip 文件（包含全部 Lineup、类型和图片）。
          <template v-if="lastExport">上次导出：{{ formatDateTime(lastExport) }}</template>
          <template v-else>还没有导出过备份。</template>
        </span>
      </div>
      <button type="button" class="btn btn-primary" :disabled="!!busy" @click="doExport">
        <Icon name="download" :size="16" />
        {{ busy === 'export' ? '正在打包…' : '导出备份' }}
      </button>
    </div>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">导入备份</span>
        <span class="s-row-hint">选择之前导出的 .zip 文件，可以与现有数据合并，或完全覆盖</span>
      </div>
      <button type="button" class="btn btn-outline" :disabled="!!busy" @click="fileInput?.click()">
        <Icon name="upload" :size="16" />
        {{ busy === 'import' && !pending ? '读取中…' : '选择备份文件' }}
      </button>
      <input ref="fileInput" class="sr-only" type="file" accept=".zip,application/zip" @change="onPickBackup" />
    </div>

    <div v-if="pending" class="import-card">
      <div class="import-head">
        <Icon name="database" :size="18" />
        <div>
          <p class="import-file ellipsis">{{ pending.file }}</p>
          <p class="s-row-hint">
            导出于 {{ formatDateTime(pending.data.exportedAt) }} · {{ pending.data.lineups.length }} 个 Lineup ·
            {{ pending.data.types.length }} 个类型 · {{ pending.data.images.length }} 张图片
          </p>
          <p v-if="pending.data.missingImages" class="field-error">
            有 {{ pending.data.missingImages }} 张图片在压缩包中缺失，对应的图片引用会被跳过
          </p>
        </div>
      </div>
      <div class="import-actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!!busy" @click="pending = null">取消</button>
        <button type="button" class="btn btn-outline btn-sm" :disabled="!!busy" @click="doImport('replace')">覆盖现有数据</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!!busy" @click="doImport('merge')">
          {{ busy === 'import' ? '导入中…' : '合并导入' }}
        </button>
      </div>
      <p class="s-row-hint">合并：保留现有数据，备份中 id 相同的记录会覆盖现有记录。</p>
    </div>
  </section>

  <section class="s-section">
    <h3 class="s-title">维护</h3>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">清理未使用的图片</span>
        <span class="s-row-hint">删除没有被任何 Lineup 引用的图片（一般不会出现，异常中断后可以用它回收空间）</span>
      </div>
      <button type="button" class="btn btn-outline btn-sm" :disabled="!!busy" @click="cleanup">
        {{ busy === 'cleanup' ? '清理中…' : '清理' }}
      </button>
    </div>
    <div class="s-row danger-zone">
      <div class="s-row-text">
        <span class="s-row-label">清空所有数据</span>
        <span class="s-row-hint">删除全部 Lineup、图片和类型，恢复到初次打开的状态</span>
      </div>
      <button type="button" class="btn btn-danger btn-sm" :disabled="!!busy" @click="clearAll">
        <Icon name="trash" :size="15" />
        清空
      </button>
    </div>
  </section>
</template>

<style scoped>
.s-desc b {
  color: var(--text);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
}
.stat-value {
  font-size: 20px;
  font-weight: 800;
}
.stat-label {
  color: var(--text-3);
  font-size: 12px;
}
.quota {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bar {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-3);
}
.bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--cyan-dim);
}
.badge {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.badge.ok {
  background: rgb(61 220 151 / 0.14);
  color: var(--success);
}
.badge.warn {
  background: rgb(255 210 63 / 0.12);
  color: var(--gold);
}
.import-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--cyan-dim);
  border-radius: var(--r);
  background: var(--cyan-soft);
}
.import-head {
  display: flex;
  gap: 10px;
}
.import-head :deep(.icon) {
  margin-top: 2px;
  color: var(--cyan);
}
.import-file {
  font-weight: 700;
}
.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.danger-zone .s-row-label {
  color: var(--danger);
}
@media (max-width: 640px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .s-row {
    flex-wrap: wrap;
  }
}
</style>
