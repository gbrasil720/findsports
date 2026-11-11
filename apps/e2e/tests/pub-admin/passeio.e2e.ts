import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { query } from '../../fixtures/db'
import { createEvent } from '../../fixtures/going'
import { print } from '../../fixtures/prints'
import { createPub, inDays, type Plan } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

// WEB-501: o passeio pelo painel do bar novo (`components/painel/passeio.tsx`)
// troca de tela, destaca o que importa e muda pelo plano. Nenhum passo anda
// sozinho: só por "Próximo" (ou "Agora não").

const PASSOS: Record<Plan, [string, RegExp][]> = {
  starter: [
    ['Seu jogo já está no ar', /\/admin\/?$/],
    ['Ponha mais um jogo', /\/admin\/jogos$/],
    ['Foto de capa e horário', /\/admin\/meu-espaco$/],
    ['Onde o jogo vira número', /\/admin\/desempenho$/],
    ['Passeio feito', /\/admin\/?$/]
  ],
  pro: [
    ['Seu jogo já está no ar', /\/admin\/?$/],
    ['Ponha mais um jogo', /\/admin\/jogos$/],
    ['Foto de capa e horário', /\/admin\/meu-espaco$/],
    ['Por onde te procuraram', /\/admin\/desempenho$/],
    ['Passeio feito', /\/admin\/?$/]
  ],
  elite: [
    ['Seu jogo já está no ar', /\/admin\/?$/],
    ['Ponha mais um jogo', /\/admin\/jogos$/],
    ['Foto de capa e horário', /\/admin\/meu-espaco$/],
    ['O código do balcão', /\/admin\/quem-vai$/],
    ['Quem foi de verdade', /\/admin\/desempenho$/],
    ['Passeio feito', /\/admin\/?$/]
  ]
}

const tip = (page: Page) => page.locator('.pn-tour-tip')
const next = (page: Page) => tip(page).locator('.pn-acid')

type Quadro = { passo: string; x: number; y: number }

// Onde a dica aparece em cada quadro em que está à vista (o centro, que a
// escala da entrada não mexe). Ela não pode aparecer num lugar e pular para
// o destaque depois: antes, cada passo abria no canto da tela.
const gravarQuadros = (page: Page) =>
  page.addInitScript(`
    window.__quadros = []
    const loop = () => {
      const el = document.querySelector('.pn-tour-tip')
      if (el && getComputedStyle(el).visibility === 'visible') {
        const r = el.getBoundingClientRect()
        window.__quadros.push({
          passo: el.querySelector('.mono')?.textContent ?? '',
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2)
        })
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  `)

/** Os quadros do passo fora de onde a dica está agora. */
const quadrosForaDoLugar = async (page: Page, passo: string) => {
  const quadros = (await page.evaluate<Quadro[]>('window.__quadros')).filter(
    (q) => q.passo.startsWith(passo)
  )
  const fim = quadros.at(-1)
  return quadros.filter((q) => fim && Math.hypot(q.x - fim.x, q.y - fim.y) > 4)
}

for (const plan of ['starter', 'pro', 'elite'] as const) {
  test(`passeio do ${plan}: ${PASSOS[plan].length} telas, cada uma pelo "Próximo"`, async ({
    page
  }, testInfo) => {
    const tag = randomUUID().slice(0, 6)
    // Cidade só deste teste: as sugestões são dos bares da mesma cidade.
    const city = `Sorocaba ${tag}`
    const vizinho = await createPub({ bar: { city: city, uf: 'SP' } })
    const sugerido = `Jogo vizinho ${tag}`
    await createEvent(vizinho.barId, {
      startsAt: inDays(3),
      championship: sugerido
    })
    const { user, barId } = await createPub({
      subscription: {
        plan,
        status: 'trialing',
        currentPeriodEnd: inDays(90)
      },
      bar: {
        name: `Bar do Passeio ${tag}`,
        city: city,
        uf: 'SP',
        routine: JSON.stringify({ games: 8, spend: 60, wants: [] })
      }
    })
    await createEvent(barId, {
      startsAt: inDays(1),
      championship: `Final ${tag}`
    })
    await signIn(page, user)
    await gravarQuadros(page)
    await page.goto('/admin?passeio=1')

    const passos = PASSOS[plan]
    for (const [i, [titulo, rota]] of passos.entries()) {
      await expect(page).toHaveURL(rota)
      const dialog = page.getByRole('dialog', { name: titulo })
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByText(`${i + 1} DE ${passos.length}`)
      ).toBeVisible()
      await expect(
        dialog.getByRole('button', { name: 'Pular o passeio' })
      ).toBeVisible()
      await expect(page.locator('.pn-tour-spot')).toBeVisible()
      await print(page, testInfo, `passeio-${plan}-${i + 1}`, 600)
      expect(
        await quadrosForaDoLugar(page, `${i + 1} DE ${passos.length}`)
      ).toEqual([])

      if (titulo === 'Ponha mais um jogo') {
        // A ação do passo muda o texto; quem segue é o dono.
        await page
          .getByRole('region', {
            name: 'Jogos que outros bares perto já marcaram'
          })
          .getByRole('button', { name: new RegExp(sugerido) })
          .click()
        await expect(
          page.getByRole('dialog', { name: 'Mais um na grade' })
        ).toBeVisible()
        await page.waitForTimeout(2500)
        await expect(
          page.getByRole('dialog', { name: 'Mais um na grade' })
        ).toBeVisible()
        await expect(page).toHaveURL(rota)
      }
      if (titulo === 'O código do balcão') {
        await page
          .getByRole('button', { name: 'Validar o código de exemplo' })
          .click()
        await expect(page.getByText('Código validado')).toBeVisible()
        // Simulação só na tela: nenhum código nem visita no banco.
        expect(
          await query(
            'SELECT 1 FROM reservation r JOIN event e ON e.id = r.event_id WHERE e.bar_id = $1',
            [barId]
          )
        ).toHaveLength(0)
        await print(page, testInfo, `passeio-${plan}-${i + 1}-validado`, 300)
      }
      await next(page).click()
    }

    await expect(tip(page)).toHaveCount(0)
    await expect(page.getByText('Bom jogo. O painel é seu.')).toBeVisible()
    const card = page.getByRole('region', {
      name: /Primeiros passos do Bar do Passeio/
    })
    await expect(card.getByText('Conhecer o painel')).toBeVisible()
    await expect(card.getByText(/^Passeio feito:/)).toBeVisible()
    await print(page, testInfo, `passeio-${plan}-card`, 600)
  })
}

test('bar de antes do cadastro novo não vê passeio nem Primeiros passos', async ({
  page
}) => {
  const { user, barId } = await createPub()
  await createEvent(barId, { startsAt: inDays(1) })
  await signIn(page, user)
  await page.goto('/admin?passeio=1')
  await expect(
    page.getByRole('heading', { name: 'Hoje na casa' })
  ).toBeVisible()
  await expect(page.getByText('Primeiros passos do')).toHaveCount(0)
  await expect(tip(page)).toHaveCount(0)
})
