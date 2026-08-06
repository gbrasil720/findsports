# Spec — melhoria de copy e conversão da landing Onside

Status: proposta pronta para revisão

Escopo desta entrega: especificação somente; nenhuma mudança de UI, copy, analytics, API ou banco faz parte desta tarefa

Objetivo primário: aumentar cadastros válidos de torcedores por cidade sem criar expectativa falsa sobre a disponibilidade atual do produto

Objetivo secundário: aumentar manifestações qualificadas de bares interessados no piloto sem competir com a jornada principal do torcedor

## 1. Contexto e arquivos analisados

O arquivo citado no pedido, `apps/web/src/router.tsx`, configura o TanStack Router, o cliente tRPC e o React Query, mas não contém a landing. A página efetivamente renderizada em `/` está distribuída entre:

- `apps/web/src/routes/index.tsx`: rota, metadata, JSON-LD e page view;
- `apps/web/src/components/landing/onside-landing.tsx`: narrativa, seções e CTAs;
- `apps/web/src/components/landing/onside-app-demo.tsx`: demonstração ilustrativa do produto;
- `apps/web/src/components/landing/onside-waitlist.tsx`: formulários de torcedor e bar;
- `apps/web/src/components/landing/onside.css`: hierarquia visual, responsividade e estados;
- `apps/web/src/lib/analytics.ts`: eventos atuais da landing;
- `packages/api/src/routers/waitlist.ts`: contrato real de cadastro.

Também foi considerada `specs/new-landing-page.md`, que define a direção de produto e as integrações que não podem regredir.

Não havia navegador conectado durante esta análise. As conclusões abaixo foram verificadas no código e nos contratos, mas a futura implementação ainda exige inspeção visual e interativa em desktop e mobile.

## 2. Decisão estratégica

A home deve falar primeiro com o torcedor. Bares são o segundo ICP e recebem uma jornada própria depois da conversão principal.

A promessa central recomendada é:

> O Onside vai mostrar onde seu jogo será transmitido e como é o ambiente de cada bar antes de você sair de casa.

A ação principal recomendada é:

> Votar pela minha cidade.

A página está em fase de waitlist. Portanto, toda copy deve distinguir com clareza:

- o que existe hoje: cadastro de interesse e priorização por cidade;
- o que é uma prévia: interface, eventos, informações de lotação e painel;
- o que o produto pretende entregar no piloto: busca por jogo, grade confirmada e comparação de ambiente;
- o que ainda não pode ser prometido: reservas, disponibilidade de mesas, métricas de demanda ou cobertura em uma cidade sem funcionalidade e dados reais.

## 3. Hipótese de público e nível de consciência

### 3.1. Torcedor — ICP primário

- Situação de compra: quer assistir a uma partida fora de casa e não confia no Google, Instagram ou na informação desatualizada do bar.
- Dor concreta: perder tempo, chegar ao lugar errado, encontrar o bar lotado, sem som ou transmitindo outra partida.
- Resultado desejado: escolher o bar com segurança antes de sair.
- Alternativas atuais: Google Maps, stories, mensagem direta ao bar e indicação de amigos.
- Objeções principais: “isso já funciona?”, “a informação é confiável?”, “é gratuito?”, “minha cidade estará disponível?” e “por que deixar meus dados?”.
- Nível de consciência assumido: consciente do problema ou da solução. A copy deve funcionar para tráfego frio que reconhece a dor, sem pressupor que a pessoa conhece o Onside.

### 3.2. Bar ou pub — ICP secundário

- Situação de compra: transmite esportes, mas divulga a grade em canais efêmeros e depende de descoberta genérica.
- Dor concreta: pessoas interessadas em uma partida não encontram a casa no momento de decisão.
- Resultado desejado: aparecer para demanda com intenção, jogo e localização definidos.
- Objeções principais: trabalho operacional, custo, qualidade da demanda, o que o piloto entrega e o que acontece depois do cadastro.
- Nível de consciência assumido: consciente do problema. A copy precisa provar o mecanismo antes de pedir seis campos.

