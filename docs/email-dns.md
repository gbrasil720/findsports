# E-mail: DNS e base pública

## Código entregue

Os links de ação e as imagens dos e-mails usam `PUBLIC_APP_URL`, separado de
`BETTER_AUTH_URL`. Em `development` e `test`, a variável pode ficar ausente e
cai para `BETTER_AUTH_URL`; em `production`, ela é obrigatória e precisa ser um
endereço HTTPS público. A validação acontece no caminho de e-mail: a ausência
não derruba o boot da aplicação, mas impede o envio até a variável ser
configurada. Em produção ela é `vars` do Worker (`apps/web/wrangler.jsonc`);
configure `PUBLIC_APP_URL=https://www.onside.sh` também no ambiente local que
dispara e-mails reais.

O asset `apps/web/public/og-image.jpg` já existe no branch e em produção; não
use `og-image.png`, que não é um fallback válido.

## Domínio e zona DNS

A zona DNS de `onside.sh` está na Cloudflare desde 03/10/2026 (WEB-101/WEB-205):
`www` é custom domain do Worker `onside-web`, o apex redireciona para `www` por
Redirect Rule, `tiles` e `media` são domínios de bucket R2, e os registros de
e-mail estão abaixo.

O **registro** do domínio continua na Vercel (Name.com por trás), criado em
29/07/2026 e com renovação automática ligada lá: o Cloudflare Registrar não
aceita `.sh`. A conta e o domínio na Vercel ficam só para isso — o registro
aponta os nameservers da Cloudflare, e nenhum tráfego passa pela Vercel.

## DMARC — publicado

```text
_dmarc.onside.sh  TXT  "v=DMARC1; p=quarantine; pct=100; rua=mailto:contato@onside.sh; fo=1"
```

Publicado em 29/09/2026 (WEB-109) com `p=none`; a zona DNS está na Cloudflare
desde 03/10/2026 (WEB-101/WEB-205). Em 16/10/2026 (WEB-227) o registro foi
atualizado na Cloudflare para `p=quarantine` (antes `p=none`). `contato@onside.sh`
recebe de fato: `onside.sh` tem MX do Google Workspace (`1 smtp.google.com`). O
registro vale também para `mail.onside.sh`, que não tem `_dmarc` próprio: sem
`sp=`, o subdomínio herda o `p=` do domínio organizacional.

Validação em 16/10/2026: testes de envio pelo Google Workspace (DKIM
`d=onside.sh`, seletor `google`) e pelo Resend (DKIM `d=mail.onside.sh`, seletor
`resend`) passaram em SPF, DKIM e DMARC e caíram na caixa de entrada.

Próximo passo: após algumas semanas de relatórios limpos, subir para
`p=reject`. Rollback: voltar para `p=none`.

## Domínio de envio: `mail.onside.sh`

O envio transacional sai de `contato@mail.onside.sh` (`EMAIL_FROM` nas
`vars` do Worker), separado da reputação do domínio raiz, que é o do Google Workspace.
Domínio verificado no Resend, região `sa-east-1`, com os registros:

```text
resend._domainkey.mail.onside.sh  TXT  "p=MIGfMA0GCSq…"   (DKIM, valor no painel do Resend)
send.mail.onside.sh               TXT  "v=spf1 include:amazonses.com ~all"
send.mail.onside.sh               MX   10 feedback-smtp.sa-east-1.amazonses.com
```

`mail.onside.sh` não tem MX, então todo envio leva `reply_to:
contato@onside.sh` (`sendEmail`, em `packages/auth`). Sem isso, a
resposta de quem recebe o e-mail voltaria com bounce.

Os registros de envio do domínio raiz (`resend._domainkey`, `send.onside.sh`
TXT e MX) e o domínio `onside.sh` no Resend foram removidos em 30/09/2026,
depois do deploy que passou produção para `mail.onside.sh`.

Para enviar localmente, use `EMAIL_FROM=contato@mail.onside.sh` e `EMAIL_API_KEY`
no `.env`.

## Troca para a MillionSend (WEB-476)

