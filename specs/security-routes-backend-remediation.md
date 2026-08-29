# Remediação de segurança de rotas e back-end

- Status: implementada e validada em 2026-08-24
- Data da auditoria: 2026-08-24
- Escopo: `apps/web`, `packages/api`, `packages/auth`, `packages/db`, configuração de deploy e dependências alcançáveis
- Implementação: tickets locais em `.scratch/security-routes-backend/issues`

## Resultado executivo

A auditoria confirmou sete vulnerabilidades. Duas devem bloquear uma abertura
pública do produto: identidade de e-mail não comprovada no cadastro e leitura de
bares fora da projeção pública pela API de favoritos. As demais reduzem a
confiabilidade dos controles de entrada, CSRF, upload e tratamento de falhas.

| ID | Severidade | Estado | Resumo |
| --- | --- | --- | --- |
| SEC-01 | alta | confirmada | cadastro cria sessão sem provar posse do e-mail usado como identidade, convite e vínculo comercial |
| SEC-02 | média | confirmada | favoritos aceitam bar inativo e devolvem campos internos sem a projeção pública |
| SEC-03 | média | confirmada | portão da waitlist pode abrir em falha de configuração e permite enumeração quando o login é fechado |
| SEC-04 | média | confirmada | origem ngrok de desenvolvimento é confiada permanentemente pelo auth, inclusive em produção |
| SEC-05 | baixa | confirmada | validação de foto aceita qualquer loja pública do Vercel Blob e caminhos apenas prefixados |
| SEC-06 | baixa | confirmada | rotas REST devolvem mensagens cruas de exceções internas ao cliente |
| SEC-07 | média | confirmada | fan autenticado podia chamar checkout Dodo de bar diretamente, apesar do redirecionamento visual |

## Método e limites

Foram inventariadas as rotas TanStack Start, o handler de Better Auth, o handler
tRPC, procedimentos públicos/protegidos/admin, mutações SQL, uploads, webhooks,
redirecionamentos e chamadas externas. Cada candidato só permaneceu abaixo
quando existia uma cadeia concreta entre entrada controlável, controle ausente e
impacto observável.

Não foi usado banco remoto nem executado teste mutável. O baseline unitário
seguro passou com 58 testes em nove arquivos, cobrindo guards, autorização de
waitlist/recomendações, rate limit, redirects, 2FA, upload e SQL parametrizado.
`bun audit` encontrou 70 avisos transitivos, mas nenhum aviso de severidade alta
ou crítica teve uma cadeia de produção confirmada com os plugins e APIs
habilitados hoje; por isso a contagem bruta não virou achado.

## SEC-01 — cadastro sem comprovação de e-mail

### Evidência

- `packages/auth/src/index.ts:143-147` habilita senha, `autoSignIn: true` e
  `requireEmailVerification: false`.
- Não existe `emailVerification.sendVerificationEmail` nem transporte de e-mail
  no repositório.
- `apps/web/src/routes/(auth)/signup.tsx:94-108` trata o cadastro como concluído e
  navega para dentro da aplicação imediatamente.
- `packages/api/src/lib/waitlist-gate.ts:128-143` concede entrada pelo e-mail
  aprovado, sem prova de posse.
- `packages/auth/src/index.ts:33-89` resolve ativação de assinatura pelo e-mail do
  payload do Dodo.
- A versão instalada do plugin Dodo também exige `emailVerified` para portal e
  histórico, de modo que o estado atual simultaneamente não prova identidade e
  deixa essas superfícies indisponíveis para contas de senha.

### Cadeia confirmada

1. Uma pessoa legítima entra na waitlist com seu e-mail e é aprovada.
2. Antes de ela criar a conta, um atacante cadastra o mesmo e-mail com uma senha
   controlada por ele.
3. O portão vê um e-mail aprovado e o Better Auth cria usuário e sessão sem
   enviar ou exigir confirmação.
4. A unicidade de `user.email` impede a pessoa legítima de se cadastrar depois.
5. Se a conta for de bar, o atacante pode concluir onboarding sob aquela
   identidade; eventos de pagamento baseados no mesmo e-mail podem ser
   associados ao bar errado.