O enquadramento usa os [cinco níveis de consciência de Eugene Schwartz](https://x.com/richardrx/status/2011427153133351046): headline e problema encontram o visitante no estágio atual; demonstração, mecanismo e prova o movem até a ação.

## 4. Diagnóstico da landing atual

### 4.1. O que já funciona

- A dor é específica: partida, som, lotação, telões e torcida são mais persuasivos que “encontre bares”.
- A página mostra o mecanismo do produto, em vez de depender apenas de adjetivos.
- O torcedor é tratado como conversão principal, com o bar como caminho secundário.
- “Grátis para torcedores”, “sem newsletter” e “um e-mail no lançamento” reduzem risco.
- Os formulários usam a mutação real e só exibem sucesso após resposta do servidor.
- A interface já diferencia CTAs por posição e mantém analytics básico de clique e sucesso.
- O mock do painel usa traços no lugar de métricas inventadas.

### 4.2. Problemas prioritários

| Prioridade | Problema | Evidência atual | Impacto esperado |
|---|---|---|---|
| P0 | Expectation debt entre promessa e estágio | Hero e demo falam no presente — “mostra”, “transmissões confirmadas”, “mesas disponíveis” — enquanto o FAQ diz “Ainda não” | Reduz confiança quando o visitante entende que o produto não está disponível |
| P0 | Conteúdo ilustrativo pode parecer dado real | Ticker usa horários, campeonatos e bairros; o fallback não recebe um rótulo visível de exemplo | Cria prova aparente e risco de percepção enganosa |
| P0 | Promessas sem produto confirmado | “Reserve quando disponível”, “sua mesa está antes do apito” e “receba ... reservas” aparecem na narrativa | A promessa fica maior que a prova e que o escopo do piloto descrito no repositório |
| P0 | CTA não explica sempre a próxima ação | “Quero na minha cidade”, “Quero assistir junto”, “Cadastrar meu bar”, “Cadastrar interesse” e “Entre no piloto” descrevem ações diferentes | Aumenta esforço mental e enfraquece a continuidade até o formulário |
| P1 | Prova social inexistente ou confundida com redução de risco | “Grátis”, “sem spam” e “primeiras cidades por demanda” são condições, não prova de adoção | O visitante entende a proposta, mas não recebe evidência externa para acreditar nela |
| P1 | A jornada principal é interrompida pelo ICP secundário | A seção para bares aparece antes de confiança e waitlist do torcedor | Desvia atenção antes da conversão primária |
| P1 | Formulário de torcedor não explica o valor de cada dado | Cidade, nome e e-mail são obrigatórios; telefone é opcional, mas seu uso não é explicado | Cada campo adicional aumenta abandono silencioso |
| P1 | Formulário de bar pede muito antes de explicar o pós-cadastro | Seis campos aparecem juntos e o sucesso diz apenas “Interesse registrado” | Eleva carga cognitiva e deixa custo, prazo e próximo passo incertos |
| P1 | FAQ contém metacopy | “A página deixa isso explícito porque uma boa promessa precisa ser crível” fala sobre a própria copy | Quebra a voz da marca e não resolve uma dúvida do cliente |
| P1 | Analytics mede cliques e sucesso, mas não diagnostica a perda | Não há eventos de visualização do formulário, início, erro de validação ou falha de envio | Não é possível separar problema de mensagem, fricção do formulário e erro técnico |
| P2 | Metadata vende disponibilidade presente | Description e schema dizem “Descubra quais bares vão transmitir” | Pode gerar entrada desalinhada por busca ou compartilhamento |

### 4.3. Mecanismos de conversão aplicáveis

- **Teste dos 5 segundos:** o primeiro fold deve responder o que é, para quem é, por que importa, qual é o estágio atual e o que acontece no clique. [Fonte](https://x.com/richardrx/status/2050280273682510230).
- **Outcome bias + Construal Level Theory:** o CTA precisa tornar o próximo resultado concreto; “Votar pela minha cidade” simula melhor a ação que “Quero na minha cidade”. [Fonte](https://x.com/richardrx/status/2058875777739866490).
- **Von Restorff:** uma ação primária deve dominar; o caminho de bares permanece secundário no hero. [Fonte](https://x.com/richardrx/status/2014317885494059106).
- **Carga cognitiva:** campos e escolhas sem justificativa consomem intenção. Se não puderem ser removidos, devem ser agrupados e explicados. [Fonte](https://x.com/richardrx/status/2013597792447394034).
- **Efeito do número preciso:** prova futura deve usar números exatos e verificáveis, nunca “milhares de torcedores”. [Fonte](https://x.com/richardrx/status/2024141244717281514).
- **Qualidade do sinal:** tamanho bruto da waitlist não é tração; a página deve captar demanda qualificável por cidade e perfil. [Fonte](https://x.com/richardrx/status/2045094511106220220).

## 5. Arquitetura de conversão proposta

### 5.1. Funil primário — torcedor

1. Reconhece a dor no hero.
2. Entende que o produto está em pré-lançamento.
3. Vê uma prévia concreta do mecanismo.
4. Confirma como a informação será produzida e atualizada.
5. Entende que seu cadastro funciona como voto por cidade.
6. Informa cidade, nome e e-mail; telefone permanece opcional.
7. Recebe confirmação e próximo passo claros.

### 5.2. Funil secundário — bar

1. Acessa “Para bares” pelo header ou link secundário do hero.
2. Reconhece a perda causada pela grade efêmera.
3. Vê o painel explicitamente rotulado como prévia.
4. Entende o que será entregue no piloto, o esforço esperado e a condição comercial aprovada.
5. Informa dados da casa e contato.
6. Recebe confirmação e próximo passo claros.

### 5.3. Ordem recomendada das seções

1. Header com CTA primário de torcedor.
2. Hero com estágio de pré-lançamento, promessa, CTA e click trigger.
3. Prévia do produto visivelmente rotulada.
4. Problema atual.
5. Proposta e mecanismo.
6. Como funciona em três passos.
7. Confiança e prova verificável.
8. Comunidade e resultado emocional.
9. Waitlist do torcedor.
10. Proposta para bares + prévia do painel + formulário.
11. FAQ por objeção.
12. CTA final do torcedor.
13. Footer.

A seção de bares sai do meio da argumentação do torcedor. Isso mantém um ICP dominante sem excluir o segundo público.

## 6. Copy proposta

### 6.1. Header

- Navegação: `O Onside`, `Como funciona`, `Para bares`, `Dúvidas`.
- CTA primário: `Votar pela minha cidade`.
- O CTA mobile e desktop devem usar o mesmo label.

### 6.2. Hero — recomendação principal

Eyebrow:

> O ONSIDE ESTÁ CHEGANDO

Headline:

> SAIBA ONDE SEU JOGO VAI PASSAR. ANTES DE SAIR DE CASA.

Subheadline:

> O Onside vai reunir bares que confirmaram a transmissão e mostrar distância, lotação, som, telões e perfil da torcida. Vote na sua cidade para ajudar a definir o primeiro lançamento.

CTA primário:

> Votar pela minha cidade →

Click trigger:

> Grátis para torcedores · sem newsletter · 1 e-mail no lançamento

CTA secundário:

> Quero participar com meu bar ↗

Anotação: o hero passa do presente para o futuro, comunica o estágio antes da promessa e liga o CTA ao mecanismo real de priorização.

### 6.3. Alternativas de headline para pesquisa ou teste

- Opção A — `Saiba onde seu jogo vai passar. Antes de sair de casa.` Recomendada por equilibrar dor, resultado e clareza.
- Opção B — `Não chegue ao bar para descobrir que o jogo não vai passar.` Mais forte para tráfego frio e consciente do problema.
- Opção C — `Seu jogo vai passar onde? O Onside vai mostrar.` Mais curta e conversacional, mas depende mais da subheadline.

Não testar variações pequenas de pontuação ou cor. Se houver volume suficiente, testar ângulos materialmente diferentes.

### 6.4. Prévia do produto

Rótulo visível sobre o telefone:

> PRÉVIA DO PRODUTO · AINDA NÃO DISPONÍVEL

Legenda:

> Exemplo de como o Onside pretende mostrar partidas e bares no piloto.

Regras:

- A legenda não pode ficar apenas para leitor de tela.
- Horários, placares, lotação e estabelecimentos fictícios devem ser marcados como demonstração.
- Se o ticker tiver eventos reais vindos da API, pode usar `Agenda confirmada pelos bares`.
- Se cair no fallback, deve trocar para uma faixa de benefícios sem datas, bairros ou aparência de agenda ao vivo. Exemplo: `BUSQUE PELO JOGO · COMPARE O AMBIENTE · VEJA QUANDO A GRADE FOI ATUALIZADA`.

### 6.5. Problema

Kicker:

> O PROBLEMA

Headline:

> O BAR APARECE NA BUSCA. A GRADE DO SEU JOGO, NÃO.

Itens:

1. `Você encontra o bar, não a transmissão.` — O Google mostra endereço e horário, mas não confirma qual partida estará no telão ou se haverá som.
2. `Os stories somem antes da rodada.` — A programação fica espalhada e quase nunca explica lotação, estrutura ou perfil da torcida.
3. `A dúvida só acaba quando você chega.` — Lotado, sem som ou em outro jogo: hoje, a confirmação vem tarde demais.

Anotação: preservar exemplos concretos e remover labels abstratos como “informação descartável” quando não acrescentarem informação nova.

### 6.6. Definição e mecanismo

Kicker:

> A PROPOSTA

Headline:

> A GRADE ESPORTIVA DOS BARES, JOGO POR JOGO.

Body:

> O Onside pretende reunir a programação publicada pelas casas e as confirmações de quem já está no local. Assim, você compara onde assistir sem depender de mais um story ou de uma ligação.

Pontos:

1. `A partida exata, não apenas “passa futebol”.`
2. `A grade publicada pelo bar, com data de atualização.`
3. `Sem confirmação recente? A interface mostra a dúvida.`

### 6.7. Como funciona

Kicker:

> DO JOGO AO BAR

Headline:

> TRÊS PASSOS PARA ESCOLHER ANTES DE SAIR.

Passos:

1. `Busque seu jogo.` Procure por time, campeonato ou esporte.
2. `Compare o ambiente.` Veja distância, lotação informada, som, telões e perfil da torcida.
3. `Vá sabendo o que esperar.` Escolha o bar, chame a galera e confira quando a informação foi atualizada.

Remover da narrativa principal qualquer reserva ou disponibilidade de mesa até que essa capacidade esteja confirmada para o piloto.

### 6.8. Confiança e prova

Kicker:

> INFORMAÇÃO COM ORIGEM

Headline:

> CONFIRMADO APARECE COMO CONFIRMADO. O RESTO APARECE COMO DÚVIDA.

Pontos:

1. `Grade publicada pela casa.` O bar informa o evento específico e a estrutura prevista.
2. `Confirmação de quem está lá.` A comunidade poderá atualizar som, lotação e transmissão.
3. `Horário sempre visível.` Cada informação mostra quando foi publicada ou confirmada.

Essa seção explica o mecanismo de confiança; ela não substitui prova social.

Prova social só deve entrar quando houver material verificável. Ordem de preferência:

1. depoimento específico de torcedor ou bar, com nome, função/cidade e autorização;
2. bar parceiro ou participante do piloto, com logo e relação explicada;
3. número exato de cadastros, cidades ou bares, calculado no servidor e com data de atualização;
4. resultado de pesquisa ou entrevista com metodologia resumida.

Não usar avaliações perfeitas, avatares genéricos, logos sem relação real, contadores arredondados ou escassez fabricada.

### 6.9. Comunidade

Kicker:

> O JOGO É AQUI

Headline:

> O GOL É O MESMO. ASSISTIR JUNTO É OUTRA COISA.

Body:

> O Onside quer ajudar você a encontrar o bar e a torcida que fazem aquela partida valer a saída de casa.

CTA:

> Votar pela minha cidade →

Anotação: manter a função emocional desta seção, mas não introduzir uma terceira intenção de CTA como “Quero assistir junto”.

### 6.10. Waitlist do torcedor

Kicker:

> VOTE PELO PRIMEIRO LANÇAMENTO

Headline:

> LEVE O ONSIDE À SUA CIDADE.

Body:

> As primeiras cidades serão escolhidas pela demanda de torcedores e pela adesão de bares. Seu cadastro conta como um voto e você recebe um e-mail quando houver lançamento por perto.

Redução de risco:

- `Grátis para torcedores`;
- `Sem newsletter`;
- `1 e-mail no lançamento`.

Labels e helpers:

- Cidade: `Em qual cidade você quer usar o Onside?`
- Nome: `Como podemos chamar você?`
- E-mail: `Onde avisamos quando o Onside chegar?`
- Telefone: `Telefone (opcional)`; explicar o uso aprovado. Se não existir um uso real e consentido, não destacar o campo como parte necessária do voto.

CTA de envio:

> Registrar meu voto →

Click trigger:

> Cadastro gratuito · seus dados não entram em uma newsletter

Sucesso:

> Voto registrado para {cidade}.
>
> Vamos avisar pelo e-mail informado quando o Onside avançar por perto.

Duplicidade:

> Este e-mail já está na lista. Se quiser atualizar sua cidade, fale com a gente.

Não orientar a pessoa a usar outro e-mail: isso piora a qualidade da base e não representa uma nova pessoa interessada.

### 6.11. Seção e formulário para bares

Kicker:

> PARA BARES E PUBS

Headline:

> PUBLIQUE SUA GRADE E APAREÇA PARA QUEM JÁ PROCURA AQUELE JOGO.

Body:

> No piloto, o bar informa as transmissões da semana e detalhes como som, telões e lotação. O Onside organiza essa informação para o torcedor encontrar a casa pelo jogo e pela localização.

Benefícios permitidos:

- `Publique a programação da semana em um só lugar.`
- `Atualize estrutura e lotação quando necessário.`
- `Seja encontrado por jogo e distância.`

Não prometer reservas, relatórios de visualização ou intenção de visita antes de essas funções estarem disponíveis e mensuráveis.

CTA da seção:

> Quero participar do piloto ↗

Título do formulário:

> Conte sobre seu bar.

Organização dos campos:

- Grupo `Sobre a casa`: nome do bar, cidade e bairro opcional.
- Grupo `Seu contato`: nome, e-mail e telefone opcional.
- Os campos opcionais devem continuar explicitamente marcados.
- Em mobile, avaliar dois passos curtos somente depois de medir abandono no formulário atual. Não adicionar passos por preferência estética.

CTA de envio:

> Cadastrar meu bar no piloto →

Click trigger condicional:

> Sem compromisso · entraremos em contato pelo e-mail informado

Só usar “gratuito durante o lançamento” depois de confirmar a regra comercial e o que acontece após o piloto.

Sucesso:

> Interesse recebido.
>
> Vamos entrar em contato pelo e-mail informado quando o piloto avançar na sua cidade.

### 6.12. FAQ

Kicker:

> DÚVIDAS ANTES DO CADASTRO

Headline:

> O QUE VOCÊ PRECISA SABER ANTES DE VOTAR.

Perguntas e respostas:

1. `O Onside já funciona na minha cidade?`
   `Ainda não. Estamos medindo a demanda de torcedores e a adesão de bares para escolher as primeiras cidades do piloto.`
2. `O Onside será gratuito para torcedores?`
   `Sim. Buscar partidas, comparar bares e consultar a grade será gratuito para quem assiste.`
3. `Como vou saber se a informação está atualizada?`
   `A proposta é mostrar quem publicou ou confirmou a informação e quando isso aconteceu. Sem confirmação recente, a interface deve deixar a dúvida visível.`
4. `É só para futebol?`
   `Não. Futebol será o ponto de partida, mas a mesma busca pode incluir basquete, vôlei, automobilismo, lutas e outros eventos.`
5. `Como funciona para bares?`
   `O bar manifesta interesse no piloto e informa a casa, a cidade e um contato. Quando a operação avançar naquela região, o Onside entra em contato com os próximos passos.`
6. `Como as primeiras cidades serão escolhidas?`
   `Pela combinação entre votos de torcedores e bares interessados. Por isso os dois formulários pedem a cidade.`
7. `O que acontece com meus dados?`
   `Usamos os dados para registrar o interesse e avisar sobre o lançamento. A resposta final deve refletir a política de privacidade aprovada e conter o link correspondente.`

A resposta de privacidade é um gate: não publicar uma formulação definitiva antes de validar política, retenção e canais de contato.

### 6.13. CTA final

Kicker:

> ONSIDE · O JOGO É AQUI

Headline:

> SEU PRÓXIMO JOGO MERECE UMA RESPOSTA ANTES DE VOCÊ SAIR.

CTA:

> Votar pela minha cidade →

Click trigger:

> Grátis · sem newsletter · 1 e-mail no lançamento

## 7. Metadata recomendada

Title:

> Onside — Saiba onde assistir ao seu jogo

Meta description:

> O Onside vai reunir bares que confirmaram a transmissão do seu jogo. Compare o ambiente e vote para levar o primeiro lançamento à sua cidade.

Open Graph title:

> Onde seu jogo vai passar? O Onside vai mostrar.

Open Graph description:

> Compare bares por jogo, distância, lotação, som, telões e torcida. Vote para ajudar o Onside a chegar à sua cidade.

O JSON-LD deve usar linguagem futura ou de pré-lançamento e não declarar uma oferta operacional apenas porque o cadastro é gratuito.

## 8. Regras editoriais

- Usar português brasileiro direto, casual e confiante.
- Falar com `você`; evitar alternar entre “torcedor”, “usuário” e “pessoa” sem necessidade.
- Usar `bar` como termo principal e `bar ou pub` apenas onde a abrangência importar.
- Preferir `jogo` na copy geral; usar `partida` para evitar repetição.
- Um argumento por seção.
- Benefício primeiro, feature como explicação.
- Nenhum número, depoimento, parceiro, cobertura, escassez ou prazo sem fonte verificável.
- Evitar metacopy sobre marketing, conversão ou credibilidade.
- Evitar presente do indicativo para funções ainda não lançadas.
- Não usar `sem spam`; preferir a condição concreta `1 e-mail no lançamento` quando ela for verdadeira.
- Reservas e mesas só entram na copy depois de contrato funcional, escopo do piloto e critério de disponibilidade aprovados.

## 9. Instrumentação e métricas

### 9.1. Conversão primária

`cadastros únicos de torcedores concluídos / visitantes únicos da landing`

Segmentar por origem, campanha, dispositivo e novo/recorrente quando esses dados estiverem disponíveis. Nunca enviar cidade, nome, e-mail, telefone, nome do bar ou bairro ao PostHog.

### 9.2. Conversão secundária

`cadastros únicos de bares concluídos / visitantes únicos que visualizaram a seção de bares`

### 9.3. Funil de diagnóstico

Eventos recomendados:

- `landing_viewed` — já existe;
- `landing_cta_clicked` com `cta` — já existe;
- `waitlist_form_viewed` com `role`;
- `waitlist_form_started` com `role`;
- `waitlist_submit_attempted` com `role`;
- `waitlist_validation_failed` com `role` e lista de nomes de campos, nunca valores;
- `waitlist_submit_failed` com `role` e categoria `conflict | network | server | unknown`;
- `waitlist_submitted` com `role` — já existe;
- `demo_view_changed` com `view` — pode substituir os dois IDs atuais se isso simplificar análise.

Não emitir duas vezes o mesmo submit por causa do listener global de `[data-cta]` e do handler do formulário. Para cada interação, deve existir uma única fonte de captura.

### 9.4. Guardrails

- taxa de erro de validação por campo;
- taxa de conflito por e-mail;
- taxa de falha técnica;
- abandono entre início e sucesso do formulário;
- cliques no caminho de bar vindos do hero;
- qualidade da waitlist por cidade e proporção de contatos válidos, analisadas no backend e nunca expostas como PII ao analytics.

Cadastros medem interesse, não tração. Quando o produto lançar, a métrica precisa evoluir para ativação: retorno e conclusão da busca que entrega valor.

## 10. Plano de validação

### Fase 0 — pesquisa e gates

Antes de implementar a copy final, responder:

1. De onde vem o tráfego esperado: social próprio, busca, mídia paga, parceiros ou contato direto com bares?
2. O piloto terá reservas ou apenas descoberta e grade?
3. O telefone do torcedor será usado para quê e com qual consentimento?
4. Participar do piloto será gratuito para bares? Até quando e o que ocorre depois?
5. Existem números, entrevistas, depoimentos ou bares parceiros publicáveis?
6. Qual é o próximo passo real depois do cadastro de um bar?
7. A política de privacidade cobre a waitlist e está disponível por URL?

### Fase 1 — correções de honestidade

Implementar sem A/B test:

- estágio de pré-lançamento visível;
- linguagem futura consistente;
- rótulo de prévia nos mocks;
- fallback do ticker sem agenda fictícia;
- remoção de promessas não confirmadas;
- FAQ sem metacopy;
- sucesso e conflito com próximo passo correto.

Essas mudanças corrigem expectativa e não devem depender de experimento para serem adotadas.

### Fase 2 — baseline

Instrumentar o funil e observar ao menos:

- exposição ao CTA;
- clique;
- visualização do formulário;
- início;
- tentativa;
- erro;
- sucesso.

Registrar baseline por origem e dispositivo antes de atribuir qualquer melhora à copy.

### Fase 3 — experimentos de alto impacto

Backlog recomendado:

1. Headline A orientada a resultado versus headline B orientada à perda.
2. CTA `Votar pela minha cidade` versus `Levar o Onside à minha cidade`.
3. Formulário de bar em uma tela versus dois grupos progressivos no mobile.
4. Prova qualitativa real versus prova quantitativa real, quando ambas existirem.

Não rodar testes subdimensionados. Calcular amostra mínima antes; com pouco tráfego, preferir cinco entrevistas bem conduzidas, gravações de sessão e teste moderado de compreensão. [Fonte](https://x.com/richardrx/status/2061463480868229189).

## 11. Arquivos previstos para futura implementação

- `apps/web/src/routes/index.tsx`: metadata e JSON-LD.
- `apps/web/src/components/landing/onside-landing.tsx`: copy, ordem das seções, CTA e fallback do ticker.
- `apps/web/src/components/landing/onside-app-demo.tsx`: rótulo visível de prévia e remoção de promessas não confirmadas.
- `apps/web/src/components/landing/onside-waitlist.tsx`: labels, helpers, CTA, erros e estados de sucesso.
- `apps/web/src/components/landing/onside.css`: suporte visual à nova hierarquia e aos click triggers, sem redesenho gratuito.
- `apps/web/src/lib/analytics.ts`: eventos de diagnóstico e tipos.
- Testes existentes mais próximos da rota, analytics e formulários; criar novos testes apenas onde não houver cobertura adequada.

Mudanças no contrato de API ou banco ficam fora do escopo por padrão. A copy deve respeitar o contrato real; qualquer remoção de campo obrigatório exige uma decisão de produto e uma alteração coordenada.

## 12. Critérios de aceite da futura implementação

- Em cinco segundos, uma pessoa nova consegue dizer o que o Onside pretende fazer, para quem, qual problema resolve, que ainda não lançou e qual ação está disponível agora.
- O torcedor é inequivocamente o ICP primário da home.
- Todos os CTAs de torcedor usam uma intenção consistente; todos os CTAs de bar usam outra intenção consistente.
- Nenhuma parte ilustrativa parece agenda, disponibilidade, métrica ou prova real sem rótulo.
- Reservas, mesas e métricas para bares não são prometidas sem confirmação de escopo.
- A prova social, se adicionada, é específica, verificável e autorizada.
- O formulário de torcedor preserva cidade, nome e e-mail requeridos e telefone opcional, com propósito claro.
- O formulário de bar preserva os campos do contrato e deixa opcionais explícitos.
- Estados de sucesso, conflito e erro explicam o que aconteceu e o que fazer depois.
- Analytics permite reconstruir os dois funis e não envia PII.
- Metadata e conteúdo visível descrevem o mesmo estágio de produto.
- A página continua usando a mutação real `waitlist.join` e não exibe sucesso antes do servidor.
- A implementação passa por revisão visual em desktop e mobile, teclado, leitor de tela, redução de movimento e estados de carregamento/erro/sucesso.

## 13. Resultado esperado

A landing deixa de vender uma disponibilidade que ainda não existe e passa a vender uma decisão concreta e honesta: ajudar o Onside a chegar à cidade certa. A proposta continua ambiciosa, mas cada promessa recebe um mecanismo, cada CTA descreve o próximo passo e cada formulário explica por que vale o esforço.
