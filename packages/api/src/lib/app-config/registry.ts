import { z } from 'zod'

import { WAITLIST_LIMITES_PADRAO } from '../waitlist-rate-limit'

/**
 * Registro das chaves de configuração em tempo de execução (ESC-19).
 *
 * Este arquivo é a fonte da verdade: o banco guarda apenas o desvio, e um
 * valor gravado que não case com o esquema daqui é descartado na leitura.
 * Chave que não existe aqui não existe para a aplicação, mesmo que alguém
 * insira a linha à mão.
 *
 * Duas regras valem para toda entrada nova, e as duas são sobre o que
 * acontece quando algo dá errado:
 *
 *   1. `padrao` é o comportamento ATUAL de produção, nunca o novo. Banco
 *      fora do ar, JSON corrompido, linha ausente — em todos esses casos a
 *      aplicação cai no padrão, e cair no padrão precisa ser um não-evento.
 *      Quem liga o caminho novo é a linha no banco, não o código.
 *
 *   2. O esquema precisa recusar valor absurdo. Um administrador com pressa
 *      às três da manhã é o usuário deste registro; um limite de zero ou uma
 *      janela de um ano não podem ser representáveis.
 *
 * `publico: true` significa que o valor pode ser lido por qualquer visitante,
 * inclusive sem sessão. Só marque assim o que a interface precisa saber para
 * não mentir para o usuário — nunca o que só o servidor deveria decidir.
 */

/** Uma janela de contagem: quantas vezes, em quanto tempo. */
const janelaSchema = z.object({
  /** Teto de eventos na janela. Mínimo 1: zero trancaria todo mundo fora. */
  max: z.number().int().min(1).max(10_000),
  /** Tamanho da janela. Entre um segundo e um dia. */
  windowMs: z
    .number()
    .int()
    .min(1_000)
    .max(24 * 60 * 60 * 1_000)
})

/**
 * Amarra `padrao` ao tipo do próprio `schema`. Sem isto o par pode divergir
 * em silêncio — um padrão que o próprio esquema recusa faria toda leitura
 * cair no `catch` e a chave nunca funcionaria.
 */
function definir<S extends z.ZodType, P extends boolean>(definicao: {
  schema: S
  padrao: z.infer<S>
  /** Genérico para o tipo guardar `true`/`false`, não `boolean`: é o que
   *  permite derivar o formato do subconjunto público em tempo de tipo. */
  publico: P
  descricao: string
}) {
  return definicao
}

