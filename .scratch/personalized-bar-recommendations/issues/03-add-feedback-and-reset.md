# 03: Permitir rejeição e reset das sugestões

**What to build:** O torcedor pode remover uma sugestão com “Não tenho interesse” e pode recomeçar somente a personalização. Rejeitar substitui o card imediatamente e impede o retorno daquele bar por 60 dias; resetar preserva onboarding, preferências, raio, favoritos, avaliações, conta e métricas comerciais.

**Blocked by:** 02: Aprender com o comportamento recente.

**Status:** ready-for-agent

- [ ] Cada card oferece feedback acessível e mantém um trio consistente após a rejeição.
- [ ] A rejeição exclui somente o bar escolhido por 60 dias e não penaliza semelhantes.
- [ ] Configurações oferece “Recomeçar minhas sugestões” com confirmação e estados honestos de sucesso/erro.
- [ ] O reset cria um marco comportamental sem reiniciar onboarding ou apagar dados preservados pelo contrato.
- [ ] Testes provam isolamento por usuário, autorização server-side e preservação de preferências/favoritos/avaliações.

