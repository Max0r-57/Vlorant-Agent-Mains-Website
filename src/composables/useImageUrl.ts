import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { getImageUrl, peekImageUrl, type ImageVariant } from '@/lib/imageCache'

/** 根据图片 id 得到可以放进 <img src> 的地址 */
export function useImageUrl(
  id: MaybeRefOrGetter<string | null | undefined>,
  variant: ImageVariant = 'thumb',
) {
  const url = ref<string | null>(null)
  const loading = ref(false)
  watch(
    () => toValue(id),
    async (v) => {
      if (!v) {
        url.value = null
        return
      }
      const cached = peekImageUrl(v, variant)
      if (cached) {
        url.value = cached
        return
      }
      url.value = null
      loading.value = true
      const u = await getImageUrl(v, variant)
      if (toValue(id) === v) {
        url.value = u
        loading.value = false
      }
    },
    { immediate: true },
  )
  return { url, loading }
}
