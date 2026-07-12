import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enablePush } from '@/lib/push-client'
import { saveSubscriptionAction } from '@/lib/actions/push'

vi.mock('@/lib/actions/push', () => ({
  saveSubscriptionAction: vi.fn(),
  deleteSubscriptionAction: vi.fn(),
}))

const unsubscribe = vi.fn().mockResolvedValue(true)

function stubBrowser(permission: NotificationPermission = 'granted', keys: Record<string, ArrayBuffer | null> = {
  p256dh: new Uint8Array([1, 2, 3]).buffer,
  auth: new Uint8Array([4, 5, 6]).buffer,
}) {
  const sub = {
    endpoint: 'https://push.example/ep',
    getKey: (name: string) => keys[name] ?? null,
    unsubscribe,
  }
  vi.stubGlobal('window', { PushManager: function () {} })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({}),
      ready: Promise.resolve({ pushManager: { subscribe: vi.fn().mockResolvedValue(sub) } }),
    },
  })
  vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue(permission) })
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BGvOAgREiZw86VpRNxX7YAm99dx0'
}

describe('enablePush', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns denied without subscribing when permission refused', async () => {
    stubBrowser('denied')
    expect(await enablePush()).toBe('denied')
    expect(saveSubscriptionAction).not.toHaveBeenCalled()
  })

  it('saves the subscription and returns enabled', async () => {
    stubBrowser()
    vi.mocked(saveSubscriptionAction).mockResolvedValue({ success: true })
    expect(await enablePush()).toBe('enabled')
    expect(saveSubscriptionAction).toHaveBeenCalledWith({
      endpoint: 'https://push.example/ep', p256dh: 'AQID', auth: 'BAUG',
    })
  })

  it('throws a named error when the browser provides no push keys', async () => {
    stubBrowser('granted', { p256dh: null, auth: null })
    await expect(enablePush()).rejects.toThrow('推播金鑰')
    expect(saveSubscriptionAction).not.toHaveBeenCalled()
  })

  it('returns error and unsubscribes locally when server save fails', async () => {
    stubBrowser()
    vi.mocked(saveSubscriptionAction).mockResolvedValue({ error: '未登入' })
    expect(await enablePush()).toBe('error')
    expect(unsubscribe).toHaveBeenCalled()
  })
})
