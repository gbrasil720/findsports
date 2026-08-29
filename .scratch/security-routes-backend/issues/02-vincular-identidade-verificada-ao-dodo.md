# 02: Vincular identidade verificada ao cliente Dodo

**What to build:** contas de bar verificadas possuem um identificador persistente de cliente Dodo, compatível com o plugin atual, e os fluxos de portal e pagamento não associam cobranças a uma identidade não verificada nem criam clientes duplicados.

**Blocked by:** 01: Verificar e-mail antes de liberar a conta.

**Status:** completed

- [x] O schema e a migration adicionam o identificador Dodo opcional e único sem alterar contas existentes.
- [x] O identificador nunca é aceito como entrada do cliente.
- [x] Portal, checkout e webhook exigem identidade verificada.
- [x] Checkout e portal recusam fan, anônimo e qualquer papel diferente de pub.
- [x] A transição é compatível com registros existentes e possui caminho de rollback documentado.
