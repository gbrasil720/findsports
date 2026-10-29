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
Domínio verificado na MillionSend, região `sa-east-1`, com os registros:

```text
millionsend._domainkey.mail.onside.sh  TXT  "v=DKIM1; k=rsa; p=MIIB…"  (DKIM, valor no painel da MillionSend)
send.mail.onside.sh                    TXT  "v=spf1 include:amazonses.com ~all"
send.mail.onside.sh                    MX   10 feedback-smtp.sa-east-1.amazonses.com
```

O Return-Path `send.mail.onside.sh` (SPF e MX) é o mesmo que a Resend usava:
as duas enviam pelo Amazon SES de `sa-east-1`.

`mail.onside.sh` não tem MX, então todo envio leva `reply_to:
contato@onside.sh` (`sendEmail`, em `packages/auth`). Sem isso, a
resposta de quem recebe o e-mail voltaria com bounce.

Os registros de envio do domínio raiz (`resend._domainkey`, `send.onside.sh`
TXT e MX) e o domínio `onside.sh` no Resend foram removidos em 30/09/2026,
depois do deploy que passou produção para `mail.onside.sh`.

Para enviar localmente, use `EMAIL_FROM=contato@mail.onside.sh` e `EMAIL_API_KEY`
no `.env`.

## Troca para a MillionSend (WEB-476, WEB-482)

Feita em 29/10/2026, por decisão do dono (28/10): plano Free da nuvem, 100
e-mails por dia; passando disso, o envio fica para o dia seguinte, inclusive
verificação e reset de senha.

- Domínio `mail.onside.sh` adicionado na MillionSend (sa-east-1, Return-Path
  `send`) e verificado com o DKIM `millionsend._domainkey.mail` na Cloudflare.
  O `_dmarc.mail` com `p=none` que o painel sugere não foi criado: enfraqueceria
  o `p=quarantine` herdado de `onside.sh`.
- Duas chaves só de envio, só para o domínio: "onside-web produção" (Worker
  `onside-web`) e "onside-web preview e local" (`onside-web-preview` e o `.env`
  local). O segredo `EMAIL_API_KEY` entrou nos Workers antes do deploy que levou
  `EMAIL_API_URL` para a MillionSend (#391): URL e chave trocaram juntas.
- Conferido com envio real (local e um "esqueci a senha" em produção): caixa de
  entrada, SPF, DKIM e DMARC `pass`, `Reply-To` certo, anexo.
- No mesmo dia a Resend saiu: `RESEND_API_KEY` dos Workers, o
  `resend._domainkey.mail` da zona, o domínio e as chaves `onside-production` e
  `onside-local` no painel da Resend (a `envy` é de outro projeto), os nomes
  antigos em `packages/env` e a Resend na política de privacidade e no Bastidores.

Voltar para a Resend agora exige refazer domínio, DKIM e chave lá.

## Verificação

```bash
dig +short TXT _dmarc.onside.sh @1.1.1.1
dig +short TXT millionsend._domainkey.mail.onside.sh @8.8.8.8
dig +short MX send.mail.onside.sh @1.1.1.1
curl -sI https://www.onside.sh/og-image.jpg  # deve ser 200 image/jpeg
```

`dig` não verifica entrega. Dispare também um e-mail transacional real,
confirme a chegada na caixa de entrada e confira que nenhum link ou `<img src>`
contém `localhost`.

DNS e MillionSend não têm CLI configurada neste repositório; as mudanças acima foram
feitas pelos painéis.
