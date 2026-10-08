<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useBackupActions } from '@/composables/useBackupActions'
import type { ParsedBackup } from '@/db/backup'
import { BACKUP_GUIDE_URL } from '@/data/links'
import { formatBytes, formatDateTime, formatMediaCount } from '@/lib/format'
import { describeFsError } from '@/lib/fsAccess'
import { KEEP_DAY_OPTIONS, useAutoBackup, type FolderBackup } from '@/stores/autoBackup'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import Icon from '@/components/common/Icon.vue'

/** 设置 → 数据备份 → 自动备份到文件夹 */
const emit = defineEmits<{ restore: [file: string, data: ParsedBackup] }>()

const ab = useAutoBackup()
const store = useLineups()
const ui = useUi()
const { report, authorizeAndBackup } = useBackupActions()

const files = ref<FolderBackup[] | null>(null)
const busy = ref<'' | 'connect' | 'backup' | 'restore' | 'authorize' | 'list'>('')
const showAll = ref(false)

const canRead = computed(() => ab.enabled && ab.permission === 'granted')
const visibleFiles = computed(() => (showAll.value ? files.value : files.value?.slice(0, 6)) ?? [])
const totalSize = computed(() => files.value?.reduce((s, f) => s + f.size, 0) ?? 0)

const status = computed(() => {
  if (!ab.enabled) return { text: '未开启', cls: 'off' }
  if (ab.running) return { text: '备份中…', cls: 'busy' }
  if (ab.permission !== 'granted') return { text: '等待授权', cls: 'warn' }
  if (ab.lastError) return { text: '出错了', cls: 'error' }
  if (ab.dirty) return { text: '等待备份', cls: 'busy' }
  return { text: '已开启', cls: 'ok' }
})

async function refreshList() {
  if (!canRead.value) {
    files.value = null
    return
  }
  busy.value = busy.value || 'list'
  try {
    files.value = await ab.listBackups()
  } catch (e) {
    files.value = null
    ui.toast(`读取备份文件夹失败：${describeFsError(e)}`, { kind: 'error' })
  } finally {
    if (busy.value === 'list') busy.value = ''
  }
}
onMounted(refreshList)
// 自动备份完成后刷新列表
watch(
  () => [ab.lastBackupAt, ab.permission, ab.enabled],
  () => void refreshList(),
)

async function connect() {
  busy.value = 'connect'
  try {
    const existing = await ab.connect()
    if (!existing) return // 取消了选择
    files.value = existing
    // 新浏览器 / 数据被清空后重新连接备份文件夹：直接提示从最新的备份恢复
    if (!store.lineups.length && existing.length) {
      const latest = existing[0]!
      let detail = ''
      try {
        const s = await ab.readSummary(latest.name)
        detail = `（${s.lineups} 个 Lineup、${formatMediaCount(s.images, s.videos)}）`
      } catch {
        /* 读不出概要也不影响 */
      }
      const ok = await ui.confirm({
        title: '在这个文件夹里找到了备份',
        message: `共 ${existing.length} 份备份，最新的是 ${latest.date} 的「${latest.name}」${detail}。\n当前网站里还没有任何 Lineup，要从这份备份恢复吗？`,
        confirmText: '恢复这份备份',
        cancelText: '暂不恢复',
      })
      if (ok) await restore(latest)
      else ui.toast(`已开启自动备份，之后的修改会保存到「${ab.folderName}」`)
      return
    }
    report(await ab.backupNow(), `已开启自动备份，并已备份到「${ab.folderName}」`)
  } catch (e) {
    ui.toast(`无法使用这个文件夹：${describeFsError(e)}`, { kind: 'error', duration: 7000 })
  } finally {
    busy.value = ''
  }
}

async function backupNow() {
  busy.value = 'backup'
  try {
    report(await ab.backupNow())
  } finally {
    busy.value = ''
  }
}

async function authorize() {
  busy.value = 'authorize'
  try {
    if (await authorizeAndBackup()) await refreshList()
  } finally {
    busy.value = ''
  }
}

async function disconnect() {
  const ok = await ui.confirm({
    title: '关闭自动备份？',
    message: `之后的修改不会再自动保存。文件夹「${ab.folderName}」里已有的备份文件会保留。`,
    confirmText: '关闭',
    danger: true,
  })
  if (!ok) return
  await ab.disconnect()
  files.value = null
  ui.toast('已关闭自动备份')
}

