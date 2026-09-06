// Preload de `bun test` (ver bunfig.toml). Carrega o .env.test da raiz antes de
// qualquer import de teste, independente do cwd (raiz ou apps/*/packages/* via
// turbo), para que os 43 testes que importam `@findsports_oficial/env/server`
// rodem sem segredos de produção (WEB-24).
import { config } from 'dotenv'

config({
  path: new URL('.env.test', import.meta.url).pathname,
  quiet: true
})
