# Configuração em tempo de execução (ESC-19)

Alavancas operacionais que antes eram constante de módulo passaram a viver no
banco. Mudar qualquer uma deixou de exigir deploy.

O painel fica em `/internal/flags`, restrito a `role = 'admin'`.

---

## O que é e o que não é

**É** para decisão operacional reversível: desligar um caminho de código que
regrediu, afrouxar um limite durante um pico, liberar cobrança.

**Não é** para direito por plano. Isso já existe, é server-side e é testado —
`lib/commercial-analytics/entitlements.ts` e `lib/event-creation-policy.ts`.
Flag em cima daquilo só duplicaria a fonte da verdade.

---

## As duas regras

1. **O padrão é o comportamento atual de produção, nunca o novo.** Banco fora
   do ar, JSON corrompido, linha ausente: tudo cai no padrão, e cair no padrão
   precisa ser um não-evento. Quem liga o caminho novo é a linha no banco.

2. **Linha ausente significa "usa o padrão".** Voltar ao padrão apaga a linha
   em vez de gravar o valor padrão nela — assim o padrão continua vivendo em um
   lugar só, e quem nunca mexeu na flag acompanha uma mudança futura de padrão.

---

## Chaves

| Chave | Padrão | Público | O que faz |
|---|---|---|---|
| `search.tiered_plan_query` | `true` | não | Busca avalia planos em camadas usando a projeção `bar.plan` (0018). Desligar volta ao caminho linear, que lê o plano de `subscription`. |
| `billing.checkout_enabled` | `false` | sim | Libera a abertura de checkout do Dodo. Webhook e portal do cliente **não** passam por este portão. |
| `waitlist.rate_limit` | 8/IP e 3/e-mail por 10 min | não | Freio da waitlist pública. `enabled: false` desliga o contador inteiro. |
| `launch.pub_cities` | `[]` | sim | Cidades em que um bar conclui o onboarding. Vazio = todas. |

`Público` significa que a chave é servida por `appConfig.getPublic`, aberta a
qualquer visitante. Serve para a tela avisar antes de o usuário bater numa
porta fechada — **nunca** como decisão de segurança. O servidor recusa de novo,
sozinho, em `api/auth/$` e em `onboarding.completePub`.

---

## Propagação

Salvar grava na hora. As instâncias já em execução veem o valor novo **em até
60 segundos** — é o TTL do cache que evita uma consulta por requisição.

Com Upstash/Vercel KV configurado, o cache é compartilhado entre instâncias;
sem credencial, cada instância mantém a sua cópia. O prazo é o mesmo nos dois
casos.

O painel lê direto do banco, sem cache, para o administrador ver o que está
gravado em vez do que a instância dele ainda tem em memória.

---

## Runbook

### A busca está devolvendo bar pago na posição errada

Sintoma: bar `pro`/`elite` aparece depois de `starter`, ou some da primeira
página. Provável causa: `bar.plan` dessincronizou de `subscription.plan`.

1. Confirme a dessincronia:

   ```sql
   SELECT b.id, b.plan AS projetado, s.plan AS assinatura
   FROM bar b
   LEFT JOIN subscription s ON s.bar_id = b.id
   WHERE b.plan IS DISTINCT FROM COALESCE(s.plan, 'starter');
   ```

2. Em `/internal/flags`, **desligue** `search.tiered_plan_query`. A busca passa
   a ler o plano da assinatura a cada consulta. Custa mais (24 ms contra 5,5 ms
   no dataset grande) e é imune à projeção.

3. Reconcilie a projeção:

   ```sql
   UPDATE bar b SET plan = COALESCE(s.plan, 'starter')
   FROM subscription s WHERE s.bar_id = b.id AND b.plan IS DISTINCT FROM s.plan;
   ```

4. Rode a consulta do passo 1 de novo. Zero linhas: religue a flag.

O cursor de paginação é idêntico nos dois caminhos, então a troca pode
acontecer com gente no meio da navegação. A chave do cache inclui o modo, então
desligar não continua servindo páginas do caminho suspeito.

### Cadastros legítimos estão sendo barrados na waitlist

Sintoma: `TOO_MANY_REQUESTS` em volume, tipicamente de faculdade, empresa ou
operadora atrás de NAT — todos compartilham um IP.

Afrouxe só a dimensão que está estourando. Exemplo, dobrando o teto por IP:

