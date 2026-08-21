# Configurações de conta e segurança

- Status: aprovado para ticketização
- Data: 2026-08-21
- Decisão: `docs/adr/0002-role-specific-account-settings.md`

## Objetivo

Entregar configurações de conta completas para torcedores e bares sem fundir
as experiências dos dois papéis. O torcedor continua dentro da aba
`Configurações` do perfil. O bar recebe uma nova aba `Configurações` na barra
lateral do painel. As duas superfícies compartilham contratos de segurança,
mas mantêm composição, hierarquia e textos próprios.

## Escopo funcional

### Conta

- Exibir o e-mail autenticador como somente leitura.
- Não permitir troca de e-mail nesta versão.
- Alterar senha exigindo senha atual, nova senha e confirmação.
- Após a troca, revogar todas as outras sessões.
- Oferecer saída explícita da sessão atual.

### Sessões

- Destacar a sessão atual e encaminhar sua saída pela ação comum de logout.
- Listar outras sessões com IP, última atividade, expiração e user agent como
  texto secundário.
- Não adicionar parser ou heurística para inferir dispositivo/navegador.
- Permitir revogar uma sessão específica e todas as outras sessões.
- Atualizar a lista e anunciar sucesso ou erro depois de cada ação.
- Não representar o cookie de dispositivo confiável como sessão.

### Autenticação em dois fatores

- Usar somente TOTP de aplicativo autenticador e códigos de recuperação.
- Adicionar o plugin 2FA do Better Auth no servidor e no cliente, com issuer
  `Onside`, schema e migração exigidos pela versão instalada.
- Ativação: senha atual, QR, chave manual, primeiro TOTP e confirmação de que os
  códigos de recuperação foram guardados.
- O primeiro TOTP precisa ser validado antes de `twoFactorEnabled` tornar-se
  verdadeiro.
- Oferecer cópia e download local dos códigos; não persistir cópias próprias.
- Regenerar códigos somente mediante senha e invalidar os anteriores.
- Desativar 2FA somente mediante senha e confirmação explícita.
- Não oferecer OTP ou recuperação por e-mail.
- Se autenticador e códigos forem perdidos, orientar contato com suporte. Reset
  administrativo fica como follow-up condicionado a verificação de identidade,
  autorização, auditoria e revogação de sessões.

### Login protegido

- Depois de senha válida para uma conta com 2FA, não criar acesso autenticado
  até validar o segundo fator.
- Redirecionar o desafio para `/two-factor`, usando o mesmo shell visual do
  login e preservando apenas callback interno validado.
- Aceitar TOTP ou código de recuperação.
- Oferecer `Confiar neste dispositivo por 30 dias`, desmarcado por padrão.
- Manter no navegador apenas o estado mínimo de navegação do desafio, com a
  validade de dez minutos do cookie do plugin. A autorização continua sendo do
  cookie assinado pelo Better Auth.
- Sem desafio navegável pendente, redirecionar para `/login`.
- Em sucesso, limpar o estado transitório e seguir para o callback original.
- Mostrar erros de código inválido, código consumido e limite de tentativas sem
  revelar credenciais ou existência de conta.

### Exclusão de conta

- Exigir senha atual e a frase exata `EXCLUIR MINHA CONTA`.
- Usar exclusão permanente do Better Auth; não criar soft delete.
- A frase é uma confirmação de interface. A senha e a sessão autenticada são a
  autorização efetiva.
- Aplicar no servidor a política de exclusão do bar, independentemente da UI.
- Se não houver `dodoSubscriptionId`, permitir exclusão após as confirmações.
- Com assinatura externa, bloquear em `active`, `trialing` e `past_due`.
- Em `cancelled`, bloquear enquanto `currentPeriodEnd` estiver no futuro.
- Liberar somente com estado `cancelled` ou `inactive` e sem período vigente.
- Explicar o bloqueio e oferecer acesso a `Assinatura e pagamentos`.
- Informar que dados locais serão apagados em cascata e que o provedor pode
  reter registros fiscais próprios.
- Depois da exclusão, limpar estado local da autenticação e voltar à entrada
  pública.

## Composição das superfícies

### Torcedor

Preservar esportes favoritos, raio de busca e reset de sugestões no início da
aba. Abaixo deles, compor conta/senha, 2FA, sessões, sair e zona de exclusão no
mesmo vocabulário visual do perfil.

### Bar

Adicionar `Configurações` depois de `Meu espaço` na navegação por tabs do
painel. Preservar navegação por teclado, foco roving, hash e relacionamento
`tab`/`tabpanel`. A nova seção usa os painéis, títulos e espaçamento existentes
do admin para conta/senha, 2FA, sessões, sair e zona de exclusão. Assinatura e
pagamentos permanece um link separado.

Formulários sensíveis abrem em dialogs com foco contido e retorno de foco. QR
sempre possui chave manual equivalente. Ações assíncronas possuem estados de
carregamento, sucesso e erro anunciados semanticamente.

## Contratos e limites

- Better Auth é a fonte canônica para senha, sessões, 2FA e exclusão.
- O servidor é a fonte canônica para elegibilidade de exclusão do bar.
- Não duplicar hash de senha, armazenamento de TOTP, códigos ou sessões.
- Não adicionar configurações de notificações, troca de e-mail, login por OTP,
  soft delete ou reset administrativo de 2FA.
- A configuração de 2FA exige migração compatível: novo campo booleano no
  usuário e tabela própria do plugin, sem alterar contas existentes.
- A revogação de uma sessão pode levar até o `cookieCache.maxAge` atual de 60
  segundos para ser observada por outro navegador; a interface não promete
  invalidação instantânea.

## Verificação

- Testar a política pura de exclusão em todos os estados, com e sem período e
  identificador externo.
- Testar navegação por teclado da nova tab do bar.
- Testar preservação e validação do callback do desafio 2FA.
- Testar estados dos fluxos de senha, sessões, ativação/desativação de 2FA,
  recuperação e exclusão nos limites onde o código do projeto controla o
  comportamento.
- Rodar testes focados durante cada slice, typecheck forçado do monorepo e a
  suíte completa ao final.
- Fazer QA visual autenticado das duas tabs, dialogs e login 2FA em viewports
  móvel e desktop. Se não houver sessão/browser disponível, relatar esse limite
  sem converter build ou teste estático em prova visual.
