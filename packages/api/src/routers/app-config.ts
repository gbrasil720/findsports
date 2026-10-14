import { recordAdminActionSafely } from '@findsports_oficial/db/admin-action'
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

/** WEB-384: o que estava gravado antes, para o Grimório. Sem linha, o padrão. */
async function valorGravado(key: string) {
  const linha = (await carregarAppConfigGravada()).find((l) => l.key === key)
  return linha ? { value: linha.value } : { padrao: true }
}

export const appConfigRouter = router({
  list: adminProcedure.query(async () => {
    const gravadas = await carregarAppConfigGravada()
    const bruto: RegistroBruto = {}
    for (const linha of gravadas) bruto[linha.key] = linha.value
    const auditoria = new Map(gravadas.map((linha) => [linha.key, linha]))

    return montarEntradasAppConfig(bruto).map((entrada) => ({
      ...entrada,
      updatedAt: auditoria.get(entrada.key)?.updatedAt ?? null,
      updatedBy: auditoria.get(entrada.key)?.updatedBy ?? null,
      updatedByNome: auditoria.get(entrada.key)?.updatedByNome ?? null
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

      const antes = await valorGravado(input.key)
      await setAppConfig(input.key, validado.value, ctx.session.user.id)
      await recordAdminActionSafely({
        kind: 'config.set',
        actorId: ctx.session.user.id,
        actorName: ctx.session.user.name,
        targetType: 'config',
        targetId: input.key,
        targetLabel: input.key,
        before: antes,
        after: { value: validado.value }
      })
      return { key: input.key, valor: validado.value }
    }),

  reset: adminProcedure
    .input(z.object({ key: appConfigKeySchema }))
    .mutation(async ({ ctx, input }) => {
      const antes = await valorGravado(input.key)
      await resetAppConfig(input.key)
      await recordAdminActionSafely({
        kind: 'config.reset',
        actorId: ctx.session.user.id,
        actorName: ctx.session.user.name,
        targetType: 'config',
        targetId: input.key,
        targetLabel: input.key,
        before: antes,
        after: { padrao: true }
      })
      return { key: input.key }
    }),

  /**
   * Subconjunto público. Aberto de propósito: a busca do torcedor precisa
   * saber se a nota do bar está no ar antes de oferecer "Melhor avaliados".
   *
   * Nada aqui é decisão de segurança — o servidor decide de novo, sozinho,
   * em `pubs.search` e `pubs.getById`. Isto é só cortesia com quem está do
   * outro lado da tela.
   */
  getPublic: publicProcedure.query(() => appConfigStore.getPublic())
})
