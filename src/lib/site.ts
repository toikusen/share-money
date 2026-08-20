/**
 * Publisher identity, in one place so the byline, the contact page and every
 * JSON-LD block stay in sync.
 */
export const SITE_NAME = 'ShareMoney'

export const SITE_AUTHOR = {
  name: 'Sei Tu',
  /** 一句話的身分說明，出現在文章署名與關於頁。 */
  role: 'ShareMoney 的開發者與維護者',
  email: 'sei.tu@neutec.com.tw',
} as const
