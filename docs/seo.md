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

## FAQPage

O mesmo `@graph` da home leva um `FAQPage` gerado de `FAQ_ITEMS`
(`onside-landing-content.ts`), a lista que a seção "Dúvidas" mostra pelo
`OnsideFaqList` (`components/landing/onside-faq.tsx`). O Google exige que
pergunta e resposta do JSON-LD estejam visíveis na página, palavra por palavra:
`onside-faq.test.tsx` renderiza a lista e compara com o JSON-LD. Pergunta nova
entra em `FAQ_ITEMS` e vale para os dois; não escreva o FAQ à mão em outro lugar.

Desde 2023 o Google só mostra o resultado rico de FAQ para sites de governo e
saúde; o `FAQPage` continua valendo como dado estruturado para outros buscadores
e para assistentes de IA.

## llms.txt

`apps/web/public/llms.txt`, no formato de [llmstxt.org](https://llmstxt.org/):
título, resumo em citação, e listas de links (páginas públicas, termos e
privacidade, redes em `## Optional`). Arquivo estático; `public/_headers` manda
`text/plain; charset=utf-8`. `seo.test.ts` confere o formato e que todo link do
host aponta para uma página pública. Mudou o produto, uma página pública ou as
redes, atualize o arquivo.

Não há `llms-full.txt`: o conteúdo público é a home e as páginas legais, que já
saem renderizadas no servidor; uma cópia do texto num arquivo estático ficaria
desatualizada na primeira edição da landing ou dos termos.

## Guia (`/guia`)

Artigos de marketing em `apps/web/src/components/guia/guia-articles.ts`, um
objeto por artigo (slug, título, descrição, datas, texto). Saem no visual das
páginas legais (`LegalPage`, `legal.css`, cabeçalho e rodapé da home): nenhum
estilo próprio. O texto aceita link interno (`{ link, to }`) além dos trechos
das páginas legais.

- **Regra de conteúdo:** só o que a Onside faz hoje e conselho prático. Nada de
  bar, número ou estatística que não dê para conferir.
- **Head e JSON-LD:** `guia-head.ts`. O head sai do `pageHead` (ver "Head de
  cada página"): título, descrição, canônica e `og:url` próprios,
  `og:type=article` e as datas `article:*`. O JSON-LD é um `@graph` com
  `Article` (autor e publisher = a `Organization` da home) e `BreadcrumbList`.
- **Artigo novo:** acrescente em `GUIA_ARTICLES`. Sitemap e índice saem dele
  sozinhos; o `llms.txt` é estático e `seo.test.ts` falha se faltar o link.
  `guia.test.ts` confere título e descrição únicos e no tamanho, e que todo link
  interno existe.

## O que é indexável

| Página | Indexa | Como |
|---|---|---|
| `/`, `/termos`, `/privacidade` | sim | `index, follow`, canônica, no sitemap |
| `/guia`, `/guia/:slug` | sim | `index, follow`, canônica, no sitemap e no `llms.txt`; slug desconhecido é 404 |
| `/login`, `/signup`, recuperação de senha, `/verify-email`, `/two-factor` | não | `noindex` |
| `/pub/:id` | não | `noindex`: "O bar está no app" (o web é só para bares), uma página de passagem para o app, aberta sem sessão. Título com o nome do bar, para a prévia de link. Bar fora do ar: 200, a página sem bar, com o título dela. Id que não existe: 404 |
| `/torcedor` | não | `noindex`: onde o torcedor logado cai no web, a mesma página sem bar |
| `/convite/:código` | não | `noindex`: a página sem bar (WEB-468), que no celular abre o app no convite de amigo (`onside://convite/…`); os amigos não têm tela no web |
| rota que não existe (`/x`, `/termos/x`, `/x.txt`) | não | status 404 de verdade, `noindex, nofollow` |
| `/llms.txt` | — | texto para assistentes de IA; não é página |
| `/dashboard`, `/admin`, `/plan`, `/onboarding`, `/app`, `/houdini`, `/api` | não | `Disallow` no `robots.txt` (redirecionam para o login ou dão 404; `/dashboard` saiu e é 404) |

Fora de `www.onside.sh` (o `workers.dev` do `onside-web`, o preview por PR e
`houdini.onside.sh`) o Worker manda `X-Robots-Tag: noindex, nofollow`
(`applyHostIndexing`, em `apps/web/src/start.ts`): a mesma home em dois hosts seria conteúdo
duplicado.

Não existe página de bar indexável nem de jogo: a do bar só leva ao app, e
jogo não tem página própria (cada bar cadastra o seu `event`). Por isso o sitemap tem só
a home e as páginas legais.

As páginas saem renderizadas do servidor (TanStack Start no Worker): o
crawler recebe o texto da landing sem rodar JavaScript.

`apps/web/src/lib/seo.test.ts` confere o JSON-LD, o `robots.txt` e os favicons.

## Head de cada página

Toda página pública monta o `head` com `pageHead` (`apps/web/src/lib/page-head.ts`):
título, descrição, `robots`, `og:title`, `og:description`, `og:url`, `og:type`,
`twitter:title` e `twitter:description` saem de um só lugar, e `og:url` é sempre
a URL da própria página, sem query. `social` troca só o texto do cartão (a home
usa). A raiz (`__root.tsx`) põe apenas o que vale para o site inteiro:
`og:site_name`, `og:locale`, `og:type` padrão, `og:image` com medidas,
`twitter:card` e `twitter:image`. Se ela pusesse título do cartão ou `og:url`, a
página que esquecesse de sobrescrever sairia com os da home (era o que
acontecia em `/login`, `/signup` e no 404). `page-head.test.ts` impede a volta.

Regras:

- **Canônica só em página indexável**, absoluta no `www`. Em página `noindex` ela
  não ajuda (a página não entra no índice) e, se apontasse para outra URL,
  contradiria o `noindex`.
- **Um `h1` por página, sem pular nível.** O slogan do painel escuro das telas de
  conta ("O JOGO COMEÇA AQUI.") é `<p>` com as mesmas classes, não `h2`: vinha
  antes do `h1` do formulário.
- **`alt` em toda imagem.** A marca e as fotos de fundo são decorativas
  (`alt=""`); o link da marca tem nome pelo `aria-label`. Foto com conteúdo
  leva descrição em português (a do hero da home).
- **404 é status 404.** A rota curinga (`$.tsx`) e o `notFound()` lançado por
  rota existente usam `NOT_FOUND_META` (`components/not-found/not-found-head.ts`);
  no segundo caso o `head` da rota não roda, e é a raiz que põe o `noindex`
  (`isNotFound` no `error` do match).

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
