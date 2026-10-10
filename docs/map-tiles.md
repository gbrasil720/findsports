# Basemap próprio — MapLibre + Protomaps (WEB-73, WEB-218)

O mapa não depende mais de fornecedor com faturamento. O basemap inteiro é **um
arquivo** `.pmtiles` no R2; o navegador **não** lê esse arquivo direto — um
Worker Cloudflare (`onside-tiles`) fatia o archive em tiles ZXY e cacheia cada
resposta na borda.

| Peça | Onde | Quem paga |
|---|---|---|
| Biblioteca | `maplibre-gl` (BSD), npm | — |
| Archive | `.pmtiles` no bucket R2 `onside-maps` | armazenamento (egress grátis) |
| API de tiles | Worker `onside-tiles` em `tiles.onside.sh` | Workers Paid (WEB-218) |
| Glyphs e sprite | `apps/web/public/map/`, mesma origem | — |
| Estilo | `apps/web/src/lib/map-style.ts` | — |
| Geocoding | LocationIQ (`LOCATIONIQ_API_KEY`) | tier grátis, 5.000/dia |

Não existe chave, cota nem cliff de faturamento em nenhuma dessas linhas.

## Estado do build atual

| Campo | Valor |
|---|---|
| Build do Protomaps | `20260906` |
| Tileset (nome na URL) | `onside-br-20260906` |
| TileJSON | `https://tiles.onside.sh/onside-br-20260906.json` |
| Objeto no R2 | `maps/onside-br-20260906.pmtiles` (~6,1 GB) |
| bbox | `-74.1,-33.9,-34.7,5.4` (Brasil) |
| maxzoom | 15 |
| Esquema | Protomaps v4 (`version 4.15.2`) |

`VITE_MAP_TILES_URL` aceita os dois formatos até Infra migrar produção:

| Formato | Exemplo | Comportamento no cliente |
|---|---|---|
| Legado (produção hoje) | `…/maps/onside-br-20260906.pmtiles` | `pmtiles://` + Range no R2 |
| Worker (alvo WEB-218) | `https://tiles.onside.sh/onside-br-20260906.json` | TileJSON + MVT no Worker |

A distinção é automática pelo sufixo `.pmtiles` vs `.json`. Trocar a variável
(nas `vars` do GitHub Actions) **sem** redeploy do web não muda nada — o valor
entra no build.

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
**não muda a transferência** na API ZXY: o que trafega é o que o viewport pede,
não o tamanho do arquivo. Não havia motivo para pagar em cobertura o que não se
economizava em conta.

**Abrir cidade nova não exige rebuild.**

## Por que R2 + Worker, e não Vercel Blob

O arquivo morou no Vercel Blob por um dia e estourou o plano: **o tier grátis
Hobby dá 1 GB de armazenamento**, e o archive tem 6,1 GB. O R2 dá 10 GB de
armazenamento e **egress zero** no tier grátis.

**Cache de borda no domínio do bucket (WEB-218, opção A descartada):** servir o
`.pmtiles` direto em `tiles.onside.sh` (custom domain do R2) devolve
`cf-cache-status: DYNAMIC` em todo Range request, porque o objeto inteiro passa
de **512 MB** — limite de cache da Cloudflare para um único recurso. O ganho do
R2 era custo e egress; não havia HIT na borda.

