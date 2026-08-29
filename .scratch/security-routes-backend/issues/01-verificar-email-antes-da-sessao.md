# 01: Verificar e-mail antes de liberar a conta

**What to build:** o cadastro envia um e-mail transacional Resend com a identidade visual do Onside e não libera superfícies protegidas antes da confirmação. Para bares, concluir o onboarding leva a uma etapa dedicada de verificação; somente a confirmação libera a seleção de planos. O reenvio usa resposta neutra e não revela se uma conta existe.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Cadastro por senha não cria sessão utilizável antes da verificação.
- [x] O e-mail Resend contém versões HTML e texto, CTA seguro e identidade visual coerente com o produto.
- [x] Um bar conclui o onboarding, verifica o e-mail e somente então acessa os planos.
- [x] Onboarding, checkout e demais superfícies protegidas recusam e-mail não verificado no servidor.
- [x] Reenvio e cadastro duplicado não permitem enumeração de contas.