Isso é pre-account hijacking/identity squatting, não apenas ausência de uma
melhoria de UX. A aprovação da waitlist prova que o endereço foi escolhido por
um administrador; não prova que quem enviou a senha controla o endereço.

### Correção obrigatória

1. Contenção imediata: enquanto não houver transporte de e-mail, desabilitar
   signup público no servidor. Não considerar o portão da waitlist mitigação,
   pois ele é justamente indexado pelo e-mail não verificado.
2. Configurar o fluxo nativo do Better Auth com:
   - `emailAndPassword.requireEmailVerification: true`;
   - `emailAndPassword.autoSignIn: false`;
   - `emailVerification.sendVerificationEmail` usando um provedor transacional;
   - `emailVerification.sendOnSignUp: true`;
   - `emailVerification.autoSignInAfterVerification: true` somente se o callback
     continuar restrito a caminho interno.
3. Enviar o e-mail por chamada HTTPS direta ao provedor escolhido; não adicionar
   uma camada própria de tokens, hash ou tabela. Better Auth continua dono do
   token, expiração e consumo único.
4. Usar Resend com versões HTML e texto. O HTML deve repetir a identidade
   Onside — wordmark, ink `#12120f`, paper `#f1eee6`, acid `#c9f135`, live
   `#e8320c`, tipografia editorial e CTA acessível — sem depender de CSS externo.
5. Para bares, permitir preencher o onboarding antes da confirmação, mas
   manter o rascunho expirável somente no navegador. Depois da revisão, abrir
   a tela “verifique seu e-mail”; apenas após o Better Auth confirmar o token o
   servidor grava bar/assinatura e libera `/plan`. Se a confirmação ocorrer em
   outro dispositivo sem rascunho, voltar ao onboarding em vez de criar dados
   parciais.
6. Para fans, levar do cadastro diretamente à verificação e somente depois ao
   onboarding. O reenvio usa mensagem neutra, sem confirmar se a conta existe.
7. Impedir persistência de onboarding, checkout e demais procedimentos
   protegidos para identidade cujo `emailVerified` não seja `true`. A proteção
   deve viver em middleware de servidor reutilizado, não apenas no guard visual.
8. Adicionar ao schema Drizzle a coluna `dodoCustomerId` exigida pelo plugin
   Dodo e sua migration. O campo deve ser `input: false`, único quando presente,
   e nunca aceito do cliente.
9. Antes de habilitar cobrança, reconciliar contas Dodo existentes e validar
   que o webhook associa uma assinatura a uma identidade verificada. Se troca
   de e-mail ou OAuth forem adicionados no futuro, substituir a resolução por
   e-mail por um identificador Dodo persistido; não ampliar o vínculo atual.

### Provas de regressão

- Signup não devolve sessão antes da verificação.
- Link válido verifica uma única vez, expira e só redireciona internamente.
- E-mail aprovado na waitlist, porém não verificado, não acessa onboarding nem
  checkout.
- Cadastrar e-mail de outra pessoa não permite ocupar a identidade.
- Portal e pagamentos funcionam para conta verificada e não criam clientes Dodo
  duplicados.
- Testes de resposta não distinguem e-mail inexistente, já cadastrado e pendente
  além do estritamente necessário ao usuário legítimo.

## SEC-02 — favoritos contornam visibilidade e projeção pública

### Evidência

- `packages/api/src/routers/pubs.ts:240-313` é o caminho público canônico de um
  bar: recusa `isActive === false`, remove `userId`, `ratingCount`,
  `ratingPositive` e `ratingScore`, e aplica a política de nota pública.
- `packages/api/src/routers/pubs.ts:316-360` insere favorito por qualquer
  `barId` existente sem exigir `bar.isActive`.
- `packages/api/src/routers/pubs.ts:410-438` lista favoritos com
  `columns: { geo: false }`, o que devolve todas as demais colunas do bar,
  inclusive dono, plano, estado ativo e contadores internos de avaliação.
- A consulta não filtra bar ativo e devolve seus eventos futuros.

### Cadeia confirmada

Um torcedor favorita um bar enquanto ele está ativo — ou envia diretamente um
UUID conhecido. Se o bar for desativado, `getById` passa a responder 404, mas
`getFavorites` continua entregando o registro completo. Mesmo enquanto ativo,
o segundo endpoint revela campos que o primeiro remove deliberadamente,
inclusive os contadores protegidos pelo piso/flag de nota pública.

