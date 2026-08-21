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
- Listar as outras sessões com IP, última atividade, expiração e user agent
  secundário, sem tentar inferir dispositivo por heurística própria.
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
- Impedir a exclusão de um bar enquanto existir assinatura externa em período
  vigente. Solicitar cancelamento não libera a exclusão: ela só fica disponível
  depois que o encerramento for efetivado e o período contratado terminar.
- Exigir senha atual e a frase `EXCLUIR MINHA CONTA` para qualquer exclusão.
  A exclusão é permanente e não cria estado de soft delete.
- Para assinatura externa, bloquear nos estados `active`, `trialing` e
  `past_due`; em `cancelled`, bloquear enquanto `currentPeriodEnd` estiver no
  futuro. Liberar quando o período terminar e o estado for `cancelled` ou
  `inactive`.
- Permitir excluir um bar com assinatura manual sem `dodoSubscriptionId`, pois
  não existe cobrança externa a deixar órfã.
- Informar que os dados locais serão apagados, mas o provedor de pagamento pode
  reter registros fiscais próprios.

## Follow-up obrigatório fora deste escopo

- Adicionar reset administrativo de 2FA somente depois de existir um processo
  verificável de confirmação de identidade. A futura implementação deverá
  exigir autorização administrativa, confirmação explícita, trilha de
  auditoria e revogação das sessões afetadas; um botão direto sem essas
  proteções é proibido por esta decisão.