**Feita em 29/10/2026.** Domínio `mail.onside.sh` verificado na MillionSend
(sa-east-1, Return-Path `send.mail.onside.sh`, o mesmo da Resend), com o DKIM
`millionsend._domainkey.mail` na Cloudflare; o `_dmarc.mail` com `p=none` que o
painel sugere não foi criado, para não enfraquecer o `p=quarantine` de
`onside.sh`. Duas chaves só de envio, só para o domínio: "onside-web produção"
(Worker `onside-web`) e "onside-web preview e local" (`onside-web-preview`). O
segredo entrou nos dois Workers antes do deploy, e a URL veio no mesmo PR que
trouxe o código para a master: URL e chave trocaram no mesmo deploy. Envio real
conferido no Gmail (SPF, DKIM e DMARC `pass`, `Reply-To` certo, anexo). Falta
o passo 6.

Decisão do dono em 28/10/2026: plano Free da nuvem (100 e-mails/dia; passando
disso, o envio fica para o dia seguinte, inclusive verificação e reset de senha).
O código já fala com qualquer API no formato da Resend: muda o provedor
`EMAIL_API_URL` com `EMAIL_API_KEY`. A Resend fica até a troca ser conferida.

1. Conta na MillionSend; em **Domains**, adicionar `mail.onside.sh` (região
   `sa-east-1`). Ela usa DKIM próprio: a tabela de registros sai no painel.
2. Na Cloudflare (zona `onside.sh`), criar os registros da tabela **sem apagar os
   da Resend** (seletores de DKIM diferentes convivem; o `send.mail.onside.sh` do
   SPF e do MX já aponta para o SES de `sa-east-1`, o mesmo da MillionSend: se a
   tabela pedir outro valor para ele, pare e compare antes de trocar). Proxy
   desligado (nuvem cinza). O DMARC de `onside.sh` vale para o subdomínio: nada a
   mudar. Esperar o domínio ficar verificado no painel.
3. Criar uma chave de envio (`ms_…`), só com permissão de envio.
4. Preview: `bunx wrangler secret put EMAIL_API_KEY --env preview` e, em
   `apps/web/wrangler.jsonc`, `env.preview.vars.EMAIL_API_URL =
   "https://api.millionsend.com"`. O preview tem `EMAIL_DELIVERY=console`, então
   nada sai de lá: para um envio de verdade, rode o web local com
   `EMAIL_API_URL=https://api.millionsend.com`, `EMAIL_API_KEY=ms_…` e
   `EMAIL_FROM=contato@mail.onside.sh`, cadastre-se com um e-mail seu e confira
   chegada, SPF/DKIM/DMARC `pass` no "mostrar original" do Gmail e o `Reply-To`.
5. Produção: URL e chave têm de trocar juntas (chave da MillionSend indo para a
   Resend, ou o contrário, é envio recusado). No painel da Cloudflare, Worker
   `onside-web` → Settings → Variables and Secrets: editar `EMAIL_API_URL` para
   `https://api.millionsend.com` e adicionar o segredo `EMAIL_API_KEY`, e salvar
   uma vez só (vira uma versão). Logo depois, um PR com o mesmo `vars.EMAIL_API_URL`
   no topo do `wrangler.jsonc`: sem ele, o próximo deploy do CI volta a URL para a
   Resend com a chave nova. Conferir com um "esqueci a senha" real.
   Rollback: o mesmo, ao contrário (URL de volta para `https://api.resend.com` e
   apagar `EMAIL_API_KEY`, numa versão só): sem o novo, vale de novo o
   `RESEND_API_KEY`.
6. Depois de alguns dias limpos: apagar `RESEND_API_KEY` do Worker, o
   `resend._domainkey` da zona, o domínio no painel da Resend, a Resend da
   política de privacidade (`packages/legal`) e o link do Bastidores no Houdini.

## Verificação

```bash
dig +short TXT _dmarc.onside.sh @1.1.1.1
dig +short TXT resend._domainkey.mail.onside.sh @1.1.1.1
dig +short MX send.mail.onside.sh @1.1.1.1
curl -sI https://www.onside.sh/og-image.jpg  # deve ser 200 image/jpeg
```

`dig` não verifica entrega. Dispare também um e-mail transacional real,
confirme a chegada na caixa de entrada e confira que nenhum link ou `<img src>`
contém `localhost`.

DNS e Resend não têm CLI configurada neste repositório; as mudanças acima foram
feitas pelos painéis.
