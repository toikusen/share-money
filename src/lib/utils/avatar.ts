/**
 * 成員頭像/圖表用色:由 id(穩定)推導一個 oklch 色相,
 * 同一人於頭像、圖表長條、流向圖中顏色一致。
 * 彩度刻意壓低 — 紅綠保留給金錢語意。
 */
export function avatarHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

/** 頭像底色(粉彩) */
export const avatarBg = (seed: string) => `oklch(0.85 0.04 ${avatarHue(seed)})`

/** 頭像文字色 */
export const avatarFg = (seed: string) => `oklch(0.4 0.07 ${avatarHue(seed)})`

/** 圖表長條色(較飽和一階,仍低彩度) */
export const chartFill = (seed: string) => `oklch(0.75 0.06 ${avatarHue(seed)})`

/** 頭像顯示字:中文取最後一字(名),拉丁字母取首字大寫 */
export function avatarChar(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const last = trimmed.slice(-1)
  if (/[\u4e00-\u9fff]/.test(last)) return last
  return trimmed.slice(0, 1).toUpperCase()
}
