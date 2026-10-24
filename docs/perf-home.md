# Performance da home no celular

## O que pesa no LCP

No celular o LCP da home é o pôster do hero em retrato
(`public/landing/hero-mapa-retrato*.webp`) ou, quando a Anton chega depois
dele, o `h1`. Os dois dependem do que disputa banda no começo da carga: CSS,
o JavaScript de entrada, as fontes pré-carregadas e o próprio pôster.

Regras que valem para não perder o que foi ganho:

- **Pôster com `srcset`.** O `<source>` em retrato tem 600, 750, 900 e
  1170 px, com `sizes="100vw"`. Regere tudo pelo
  `scripts/render-landing-posters.ts`, que grava as larguras menores e o
  `srcSet` no `hero-posters.json`; não suba só a imagem grande.
- **Wordmark por densidade.** `OnsideBrand` serve
  `onside-wordmark-paper-{32,64,96}.png` (1x, 2x, 3x). O
  `onside-wordmark-paper.png` cheio fica para o `src` e para o logo dos e-mails.
  Trocou a arte, regere as três.
- **Prioridade das fontes.** Só a Anton (título) é pré-carregada com
  `fetchPriority: 'high'`; Archivo e Geist Mono vão com `'low'`. Fonte nova
  pré-carregada entra com `'low'`, a não ser que seja a do LCP.
- **Nada pesado no chunk de entrada.** `src/lib/env.ts` usa `zod/mini`: o
  `zod` clássico punha 64 KB minificados em toda página. Módulo que o
  `__root.tsx`, o `router.tsx` ou o `head` de uma rota importam vai para o
  JavaScript inicial de todas as páginas.
- **CSS por rota.** O `index.css` (link do `__root.tsx`) vai em toda página:
  Tailwind, tokens, app, a casca `.onside-page` (`onside-page.css`), aviso de
  cookies, 404 e tela de erro (estes dois aparecem em qualquer rota). O CSS de
  uma área entra por `import './x.css'` no componente dela, e o Start põe o
  `<link>` só nas rotas que usam o componente: landing (`onside.css`, que a
  home, os termos e o guia carregam pelo cabeçalho e rodapé), `legal.css` e o
  recibo do plano. Folha de uma área só não volta para o `index.css`.
- **Medição de terceiros com prioridade baixa** (beacon do Cloudflare Web
  Analytics no `__root.tsx`).

## Como medir

Lighthouse mobile contra um build de produção local, não o `vite dev`:

```bash
cd apps/web
bunx vite build --mode cloudflare
bunx vite preview --mode cloudflare --port 3031
```

O build copia o `apps/web/.dev.vars` para o Worker: crie-o antes, senão a
home responde 500 por falta de segredo. Para medir bastam valores falsos:
`BETTER_AUTH_SECRET` com 32 caracteres ou mais, `BETTER_AUTH_URL` local,
`PUBLIC_APP_URL` em HTTPS fora de `onside.sh` e `EMAIL_DELIVERY=console`.

O `vite preview` não comprime as respostas, e a borda da Cloudflare comprime:
sem compressão o CSS da home sai com 201 KB em vez de 32 KB e o resultado não vale.
Ponha um proxy com gzip na frente (algumas linhas de `Bun.serve` com
`Bun.gzipSync`) e meça nele.

```bash
CHROME_PATH=<chromium do Playwright> bunx lighthouse@latest http://localhost:3032/ \
  --form-factor=mobile --throttling-method=devtools \
  --only-categories=performance --output=json --quiet --chrome-flags="--headless=new"
```

Use `--throttling-method=devtools`, que limita a rede de verdade. O padrão
(`simulate`) estima o tempo a partir da ordem em que tudo carregou sem
limite, e em `localhost` essa ordem varia a cada execução: o elemento do LCP
alterna entre o pôster e o `h1`, e a mediana não para quieta. Para comparar,
sirva o `master` noutra porta e alterne as execuções (antes, depois, antes...),
dez de cada, e compare medianas.

Mesmo com `devtools`, cerca de uma execução em quatro sai com a primeira
pintura atrasada em 1 a 2 s (FCP e LCP juntos, rede igual à das rápidas), nos
dois lados e mais vezes com a máquina carregada. Com cinco de cada, três
dessas num lado só viram a mediana. Conte quantas saíram assim em cada lado
antes de concluir. Os dois `vite preview` ao mesmo tempo disputam a porta 9229
do inspetor: no segundo, `inspectorPort: false` no `cloudflare()` de uma
cópia descartável do `vite.config.ts`.
