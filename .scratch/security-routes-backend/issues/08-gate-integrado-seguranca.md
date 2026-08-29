# 08: Executar o gate integrado de segurança

**What to build:** os seis fixes são comprovados juntos sem ampliar escopo: testes focados e completos, typecheck forçado, build web e integrações somente em banco descartável produzem evidência reproduzível de aceite.

**Blocked by:** 01: Verificar e-mail antes de liberar a conta; 02: Vincular identidade verificada ao cliente Dodo; 03: Fazer a admissão da waitlist falhar fechada; 04: Fechar a projeção pública e os favoritos; 05: Restringir origens confiáveis do Better Auth; 06: Validar loja e caminho exatos das fotos; 07: Sanitizar erros das rotas REST.

**Status:** completed

- [x] Todos os critérios da spec passam com testes automatizados proporcionais ao risco.
- [x] Testes mutáveis usam somente banco local ou CI comprovadamente descartável.
- [x] Typecheck forçado, build e higiene do diff passam.
- [x] A revisão final não encontra bypass de rota, role ou recurso introduzido pelos fixes.
