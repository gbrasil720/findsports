# 03: Fazer a admissão da waitlist falhar fechada

**What to build:** o deploy declara sua política de admissão como `open` ou `invite-only`; em modo de convite, configuração ausente ou inválida recusa novos cadastros. Login de contas existentes não consulta aprovação nem papel antes de validar credenciais.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] `invite-only` recusa signup quando a configuração não pode ser lida.
- [x] `open` aceita signup sem depender da tabela de configuração.
- [x] Login inválido não distingue usuário desconhecido, pendente, aprovado ou admin.
- [x] A queda para o valor seguro gera log sem dados pessoais ou segredos.

