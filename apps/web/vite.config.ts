import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Só na suíte E2E: o servidor não fecha conexão ociosa enquanto um teste vive
 * (60 s). Com os 5 s do Node, o `page.request` que volta a falar depois de
 * uns segundos de tela pegava a conexão no instante em que o servidor a
 * fechava, e o teste caía com "socket hang up" ou "read ECONNRESET" (o agente
 * do Node não respeita o `Keep-Alive: timeout` e não repete o pedido; o
 * navegador repete). Pela mesma razão o pedido do navegador nunca acusou.
 */
const e2eKeepAlive: Plugin = {
  name: 'e2e-keep-alive',
  apply: 'serve',
  configureServer: ({ httpServer }) => keepAlive(httpServer),
  // O CI roda a suíte no `vite preview` do build (docs/e2e.md).
  configurePreviewServer: ({ httpServer }) => keepAlive(httpServer)
}

function keepAlive(httpServer: object | null) {
  if (!process.env.E2E_DATABASE_URL || !httpServer) return
  if (!('keepAliveTimeout' in httpServer)) return
  Object.assign(httpServer, {
    keepAliveTimeout: 70_000,
    headersTimeout: 71_000
  })
}

export default defineConfig(({ mode, command }) => ({
  optimizeDeps: {
    /**
     * `three` só é pedido por `import()`, no desktop, depois da hidratação
     * (WEB-333). Sem ele aqui o `vite dev` o descobre no meio da visita,
     * reempacota as dependências e recarrega a página.
     */
    /**
     * As telas importam regras puras de `packages/api/src/lib`, e alguns
     * desses módulos puxam `@t3-oss/env-core`, `zod/mini` e `@trpc/server`.
     * Sem eles aqui o `vite dev` de cache vazio (o do CI) só os acha numa
     * segunda página, reempacota tudo com outro hash e a página aberta fica
     * com duas cópias dos pacotes: o React não hidrata.
     */
    include: ['three', '@t3-oss/env-core', 'zod/mini', '@trpc/server'],
    /**
     * WEB-73/456: pré-empacotado, o worker do MapLibre e a página carregam
     * duas cópias do módulo compartilhado e o handshake trava, sem erro: o
     * canvas aparece e nenhum tile é desenhado. Só afeta `vite dev`.
     */
    exclude: ['maplibre-gl']
  },
  /** O worker do MapLibre é módulo ES (`?worker&url` em `mapa-maplibre.ts`). */
  worker: {
    format: 'es'
  },
  /**
   * Build em Node (o do E2E; o deploy é `--mode cloudflare`): tudo no bundle,
   * como no Worker. Com dependência externa, o Node acha o `react` dela por
   * outro caminho que o do `react-dom` e o SSR quebra com duas cópias do React
   * ("Cannot read properties of null (reading 'useContext')").
   */
  ssr: command === 'build' ? { noExternal: true } : undefined,
  server: {
    port: 3001,
    allowedHosts: ['host.docker.internal']
  },
  resolve: {
    tsconfigPaths: true
  },
  plugins: [
    /**
     * WEB-199: só no build da Cloudflare (`vite build --mode cloudflare`).
     * Com o plugin, o `vite dev` roda o SSR em workerd, e o E2E depende do dev
     * em Node (outbox de e-mail em `node:fs`, resolver do banco local).
     */
    // `remoteBindings: false`: o `vite preview` do E2E do Worker não abre
    // sessão remota para o binding `ai` (o CI não tem token da Cloudflare). O
    // deploy não usa sessão remota; em desenvolvimento a IA vai pela API REST.
    mode === 'cloudflare' &&
      cloudflare({ viteEnvironment: { name: 'ssr' }, remoteBindings: false }),
    e2eKeepAlive,
    tailwindcss(),
    tanstackStart(),
    viteReact()
  ]
}))
