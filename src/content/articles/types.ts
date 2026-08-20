import type { ReactNode } from 'react'

/**
 * 一篇公開文章。body 用原生標籤（p/h2/ul/table）書寫，樣式由 .article-body 統一處理。
 */
export type Article = {
  /** URL 片段，同時是 React key 與 canonical 路徑 */
  slug: string
  /** H1 與 <title> 的主體 */
  title: string
  /** meta description,也用在列表卡片上 */
  description: string
  /** 首次發佈日 YYYY-MM-DD */
  published: string
  /** 最後實質修改日，沒改過就等於 published */
  updated?: string
  /** 列表上的分類標籤 */
  category: '旅遊' | '合租' | '聚餐' | '觀念' | '工具'
  /** 內文 */
  body: ReactNode
}
