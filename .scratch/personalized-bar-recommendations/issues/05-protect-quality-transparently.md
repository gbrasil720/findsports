# 05: Aplicar a proteção transparente de qualidade

**What to build:** Recomendações deixam de promover temporariamente um bar quando evidência recente e suficiente indica experiência ruim, enquanto busca, perfil e assinatura continuam intactos. O responsável pelo bar entende no painel o estado e o critério sem receber dados de torcedores.

**Blocked by:** 02: Aprender com o comportamento recente.

**Status:** ready-for-agent

- [ ] A proteção considera somente 60 dias, exige ao menos 10 avaliações e menos de 30% de “voltaria”.
- [ ] Bares sem amostra recebem qualidade neutra e não são prejudicados; a elegibilidade é reavaliada diariamente.
- [ ] A proteção nunca escreve em `isActive`, não altera assinatura e afeta somente o endpoint de recomendações.
- [ ] O painel comunica elegibilidade e critério sem identidade ou histórico individual do torcedor.
- [ ] Testes de fronteira cobrem 9/10 avaliações, 29%/30%, envelhecimento e recuperação por novas avaliações.

