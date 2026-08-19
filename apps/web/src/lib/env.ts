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
     * Chave pública do Google Maps. Sem ela o mapa recusa carregar com
     * mensagem própria (`google-maps-loader.ts`); o resto do app funciona.
     */
    VITE_GOOGLE_MAPS_PUBLIC_KEY: z.string().min(1).optional(),

    /**
     * Map ID do Google Cloud (ESC-16). O `AdvancedMarkerElement` só renderiza
     * em mapa criado com um; sem ele os pinos somem sem erro nenhum, que é a
     * pior falha possível. Por isso o mapa recusa carregar quando falta, em
     * vez de subir mudo — ver `google-map.tsx`.
     *
     * Não é segredo: viaja no bundle do cliente e identifica um mapa, não uma
     * credencial. Quem controla acesso é a chave pública, com restrição de
     * origem.
     */
    VITE_GOOGLE_MAPS_MAP_ID: z.string().min(1).optional(),

    /**
     * Projeto do PostHog. Ausente = sem analytics, que é o estado normal em
     * desenvolvimento. `initPostHog` já trata.
     */
    VITE_POSTHOG_KEY: z.string().min(1).optional(),

    /** Região da instância. O padrão é o mesmo que estava embutido no código. */
    VITE_POSTHOG_HOST: z.url().default('https://eu.i.posthog.com')
  },
  runtimeEnv: {
    VITE_GOOGLE_MAPS_PUBLIC_KEY: import.meta.env.VITE_GOOGLE_MAPS_PUBLIC_KEY,
    VITE_GOOGLE_MAPS_MAP_ID: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
    VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST
  },
  emptyStringAsUndefined: true
})
