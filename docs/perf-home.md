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
- **Medição de terceiros com prioridade baixa** (beacon do Cloudflare Web
  Analytics no `__root.tsx`).

## Como medir

Lighthouse mobile contra um build de produção local, não o `vite dev`:

```bash
cd apps/web
bunx vite build --mode cloudflare
bunx vite preview --mode cloudflare --port 3031
```

O `vite preview` não comprime as respostas, e a borda da Cloudflare comprime:
sem compressão o CSS sai com 228 KB em vez de 35 KB e o resultado não vale.
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
cinco de cada, e compare medianas.
