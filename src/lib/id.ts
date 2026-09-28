/** 生成唯一 id（优先使用浏览器自带的 UUID；非 HTTPS 环境下退回随机数） */
export function newId(prefix = '') {
  let uuid: string
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID()
  } else {
    const bytes = new Uint8Array(16)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
    }
    uuid = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return prefix ? `${prefix}_${uuid}` : uuid
}
