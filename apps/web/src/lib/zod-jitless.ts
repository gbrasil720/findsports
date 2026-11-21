import { config } from 'zod/mini'

// CSP sem `'unsafe-eval'` (`lib/csp.ts`): o Zod testa `new Function` na
// primeira validação e a CSP acusa a recusa. No Worker ele já vem desligado.
// Importado antes de tudo em `router.tsx`, que é por onde o cliente começa.
config({ jitless: true })
