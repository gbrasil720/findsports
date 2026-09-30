# Glossário de domínio

## Recomendação de bar

Bar comercialmente elegível, não favoritado e não rejeitado que o algoritmo
seleciona para a visão geral do perfil do torcedor.

## Trio de sugestões

Conjunto ordenado de até três recomendações: confiança, diversidade e
descoberta. “Trio” descreve a capacidade desejada; pode haver menos itens
quando não existem três candidatos elegíveis.

## Afinidade

Estimativa explicável de compatibilidade entre torcedor e bar, derivada apenas
do próprio torcedor e de atributos estruturados do bar nesta versão.

## Intenção direta

Ação do torcedor sobre o próprio bar candidato. Da maior para a menor força:
"voltaria", contato/rota, visualização originada por jogo e visualização
direta.

## Visualização originada por jogo

Abertura do perfil de um bar cujo evento comercial possui `sourceEventId`.
Tem força média porque vincula a curiosidade a uma programação esportiva.

## Assinatura de experiência

Perfil estruturado formado por comodidades, faixa de telas e padrão geográfico
dos bares favoritados, avaliados positivamente ou associados a alta intenção.

## Descoberta

Terceira recomendação que aumenta diversidade sem cair abaixo do piso de 70%
da relevância do primeiro resultado.

## Diversidade

Diferença útil de bairro, esporte ou comodidades entre recomendações. Não é
aleatoriedade nem autorização para apresentar candidato irrelevante.

## Bar comercialmente ativo

Bar com `bar.isActive = true`, mantido pelo ciclo de assinatura. Não significa
que esteja aberto agora, tenha evento futuro ou tenha usado a plataforma
recentemente.

## Proteção de qualidade

Supressão temporária apenas das recomendações quando um bar reúne ao menos dez
avaliações nos últimos 60 dias e menos de 30% de respostas "voltaria". Não
altera assinatura, `isActive`, busca normal ou perfil público.

## Rejeição moderada

Desfavoritar. Exclui somente aquele bar das recomendações por 30 dias e não
penaliza candidatos semelhantes.

## Rejeição explícita

"Não tenho interesse" ou "não voltaria". Exclui somente aquele bar por 60
dias. "Não voltaria" pode reduzir levemente similaridade, sem generalização
forte para esporte ou bairro.

## Expansão de raio

Busca gradual além do raio configurado, limitada a 1,5 vez esse valor e sempre
identificada ao torcedor.

## Execução de recomendação

Cálculo identificável e determinístico que produz o trio de um torcedor para
um dia/versão de comportamento. Seu identificador permite atribuir ações sem
expor o histórico individual ao bar.

## Reset de sugestões

Marco que faz o algoritmo ignorar comportamento anterior e limpar rejeições
específicas de recomendação. Preserva onboarding, esportes, raio, favoritos,
avaliações, conta e métricas comerciais.

## Configurações de conta

Capacidades compartilhadas de segurança da conta — e-mail somente leitura,
senha, sessões, 2FA, saída e exclusão — apresentadas dentro da experiência
específica do torcedor ou do bar. Não é uma terceira página genérica.

## Sessão

Acesso autenticado persistido pelo Better Auth para um navegador. Pode ser a
sessão atual, encerrada pela ação de sair, ou outra sessão revogável pela tela
de configurações.

## Dispositivo confiável

Navegador dispensado do desafio de segundo fator por até 30 dias após escolha
explícita no login. É um cookie local e não uma sessão administrável.

## Segundo fator TOTP

Código temporário gerado por aplicativo autenticador. Só passa a proteger a
conta depois que o primeiro código for validado durante a ativação.

## Código de recuperação

Código de uso único entregue na ativação ou regeneração do 2FA. É a única
recuperação autônoma quando o autenticador não está disponível.

## Encerramento efetivo de assinatura

Momento em que uma assinatura externa já não possui período contratado
vigente. Uma solicitação de cancelamento ainda dentro do período pago não é
encerramento efetivo e não autoriza excluir a conta do bar.

## Reserva de mesa

Pedido do torcedor para um jogo futuro publicado por um bar, confirmado
manualmente pelo dono. Promete mesa sem que exista inventário de mesas: a
garantia vem do julgamento do dono, não da plataforma.

