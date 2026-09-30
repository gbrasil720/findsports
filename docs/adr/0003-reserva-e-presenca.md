# ADR 0003: Reserva de mesa e presença confirmada como features distintas

- Status: aceita
- Data: 2026-09-13
- Tickets: WEB-38 (guarda-chuva, precisa ser fatiado); decisões dos pontos em
  aberto em WEB-121, WEB-122, WEB-123 e WEB-132 (2026-09-29)

## Contexto

O WEB-38 especificava um MVP de pedido de reserva por jogo, com confirmação
manual do dono. O próprio ticket registra a razão da confirmação manual: não
existe inventário de mesas, então confirmação automática criaria overbooking.

Surgiu depois a ideia de o torcedor apenas "confirmar que vai assistir o jogo
ali", para o bar se programar com antecedência — descrita como uma "reserva que
não é reserva".

A entrevista sobre essa ideia mostrou que ela não é uma variação da reserva, e
mostrou também que o desenho original da reserva estava incompleto: o benefício
do torcedor, a prova de comparecimento e a atribuição não existiam em lugar
nenhum do contrato.

## Decisões confirmadas

### Separação

- Reserva e presença são duas features distintas, com contratos, incentivos e
  superfícies próprias. Não compartilham máquina de estado.
- Reserva promete um recurso escasso e dá contrapartida ao torcedor. Presença
  não promete nada e não dá contrapartida.
- Uma reserva implica presença para efeito de contagem. O painel do bar nunca
  soma reservas e presenças como números independentes: seriam as mesmas
  pessoas contadas duas vezes.

### Reserva

- Mantida a confirmação manual do dono, pela razão já registrada no WEB-38:
  sem inventário de mesas, confirmação automática é promessa que a plataforma
  não pode cumprir.
- Ao criar a reserva, a plataforma gera um código curto de validação.
- O brinde do bar é o motor do lado do torcedor. Sem ele, a reserva oferece
  apenas uma mesa que a plataforma não consegue garantir.

### Oferta da casa

- Cada bar configura, opcionalmente, o que oferece a quem chega pela Onside.
  A oferta é do bar, não da plataforma; a plataforma não define nem sugere
  valor.
- A oferta é opcional. Bar sem oferta configurada continua recebendo reservas;
  o torcedor apenas não recebe contrapartida material.
- O texto da oferta é copiado para dentro da reserva no momento da criação e
  não muda depois. A configuração do bar é mutável; a promessa feita a um
  torcedor específico é imutável. Sem esse congelamento, o bar pode alterar
  unilateralmente uma promessa já aceita.

### Código de validação

- O código resolve o bar. A página de validação é única e não tem seletor de
  bar.
- A autorização exige que a sessão seja dona do bar que o código resolve.
  Checar apenas `role === 'pub'` permitiria que o dono de outro bar queimasse
  o código, desviando a atribuição e deixando o torcedor sem o brinde ao
  chegar. É sabotagem de um clique e sem rastro.
- Tentativas de validação são limitadas por sessão. O espaço de um código curto
  é pequeno; sem limite, é possível varrer códigos até acertar um do próprio
  bar e registrar comparecimento falso.
- O código admite tantos usos quanto a quantidade de pessoas da reserva. Isso
  cobre o grupo que chega escalonado, que é o comportamento real.
- A validação é uma digitação só. A tela abre com o resumo da reserva e um
  contador (`2 de 4 validados`), e cada uso é um `+1` com confirmação e desfazer
  curto. Exigir N digitações do mesmo código não sobrevive a um sábado de jogo,
  e `+1` sem proteção de duplo envio rouba o brinde de um torcedor real.
- Não há leitura por QR code nem aplicativo de garçom nesta versão. Escaneamento
  exigiria identidade de equipe — papel novo, convite, escopo, revogação — ou
  compartilhamento do login do dono, que dá acesso a faturamento e assinatura.
  Digitação de código não exige nenhum dos dois e não depende de haver alguém
  na porta.

### Janela de validação

- Abre 3 horas antes de `event.startsAt`, para cobrir quem chega no pré-jogo —
  exatamente o público que o bar mais quer.
- Fecha 3 horas depois do fim derivado do evento. A folga existe para o caso de
  a rede do bar cair em dia de clássico: o código pode ser anotado e validado
  depois.