UUID não é autorização. O próprio fluxo normal fornece o ID enquanto o bar está
ativo, então não depende de adivinhação.

### Correção obrigatória

1. Extrair somente uma projeção de resposta compartilhada entre `getById`,
   busca e favoritos; ela deve listar explicitamente os campos públicos, nunca
   selecionar “tudo exceto”.
2. `favorite` deve inserir apenas se o bar existir e estiver ativo. Bar ausente
   ou inativo responde `NOT_FOUND`, sem distinguir os dois casos.
3. `getFavorites` deve filtrar `bar.isActive = true` e aplicar a mesma política
   server-side de rating de `getById`.
4. Não retornar `userId`, `ratingCount`, `ratingPositive`, `ratingScore`,
   `isActive`, `plan` ou qualquer campo futuro por efeito colateral do schema.
5. Favoritos antigos de bar desativado podem permanecer no banco; apenas deixam
   de ser entregues. Não apagar preferência do usuário como efeito de leitura.

### Provas de regressão

- Bar inativo conhecido não pode ser favoritado.
- Favorito existente some da resposta enquanto o bar estiver inativo.
- Reativar o bar faz o favorito reaparecer sem reinserção.
- A resposta de favoritos não contém os campos internos acima.
- Flag e piso de nota produzem o mesmo resultado em `getById`, busca e favoritos.
- Favoritar/desfavoritar continua limitado ao `ctx.session.user.id`.

## SEC-03 — portão de entrada não é um controle fail-closed

### Evidência

- `packages/api/src/lib/app-config/store.ts:120-130` converte qualquer falha de
  leitura de configuração em registro vazio.
- `packages/api/src/lib/app-config/registry.ts:142-147` define
  `launch.waitlist_gate` como aberto nos dois lados por padrão.
- `apps/web/src/routes/api/auth/$.ts:27-50` usa esse valor antes de despachar para
  o Better Auth. Falha isolada da tabela/migration/configuração pode, portanto,
  abrir signup mesmo com o portão operacionalmente fechado.
- `packages/api/src/lib/waitlist-gate.ts:73-87` permite login de admin antes da
  decisão normal. Com `signin: true`, a resposta para e-mail não aprovado difere
  da resposta para e-mail aprovado ou de administrador, criando um oráculo de
  aprovação/conta privilegiada antes da validação da senha.

A indisponibilidade total do Postgres também impede o cadastro e não explora a
falha. O caso relevante e confirmado é parcial: tabela `app_config` ausente,
permissão quebrada, linha perdida ou valor inválido enquanto as tabelas de auth
continuam graváveis.

### Correção obrigatória

1. Tratar `launch.waitlist_gate` como configuração de segurança separada das
   flags de experiência. Leitura inválida/ausente deve recusar signup quando o
   deploy estiver em modo de convite.
2. Definir o modo de admissão em variável de ambiente validada no boot
   (`open` ou `invite-only`). O banco pode afrouxar UX/rollout, mas não pode
   transformar uma política `invite-only` em `open` por falha de leitura.
3. Remover o portão de signin. Fechar cadastro já impede novas contas; usuários
   existentes, inclusive administradores, devem autenticar normalmente e
   receber a mensagem neutra do Better Auth para credencial inválida.
4. Se o produto insistir em suspender login por aprovação, aplicar a decisão
   somente depois de credenciais válidas e devolver a mesma resposta externa
   para todos os e-mails inválidos. Não consultar papel para modular resposta
   antes da senha.
5. Registrar evento estruturado quando configuração de segurança cair no valor
   seguro, sem e-mail, corpo ou segredo.

### Provas de regressão

- Em `invite-only`, erro/ausência/JSON inválido da configuração recusa signup.
- Em `open`, signup funciona apenas com e-mail verificado conforme SEC-01.
- Login com senha errada tem resposta indistinguível para desconhecido,
  pendente, aprovado e admin.
- Admin continua conseguindo entrar com credenciais válidas durante o modo de
  convite.

## SEC-04 — origem de desenvolvimento confiada em produção

### Evidência

