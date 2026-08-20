import { article as askingForMoneyBack } from './asking-for-money-back'
import { article as companyEventReimbursement } from './company-event-reimbursement'
import { article as coupleSharedExpenses } from './couple-shared-expenses'
import { article as creditCardFxRate } from './credit-card-fx-rate'
import { article as japanTripSplitExample } from './japan-trip-split-example'
import { article as largeGroupTrip } from './large-group-trip'
import { article as restaurantBillSplit } from './restaurant-bill-split'
import { article as roommateUtilitiesSplit } from './roommate-utilities-split'
import { article as roundingAndRemainders } from './rounding-and-remainders'
import { article as splitMethodsExplained } from './split-methods-explained'
import { article as spreadsheetVsApp } from './spreadsheet-vs-app'
import type { Article } from './types'

/** 列表頁、延伸閱讀與 sitemap 都直接吃這個順序。新文章加在最前面。 */
export const ARTICLES: readonly Article[] = [
  japanTripSplitExample,
  creditCardFxRate,
  roommateUtilitiesSplit,
  splitMethodsExplained,
  restaurantBillSplit,
  largeGroupTrip,
  roundingAndRemainders,
  spreadsheetVsApp,
  companyEventReimbursement,
  coupleSharedExpenses,
  askingForMoneyBack,
]

export const findArticle = (slug: string) => ARTICLES.find(a => a.slug === slug)

/** 同分類優先，不足才用其他文章補滿，給文章底部的延伸閱讀用。 */
export function relatedArticles(slug: string, limit = 3) {
  const category = findArticle(slug)?.category
  const rest = ARTICLES.filter(a => a.slug !== slug)
  const sameCategory = rest.filter(a => a.category === category)

  return [...sameCategory, ...rest.filter(a => a.category !== category)].slice(0, limit)
}

export type { Article }
