'use client'

export function CopyInviteButton({ inviteUrl }: { inviteUrl: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(inviteUrl)
          .then(() => alert('已複製邀請連結！'))
          .catch(() => alert('複製失敗，請手動複製連結'))
      }}
      className="mt-2 text-xs text-indigo-500 hover:text-indigo-700"
    >
      📋 複製邀請連結
    </button>
  )
}
