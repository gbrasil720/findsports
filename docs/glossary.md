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
