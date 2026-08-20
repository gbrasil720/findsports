# 02: Aprender com o comportamento recente

**What to build:** O trio reage às ações reais dos últimos 60 dias, distinguindo intenção forte, visualização originada por jogo e visualização direta. Favoritos e experiências positivas formam uma assinatura estruturada de experiência; desfavoritar afasta somente aquele bar por 30 dias.

**Blocked by:** 01: Entregar o trio personalizado no cold start.

**Status:** ready-for-agent

- [ ] A decadência de 7/21/45/60 dias, os pesos 30/20/15/18/17 e o retorno decrescente são aplicados no servidor.
- [ ] Visualização com origem em jogo vale mais que visualização direta; contatos, rota e “voltaria” mantêm a hierarquia aprovada.
- [ ] Similaridade usa comodidades, faixa de telas e bairro secundário, sem nome, descrição livre ou plano.
- [ ] Desfavoritar registra histórico antes de remover o favorito e exclui somente aquele bar por 30 dias.
- [ ] Consultas restringem histórico aos candidatos e às janelas necessárias, com índices alinhados aos padrões de leitura.

