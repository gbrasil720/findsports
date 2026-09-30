# E-mail: DNS e base pública

## Código entregue

Os links de ação e as imagens dos e-mails usam `PUBLIC_APP_URL`, separado de
`BETTER_AUTH_URL`. Em `development` e `test`, a variável pode ficar ausente e
cai para `BETTER_AUTH_URL`; em `production`, ela é obrigatória e precisa ser um
endereço HTTPS público. A validação acontece no caminho de e-mail: a ausência
não derruba o boot da aplicação, mas impede o envio até a variável ser
configurada. Configure `PUBLIC_APP_URL=https://www.onside.sh` na Vercel e no
ambiente local que dispara e-mails reais.

O asset `apps/web/public/og-image.jpg` já existe no branch e em produção; não
use `og-image.png`, que não é um fallback válido.

## DMARC — publicado

```text
_dmarc.onside.sh  TXT  "v=DMARC1; p=none; rua=mailto:contato@onside.sh; fo=1"
```

Publicado em 29/09/2026 no DNS da Vercel (WEB-109). `contato@onside.sh` recebe
de fato: `onside.sh` tem MX do Google Workspace (`1 smtp.google.com`). O
registro vale também para `mail.onside.sh`, que não tem `_dmarc` próprio: sem
`sp=`, o subdomínio herda o `p=` do domínio organizacional.

Após algumas semanas lendo os relatórios, e confirmando que só o Resend (DKIM
`mail.onside.sh`) e o Google Workspace assinam pelo domínio, apertar para
`p=quarantine` e depois `p=reject`.

## Domínio de envio: `mail.onside.sh`

O envio transacional sai de `contato@mail.onside.sh` (`RESEND_FROM_EMAIL` na
Vercel), separado da reputação do domínio raiz, que é o do Google Workspace.
Domínio verificado no Resend, região `sa-east-1`, com os registros:

```text
resend._domainkey.mail.onside.sh  TXT  "p=MIGfMA0GCSq…"   (DKIM, valor no painel do Resend)
send.mail.onside.sh               TXT  "v=spf1 include:amazonses.com ~all"
send.mail.onside.sh               MX   10 feedback-smtp.sa-east-1.amazonses.com
```

`mail.onside.sh` não tem MX, então todo envio leva `reply_to:
contato@onside.sh` (`sendEmailWithResend`, em `packages/auth`). Sem isso, a
resposta de quem recebe o e-mail voltaria com bounce.

O domínio antigo `onside.sh` continua verificado no Resend e seus registros
(`resend._domainkey`, `send.onside.sh`) continuam publicados; remova-os só
depois que nenhum ambiente usar mais `RESEND_FROM_EMAIL=…@onside.sh`.

Para enviar localmente com Resend, use `RESEND_FROM_EMAIL=contato@mail.onside.sh`
no `.env`.

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

DNS, Resend e Vercel não têm CLI configurada neste repositório; as mudanças
acima foram feitas pelos painéis.
