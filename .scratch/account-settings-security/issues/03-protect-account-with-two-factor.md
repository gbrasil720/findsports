# 03: Proteger a conta com 2FA de ponta a ponta

**What to build:** Permitir ativar e administrar TOTP nas configurações e concluir o login protegido usando autenticador ou código de recuperação, sem criar uma janela em que 2FA possa ser ativado mas não validado no acesso.

**Blocked by:** 01: Entregar configurações básicas nas duas experiências.

**Status:** done

- [x] O schema e a autenticação suportam TOTP, códigos de recuperação e o rate limit existente sem alterar contas existentes.
- [x] A ativação exige senha, apresenta QR e chave manual, valida o primeiro TOTP e entrega códigos de recuperação com cópia e download.
- [x] É possível regenerar códigos e desativar 2FA mediante senha e confirmações previstas.
- [x] O login protegido encaminha para uma etapa visualmente coerente, aceita TOTP ou recuperação, preserva callback interno e oferece confiança opcional por 30 dias.
- [x] Acesso direto sem desafio volta ao login e perda de todos os fatores orienta suporte sem bypass por e-mail.
