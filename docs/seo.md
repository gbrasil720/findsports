# SEO do site (www.onside.sh)

## Host canônico

`https://www.onside.sh/`. `onside.sh` e `http://` respondem 301 para ele (regra
na Cloudflare, fora do repositório). Canônica, `og:url`, sitemap e JSON-LD usam
`SITE_URL` (`packages/config/site.ts`).

## Nome do site no Google

O Google escolhe o nome que aparece acima do link principalmente pelo JSON-LD
`WebSite` na home, e confere com o `og:site_name`, o `<title>` e os títulos da
página ([site names](https://developers.google.com/search/docs/appearance/site-names)).
Os quatro dizem "Onside":

- `apps/web/src/lib/structured-data.ts`: `WebSite` (`name`, `alternateName`,
  `url` com barra) e `Organization` (logo quadrado de 512 px, redes do rodapé
  em `sameAs`). Só na home, como pede o Google.
- `og:site_name` em todas as páginas (`__root.tsx`).
- `<title>` da home começa com a marca; nas demais a marca vai no fim
  (`Termos de uso — Onside`).

A troca de nome não é imediata: o Google só lê o JSON-LD na próxima vez que
rastrear a home. Pedir a indexação no Search Console encurta a espera.

## O que é indexável

| Página | Indexa | Como |
|---|---|---|
| `/`, `/termos`, `/privacidade` | sim | `index, follow`, canônica, no sitemap |
| `/login`, `/signup`, recuperação de senha | não | `noindex` |
| `/pub/:id` | não | `noindex`: a página do bar exige login (ver `sitemap[.xml].ts`) |
| `/dashboard`, `/admin`, `/plan`, `/onboarding`, `/app`, `/houdini`, `/api` | não | `Disallow` no `robots.txt` (redirecionam para o login ou dão 404) |

Fora de `www.onside.sh` (o `workers.dev` do `onside-web`, o preview por PR e
`houdini.onside.sh`) o Worker manda `X-Robots-Tag: noindex, nofollow`
(`applyHostIndexing`, em `apps/web/src/start.ts`): a mesma home em dois hosts seria conteúdo
duplicado.

As páginas saem renderizadas do servidor (TanStack Start no Worker): o
crawler recebe o texto da landing sem rodar JavaScript.

`apps/web/src/lib/seo.test.ts` confere o JSON-LD, o `robots.txt` e os favicons.

## Favicon

O Google só usa favicon quadrado com lado múltiplo de 48 px. `favicon-48x48`,
`-96x96`, `-192x192` e o `favicon.ico` (16, 32, 48 e 64) saem de
`apps/web/public/onside-app-icon.png`:

```python
from PIL import Image
src = Image.open("apps/web/public/onside-app-icon.png").convert("RGBA")
for size in (48, 96, 192):
    src.resize((size, size), Image.LANCZOS).save(f"apps/web/public/favicon-{size}x{size}.png", optimize=True)
src.resize((256, 256), Image.LANCZOS).save("apps/web/public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
```

Trocou a arte, suba o `?v=` em `ONSIDE_ICONS` (`__root.tsx`).

## Fora do código

Search Console (propriedade de domínio `onside.sh`), envio do sitemap, pedido
de indexação da home e Perfil da Empresa no Google são manuais.
