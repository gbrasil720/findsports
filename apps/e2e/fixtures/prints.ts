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
  const tema = await page.evaluate(
    () => document.documentElement.getAttribute('data-theme') ?? 'light'
  )
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(
      (t) => document.documentElement.setAttribute('data-theme', t),
      theme
    )
    // As transições de cor do tema assentam antes do print.
    await page.waitForTimeout(250)
    await page.screenshot({
      path: join(dir, `${name}-${project}-${theme}.png`),
      fullPage: false
    })
  }
  await page.evaluate(
    (t) => document.documentElement.setAttribute('data-theme', t),
    tema
  )
}
