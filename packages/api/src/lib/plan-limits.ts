/**
 * Limites de plano que a interface também precisa dizer em voz alta.
 *
 * Módulo folha, sem importar banco nem ORM, de propósito: a tela de planos é
 * cliente e não pode arrastar o servidor para dentro do bundle só para saber
 * quantos jogos o Starter permite.
 *
 * Antes o número vivia em dois lugares — na política que barra a criação e na
 * lista de vantagens do plano, escrito à mão. Enquanto os dois concordassem,
 * ninguém notaria; no dia em que o limite mudar, um deles mente para quem
 * está decidindo se assina.
 */
export const STARTER_EVENT_LIMIT = 5

/**
 * Teste grátis do cadastro (WEB-113, WEB-31): todo bar novo nasce publicado e
 * com assinatura `trialing` neste plano, por estes dias, sem cartão. O plano é
 * só o de nascimento: o bar troca em `/plan` sem mudar a data (WEB-358).
 *
 * Vence sozinho: `getCurrentPlan` deixa de reconhecer o plano na data, e sem
 * contratação o bar sai do ar no cron diário (WEB-357).
 */
export const ONBOARDING_TRIAL = { plan: 'elite', days: 120 } as const

/**
 * Nome de exibição de cada plano. Mensagem de erro do servidor e catálogo da
 * tela leem daqui, para o usuário nunca ver o id interno (`starter`).
 */
export const PLAN_NAMES = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite'
} as const
