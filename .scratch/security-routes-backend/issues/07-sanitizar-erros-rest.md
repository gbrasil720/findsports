# 07: Sanitizar erros das rotas REST

**What to build:** rotas REST preservam respostas públicas conhecidas, devolvem `400` para JSON inválido e uma mensagem genérica para falhas inesperadas, mantendo detalhes somente em logs seguros do servidor.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Exceções inesperadas não devolvem SQL, host, SDK, configuração ou segredo.
- [x] Erros conhecidos preservam os status públicos esperados.
- [x] Logs não incluem corpo, cookie, token nem URL assinada.

