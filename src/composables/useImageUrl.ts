import { ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  getImageUrl,
  getMediaInfo,
  mediaRevision,
  peekImageUrl,
  peekMediaInfo,
  type ImageVariant,
  type MediaInfo,
} from '@/lib/imageCache'

/** 根据图片 id 得到可以放进 <img src> 的地址（媒体被修改后自动更新） */
export function useImageUrl(
  id: MaybeRefOrGetter<string | null | undefined>,
  variant: ImageVariant = 'thumb',
) {
  const url = ref<string | null>(null)
  const loading = ref(false)
  watch(
    [() => toValue(id), mediaRevision],
    async ([v], old) => {
      if (!v) {
        url.value = null
        return
      }
      const cached = peekImageUrl(v, variant)
      if (cached) {
        url.value = cached
        return
      }
      // 换了一张图时先清空；同一张图被修改时保留旧图，新图读出来后再替换，避免闪烁
      if (old?.[0] !== v) url.value = null
      loading.value = true
      const rev = mediaRevision.value
      const u = await getImageUrl(v, variant)
      if (toValue(id) === v && mediaRevision.value === rev) {
        url.value = u
        loading.value = false
      }
    },
    { immediate: true },
  )
  return { url, loading }
}

/** 媒体信息（图片 / 视频、尺寸、时长、标注） */
export function useMediaInfo(id: MaybeRefOrGetter<string | null | undefined>) {
  const info = shallowRef<MediaInfo | null>(null)
  watch(
    [() => toValue(id), mediaRevision],
    async ([v]) => {
      if (!v) {
        info.value = null
        return
      }
      const cached = peekMediaInfo(v)
      if (cached) {
        info.value = cached
        return
      }
      const rev = mediaRevision.value
      const next = await getMediaInfo(v)
      if (toValue(id) === v && mediaRevision.value === rev) info.value = next
    },
    { immediate: true },
  )
  return info
}
