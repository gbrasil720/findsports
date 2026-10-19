import { jsonLd } from '@/lib/structured-data'

/** `<script type="application/ld+json">` com o `<` escapado. */
export function StructuredData({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD montado no servidor, com `<` escapado por jsonLd
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  )
}
