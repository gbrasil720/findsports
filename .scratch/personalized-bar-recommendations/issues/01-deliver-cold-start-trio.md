# 01: Entregar o trio personalizado no cold start

**What to build:** Na visão geral do perfil, o torcedor recebe até três recomendações explicáveis calculadas com seus esportes do onboarding, distância, jogos, qualidade e diversidade. A lista respeita a elegibilidade comercial, nunca inclui favoritos, não usa o nível do plano no score e identifica qualquer resultado obtido pela expansão controlada do raio.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O servidor retorna um trio determinístico com score e motivos definidos pelo contrato, incluindo cold start e menos de três candidatos.
- [ ] O candidato é reduzido espacialmente antes do enriquecimento, usa agregação em lote e não introduz N+1 ou varredura integral do catálogo.
- [ ] O perfil substitui “Perto de você” por “Sugestões para você” com estados de carregamento, erro, vazio e aviso de expansão do raio.
- [ ] Favoritos e bares sem assinatura ativa nunca aparecem; Starter, Pro e Elite recebem tratamento orgânico idêntico.
- [ ] Testes unitários cobrem score, diversidade, motivo dominante, raio e determinismo; integração com banco só roda em banco comprovadamente descartável.

