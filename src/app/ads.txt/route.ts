// AdSense requires /ads.txt to name the publisher that may sell this site's inventory.
// Kept as a route (not public/ads.txt) so the publisher id lives in one env var.
const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT // ca-pub-…

export function GET() {
  if (!client) return new Response('Not found', { status: 404 })
  const pub = client.replace(/^ca-/, '') // ads.txt wants pub-…, not ca-pub-…
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
