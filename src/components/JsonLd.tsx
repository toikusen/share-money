/**
 * Structured data for search engines. `<` is escaped because JSON.stringify does not
 * sanitise strings that could close the script tag — see Next's JSON-LD guide.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