export const APP_CONFIG_DEFINITIONS = {
  /**
   * Interruptor da busca em camadas por plano (migration 0018).
   *
   * O caminho em camadas depende de `bar.plan`, uma projeção de
   * `subscription.plan` mantida por trigger. Se a projeção dessincronizar, um
   * bar pago some da camada em que deveria aparecer — sem erro, sem log, sem
   * teste de tipo reclamando. É o tipo de falha que só se percebe pela
   * reclamação do cliente.
   *
   * Desligar aqui devolve a busca ao caminho linear anterior à 0018, que lê o
   * plano direto de `subscription`. É mais caro (24 ms contra 5,5 ms no
   * dataset grande) e é exatamente por isso que fica desligado só o tempo do
   * incidente.
   */
  'search.tiered_plan_query': definir({
    schema: z.boolean(),
    padrao: true,
    publico: false,
    descricao:
      'Busca avalia planos em camadas usando a projeção bar.plan (0018). ' +
      'Desligar volta ao caminho linear que lê o plano de subscription: ' +
      'mais lento, imune a dessincronia da trigger.'
  }),

  /**
   * Libera o checkout do Dodo Payments.
   *
   * O MVP subiu com cobrança desligada e plano definido à mão. Ligar era
   * editar `packages/auth` e fazer deploy — decisão comercial presa a uma
   * janela de engenharia.
   *
   * Desligado bloqueia apenas a ABERTURA de checkout. O webhook continua
   * recebendo (assinatura que ativa é dinheiro real, e ignorá-la deixaria o
   * banco mentindo) e o portal do cliente continua aberto (quem quer cancelar
   * precisa conseguir cancelar, sempre).
   */
  'billing.checkout_enabled': definir({
    schema: z.boolean(),
    padrao: false,
    publico: true,
    descricao:
      'Permite abrir checkout de assinatura. Desligado, /plan avisa que a ' +
      'cobrança está indisponível. Webhook e portal do cliente seguem ativos.'
  }),

  /**
   * Freio da waitlist pública, por IP e por e-mail normalizado.
   *
   * Os números atuais cabem em humano preenchendo formulário e cortam o pico
   * de ~74 inserts/s medido no teste de carga. O risco conhecido é o oposto:
   * faculdade, empresa ou operadora atrás de NAT compartilham um IP, e num
   * dia de lançamento oito cadastros por dez minutos acaba rápido.
   *
   * `enabled: false` desliga o freio inteiro. Existe para o caso em que o
   * limitador é o problema — contenção na tabela `rate_limit`, por exemplo —
   * e não a carga.
   */
  'waitlist.rate_limit': definir({
    schema: z.object({
      enabled: z.boolean(),
      ip: janelaSchema,
      email: janelaSchema
    }),
    padrao: WAITLIST_LIMITES_PADRAO,
    publico: false,
    descricao:
      'Limite de cadastros na waitlist por IP e por e-mail. Afrouxe durante ' +
      'pico de lançamento; desligue só se o próprio limitador for o gargalo.'
  }),

  /**
   * Portão de entrada pela lista de espera.
   *
   * A plataforma começa por convite. Fechado, novos acessos dependem de
   * aprovação; aberto, cadastro e login admitem a conta de forma persistente.
   *
   * A configuração persistida é soberana. O ambiente define apenas o padrão
   * inicial usado antes da primeira alteração pelo painel.
   */
  'launch.waitlist_gate': definir({
    schema: z.object({
      signup: z.boolean()
    }),
    padrao: { signup: process.env.LAUNCH_ADMISSION_MODE !== 'open' },
    publico: true,
    descricao:
      'Fecha o cadastro por aprovação. O painel pode abrir ou fechar o modo ' +
      'global sem novo deploy.'
  }),

  /**
   * Cidades em que um bar pode concluir o onboarding.
   *
   * Lista vazia — o padrão — significa SEM restrição, que é o comportamento
   * de hoje. Preenchida, vira o mecanismo de lançamento cidade a cidade: só
   * bar em cidade da lista completa o cadastro.
   *
   * Vale apenas para bares. Torcedor não informa cidade em lugar nenhum do
   * fluxo — a busca dele é por GPS e raio — então não há o que comparar, e
   * inventar uma comparação daria um bloqueio que erra.
   */
  /**
   * Libera a exibição PÚBLICA da nota do bar.
   *
   * A coleta de avaliações não depende desta chave — ela roda desde o
   * primeiro dia, e o dono vê tudo no painel. O que a chave controla é
   * apenas o que o torcedor enxerga no perfil e o modo "melhor avaliados"
   * na busca.
   *
   * Nasce desligada de propósito. Nota precisa de volume: com poucas
   * avaliações, ligar a exibição só produziria perfis anunciando "—" e uma
   * ordenação que ordena ruído. Ligar é decisão de quando a base chegou lá,
   * não de quando o código ficou pronto.
   *
   * O piso por bar (`RATING_PUBLIC_FLOOR`) continua valendo por cima desta
   * chave: mesmo ligada, bar com poucas avaliações não mostra nota.
   */
  'rating.public_display': definir({
    schema: z.boolean(),
    padrao: false,
    publico: true,
    descricao:
      'Exibe a nota do bar para o torcedor e libera o modo "melhor ' +
      'avaliados" na busca. A coleta de avaliações independe desta chave.'
  }),

  'launch.pub_cities': definir({
    schema: z.array(z.string().trim().min(2).max(100)).max(500),
    padrao: [] as string[],
    publico: true,
    descricao:
      'Cidades liberadas para onboarding de bar. Vazio = todas liberadas. ' +
      'Comparação ignora acento, caixa e espaço repetido.'
  })
} as const