## Presença confirmada

Declaração do torcedor de que pretende assistir a um jogo em um bar. Não gera
código, não gera brinde e não exige ação do bar. Uma reserva implica presença;
os dois números nunca se somam. É o termo interno: na interface do torcedor a
ação se chama "Vou assistir aqui", e a reserva, "Reservar mesa". A contagem só
aparece ao torcedor a partir de 15 pessoas.

## Sinal de interesse

Forma como a presença chega ao bar: posição relativa, nunca contagem absoluta.
Existe porque marcar presença e furar são igualmente gratuitos, não há
verificação possível e um número absoluto inflado levaria o dono a gastar
estoque e equipe com demanda que não aparece. Compara o jogo com o histórico do
próprio bar; sem histórico suficiente, o painel mostra que ainda está reunindo
dados, sem número nem faixa. No painel se chama "Interesse".

## Teto por jogo

Número máximo de pessoas com reserva confirmada num jogo, definido pelo dono
como padrão do bar e ajustável por jogo. Pedidos pendentes não contam. Ao
atingir o teto o jogo para de receber pedidos; nada é confirmado sozinho.

## Oferta da casa

Texto curto e opcional em que o bar decide o que oferece a quem chega pela
Onside. É promessa do bar ao cliente dele: a Onside não define, sugere nem
valida o conteúdo. Configurar exige plano Elite vigente (`active`, ou
`trialing` dentro do período); exibir exige também o recebimento de reservas
ligado, porque o único resgate da oferta é o código de uma reserva. Sem uma das
duas coisas o texto some do perfil público, mas continua guardado. Uma reserva
copia o texto na criação e não acompanha mudanças posteriores.

## Recebimento de reservas

Interruptor do bar, no painel, que diz se ele **quer** receber pedidos de
reserva pela Onside. Desligado por padrão: assinar Elite dá a capacidade, não
inscreve o bar numa operação que ele não pediu. Ligar exige Elite vigente; o
recebimento efetivo exige as duas coisas. Desligar só barra pedidos novos —
reservas já criadas continuam legíveis, canceláveis e com código válido dentro
da janela. Não é teto por jogo (WEB-132).

## Código de validação

Código curto emitido com a reserva, digitado pelo bar para provar que o
torcedor veio da Onside e liberar a oferta da casa. Resolve o bar sozinho, mas
só é aceito de uma sessão dona daquele bar. Admite tantos usos quanto a
quantidade de pessoas da reserva, porque o grupo chega escalonado.

## Janela de validação

Intervalo em que o código é aceito: de 3 horas antes de `startsAt` até 3 horas
depois do fim derivado. Abre cedo para cobrir o pré-jogo e fecha tarde para
sobreviver a queda de rede em dia de clássico.

## Chegada

Uma pessoa da reserva registrada pelo bar na página de validação — um `+1` no
código. Só se registra em reserva confirmada e dentro da janela de validação.
Pode ser desfeita por um prazo curto; desfazer devolve o uso ao código e
mantém o registro para auditoria.

## Cardápio e preço médio

Link público para o cardápio do bar e gasto médio por pessoa com comida e
bebida, sem taxa de serviço. Os dois são declarados pelo bar: o perfil mostra
"Preço médio por pessoa informado pelo bar", nunca como média calculada pela
Onside. Configurar e exibir exigem Pro ou Elite vigente (`active`, ou
`trialing` dentro do período); sem ele os dados somem do perfil público, mas
continuam guardados. O link aceita só `http`/`https`. O teto do gasto médio é
R$ 1.000,00 por pessoa — provisório, sem definição comercial ainda — e vive
só em `packages/db/src/bar-menu.ts`.

## Fim derivado do evento

`endsAt ?? startsAt + duração padrão`. Existe porque `event.endsAt` é opcional
no schema e "fim do jogo" precisa ser definido para todo evento. Calculado por
uma função única.

## Comparecimento

Registro de que o torcedor de fato foi ao bar. Tem duas fontes declaradas e
independentes — o bar validando o código e o torcedor respondendo depois do
jogo. A segunda existe porque cada validação custa um brinde ao bar e só rende
um dado que será usado para cobrar dele: não registrar é gratuito e invisível.
