import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
    tailwindcss(),
    tanstackStart(),
    viteReact()
  ]
}))
