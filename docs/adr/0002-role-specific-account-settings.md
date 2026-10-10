# ADR 0002: Configurações de conta em superfícies específicas por papel

- Status: aceita
- Data: 2026-08-21

## Contexto

Torcedores já possuem uma aba de configurações dentro do próprio perfil. Bares
administram sua operação por abas na barra lateral do painel. Os dois papéis,
porém, autenticam por uma conta Better Auth e precisam das mesmas capacidades
de segurança sem perder o desenho e o contexto próprios de cada experiência.

## Decisões confirmadas

- Manter configurações do torcedor na aba do perfil, com design voltado ao
  torcedor.
- Adicionar `Configurações` como nova aba da barra lateral do painel do bar,
  seguindo o design e a navegação acessível das abas existentes.
- Compartilhar o comportamento de segurança da conta, sem criar uma terceira
  página genérica de configurações.
- Oferecer e-mail somente leitura, alteração de senha, administração de
  sessões, encerramento da sessão atual, exclusão da conta e gerenciamento de
  autenticação em dois fatores.
- Aplicar o segundo fator durante o login de contas que o tenham habilitado.
- Depois de e-mail e senha válidos, encaminhar contas protegidas para
  `/two-factor`, preservando a identidade visual do login.
- Aceitar nessa etapa código TOTP ou código de recuperação. A opção de confiar
  no dispositivo por 30 dias existe, mas começa desmarcada.
- Redirecionar para `/login` quando `/two-factor` for aberto sem um desafio
  pendente válido.
- Destacar a sessão atual e encerrá-la pela ação comum de sair.
- Listar as outras sessões com IP, última atividade, expiração e um rótulo de
  dispositivo ("Chrome no macOS") derivado do user agent por detecção rasa
  (`describe-device.ts`, WEB-310). O user agent bruto só aparece quando nada
  foi reconhecido; o rótulo serve para reconhecer, nunca para autorizar.
- Permitir encerrar uma sessão específica ou todas as outras sessões.
- Encerrar automaticamente as outras sessões depois de alterar a senha.
- Tratar dispositivo confiável de 2FA como cookie local, não como sessão
  administrável.
- Ativar 2FA por senha, QR/chave manual e validação do primeiro TOTP; não marcar
  a conta como protegida antes dessa validação.
- Entregar códigos de recuperação uma única vez e exigir confirmação de que
  foram guardados. Oferecer cópia e download local.
- Permitir regenerar códigos mediante senha, invalidando os anteriores, e
  desativar 2FA somente mediante senha e confirmação explícita.
- Não oferecer segundo fator por e-mail nesta versão.
- Considerar os códigos de recuperação como a única recuperação autônoma. Se o
  autenticador e todos os códigos forem perdidos, orientar a procurar suporte,
  sem oferecer bypass por e-mail.
- Permitir que o torcedor exclua a conta após reautenticação e confirmação
  destrutiva explícita.
- Exigir senha atual e a frase `EXCLUIR MINHA CONTA` para qualquer exclusão.
  A exclusão é permanente e não cria estado de soft delete.
- Assinatura viva não impede mais a exclusão (WEB-336). O bloqueio original
  deixava o dono preso: cancelar não liberava nada até o período contratado
  acabar. Em vez disso, ao confirmar a exclusão o servidor encerra a assinatura
  no Stripe na hora e só então apaga a conta. Se o Stripe recusar ou demorar,
  nada é excluído e o dono lê o erro.
- Encerrar no Stripe as assinaturas em `active`, `trialing`, `past_due` e
  `inactive` (pausada); pular as que já acabaram. Assinatura pausada precisa
  entrar: sem conta, ninguém mais conseguiria retomá-la ou encerrá-la.
- A confirmação avisa que a assinatura acaba agora, que o período pago não é
  devolvido, e que quem contratou há até 7 dias pede o reembolso integral ao
  suporte. Não há reembolso automático; cada exclusão com assinatura encerrada
  fica no log com os ids do cliente e da assinatura no Stripe.
- Bar cujo trial do cadastro nunca virou assinatura externa (sem
  `externalSubscriptionId`) não tem nada a encerrar no Stripe.
- Informar que os dados locais serão apagados, mas o provedor de pagamento pode
  reter registros fiscais próprios.

## Follow-up obrigatório fora deste escopo

- Adicionar reset administrativo de 2FA somente depois de existir um processo
  verificável de confirmação de identidade. A futura implementação deverá
  exigir autorização administrativa, confirmação explícita, trilha de
  auditoria e revogação das sessões afetadas; um botão direto sem essas
  proteções é proibido por esta decisão.