export type AppConfigKey = keyof typeof APP_CONFIG_DEFINITIONS

export type AppConfigValue<K extends AppConfigKey> = z.infer<
  (typeof APP_CONFIG_DEFINITIONS)[K]['schema']
>

export const APP_CONFIG_KEYS = Object.keys(
  APP_CONFIG_DEFINITIONS
) as AppConfigKey[]

/**
 * Esquema da chave, para quem recebe uma de fora. O `as` existe porque
 * `Object.keys` devolve `string[]` e perde a garantia de que a lista não é
 * vazia — garantia que o objeto acima dá por construção. Fica aqui, ao lado
 * do registro, e não espalhado por cada router que precise validar chave.
 */
export const appConfigKeySchema = z.enum(
  APP_CONFIG_KEYS as [AppConfigKey, ...AppConfigKey[]]
)

export function isAppConfigKey(key: string): key is AppConfigKey {
  return Object.hasOwn(APP_CONFIG_DEFINITIONS, key)
}

export function appConfigDefault<K extends AppConfigKey>(
  key: K
): AppConfigValue<K> {
  return APP_CONFIG_DEFINITIONS[key].padrao as AppConfigValue<K>
}

/**
 * Converte o valor cru vindo do banco no valor tipado da chave.
 *
 * Nunca lança: valor que não casa com o esquema vira `null` e quem chama
 * decide — na prática, cai no padrão. Uma configuração malformada não pode
 * derrubar a requisição que só queria ler uma flag.
 */
export function parseAppConfigValue<K extends AppConfigKey>(
  key: K,
  raw: unknown
): AppConfigValue<K> | null {
  const resultado = APP_CONFIG_DEFINITIONS[key].schema.safeParse(raw)
  return resultado.success ? (resultado.data as AppConfigValue<K>) : null
}

/**
 * Valida antes de gravar. Aqui SIM o erro sobe: quem está escrevendo precisa
 * saber que o valor foi recusado, em vez de descobrir depois que a flag não
 * mudou nada.
 */
export function validateAppConfigValue<K extends AppConfigKey>(
  key: K,
  raw: unknown
): { ok: true; value: AppConfigValue<K> } | { ok: false; erro: string } {
  const resultado = APP_CONFIG_DEFINITIONS[key].schema.safeParse(raw)
  if (resultado.success) {
    return { ok: true, value: resultado.data as AppConfigValue<K> }
  }
  const primeiro = resultado.error.issues[0]
  const caminho = primeiro?.path.join('.')
  return {
    ok: false,
    erro: caminho
      ? `${caminho}: ${primeiro?.message}`
      : (primeiro?.message ?? 'Valor inválido.')
  }
}

/**
 * Chaves marcadas como públicas, em tempo de tipo. Derivar daqui — em vez de
 * escrever a lista à mão — é o que garante que marcar uma chave como pública
 * no registro seja a única mudança necessária para ela chegar ao cliente, e
 * que desmarcar a tire de lá sem sobrar nada.
 */
export type AppConfigChavePublica = {
  [K in AppConfigKey]: (typeof APP_CONFIG_DEFINITIONS)[K]['publico'] extends true
    ? K
    : never
}[AppConfigKey]

export type AppConfigPublico = {
  [K in AppConfigChavePublica]: AppConfigValue<K>
}

export const PUBLIC_APP_CONFIG_KEYS = APP_CONFIG_KEYS.filter(
  (key) => APP_CONFIG_DEFINITIONS[key].publico
) as AppConfigChavePublica[]
