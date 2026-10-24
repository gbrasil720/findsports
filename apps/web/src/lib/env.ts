import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod/mini'

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
 * ## Por que `zod/mini`
 *
 * Este módulo entra no JavaScript inicial de toda página (o PostHog e o aviso
 * de cookies o leem). O `zod` clássico arrasta a biblioteca inteira, uns 64 KB
 * minificados no chunk de entrada; o `zod/mini` só traz o que o esquema usa.
 * As regras são as mesmas, escritas com funções em vez de métodos.
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
     * Projeto do PostHog. Ausente = sem analytics, que é o estado normal em
     * desenvolvimento. `initPostHog` já trata.
     */
    VITE_POSTHOG_KEY: z.optional(z.string().check(z.minLength(1))),

    /** Região da instância. O padrão é o mesmo que estava embutido no código. */
    VITE_POSTHOG_HOST: z._default(z.url(), 'https://eu.i.posthog.com'),

    /**
     * Site key do Cloudflare Turnstile (pública). Ausente = sem widget, que é
     * o estado de dev e do E2E; o servidor só exige o token quando tem
     * `TURNSTILE_SECRET_KEY`.
     */
    VITE_TURNSTILE_SITE_KEY: z.optional(z.string().check(z.minLength(1))),

    /**
     * Só da suíte E2E (`apps/e2e/env.ts`): mostra o aviso de cookies em
     * `vite dev`, onde não há análise, para a suíte conseguir testá-lo. O
     * PostHog continua desligado; ver `consentBannerEnabled`.
     */
    VITE_E2E_CONSENT_BANNER: z.optional(z.string()),

    /**
     * Só da suíte E2E: tira os devtools do `vite dev`, cujo botão flutuante
     * cobre o canto da tela que o teste precisa clicar.
     */
    VITE_E2E_NO_DEVTOOLS: z.optional(z.string())
  },
  runtimeEnv: {
    VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
    VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY,
    VITE_E2E_CONSENT_BANNER: import.meta.env.VITE_E2E_CONSENT_BANNER,
    VITE_E2E_NO_DEVTOOLS: import.meta.env.VITE_E2E_NO_DEVTOOLS
  },
  emptyStringAsUndefined: true
})
