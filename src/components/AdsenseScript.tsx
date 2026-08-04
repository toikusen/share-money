/**
 * AdSense loader. `NEXT_PUBLIC_ADSENSE_CLIENT` (ca-pub-…) is unset in dev/preview,
 * so nothing is loaded there.
 *
 * Mounted on the public pages and inside the signed-in app, but deliberately NOT on
 * the login / invite screens: those have almost no content of their own, which is
 * exactly what AdSense's "no ads on screens without publisher content" policy targets.
 */
export function AdsenseScript() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
  if (!client) return null

  // Plain <script>, not next/script: every next/script strategy emits a preload +
  // a client-side bootstrap instead of a literal tag, and the AdSense verification
  // crawler looks for the tag itself. React hoists this into <head>.
  return (
    <script
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
    />
  )
}
