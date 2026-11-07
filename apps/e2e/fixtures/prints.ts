import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, TestInfo } from '@playwright/test'

/**
 * Prints das telas para revisão (claro e escuro), só com `E2E_PRINTS_DIR`:
 * no CI e na rodada de sempre não grava nada. O nome leva o projeto
 * (`desktop`, `mobile`).
 */
export async function print(
  page: Page,
  testInfo: TestInfo,
  name: string,
  /** Espera antes do print (animação de entrada), só quando há print. */
  settleMs = 0
) {
  const dir = process.env.E2E_PRINTS_DIR
  if (!dir) return
  if (settleMs) await page.waitForTimeout(settleMs)
  mkdirSync(dir, { recursive: true })
  const project = testInfo.project.name
  const html = page.locator('html')
  const tema = (await html.getAttribute('data-theme')) ?? 'light'
  const pintar = (t: string) =>
    page.evaluate(`document.documentElement.setAttribute('data-theme', '${t}')`)
  for (const theme of ['light', 'dark'] as const) {
    await pintar(theme)
    // As transições de cor do tema assentam antes do print.
    await page.waitForTimeout(250)
    await page.screenshot({
      path: join(dir, `${name}-${project}-${theme}.png`),
      fullPage: false
    })
  }
  await pintar(tema)
}