- `packages/auth/src/index.ts:139-142` adiciona permanentemente
  `https://nintendo-hyperlink-undamaged.ngrok-free.dev` a `trustedOrigins`.
- `apps/web/vite.config.ts:9-14` confirma que a mesma origem existe para acesso
  ao servidor de desenvolvimento.
- Better Auth usa `trustedOrigins` como fronteira de CSRF e open redirect; uma
  origem listada deixa de ser tratada como atacante.

O domínio exato não é controlável por um atacante arbitrário hoje, portanto a
exploração exige comprometimento, reatribuição ou conteúdo malicioso naquele
túnel. A vulnerabilidade confirmada é a confiança de produção em infraestrutura
de desenvolvimento de terceiro, não uma alegação de domínio já tomado.

### Correção obrigatória

1. Em produção, confiar somente em `BETTER_AUTH_URL`/origem canônica. Não repetir
   a origem base em lista adicional sem necessidade.
2. Permitir origem de túnel apenas em `NODE_ENV === 'development'`, por variável
   explícita e validada como origem exata HTTPS.
3. Não aceitar wildcard de ngrok e não reutilizar a variável de CORS genérica
   como allowlist de autenticação.
4. Adicionar teste de configuração que instancia auth em ambiente de produção e
   prova que nenhuma origem `ngrok-*` está presente.

## SEC-05 — validação de URL de foto não prova posse da loja Blob

### Evidência

- `packages/api/src/lib/blob-photo.ts:48-61` aceita qualquer hostname terminado
  em `.public.blob.vercel-storage.com`.
- Cada loja Vercel Blob recebe seu próprio subdomínio nesse sufixo; logo um
  usuário pode criar outra loja e publicar um objeto no caminho esperado.
- A checagem usa `startsWith`, aceitando `/bars/<id>/photo-malicioso`, embora a
  emissão legítima em `apps/web/src/routes/api/bar/photo.ts:54-65` autorize o
  caminho exato, sem sufixo aleatório.

Isso contorna os limites de tipo, tamanho, sobrescrita e armazenamento impostos
na emissão do token. O atacante continua limitado ao campo de foto do próprio
bar, por isso a severidade é baixa; ainda assim, o controle declarado pode ser
bypassado sem quebrar ou falsificar token.

### Correção obrigatória

1. Derivar e validar no servidor o hostname exato da loja configurada, a partir
   de uma variável pública de origem/host do Blob ou de configuração segura do
   projeto. Não confiar no sufixo global do provedor.
2. Com `addRandomSuffix: false`, exigir pathname exatamente igual a
   `/${photoPathname(barId)}`. Se o produto voltar a usar sufixos, armazenar o
   pathname emitido no token e comparar com esse valor, não com prefixo livre.
3. Preservar HTTPS, MIME allowlist, teto de 5 MB e autorização por sessão/bar.

### Provas de regressão

- URL da loja oficial e caminho exato é aceita.
- Outra loja Vercel Blob, mesmo com caminho idêntico, é recusada.
- Prefixo acrescido, query enganosa, userinfo, porta alternativa, HTTP,
  `javascript:` e `data:` são recusados.

## SEC-06 — mensagens internas expostas por rotas REST

### Evidência

- `apps/web/src/routes/api/bar/commercial-event.ts:76-80` devolve
  `err.message` de qualquer exceção desconhecida.
- `apps/web/src/routes/api/bar/photo.ts:70-74` faz o mesmo para exceções do SDK,
  banco e configuração.
- Os `TRPCError` esperados do evento comercial já têm mapeamento controlado; o
  vazamento está no fallback desconhecido.

Falhas de driver, SDK ou configuração podem revelar nomes de tabela, host,
detalhes do provedor e decisões internas. Não foi encontrado caminho que
devolva segredo diretamente; por isso a severidade permanece baixa.

### Correção obrigatória

1. Responder mensagens estáveis por classe/status. Exceção desconhecida deve
   virar `500` com texto genérico.
2. Registrar detalhes somente no servidor, usando o log estruturado existente e
   um identificador de correlação; nunca registrar corpo, token, cookie ou URL
   assinada de upload.
3. Mover o `request.json()` da rota de foto para dentro do bloco de tratamento e
   devolver `400` genérico para JSON inválido.
