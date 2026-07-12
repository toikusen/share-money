// 常用金融機構代號(財金公司跨行轉帳代號)。只收個人收款常見的機構,
// 不求全表 — 缺的照代號格式加一行即可。
export const BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: '004', name: '臺灣銀行' },
  { code: '005', name: '土地銀行' },
  { code: '006', name: '合作金庫' },
  { code: '007', name: '第一銀行' },
  { code: '008', name: '華南銀行' },
  { code: '009', name: '彰化銀行' },
  { code: '011', name: '上海商業儲蓄銀行' },
  { code: '012', name: '台北富邦銀行' },
  { code: '013', name: '國泰世華銀行' },
  { code: '016', name: '高雄銀行' },
  { code: '017', name: '兆豐銀行' },
  { code: '048', name: '王道銀行' },
  { code: '050', name: '臺灣企銀' },
  { code: '052', name: '渣打國際商業銀行' },
  { code: '053', name: '台中銀行' },
  { code: '054', name: '京城銀行' },
  { code: '081', name: '滙豐(台灣)銀行' },
  { code: '102', name: '華泰銀行' },
  { code: '103', name: '臺灣新光商業銀行' },
  { code: '108', name: '陽信銀行' },
  { code: '118', name: '板信商業銀行' },
  { code: '147', name: '三信商業銀行' },
  { code: '700', name: '中華郵政' },
  { code: '803', name: '聯邦銀行' },
  { code: '805', name: '遠東國際商業銀行' },
  { code: '806', name: '元大銀行' },
  { code: '807', name: '永豐銀行' },
  { code: '808', name: '玉山銀行' },
  { code: '809', name: '凱基銀行' },
  { code: '810', name: '星展(台灣)銀行' },
  { code: '812', name: '台新銀行' },
  { code: '816', name: '安泰銀行' },
  { code: '822', name: '中國信託' },
  { code: '823', name: '將來銀行' },
  { code: '824', name: 'LINE Bank 連線商業銀行' },
  { code: '826', name: '樂天國際銀行' },
]

const nameByCode = new Map(BANKS.map(b => [b.code, b.name]))

/** 代號 → 顯示名稱;不在清單內時退回代號本身,舊資料不會壞 */
export function bankName(code: string): string {
  return nameByCode.get(code) ?? `銀行代碼 ${code}`
}

/** 「玉山銀行 (808)」— 結算頁顯示用 */
export function bankLabel(code: string): string {
  return `${bankName(code)} (${code})`
}

// 台/臺互通,使用者兩種都會打
const fold = (s: string) => s.replace(/臺/g, '台')

/** 自由輸入(「812」「台新」「812 台新銀行」)→ 銀行代號;無法唯一對應時回 null */
export function resolveBankCode(raw: string): string | null {
  const q = fold(raw.trim())
  if (!q) return null
  const exact = BANKS.find(b => q === b.code || q === fold(b.name) || q === `${b.code} ${fold(b.name)}`)
  if (exact) return exact.code
  const matches = BANKS.filter(b => b.code.includes(q) || fold(b.name).includes(q))
  return matches.length === 1 ? matches[0].code : null
}