- `event.endsAt` é nullable em `packages/db/src/schema/platform.ts`. O fim
  derivado é `endsAt ?? startsAt + duração padrão`, calculado por uma única
  função compartilhada. Nenhum arquivo deve somar a duração padrão por conta
  própria.

### Comparecimento

- O comparecimento tem duas fontes independentes, ambas declaradas: o registro
  do bar na página de validação, e a resposta do torcedor a uma pergunta
  pós-jogo.
- A pergunta ao torcedor existe porque quem valida é quem tem interesse em não
  validar: cada `+1` custa um brinde real ao bar e só rende um ponto num
  gráfico que a Onside usa para cobrar dele. Não registrar é gratuito,
  invisível e não gera reclamação — o torcedor recebeu o que queria.
- Sem a segunda fonte, no-show e não-registro ficam indistinguíveis, e o bar
  pouco engajado aparece como ineficaz por um número que ele mesmo deixou de
  produzir.
- O MVP registra as duas fontes e não julga. Não há sistema de disputa nem
  punição automática. O padrão "torcedor diz que foi, bar nunca registra" gera
  alerta interno, não sanção.

### Recorte de plano

- Reserva de mesa é exclusiva do plano Elite.
- A oferta da casa é configurável apenas por bares Elite. Ela só existe atrelada
  a uma reserva, e reserva é Elite; separar as duas gates criaria uma oferta que
  nenhum torcedor consegue resgatar.
- O benefício vale nos estados `trialing` e `active` da assinatura. Um bar em
  teste precisa conseguir exercitar a feature que está avaliando.
- Presença confirmada é gratuita para toda a base. Ela depende de densidade: o
  único retorno ao torcedor é ver quantos confirmaram, e restringir a emissão a
  um plano impede o volume que faz o número significar alguma coisa.

### Disposição do bar

- Plano Elite diz que o bar **pode** receber reservas. Não diz que ele **quer**:
  muitos estabelecimentos simplesmente não trabalham com reserva de mesa.
- O dono liga e desliga o recebimento de reservas no painel, independente do
  plano. Desligado é o padrão: assinar Elite não inscreve ninguém numa operação
  que ele não pediu.
- Com o recebimento desligado, o torcedor cai no mesmo caminho de quem vê um
  bar sem Elite — WhatsApp e rota, sem botão morto. Não há UX nova do lado do
  torcedor.
- Desligar impede **novos** pedidos. Reservas já criadas continuam legíveis,
  canceláveis e com código válido dentro da janela, pela mesma razão que vale
  para o downgrade de plano: o desenho não pode prender o torcedor numa reserva
  que ele não consegue resolver.
- A oferta da casa some do perfil público junto com o recebimento. O único
  caminho de resgate da oferta é o código, e código só nasce de reserva
  (`reservation_code.reservation_id` é `notNull`). Anunciar oferta sem caminho
  de resgate é exatamente a promessa sem lastro que esta ADR existe para
  evitar.

Três níveis distintos governam a disponibilidade, e confundi-los foi a origem
desta seção:

| Nível | Pergunta | Onde se decide |
|---|---|---|
| Capacidade | o bar **pode**? | plano Elite, validado no servidor |
| Disposição | o bar **quer**? | interruptor do dono no painel |
| Disponibilidade | ainda **cabe** neste jogo? | teto de pessoas confirmadas, ver "Teto por jogo" |

### Presença

- O torcedor marca que vai assistir a um jogo em um bar. Não gera código, não
  gera brinde, não exige ação do bar.
- O único retorno ao torcedor é ver quantas pessoas confirmaram.
- O bar nunca vê o número absoluto de presenças. Vê um sinal relativo de
  interesse.
- A razão: marcar presença é gratuito e furar também. Não existe verificação
  possível, então o bar nunca descobre a taxa real de furo e nunca aprende a
  descontar o número. Um número absoluto e inflado, com aparência de precisão,
  levaria o dono a comprar estoque e escalar equipe para uma demanda que não
  aparece — trocando o erro calibrado da experiência dele por um erro da
  plataforma, com prejuízo real e culpado com nome.
- Consequência aceita conscientemente: presença **não** é instrumento de
  planejamento de estoque. A formulação original da ideia — "para o bar se
  programar com antecedência" — não é entregue nesta versão. O que se entrega é
  sinal de demanda relativa para o bar e prova social para o torcedor.