4. Preservar 401/403/404/429 dos erros conhecidos, sem transformar falha interna
   em 400.

### Provas de regressão

- Erro conhecido mantém status e mensagem pública prevista.
- Erro sintético contendo URL/host/SQL aparece no log de teste e não na resposta.
- JSON inválido responde 400; exceção inesperada responde 500.

## SEC-07 — checkout de bar protegido apenas pela navegação

### Evidência e impacto

O guard da aplicação redireciona `fan` para fora de `/plan`, mas o plugin Dodo
configurado com `authenticatedUsersOnly` exige somente uma sessão. Uma chamada
direta a `/api/auth/dodopayments/checkout` ou `checkout-session` podia criar um
checkout de plano de bar para um fan. Como esse usuário não possui bar, o
webhook posterior não encontra recurso comercial para ativar; isso permite
cobrança sem entrega e contorna a separação de papéis declarada pela UI.

### Correção e provas

1. Aplicar um hook `before` no Better Auth para checkout, checkout-session e
   rotas de customer/portal do Dodo.
2. Exigir simultaneamente sessão, `role === 'pub'` e `emailVerified === true`.
3. Não interceptar o webhook assinado, que precisa permanecer server-to-server.
4. Testar a matriz: fan verificado, pub não verificado e anônimo são recusados;
   somente pub verificado passa. O perfil público `/pub/:id` continua público.

## Ordem de implementação

### Fase 0 — contenção

1. Bloquear signup público até existir verificação de e-mail.
2. Remover a origem ngrok da allowlist de produção.
3. Confirmar que cobrança segue desligada durante a reconciliação Dodo.

### Fase 1 — identidade e admissão

1. Implementar SEC-01, incluindo migration de `dodoCustomerId`.
2. Implementar o modo de admissão fail-closed e remover o gate de signin
   (SEC-03).
3. Rodar testes de auth em banco local descartável e QA dos links reais de
   verificação. Nenhum envio deve usar endereço de produção durante teste.

### Fase 2 — autorização de recurso

1. Criar a projeção pública compartilhada e fechar favoritos (SEC-02).
2. Adicionar teste de integração com um bar ativo e outro inativo em banco
   comprovadamente descartável.

### Fase 3 — bordas e erros

1. Restringir origem Blob e caminho exato (SEC-05).
2. Sanitizar fallbacks REST (SEC-06).
3. Executar suíte focada, typecheck forçado do monorepo e build web.

## Arquivos previstos

| Área | Arquivos principais |
| --- | --- |
| Auth/e-mail/origens | `packages/auth/src/index.ts`, `packages/env/src/server.ts`, `apps/web/src/routes/(auth)/signup.tsx`, nova rota/componente mínimo de verificação |
| Schema Dodo | `packages/db/src/schema/auth.ts`, nova migration Drizzle e snapshot |
| Gate | `apps/web/src/routes/api/auth/$.ts`, `packages/api/src/lib/waitlist-gate.ts`, `packages/api/src/lib/app-config/*` |
| Favoritos/projeção | `packages/api/src/routers/pubs.ts`, um helper de projeção somente se houver pelo menos dois consumidores reais, testes focados |
| Blob | `packages/api/src/lib/blob-photo.ts`, `apps/web/src/routes/api/bar/photo.ts`, testes existentes |
| Erros REST | `apps/web/src/routes/api/bar/commercial-event.ts`, `apps/web/src/routes/api/bar/photo.ts` |

Não criar framework próprio de autorização, serviço genérico de e-mail, nova
camada de repositório ou wrapper universal de erros. Os pontos responsáveis já
existem; o fix deve permanecer neles.

## Compatibilidade e rollback

- A migration `0025_left_sage.sql` adiciona `user.dodo_customer_id` como coluna
  opcional e única. Em rollback, primeiro deve ser restaurada uma versão da
  aplicação que não leia esse campo; só depois a constraint e a coluna podem
  ser removidas.
- Contas anteriores à verificação foram marcadas como verificadas na migration,
  pois já possuíam sessão válida no comportamento legado. Esse backfill é
  deliberadamente irreversível; revertê-lo bloquearia usuários existentes sem
  distinguir quem já controlava o endereço.
- `LAUNCH_ADMISSION_MODE=open` restaura cadastro aberto sem remover o controle
  de e-mail. Ausência da variável mantém o modo seguro `invite-only`.

