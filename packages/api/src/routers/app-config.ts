import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { adminProcedure, publicProcedure, router } from '../index'
import {
  appConfigKeySchema,
  appConfigStore,
  carregarAppConfigGravada,
  montarEntradasAppConfig,
  type RegistroBruto,
  resetAppConfig,
  setAppConfig,
  validateAppConfigValue
} from '../lib/app-config'

/**
 * Painel de configuração em tempo de execução (ESC-19).
 *
 * Escrita é `adminProcedure`: as chaves daqui desligam caminho de código,
 * afrouxam limite de abuso e liberam cobrança. Papel vem da sessão assinada
 * pelo servidor — a mesma garantia do resto do bastidor.
 *
 * Leitura tem duas portas de propósito. `list` é do administrador e devolve
 * tudo, inclusive o que só o servidor decide. `getPublic` é aberta e devolve
 * apenas o subconjunto marcado como público no registro, para a tela poder
 * avisar o usuário antes de ele bater numa porta fechada.
 */

export const appConfigRouter = router({
  list: adminProcedure.query(async () => {
    const gravadas = await carregarAppConfigGravada()
    const bruto: RegistroBruto = {}
    for (const linha of gravadas) bruto[linha.key] = linha.value
    const auditoria = new Map(gravadas.map((linha) => [linha.key, linha]))

    return montarEntradasAppConfig(bruto).map((entrada) => ({
      ...entrada,
      updatedAt: auditoria.get(entrada.key)?.updatedAt ?? null,
      updatedBy: auditoria.get(entrada.key)?.updatedBy ?? null
    }))
  }),

  set: adminProcedure
    .input(z.object({ key: appConfigKeySchema, value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      // Valor recusado é erro de quem pediu, não do servidor. A distinção
      // importa: um 500 aqui seria investigado como falha, quando o que
      // houve foi um número fora da faixa.
      const validado = validateAppConfigValue(input.key, input.value)
      if (!validado.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validado.erro })
      }

      await setAppConfig(input.key, validado.value, ctx.session.user.id)
      return { key: input.key, valor: validado.value }
    }),

  reset: adminProcedure
    .input(z.object({ key: appConfigKeySchema }))
    .mutation(async ({ input }) => {
      await resetAppConfig(input.key)
      return { key: input.key }
    }),

  /**
   * Subconjunto público. Aberto de propósito: a tela de planos precisa saber
   * que a cobrança está fechada ANTES do clique, e o onboarding de bar
   * precisa listar as cidades abertas antes de o dono digitar o endereço.
   *
   * Nada aqui é decisão de segurança — o servidor recusa de novo, sozinho,
   * em `api/auth/$` e em `onboarding.completePub`. Isto é só cortesia com
   * quem está do outro lado da tela.
   */
  getPublic: publicProcedure.query(async () => {
    const config = await appConfigStore.getPublic()
    return {
      ...config,
      'launch.waitlist_gate': {
        signup:
          env.LAUNCH_ADMISSION_MODE === 'invite-only' ||
          config['launch.waitlist_gate'].signup
      }
    }
  })
})
