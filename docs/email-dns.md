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

## Ação do dono: DMARC

O registro `_dmarc.onside.sh` estava ausente. Publique uma política inicial
`p=none` depois de escolher um endereço que realmente receba relatórios:

```text
Host: _dmarc.onside.sh
Tipo: TXT
Valor: "v=DMARC1; p=none; rua=mailto:<caixa-ou-agregador>; fo=1"
```

O registro sugerido originalmente usava `rua=mailto:dmarc@onside.sh`, mas
`onside.sh` não tem MX; o MX existente em `send.onside.sh` é de bounce do SES.
Essa caixa precisa existir e receber mensagens, ou `rua=` deve apontar para um
agregador de relatórios DMARC. Sem isso, os relatórios vão para o vazio.

DKIM, SPF e o MX de bounce do Resend/SES já estavam corretos. Após algumas
semanas de relatórios, revisar a transição de `p=none` para `quarantine` e
depois `reject`.

## Ação do dono: `mail.onside.sh`

Se o subdomínio dedicado for adotado antes do volume de abertura:

1. Verifique `mail.onside.sh` no Resend.
2. Publique o novo DKIM, SPF e MX de bounce fornecidos pelo Resend.
3. Troque `RESEND_FROM_EMAIL` no ambiente local e na Vercel para o novo domínio.
4. Publique DMARC para o subdomínio, ou use `sp=` no registro DMARC de
   `onside.sh`.

Essa mudança separa a reputação de envio transacional da reputação do domínio
raiz, mas exige uma nova configuração completa no Resend.

## Verificação

```bash
dig +short TXT _dmarc.onside.sh @1.1.1.1
curl -sI https://www.onside.sh/og-image.jpg  # deve ser 200 image/jpeg
```

`dig` não verifica entrega. Dispare também um e-mail transacional real,
confirme a chegada na caixa de entrada e confira que nenhum link ou `<img src>`
contém `localhost`.

DNS, Resend e Vercel continuam fora da execução do agente; este documento é o
runbook para o dono aplicar e verificar essas mudanças.