## Evidência da implementação

- 413 testes unitários passaram; nove integrações opt-in permaneceram fora da
  suíte comum por segurança.
- As duas integrações novas de waitlist e favoritos passaram contra
  `findsports_load_test` local em Docker, porta 5433 e armazenamento `tmpfs`.
- Typecheck forçado dos seis workspaces e build web client/SSR passaram.
- A rota `/verify-email` está no route tree e no build SSR. QA visual em
  navegador ficou pendente porque nenhum navegador estava conectado à sessão;
  não houve envio real para destinatário nem validação de domínio Resend.

## Gate de aceite final

- Nenhuma conta de senha obtém sessão ou onboarding antes de verificar e-mail.
- Signup em modo de convite falha fechado quando a configuração não pode ser
  lida.
- Respostas de login inválido não revelam aprovação nem papel.
- Nenhuma API de torcedor entrega bar inativo ou campos internos de bar.
- Produção não confia em origem de túnel.
- URL de foto prova loja oficial e caminho autorizado.
- Exceções desconhecidas não atravessam a fronteira HTTP.
- Testes unitários focados passam.
- Testes de integração rodam somente contra banco local/CI descartável com trava
  explícita; nunca contra URL remota ou produção.
- `bun run check-types -- --force`, build web e `git diff --check` passam, com
  regressões separadas de ruído de baseline.

## Configuração de deploy necessária

- `RESEND_API_KEY`: chave server-side do Resend.
- `RESEND_FROM_EMAIL`: remetente em domínio verificado no Resend; a aplicação
  acrescenta o nome amigável `Onside`.
- `LAUNCH_ADMISSION_MODE`: `invite-only` por padrão seguro, ou `open`.
- `BLOB_STORE_ID`: subdomínio exato da loja pública Vercel Blob.
- `AUTH_DEV_TRUSTED_ORIGIN`: opcional, somente uma origem HTTPS exata de
  desenvolvimento; ignorada fora de `development`.

## Candidatos descartados como falso positivo

- Guards apenas de tela: os endpoints administrativos sensíveis auditados usam
  `adminProcedure` ou o middleware do plugin admin; não foi confirmado IDOR
  administrativo por chamar a API diretamente.
- SQL injection: o código usa templates parametrizados do Drizzle e o scanner
  existente confirmou ausência de `sql.raw`, concatenação em template SQL e
  `db.execute(string)`.
- SSRF de geocoding: host e caminho do Google são constantes; somente o parâmetro
  `address` é codificado.
- Open redirect de login/2FA: callbacks cross-origin, `//` e barra invertida são
  recusados e há testes passando.
- Falsificação de IP na Vercel: a plataforma sobrescreve `X-Forwarded-For`; o
  helper atual não cria bypass no deploy declarado. Essa conclusão deve ser
  revista se houver proxy próprio antes da Vercel.
- Avisos Better Auth de OIDC/MCP/device/OAuth/organization/magic-link: esses
  plugins/provedores não estão habilitados. O aviso de sessão após exclusão
  exige `secondaryStorage`, também ausente.
- Token da sessão no retorno de `getSession`: a versão instalada inclui o token
  bruto no objeto, mas cookies são assinados e não há plugin bearer/one-time-token
  habilitado que aceite esse valor como credencial. Reduzir a projeção de sessão
  ao cliente é hardening válido, mas não foi classificado como exploração atual.

## Referências externas verificadas

- Better Auth, opções de verificação de e-mail e rate limit:
  <https://better-auth.com/docs/reference/options>
- Better Auth, `trustedOrigins` como defesa de CSRF/open redirect:
  <https://better-auth.com/docs/reference/security>
- Vercel, `X-Forwarded-For` sobrescrito contra spoofing:
  <https://vercel.com/docs/headers/request-headers>
- Vercel Blob, lojas com subdomínios próprios e upload por token:
  <https://vercel.com/docs/vercel-blob/using-blob-sdk>
- GitHub Advisory Database, condições dos avisos Better Auth descartados:
  <https://github.com/advisories/GHSA-2vg6-77g8-24mp> e
  <https://github.com/advisories/GHSA-g38m-r43w-p2q7>