```json
{
  "enabled": true,
  "ip": { "max": 40, "windowMs": 600000 },
  "email": { "max": 3, "windowMs": 600000 }
}
```

Mantenha o limite por e-mail: ele é o que segura cadastro repetido, e não sofre
com NAT. Só use `enabled: false` se o problema for a escrita do contador em si
(contenção na tabela `rate_limit`), não a carga.

### Abrir cobrança

Ligue `billing.checkout_enabled`. Confirme antes que a chave e o ambiente do
Dodo estão corretos — o portão libera a rota, não valida a credencial.

Para fechar de novo: desligue. Assinaturas já ativas continuam valendo, o
webhook continua sendo processado e o portal do cliente continua aberto.

### Abrir a plataforma por convite

Tudo numa tela só: **`/internal/waitlist`**. Os interruptores ficam no painel
*Acesso à plataforma*, no topo, ao lado das contagens de liberados e
pendentes — de propósito. Numa tela separada dava para fechar o cadastro sem
enxergar que ninguém foi liberado ainda.

O mesmo par de interruptores também aparece em `/internal/flags`, junto das
outras chaves.

**Estado de hoje: aberto.** `launch.waitlist_gate` nasce
`{signup: false, signin: false}` — o portão existe no código e não bloqueia
nada até alguém ligar.

#### Liberar alguém

- **Já está na lista:** botão *Liberar* na coluna Acesso da tabela. Vale para
  a pessoa, não para a linha: marca todas as inscrições daquele e-mail, porque
  o portão consulta por e-mail.
- **Não está na lista:** campo *Liberar quem não está na lista*, no painel de
  acesso. Cria a inscrição já liberada, marcada com a cidade
  `Convite direto`. É o caminho para o bar que a equipe abordou na rua — sem
  isso, a resposta seria "peça para ela se cadastrar primeiro", que é mandar
  o convidado bater na porta antes de você abrir.

O portão vive em `launch.waitlist_gate` e tem dois lados independentes.

1. **Aprove antes de ligar.** Em `/internal/waitlist`, botão *Liberar* na
   coluna Acesso. A aprovação é da pessoa, não da linha: marca todas as
   inscrições daquele e-mail, porque o portão consulta por e-mail.

2. **Feche o cadastro primeiro**, deixando o login aberto:

   ```json
   { "signup": true, "signin": false }
   ```

   Ninguém novo entra; quem já tem conta continua entrando. É o estado normal
   de um beta fechado que já tem gente dentro.

3. **Feche os dois** quando quiser exigir aprovação também para entrar:

   ```json
   { "signup": true, "signin": true }
   ```

   Cuidado: isso barra contas comuns que existem mas não foram aprovadas —
   incluindo os bares de teste. Aprove-os antes.

**A trava contra se trancar do lado de fora:** administrador NUNCA é barrado
no login, aprovado ou não. Sem essa isenção, ligar o portão por engano
deixaria o painel que o desliga do outro lado da porta. Está travado em
`lib/waitlist-gate.test.ts` — não remova.

Para tirar acesso de alguém que já entrou, o caminho é banir em
`/internal/manage-users`, não revogar aqui: revogar só impede logins novos, e
a sessão em curso vale até o cookie expirar.

### Abrir uma cidade nova

Acrescente o nome a `launch.pub_cities`:

```json
["São Paulo", "Recife"]
```

A comparação ignora acento, caixa e espaço repetido. Não casa por prefixo nem
por proximidade: `São Paulo de Potengi` **não** entra por causa de `São Paulo`.

Vale só para o onboarding de bar. Torcedor não informa cidade em lugar nenhum
do fluxo — a busca dele é por GPS e raio.

---

## Acrescentar uma chave

Uma edição em `lib/app-config/registry.ts`:

```ts
'minha.flag': definir({
  schema: z.boolean(),
  padrao: false,       // o comportamento de HOJE
  publico: false,
  descricao: 'O que faz, e o que acontece ao desligar.'
})
```

Não precisa mexer no painel, no router nem na migration. O painel é dirigido
pelo registro, e o esquema é validado na gravação e de novo na leitura.

O teste `registry.test.ts` já garante que todo padrão passa no próprio esquema.
Acrescente ali a asserção do padrão novo — é o que impede alguém de invertê-lo
sem perceber que está mudando produção.
