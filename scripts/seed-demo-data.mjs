import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const envFile = new URL('../.env.local', import.meta.url)
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PASSWORD = 'Demo-' + Math.random().toString(36).slice(2, 10) + '!9'

const users = [
  { email: 'demo-ming@sharemoney.demo', name: '王小明' },
  { email: 'demo-hua@sharemoney.demo', name: '林小華' },
  { email: 'demo-mei@sharemoney.demo', name: '張小美' },
]

const ids = {}
for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: PASSWORD, email_confirm: true,
    user_metadata: { name: u.name },
  })
  if (error) {
    // already exists → look it up
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const found = list.users.find(x => x.email === u.email)
    if (!found) throw error
    await admin.auth.admin.updateUserById(found.id, { password: PASSWORD })
    ids[u.email] = found.id
  } else {
    ids[u.email] = data.user.id
  }
}
const [ming, hua, mei] = users.map(u => ids[u.email])
console.log('users ok')

// clean previous demo trip if re-run
const { data: oldTrips } = await admin.from('trips').select('id').eq('created_by', ming)
if (oldTrips?.length) await admin.from('trips').delete().in('id', oldTrips.map(t => t.id))

const { data: trip, error: te } = await admin.from('trips').insert({
  name: '東京五日遊', created_by: ming, exchange_rate: 0.21,
  foreign_currency: 'JPY', start_date: '2026-06-10', end_date: '2026-06-14',
}).select().single()
if (te) throw te

const me = await admin.from('trip_members').insert([ming, hua, mei].map(user_id => ({ trip_id: trip.id, user_id })))
if (me.error) throw me.error
console.log('trip ok', trip.id)

const D = d => `2026-06-1${d}T0${3 + d}:30:00+09:00`
const expenses = [
  { title: 'Skyliner 機場快線', amount: 7590, currency: 'JPY', paid_by: ming, day: 0, split: [ming, hua, mei] },
  { title: '淺草壽司晚餐', amount: 12600, currency: 'JPY', paid_by: hua, day: 0, split: [ming, hua, mei] },
  { title: '迪士尼樂園門票', amount: 28500, currency: 'JPY', paid_by: ming, day: 1, split: [ming, hua, mei] },
  { title: '一蘭拉麵', amount: 3180, currency: 'JPY', paid_by: mei, day: 1, split: [ming, hua, mei] },
  { title: '飯店住宿四晚', amount: 96000, currency: 'JPY', paid_by: mei, day: 2, split: [ming, hua, mei] },
  { title: '藥妝店伴手禮', amount: 8240, currency: 'JPY', paid_by: hua, day: 3, split: [ming, hua] },
  { title: '桃園機場接送', amount: 1200, currency: 'TWD', paid_by: ming, day: 4, split: [ming, hua, mei] },
]

for (const e of expenses) {
  const { data: exp, error: ee } = await admin.from('expenses').insert({
    trip_id: trip.id, title: e.title, amount: e.amount, currency: e.currency,
    paid_by: e.paid_by, created_by: e.paid_by, paid_at: D(e.day),
  }).select().single()
  if (ee) throw ee
  const each = Math.floor(e.amount / e.split.length)
  const splits = e.split.map((user_id, i) => ({
    expense_id: exp.id, user_id,
    amount: i === 0 ? e.amount - each * (e.split.length - 1) : each,
    approval_status: 'approved',
  }))
  const { error: se } = await admin.from('expense_splits').insert(splits)
  if (se) throw se
}
console.log('expenses ok')

// sign in as 王小明 to mint a session for browser cookie injection
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: s, error: le } = await anon.auth.signInWithPassword({ email: users[0].email, password: PASSWORD })
if (le) throw le
writeFileSync(new URL('./session.json', import.meta.url), JSON.stringify(s.session))
console.log('session ok (written to ignored scripts/session.json)')
