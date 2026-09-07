import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

/**
 * Variáveis de ambiente do cliente.
 *
 * ## Por que aqui, e não em `packages/env`
 *
 * Existia um `packages/env/src/web.ts`, e ele nunca funcionou: declarava
 * `VITE_POSTHOG_PROJECT_TOKEN`, um nome que não existe em `.env` nenhum, e
 * nada no repositório o importava. O código lia `import.meta.env` cru, então
 * o erro nunca apareceu — a fronteira "tipada" era decorativa.
 *
 * O motivo de ela ter nascido torta é estrutural: `import.meta.env` só é
 * tipado onde os tipos do Vite existem. Num pacote compartilhado, que não
 * conhece o Vite, o autor precisou de `(import.meta as any).env` — e um `any`
 * na fronteira apaga exatamente o que a fronteira serve para dar.
 *
 * Env de cliente é específico do Vite por natureza: o prefixo `VITE_`, a
 * substituição estática, `import.meta.env`. Mora no app que usa o Vite.
 * `packages/env/server` continua onde está, porque `process.env` é de Node e
 * é usado por mais de um pacote.
 *
 * ## Por que quase tudo é opcional
 *
 * `createEnv` valida na carga do módulo. Marcar como obrigatório algo que só
 * degrada uma parte da tela trocaria "o mapa não carrega" por "a página
 * inteira não abre" — regressão, não proteção. Só entra como obrigatório o
 * que, faltando, não deixa nada de pé.
 *
 * ## Como acrescentar
 *
 * Declare no esquema E em `runtimeEnv`. O objeto é escrito à mão de
 * propósito: o Vite substitui `import.meta.env.VITE_X` por texto, e só
 * enxerga o acesso literal. Passar `import.meta.env` inteiro funcionaria por
 * acidente do empacotador, não por contrato.
 */
export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    /**
     * Arquivo PMTiles do basemap (WEB-73).
     *
     * É a URL pública completa do `.pmtiles` no bucket — o mapa inteiro é um
     * objeto só, e o navegador lê faixas de bytes dele por HTTP Range. O nome
     * do arquivo carrega a data do build, então um rebuild trimestral troca
     * esta variável em vez de invalidar cache.
     *
     * Não é segredo e não é credencial: é um arquivo público, sem chave, sem
     * cota e sem faturamento. Substituiu o par
     * `VITE_GOOGLE_MAPS_PUBLIC_KEY` + `VITE_GOOGLE_MAPS_MAP_ID`, que eram os
     * dois pontos únicos de falha comercial do lado do cliente.
     */
    VITE_MAP_TILES_URL: z.url().optional(),

    /**
     * Projeto do PostHog. Ausente = sem analytics, que é o estado normal em
     * desenvolvimento. `initPostHog` já trata.
     */
    VITE_POSTHOG_KEY: z.string().min(1).optional(),

    /** Região da instância. O padrão é o mesmo que estava embutido no código. */
    VITE_POSTHOG_HOST: z.url().default('https://eu.i.posthog.com')
  },
  runtimeEnv: {
    VITE_MAP_TILES_URL: import.meta.env.VITE_MAP_TILES_URL,
    VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST
  },
  emptyStringAsUndefined: true
})
