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
  configureServer({ httpServer }) {
    if (!process.env.E2E_DATABASE_URL || !httpServer) return
    if (!('keepAliveTimeout' in httpServer)) return
    httpServer.keepAliveTimeout = 70_000
    httpServer.headersTimeout = 71_000
  }
}

export default defineConfig(({ mode }) => ({
  optimizeDeps: {
    /**
     * `three` só é pedido por `import()`, no desktop, depois da hidratação
     * (WEB-333). Sem ele aqui o `vite dev` o descobre no meio da visita,
     * reempacota as dependências e recarrega a página.
     */
    include: ['three']
  },
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