### Nomenclatura na interface

Decidido no WEB-121, opção (a): verbos distantes.

- A reserva se chama **"Reservar mesa"**. A presença se chama **"Vou assistir
  aqui"**. A interface do torcedor não usa "confirmar" nem "presença" para a
  segunda ação; "presença confirmada" continua sendo o termo interno, no código
  e no glossário.
- No perfil de bar que recebe reservas, as duas ações aparecem juntas, sem uma
  subordinada à outra. Esconder a presença num link secundário tiraria o
  público justamente onde ele é maior.
- Junto das duas, um aviso curto diz que são coisas diferentes e por quê.
  Texto: "“Vou assistir aqui” não reserva mesa: só avisa ao bar que você vai.
  Para garantir lugar, use “Reservar mesa”." O aviso aparece só quando as duas
  ações coexistem.
- Depois de marcar presença, o botão vira "Você vai assistir aqui", com
  desfazer.
- No painel do bar, os dois dados se chamam **"Reservas"** e **"Interesse"**.
  Interesse é sinal relativo, não número (ver "Baseline do sinal de
  interesse"), então os dois nunca aparecem como contagens somáveis.

### Teto por jogo

Decidido no WEB-132, opção (c): teto padrão no bar, com override por jogo.

- O teto é um número de **pessoas** (soma de `party_size`), não de pedidos. O
  dono define um valor padrão para o bar e pode sobrescrevê-lo em cada jogo.
- O teto é opcional. Sem valor definido, o jogo não tem teto, que é o
  comportamento de hoje.
- **`pending` não conta para o teto.** Só reservas `confirmed` ocupam lugar.
  Uma rajada de pedidos que o dono ainda não respondeu não pode trancar os
  pedidos reais. Consequência aceita: o dono pode confirmar mais gente do que o
  teto, porque o teto só fecha **novos pedidos** depois que as confirmações o
  atingem. O painel mostra quantos lugares já estão confirmados para o dono
  decidir.
- Ao atingir o teto, o jogo para de receber pedidos: o servidor recusa a
  criação (junto da checagem de disposição) e o perfil mostra "Reservas
  esgotadas para este jogo". O torcedor continua com "Vou assistir aqui" e com
  WhatsApp e rota. Recusar ou cancelar uma reserva confirmada libera o lugar.
- Parar de receber não é confirmar: nada é aceito sozinho, e a proibição de
  confirmação automática por capacidade continua valendo.

### Baseline do sinal de interesse

Decidido no WEB-122, opção (b): histórico do próprio bar.

- O sinal compara o interesse no jogo com a média dos jogos anteriores do
  mesmo bar ("3x a média deste bar").
- Enquanto o bar não tem histórico suficiente, o painel não mostra número nem
  faixa. Mostra um aviso: "Estamos reunindo dados sobre o interesse no seu bar.
  O sinal aparece depois dos primeiros jogos." Faixa ou número sem base seria
  a precisão inventada que esta ADR proíbe.
- Histórico suficiente: 5 jogos encerrados do bar com pelo menos uma presença.
  Valor provisório.

### Piso de exibição da contagem

Decidido no WEB-123.

- Piso de **15 pessoas**. Abaixo dele a contagem não aparece e fica só o
  botão "Vou assistir aqui", sem texto no lugar. "1 torcedor confirmou"
  sinaliza bar vazio e é pior que não mostrar nada.
- A partir de 15, a contagem é visível para todos, **antes** de confirmar.
  Esconder até a confirmação resolveria o carona, mas é coercitivo e derruba
  adesão.

### Limitações das decisões acima

Nenhuma foi validada com usuário ou com tráfego real. Os textos da
nomenclatura saíram de julgamento, não de teste em campo. O piso de 15, o teto
e o critério de histórico suficiente são palpites e devem ser revistos depois
dos primeiros jogos com volume.

## Fora de escopo

Mantido o que o WEB-38 já excluía: pagamento antecipado, taxa de reserva,
escolha de mesa, fila de espera, combinação automática de mesas, reserva sem
jogo, integração com sistemas de salão e confirmação automática por capacidade.

Somam-se a esses, por decisão desta ADR: leitura por QR code, papel `staff` ou
qualquer identidade de equipe, aplicativo de garçom, e lembrete no dia do jogo
para reconfirmar presença.