**Solução atual:** o Worker `apps/tiles` lê faixas do `.pmtiles` no R2 (Range
interno, sem expor 206 ao navegador) e responde cada tile ou TileJSON como HTTP
**200** completo. O **Cache API** do Workers grava por URL (`/nome/z/x/y.mvt`,
`/nome.json`). Repetição do mesmo tile → `cf-cache-status: HIT`. O domínio tem
de ser **custom domain do Worker** (`tiles.onside.sh`), não `workers.dev` — ver
[deploy Cloudflare do Protomaps](https://docs.protomaps.com/deploy/cloudflare).

O `Cache-Control` no objeto R2 (`build-map-tiles.ts` usa `aws s3 cp` com
`max-age=31536000, immutable`) afeta leituras diretas ao bucket; **não** substitui
o cache por tile do Worker.

## Worker `onside-tiles`

Código em `apps/tiles/`, config em `apps/tiles/wrangler.jsonc`.

| Rota | Função |
|---|---|
| `GET /{nome}.json` | TileJSON para o MapLibre |
| `GET /{nome}/{z}/{x}/{y}.mvt` | tile vetorial |

Variáveis (`vars` no wrangler):

| Var | Valor | Uso |
|---|---|---|
| `PMTILES_PATH` | `maps/{name}.pmtiles` | chave no bucket |
| `PUBLIC_HOSTNAME` | `tiles.onside.sh` | URLs absolutas no TileJSON |
| `ALLOWED_ORIGINS` | origens do app + preview + localhost | CORS |
| `CACHE_CONTROL` | `public, max-age=31536000, immutable` | cabeçalho nas respostas cacheáveis |

Binding R2: `BUCKET` → `onside-maps`.

### Migração para o Worker (Infra — ordem obrigatória)

**Hoje:** `tiles.onside.sh` é custom domain do **bucket R2** `onside-maps`.
**Não** rode deploy do Worker nesse hostname enquanto o bucket ainda o usa —
colide ou toma o domínio sem aviso.

O deploy do Worker **não** roda em push/PR. Só manualmente:

**GitHub → Actions → “Deploy tiles worker” → Run workflow**  
(`.github/workflows/deploy-tiles.yml`, `workflow_dispatch`).

Ordem para ligar cache por tile **sem derrubar o mapa**:

1. **Merge do código WEB-218** — seguro sozinho: produção continua com
   `VITE_MAP_TILES_URL` apontando para `.pmtiles` e o cliente detecta o sufixo.
2. **Remover custom domain do R2** — R2 → `onside-maps` → Settings → Custom
   Domains → remover `tiles.onside.sh`. (O DNS some com o domínio; é esperado.)
3. **Deploy do Worker** — rodar o workflow “Deploy tiles worker” (ou
   `cd apps/tiles && bunx wrangler deploy` com token local). O `wrangler.jsonc`
   recria `tiles.onside.sh` como custom domain do Worker `onside-tiles`.
4. **Verificar cache** — antes de mudar o app:

```bash
curl -sI 'https://tiles.onside.sh/onside-br-20260906/0/0/0.mvt' | grep -i cf-cache-status
# repetir até HIT

curl -sI 'https://tiles.onside.sh/onside-br-20260906.json' | grep -i cf-cache-status
```

5. **Trocar variável** — GitHub Actions `vars.VITE_MAP_TILES_URL` para
   `https://tiles.onside.sh/onside-br-20260906.json` (TileJSON, não `.pmtiles`).
6. **Redeploy `onside-web`** — push em `master` ou workflow de deploy; o build
   embute a URL nova.

#### Como desfazer (por etapa)

| Etapa | Desfazer |
|---|---|
| 6–5 (app) | Voltar `VITE_MAP_TILES_URL` para a URL `.pmtiles` antiga e redeploy do web. |
| 4 (cache) | Nada persistente — só validação. |
| 3 (Worker) | Cloudflare → Workers → `onside-tiles` → Remove route / custom domain; ou `wrangler delete onside-tiles` se for apagar o Worker inteiro. |
| 2 (R2 domain) | R2 → `onside-maps` → Settings → Custom Domains → recriar `tiles.onside.sh` no bucket (mapa legado volta a funcionar com a variável `.pmtiles`). |
| 1 (código) | Reverter merge — o cliente legado continua funcionando com URL `.pmtiles`. |

Deploy local de emergência (mesmo risco de colisão de domínio — só depois do passo 2):

```bash
cd apps/tiles && bunx wrangler deploy
```

## Configuração do bucket

Duas coisas que só existem no painel da Cloudflare, porque o token de escrita de
objeto não alcança configuração de bucket:

1. **Acesso público** (opcional após WEB-218): R2 → Settings → Public access /
   Custom Domains. Com Worker na frente, o app não depende mais do domínio
   público do bucket.

2. **Política de CORS** (se o bucket continuar acessível):

```json
[
  {
    "AllowedOrigins": ["https://www.onside.sh", "https://onside.sh", "http://localhost:3001"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range", "if-match", "content-type"],
    "ExposeHeaders": ["etag", "content-length", "content-range", "accept-ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

## Rebuild

Trimestral, manual.

```bash
brew install pmtiles awscli                           # só para rodar o script
bun apps/web/scripts/build-map-tiles.ts --dry-run     # mede sem baixar
bun apps/web/scripts/build-map-tiles.ts               # extrai e publica
```

O script sobe o `.pmtiles` para `maps/onside-br-{data}.pmtiles` com
`Cache-Control: public, max-age=31536000, immutable` (via `aws s3 cp` — o
`Bun.S3Client` descartava o cabeçalho) e imprime a `VITE_MAP_TILES_URL` nova
(apontando para o TileJSON no Worker).

Trocar a variável **nas `vars` do GitHub Actions e no `.env` local** é passo
manual: build novo = nome novo = URL nova; não há invalidação global de cache
no Worker (cada tile é imutável por URL).

Ordem para não derrubar produção: publicar no R2 → deploy do Worker (se
precisar) → trocar `VITE_MAP_TILES_URL` → deploy `onside-web` → conferir mapa →
apagar archive antigo do bucket.

### Corrigir o cabeçalho de um arquivo já publicado

Opcional, para objetos que subiram sem `Cache-Control`:

```bash
set -a; source apps/web/.env; set +a
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION=auto \
aws s3 cp "s3://$R2_BUCKET/maps/onside-br-20260906.pmtiles" \
          "s3://$R2_BUCKET/maps/onside-br-20260906.pmtiles" \
  --metadata-directive=REPLACE \
  --content-type=application/vnd.pmtiles \
  --cache-control="public, max-age=31536000, immutable" \
  --endpoint-url="https://$CF_ACCOUNT_ID.r2.cloudflarestorage.com"
```

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

### Rótulo só em alfabeto latino (WEB-288)

**Regra: nenhum rótulo escreve o nome no alfabeto local.** O recorte é o
Brasil, mas os tiles de zoom baixo cobrem o mundo, e o `@protomaps/basemaps`
monta o rótulo de lugar não latino em duas ou três linhas — `name:pt` (ou
`name:en`) na primeira e o nome local nas seguintes: "Moscou" + "Москва". Cada
alfabeto pede uma faixa de glyph que não está em `public/map/fonts`, e o console
enchia de 404 (`/map/fonts/Noto Sans Regular/1024-1279.pbf`, a faixa cirílica).

O pacote não tem opção para desligar a segunda linha. `semNomeLocal`, em
`map-style.ts`, corta cada `["format", …]` de `text-field` no primeiro `"\n"`,
na saída de `layers()`. Sobra a linha que o pacote já garante latina: `name:pt`,
senão `name:en`, senão o `name` quando ele não tem `script`. Lugar que só tem
nome não latino fica sem rótulo — fora do Brasil, não faz falta.

A correção **não** é baixar mais faixas: seria versionar cirílico, árabe e CJK
para um mapa que não sai do Brasil. Se um dia o produto sair, o caminho é
tirar o corte e servir as faixas, as duas coisas juntas. `map-style.test.ts`
avalia os rótulos contra lugares de exemplo e falha se algum texto cair fora das
faixas servidas — é ele que avisa se uma atualização do pacote mudar o formato
da expressão e o corte deixar de pegar.

## Geocoding: precisão e limites

O provedor é a LocationIQ, sobre a mesma base OpenStreetMap dos tiles. Medido
contra endereços reais de São Paulo e Campinas, com a coordenada que o Google
tinha gravado como referência:

| Endereço | Erro |
|---|---|
| Rua Forte William, 87 — Panamby | 129 m |
| Rua dos Pinheiros, 500 — Pinheiros | 10 m |
| Rua Treze de Maio, 500 — Centro, Campinas | 0 m |
| Rua Vinte e Quatro de Maio, 62 — República | 47 m |

Três armadilhas descobertas medindo, todas tratadas em `geocode-address.ts`:

1. **Endereço concatenado casa por aproximação, e não avisa.** `"rua forte
   william 87, panamby, São Paulo"` numa linha só devolveu a *Rua Forte*, no
   Ipiranga, a **11,5 km** — primeiro resultado, HTTP 200, nenhum sinal. Em
   campos separados (`street` + `city`) acerta. O bairro **não entra na
   consulta**: no texto livre ele degradou a busca até o centro da cidade.
2. **Rua homônima na mesma cidade.** "Rua dos Pinheiros" tem cinco em São
   Paulo; com `limit=1` vinha uma qualquer, já vista a ~20 km. Agora pedimos
   cinco candidatos e o bairro **desempata** — nunca elimina, porque os limites
   do OSM não são os que o dono do bar tem na cabeça (quem escreve "Panamby"
   está, para a base, em "Vila Andrade").
3. **Data no nome da rua muda de grafia.** A base tem "Rua 13 de Maio" onde o
   dono escreve "Rua Treze de Maio". Sem equivalência entre algarismo e
   extenso, a guarda recusaria endereço certo e travaria o cadastro.

**Limitação que fica:** o OpenStreetMap tem a geometria da rua, mas raramente o
número da casa no Brasil (`house_number: null` na maioria dos casos medidos).
Quando falta, o provedor devolve um ponto da via, não o imóvel — o pino cai na
rua certa, no bairro certo, mas pode estar a algumas centenas de metros do
número. O Google interpolava e acertava mais fino. É uma perda real de
precisão, aceita em troca de sair do SKU faturado.

Se isso incomodar, o caminho é pedir **CEP** no formulário e resolver via
ViaCEP/BrasilAPI antes de geocodificar — está previsto no WEB-73 e mexe no
onboarding, então é decisão separada.

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
- **O `@2x` do sprite custa um 307 no Workers assets.** O MapLibre acrescenta
  `@2x` ao `sprite` em tela de alta densidade, e o Workers assets redireciona
  `light@2x.*` para `light%402x.*` antes de servir. Duas regras `200` em
  `apps/web/public/_redirects` reescrevem direto para a forma codificada. Sprite
  novo com outro nome precisa das mesmas duas linhas.
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
- **CORS no Worker de tiles.** O navegador busca TileJSON e MVT de
  `tiles.onside.sh`. `ALLOWED_ORIGINS` no wrangler precisa incluir preview e
  localhost; origem ausente na lista = preflight falha e mapa vazio.
