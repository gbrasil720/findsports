# 04: Excluir contas sem deixar cobrança órfã

**What to build:** Permitir exclusão permanente mediante senha e confirmação explícita, protegendo contas de bar contra exclusão enquanto uma assinatura externa ainda puder gerar ou representar cobrança vigente.

**Blocked by:** 01: Entregar configurações básicas nas duas experiências.

**Status:** done

- [x] Torcedor e bar precisam informar a senha atual e `EXCLUIR MINHA CONTA` antes da exclusão permanente.
- [x] A política do bar é aplicada no servidor e bloqueia assinatura externa ativa, em trial, pendente ou cancelada com período ainda vigente.
- [x] Assinatura externa encerrada e assinatura manual sem identificador externo permitem exclusão.
- [x] Quando bloqueada, a interface explica o motivo e oferece acesso a `Assinatura e pagamentos`.
- [x] A confirmação informa a exclusão dos dados locais e a possível retenção fiscal pelo provedor; o sucesso limpa a autenticação e retorna à entrada pública.
