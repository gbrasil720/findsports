# Basemap próprio — MapLibre + Protomaps (WEB-73)

O mapa não depende mais de fornecedor com faturamento. O basemap inteiro é **um
arquivo** num bucket, e o navegador lê faixas de bytes dele por HTTP Range.

| Peça | Onde | Quem paga |
|---|---|---|
| Biblioteca | `maplibre-gl` (BSD), npm | — |
| Tiles | `.pmtiles` no Vercel Blob | armazenamento + transferência |
| Glyphs e sprite | `apps/web/public/map/`, mesma origem | — |
| Estilo | `apps/web/src/lib/map-style.ts` | — |
| Geocoding | LocationIQ (`LOCATIONIQ_API_KEY`) | tier grátis, 5.000/dia |

Não existe chave, cota nem cliff de faturamento em nenhuma dessas linhas.

## Estado do build atual

| Campo | Valor |
|---|---|
| Build do Protomaps | `20260906` |
| bbox | `-74.1,-33.9,-34.7,5.4` (Brasil) |
| maxzoom | 15 |
| Tamanho | 6,1 GB |
| Esquema | Protomaps v4 (`version 4.15.2`) |

## Por que Brasil inteiro, e não a região de operação

A bbox cobre onde um **torcedor pode abrir o app**, não onde um **bar pode se
cadastrar**. São coisas separadas: `launch.pub_cities` governa o cadastro de bar
(`packages/api/src/routers/onboarding.ts`), e a busca do torcedor é GPS + raio —
ele não informa cidade em nenhum ponto do fluxo.

Um torcedor em Salvador abre o `/dashboard` e vê o mapa funcionando, só sem
bares. Com recorte no Sudeste ele passaria a ver **tiles em branco**, que é uma
regressão em relação ao Google.

Medições feitas antes de escolher, contra `20260906.pmtiles`:

| Recorte | Tamanho |
|---|---|
| Sudeste, z0–15 | 1,9 GB |
| **Brasil, z0–15** | **6,1 GB** |
| Brasil, z0–12 | 752 MB |
| Brasil, z0–11 | 313 MB |

A diferença entre 1,9 GB e 6,1 GB é de centavos por mês em armazenamento, e
**não muda a transferência**: o que trafega é o que o viewport pede, não o
tamanho do arquivo. Não havia motivo para pagar em cobertura o que não se
economizava em conta.

**Abrir cidade nova não exige rebuild.**

## Rebuild

Trimestral, manual.

```bash
brew install pmtiles                                  # só para rodar o script
bun apps/web/scripts/build-map-tiles.ts --dry-run     # mede sem baixar
bun apps/web/scripts/build-map-tiles.ts               # extrai e publica
```

O script imprime a `VITE_MAP_TILES_URL` nova. Trocar a variável **na Vercel e no
`.env` local é passo manual**, de propósito: o nome do arquivo carrega a data do
build porque ele sobe com `max-age` de um ano, e build novo tem que virar URL
nova em vez de tentar invalidar cache de CDN.

Ordem para não derrubar produção: publicar → trocar a variável → deploy →
conferir o mapa no ar → **só então** apagar o arquivo antigo do bucket.

## Glyphs e sprite

Ficam em `apps/web/public/map/`, versionados em git (1,2 MB), e não num bucket.
São estáticos, nunca mudam, e da mesma origem — nenhum CORS, nenhuma variável a
esquecer. Sem endpoint de glyphs o MapLibre não renderiza texto nenhum: nem nome
de rua, nem de bairro, e sem erro que aponte para a causa.

Faixas incluídas por fonte: `0-255`, `256-511`, `7680-7935` e `8192-8447` — todo
o latino que aparece dentro do recorte, mais a pontuação tipográfica. Origem:
[`protomaps/basemaps-assets`](https://github.com/protomaps/basemaps-assets)
(fontes sob OFL, `apps/web/public/map/fonts/OFL.txt`).

`map-style.test.ts` falha se uma camada pedir uma fonte ou faixa que não está no
disco, então a peça mais fácil de esquecer é a única que não dá para esquecer.

## Atribuição

Obrigatória, e é condição de uso do que é grátis: **OpenStreetMap** pela ODbL
(os tiles derivam dela) e **LocationIQ** pelo tier grátis do geocoder que
posiciona os pinos. Aparece no `attributionControl` do mapa, montada em
`map-style.ts`.

## Armadilhas conhecidas

- **`sprite` e `glyphs` precisam de URL absoluta.** Relativo faz o MapLibre
  recusar o estilo com `Invalid sprite URL "…", must be absolute`, e o mapa fica
  em "Carregando mapa…" para sempre — sem cartão de erro, porque nenhum erro
  chega ao componente. Por isso `criarEstiloDoMapa` recebe a origem.
- **`maplibre-gl` está em `optimizeDeps.exclude`** (`apps/web/vite.config.ts`).
  O pré-empacotamento do Vite quebra o `new Worker(new URL(...))` do MapLibre e
  o worker vira 404 em desenvolvimento; sem worker, nenhum tile é decodificado —
  mesmo sintoma silencioso do item acima. Só afeta `vite dev`.
- **O contêiner do mapa não pode ser `absolute inset-0`.** O MapLibre marca o
  nó que recebe com a classe `maplibregl-map`, e a folha de estilo dele declara
  `.maplibregl-map { position: relative }` — o que vence o utilitário e faz
  `inset-0` deixar de dimensionar. A altura vira zero, o mapa carrega, decodifica
  os tiles e desenha num canvas de altura zero, sem erro nenhum. Use `h-full
  w-full`, como em `map-status.tsx`. O SDK do Google não escrevia classe no nosso
  `<div>`, então é uma armadilha exclusiva da troca.
- **Vercel Blob cobra transferência.** O R2, considerado no ticket, tem egress
  zero. Não há cliff de faturamento como no Google — a conta é proporcional ao
  tráfego —, mas não é grátis.
