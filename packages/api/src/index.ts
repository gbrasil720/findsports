import { initTRPC, TRPCError } from '@trpc/server'

import type { Context } from './context'
import {
  deveRegistrar,
  montarLinhaDeLog,
  nivelDoLog
} from './lib/observability'

export const t = initTRPC.context<Context>().create()

export const router = t.router

/**
 * ESC-18: toda chamada passa por aqui e sai registrada, com duração e
 * desfecho. Fica na base de todos os procedimentos justamente para não
 * depender de alguém lembrar de instrumentar o próximo.
 *
 * O erro é registrado e RELANÇADO — observar não pode alterar o
 * comportamento de quem chamou.
 */
const comRegistro = t.procedure.use(async ({ path, type, next }) => {
  const inicio = performance.now()
  const resultado = await next()
  const durationMs = performance.now() - inicio

  const dados = {
    path,
    type,
    durationMs,
    ok: resultado.ok,
    errorCode: resultado.ok ? undefined : resultado.error.code
  }

  const nivel = nivelDoLog(dados)
  if (deveRegistrar(nivel)) {
    const linha = JSON.stringify(montarLinhaDeLog(dados))
    if (nivel === 'error') console.error(linha)
    else if (nivel === 'warn') console.warn(linha)
    else console.log(linha)
  }

  return resultado
})

export const publicProcedure = comRegistro

export const protectedProcedure = comRegistro.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      cause: 'No session'
    })
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session
    }
  })
})

/**
 * ESC-09: `protectedProcedure` exige apenas uma sessão — qualquer conta
 * cadastrada passa. Procedimentos de bastidor precisam de mais do que isso, e
 * a diferença não pode depender de alguém lembrar de escrever a checagem de
 * papel dentro do handler.
 *
 * Papel vem da sessão, que é assinada pelo servidor; o cliente não consegue
 * forjá-lo. A janela de propagação ao rebaixar um admin é a do cache de
 * sessão do ESC-02 — 60 segundos.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Acesso restrito a administradores.'
    })
  }
  return next({ ctx })
})
