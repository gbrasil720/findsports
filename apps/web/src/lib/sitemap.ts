/**
 * Construção do sitemap (ESC-20).
 *
 * O sitemap listava uma única URL, a raiz. As páginas de bar — que são o ativo
 * de busca natural do produto — ficavam de fora, e além disso pediam
 * `noindex`. Estavam duplamente invisíveis.
 *
 * A montagem fica aqui, separada da rota, porque escapar XML é o tipo de
 * detalhe que precisa de teste: um `&` num identificador quebraria o
 * documento inteiro, e um sitemap malformado é descartado por inteiro pelo
 * rastreador.
 */

export type SitemapEntry = {
  /** Caminho absoluto dentro do site, começando com `/`. */
  path: string
  /** Data da última modificação, no formato do sitemap (YYYY-MM-DD). */
  lastModified?: string
  changeFrequency?: 'daily' | 'weekly' | 'monthly'
  /** De 0.0 a 1.0. */
  priority?: number
}

/** Os cinco caracteres que o XML exige escapar. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSitemap(
  siteUrl: string,
  entries: readonly SitemapEntry[]
): string {
  const base = siteUrl.replace(/\/$/, '')

  const urls = entries
    .map((entry) => {
      const partes = [`    <loc>${escapeXml(base + entry.path)}</loc>`]
      if (entry.lastModified) {
        partes.push(`    <lastmod>${escapeXml(entry.lastModified)}</lastmod>`)
      }
      if (entry.changeFrequency) {
        partes.push(`    <changefreq>${entry.changeFrequency}</changefreq>`)
      }
      if (entry.priority !== undefined) {
        partes.push(`    <priority>${entry.priority.toFixed(1)}</priority>`)
      }
      return `  <url>\n${partes.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
}
