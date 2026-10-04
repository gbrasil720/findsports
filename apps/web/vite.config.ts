import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  optimizeDeps: {
    include: ['input-otp'],
    /**
     * WEB-73: o worker do MapLibre e a thread principal trocam mensagens
     * tipadas registradas em `maplibre-gl-shared.mjs`. Pré-empacotado, o lado
     * principal passa a usar a cópia de `.vite/deps` enquanto o worker carrega
     * o arquivo original — duas instâncias do mesmo módulo, e o handshake
     * trava. Sem erro: o canvas aparece e nada é decodificado.
     *
     * Só afeta `vite dev`; no build o Rollup empacota os dois a partir da
     * mesma origem.
     */
    exclude: ['maplibre-gl']
  },
  /**
   * WEB-73: o worker do MapLibre é um módulo ES e importa
   * `./maplibre-gl-shared.mjs`. O padrão do Vite é emitir worker como IIFE, e
   * aí o `new Worker(url, { type: 'module' })` do MapLibre carrega um script
   * que não é módulo. Ver `onside-map.tsx` para o resto da história.
   */
  worker: {
    format: 'es'
  },
  server: {
    port: 3001,
    allowedHosts: [
      'host.docker.internal',
      'nintendo-hyperlink-undamaged.ngrok-free.dev'
    ]
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
    mode === 'cloudflare' && cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact()
  ]
}))
