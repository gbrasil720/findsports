import { createFileRoute } from '@tanstack/react-router'

const BASE_URL = 'https://findsports.com.br'

const PUBLIC_ROUTES = [{ path: '/', priority: '1.0', changefreq: 'weekly' }]

function buildSitemap(): string {
  const now = new Date().toISOString().split('T')[0]
  const urls = PUBLIC_ROUTES.map(
    ({ path, priority, changefreq }) => `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${changefreq}</changefreq> 
    <priority>${priority}</priority>
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
