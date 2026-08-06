import { createFileRoute } from '@tanstack/react-router'

const BASE_URL = 'https://www.onside.sh'

const PUBLIC_ROUTES = ['/']

function buildSitemap(): string {
  const urls = PUBLIC_ROUTES.map(
    (path) => `  <url>
    <loc>${BASE_URL}${path}</loc>
  </url>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(buildSitemap(), {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=86400'
          }
        })
    }
  }
})
