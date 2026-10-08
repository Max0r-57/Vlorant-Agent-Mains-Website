<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useImageUrl, useMediaInfo } from '@/composables/useImageUrl'
import { formatDuration } from '@/lib/format'
import { getImageUrl, type ImageVariant } from '@/lib/imageCache'
import type { MediaKind } from '@/types'
import Icon from '@/components/common/Icon.vue'
import type { IconName } from '@/components/common/icons'

/**
 * 图片 / 视频的缩略图。视频显示封面和时长角标，鼠标悬停时静音循环播放（移开即停止）。
 * 已保存的媒体传 mediaId；还没保存的草稿传 poster / videoUrl / kind / duration。
 */
const props = withDefaults(
  defineProps<{
    mediaId?: string | null
    poster?: string | null
    videoUrl?: string | null
    kind?: MediaKind
    duration?: number
    color?: string
    alt?: string
    variant?: ImageVariant
    /** 鼠标悬停时播放视频 */
    hoverPlay?: boolean
    /** 视频角标：full 显示时长，icon 只显示播放图标（很小的缩略图用） */
    badge?: 'full' | 'icon' | 'none'
    /** 没有图片时的占位图标 */
    emptyIcon?: IconName
  }>(),
  {
    mediaId: null,
    poster: null,
    videoUrl: null,
    kind: undefined,
    duration: 0,
    color: '#94a3b8',
    alt: '',
    variant: 'thumb',
    hoverPlay: true,
    badge: 'full',
    emptyIcon: 'image',
  },
)

const stored = useImageUrl(() => props.mediaId, props.variant)
const info = useMediaInfo(() => props.mediaId)

const posterUrl = computed(() => (props.mediaId ? stored.url.value : props.poster))
const isVideo = computed(() => (props.mediaId ? info.value?.kind === 'video' : props.kind === 'video'))
const duration = computed(() => (props.mediaId ? (info.value?.duration ?? 0) : props.duration))
const placeholderIcon = computed<IconName>(() => {
  if (isVideo.value) return 'video'
  return props.mediaId || props.poster ? 'image' : props.emptyIcon
})

// ---------- 悬停播放 ----------
const playUrl = ref<string | null>(null)
const playing = ref(false)
const videoEl = ref<HTMLVideoElement>()
let hovering = false
let timer: ReturnType<typeof setTimeout> | undefined

function onEnter(e: PointerEvent) {
  if (!props.hoverPlay || e.pointerType !== 'mouse' || !isVideo.value) return
  hovering = true
  clearTimeout(timer)
  // 稍等一下再播放，鼠标只是划过时不加载视频
  timer = setTimeout(async () => {
    const url = props.mediaId ? await getImageUrl(props.mediaId, 'full') : props.videoUrl
    if (hovering && url) playUrl.value = url
  }, 150)
}

function stop() {
  hovering = false
  clearTimeout(timer)
  playUrl.value = null
  playing.value = false
}

watch(playUrl, async (url) => {
  if (!url) return
  await nextTick()
  const v = videoEl.value
  if (!v) return
  v.muted = true
  v.play().catch(() => {})
})

// 换成了另一个媒体：停止播放
watch(
  () => [props.mediaId, props.videoUrl],
  () => stop(),
)
onBeforeUnmount(stop)
</script>

<template>
  <div class="media-thumb" :style="{ '--c': color }" @pointerenter="onEnter" @pointerleave="stop">
    <img v-if="posterUrl" :src="posterUrl" :alt="alt" draggable="false" />
    <div v-else class="ph">
      <Icon :name="placeholderIcon" :size="18" />
    </div>
    <video
      v-if="playUrl"
      ref="videoEl"
      class="hover-video"
      :class="{ on: playing }"
      :src="playUrl"
      muted
      loop
      playsinline
      disablepictureinpicture
      preload="auto"
      @playing="playing = true"
    />
    <span
      v-if="isVideo && badge !== 'none'"
      class="video-badge"
      :class="{ compact: badge === 'icon' }"
      :title="duration ? `视频 ${formatDuration(duration)}` : '视频'"
    >
      <Icon name="play" :size="badge === 'icon' ? 8 : 9" :stroke="0" class="play" />
      <span v-if="badge === 'full' && duration" class="tabular">{{ formatDuration(duration) }}</span>
    </span>
  </div>
</template>

<style scoped>
.media-thumb {
  position: relative;
  overflow: hidden;
  background: var(--bg);
}
img,
.hover-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hover-video {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.15s var(--ease);
  pointer-events: none;
}
.hover-video.on {
  opacity: 1;
}
.ph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--c) 30%, transparent), transparent 70%),
    var(--map-floor);
  color: color-mix(in srgb, var(--c) 70%, #fff);
}
.video-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px 1px 5px;
  border-radius: var(--r-xs);
  background: rgb(5 8 11 / 0.75);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  pointer-events: none;
}
.video-badge.compact {
  left: 3px;
  bottom: 3px;
  padding: 2px 3px;
  line-height: 0;
}
.video-badge .play {
  fill: currentColor;
}
</style>
