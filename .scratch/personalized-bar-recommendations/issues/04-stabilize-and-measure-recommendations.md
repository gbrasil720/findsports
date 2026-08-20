# 04: Estabilizar e medir as recomendações

**What to build:** O torcedor vê um trio estável durante o dia que se atualiza após ações relevantes. A plataforma mede impressão, abertura e conversões por uma execução opaca sem transformar impressão em afinidade nem expor histórico individual ao bar.

**Blocked by:** 03: Permitir rejeição e reset das sugestões.

**Status:** ready-for-agent

- [ ] A mesma versão comportamental produz o mesmo trio no mesmo dia; ações relevantes invalidam e impressão não invalida.
- [ ] Execuções e eventos permitem atribuir abertura, favorito, rota, telefone, WhatsApp e confirmação tardia.
- [ ] Métricas cobrem rejeição, cobertura, expansão de raio e diversidade sem alterar direitos da análise comercial do bar.
- [ ] O caminho de leitura reutiliza resultado válido sem devolver sugestões obsoletas após uma mutação.
- [ ] O endpoint atende p95 abaixo de 300 ms e erros abaixo de 1% no harness representativo, com plano de execução e ausência de N+1 documentados.