async function restore(f: FolderBackup) {
  busy.value = 'restore'
  try {
    emit('restore', f.name, await ab.readBackup(f.name))
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : '读取备份失败', { kind: 'error' })
  } finally {
    busy.value = ''
  }
}

function onKeepDays(e: Event) {
  void ab.setKeepDays(Number((e.target as HTMLSelectElement).value)).then(refreshList)
}

function fileTime(f: FolderBackup) {
  return f.kind === 'manual' ? `${f.date} ${f.time}` : `最后更新 ${formatDateTime(f.lastModified).slice(5)}`
}
</script>

<template>
  <section class="s-section">
    <div class="head">
      <h3 class="s-title">
        <Icon name="shieldCheck" :size="17" />
        自动备份到文件夹
        <span class="recommend">推荐</span>
      </h3>
      <span class="badge" :class="status.cls">{{ status.text }}</span>
    </div>
    <p class="s-desc">
      选择电脑上的一个文件夹后，每次新增、修改、删除 Lineup，网站都会在几秒后自动把全部数据（包括图片和视频）保存进去：
      每天一个 <code>lineup-auto-日期.zip</code>，只保留最近几天；视频单独放在文件夹里的 <code>videos</code> 子文件夹。浏览器数据被清掉时，可以从这个文件夹恢复。
      <a :href="BACKUP_GUIDE_URL" target="_blank" rel="noopener">查看备份与恢复说明</a>
    </p>

    <!-- 浏览器不支持 -->
    <div v-if="!ab.supported" class="callout">
      <Icon name="info" :size="16" />
      <span>
        当前浏览器不支持自动备份到文件夹（需要电脑上的 <b>Edge</b> 或 <b>Chrome</b>）。请使用下方的「导出备份」定期手动备份。
      </span>
    </div>

    <!-- 未开启 -->
    <template v-else-if="!ab.enabled">
      <div class="s-row">
        <div class="s-row-text">
          <span class="s-row-label">选择备份文件夹</span>
          <span class="s-row-hint">
            建议新建一个专用文件夹，例如 <code>D:\Lineup备份</code>；放在 OneDrive、坚果云等网盘的同步文件夹里更保险。
            浏览器不允许直接选择「桌面」「文档」「下载」或磁盘根目录本身。
          </span>
        </div>
        <button type="button" class="btn btn-primary" :disabled="!!busy" @click="connect">
          <Icon name="folder" :size="16" />
          {{ busy === 'connect' ? '请在弹窗中选择…' : '选择备份文件夹' }}
        </button>
      </div>
    </template>

    <!-- 已开启 -->
    <template v-else>
      <div class="folder">
        <Icon name="folder" :size="18" class="folder-icon" />
        <div class="folder-text">
          <span class="folder-name ellipsis">{{ ab.folderName }}</span>
          <span class="s-row-hint">
            <template v-if="ab.lastBackupAt">
              上次备份 {{ formatDateTime(ab.lastBackupAt) }} · {{ ab.lastFile }} · {{ ab.lastCount }} 个 Lineup
            </template>
            <template v-else>还没有备份过</template>
          </span>
        </div>
        <div class="folder-actions">
          <button type="button" class="btn btn-sm btn-primary" :disabled="!!busy || ab.running" @click="backupNow">
            {{ busy === 'backup' || ab.running ? '备份中…' : '立即备份' }}
          </button>
          <button type="button" class="btn btn-sm btn-outline" :disabled="!!busy" @click="connect">更换文件夹</button>
          <button type="button" class="btn btn-sm btn-ghost" :disabled="!!busy" @click="disconnect">关闭</button>
        </div>
      </div>

      <div v-if="ab.permission !== 'granted'" class="callout warn">
        <Icon name="alert" :size="16" />
        <span>
          浏览器需要你再次允许网站访问这个文件夹，否则无法写入备份。
          点击后如果弹窗里有「<b>每次访问时都允许</b>」，选它就不用每次授权了。
        </span>
        <button type="button" class="btn btn-sm btn-primary" :disabled="!!busy" @click="authorize">允许访问</button>
      </div>
      <div v-else-if="ab.lastError" class="callout error">
        <Icon name="alert" :size="16" />
        <span>上次备份失败：{{ ab.lastError }}</span>
        <button
          v-if="ab.lastErrorCode === 'NotFoundError'"
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="!!busy"
          @click="connect"
        >
          重新选择
        </button>
        <button v-else type="button" class="btn btn-sm btn-outline" :disabled="!!busy" @click="backupNow">重试</button>
      </div>

      <div class="s-row">
        <div class="s-row-text">
          <span class="s-row-label">保留天数</span>
          <span class="s-row-hint">每天一个自动备份文件，超过天数的旧文件会被自动删除（手动导出的文件不会被删除）</span>
        </div>
        <select class="select" :value="ab.keepDays" aria-label="保留天数" @change="onKeepDays">
          <option v-for="d in KEEP_DAY_OPTIONS" :key="d" :value="d">{{ d ? `最近 ${d} 天` : '全部保留' }}</option>
        </select>
      </div>

      <div class="files">
        <div class="files-head">
          <span class="s-row-label">文件夹中的备份</span>
          <span v-if="files" class="s-row-hint tabular">{{ files.length }} 个文件 · 共 {{ formatBytes(totalSize) }}</span>
        </div>
        <p v-if="!canRead" class="s-row-hint">允许访问后才能查看文件夹里的备份。</p>
        <p v-else-if="files && !files.length" class="s-row-hint">还没有备份文件。</p>
        <ul v-else-if="files" class="file-list">
          <li v-for="f in visibleFiles" :key="f.name" class="file">
            <span class="kind" :class="f.kind">{{ f.kind === 'auto' ? '自动' : '手动' }}</span>
            <span class="file-date tabular">{{ f.date }}</span>
            <span class="file-meta ellipsis tabular">{{ fileTime(f) }} · {{ formatBytes(f.size) }}</span>
            <button type="button" class="btn btn-sm btn-outline" :disabled="!!busy" @click="restore(f)">
              <Icon name="history" :size="14" />
              恢复
            </button>
          </li>
        </ul>
        <button
          v-if="files && files.length > 6"
          type="button"
          class="link"
          @click="showAll = !showAll"
        >
          {{ showAll ? '收起' : `显示全部 ${files.length} 个` }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.s-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.s-title :deep(.icon) {
  color: var(--cyan);
}
.recommend {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: #ffc2c8;
  font-size: 11px;
  font-weight: 700;
}
.badge {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.badge.off {
  background: var(--surface-3);
  color: var(--text-2);
}
.badge.ok {
  background: rgb(61 220 151 / 0.14);
  color: var(--success);
}
.badge.busy {
  background: var(--cyan-soft);
  color: var(--cyan);
}
.badge.warn {
  background: rgb(255 210 63 / 0.12);
  color: var(--gold);
}
.badge.error {
  background: var(--danger-soft);
  color: var(--danger);
}
.s-desc a {
  white-space: nowrap;
}
code {
  padding: 0 4px;
  border-radius: var(--r-xs);
  background: var(--surface-3);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
}
.callout {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.6;
}
.callout > span {
  flex: 1;
}
.callout b {
  color: var(--text);
}
.callout.warn {
  border-color: rgb(255 210 63 / 0.4);
  background: rgb(255 210 63 / 0.06);
}
.callout.warn :deep(.icon) {
  color: var(--gold);
}
.callout.error {
  border-color: rgb(255 92 92 / 0.4);
  background: var(--danger-soft);
}
.callout.error :deep(.icon) {
  color: var(--danger);
}
.folder {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
}
.folder-icon {
  flex: none;
  color: var(--gold);
}
.folder-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.folder-name {
  font-weight: 700;
}
.folder-actions {
  display: flex;
  flex: none;
  gap: 6px;
}
.files {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.files-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  font-size: 13px;
}
.kind {
  flex: none;
  padding: 0 6px;
  border-radius: var(--r-xs);
  font-size: 11px;
  font-weight: 700;
}
.kind.auto {
  background: var(--cyan-soft);
  color: var(--cyan);
}
.kind.manual {
  background: var(--surface-3);
  color: var(--text-2);
}
.file-date {
  flex: none;
  font-weight: 600;
}
.file-meta {
  flex: 1;
  color: var(--text-3);
  font-size: 12px;
}
.link {
  align-self: flex-start;
  border: 0;
  background: none;
  color: var(--cyan);
  font-size: 12px;
}
@media (max-width: 640px) {
  .folder {
    flex-wrap: wrap;
  }
  .folder-actions {
    width: 100%;
  }
}
</style>
