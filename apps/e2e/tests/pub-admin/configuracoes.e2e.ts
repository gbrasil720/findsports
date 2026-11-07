import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { signIn } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { lastEmailTo } from '../../fixtures/email'
import { trpc } from '../../fixtures/fan'
import { createEvent } from '../../fixtures/going'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Configurações do painel (avisos por e-mail, WEB-441; cópia dos dados,
// WEB-418) e o "Interesse de hoje" de Hoje (WEB-449). Nenhum e-mail sai: o
// servidor do E2E grava no outbox.

async function open(page: Page) {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin/configuracoes')
  return pub
}

const secao = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

test('avisos por e-mail: cada interruptor grava na hora', async ({ page }) => {
  const { barId } = await open(page)
  const avisos = secao(page, 'Avisos por e-mail')
  const chave = (name: string) => avisos.getByRole('switch', { name })
  const gravado = async () =>
    (
      await query(
        'SELECT notice_weekly_summary, notice_game_filling, notice_empty_schedule FROM bar WHERE id = $1',
        [barId]
      )
    )[0]

  // Os padrões do design (2b): resumo e jogo lotando ligados.
  await expect(chave('Resumo da semana')).toBeChecked()
  await expect(chave('Jogo lotando')).toBeChecked()
  await expect(chave('Grade vazia')).not.toBeChecked()
  // O celular segue para depois: o app ainda não abre por link.
  await expect(avisos).toContainText('EM BREVE')

  await chave('Grade vazia').click()
  await chave('Resumo da semana').click()
  await expect(chave('Grade vazia')).toBeChecked()
  await expect(chave('Resumo da semana')).not.toBeChecked()
  await expect.poll(gravado).toEqual({
    notice_weekly_summary: false,
    notice_game_filling: true,
    notice_empty_schedule: true
  })

  await page.reload()
  await expect(chave('Grade vazia')).toBeChecked()
  await expect(chave('Resumo da semana')).not.toBeChecked()
})

test('jogo lotando: quem passa de 20 manda o e-mail ao dono', async ({
  page
}) => {
  const { user, barId } = await createPub()
  const { eventId } = await createEvent(barId, {
    startsAt: new Date(Date.now() + 2 * 86_400_000)
  })
  // Vinte já marcaram, direto no banco.
  for (let i = 0; i < 20; i++) {
    const other = await createUser({ role: 'fan' })
    await query('INSERT INTO attendance (user_id, event_id) VALUES ($1, $2)', [
      other.id,
      eventId
    ])
  }
  const fan = await createUser({ role: 'fan' })
  await signIn(page, fan)
  await trpc(page.request, 'attendance.set', { eventId, attending: true })

  const email = await lastEmailTo(user.email, { subject: /^Jogo lotando: / })
  expect(email.text).toContain('Mais de 20 pessoas marcaram na Onside')
  expect(email.link).toContain(`/admin/jogos?jogo=${eventId}`)
})

test('pede o arquivo e ele chega por e-mail, um por dia', async ({ page }) => {
  const { user } = await open(page)
  const privacidade = secao(page, 'Privacidade')
  await expect(privacidade).toContainText(
    'Um arquivo com os dados da conta e do bar, enviado por e-mail.'
  )

  await privacidade.getByRole('button', { name: 'Pedir arquivo' }).click()
  await expect(
    page.getByText(`Arquivo enviado para ${user.email}.`, { exact: false })
  ).toBeVisible()
  const email = await lastEmailTo(user.email, {
    subject: 'Seus dados da Onside'
  })
  expect(email.attachments).toEqual([
    expect.objectContaining({
      filename: expect.stringMatching(/^onside-meus-dados-.+\.json$/),
      contentType: 'application/json'
    })
  ])
  expect(email.text).toContain('Ele traz a conta, o bar, o plano e os jogos')

  // O segundo pedido no mesmo dia é recusado com a frase do servidor.
  await privacidade.getByRole('button', { name: 'Pedir arquivo' }).click()
  await expect(
    page.getByText('Você já pediu seus dados nas últimas 24 horas', {
      exact: false
    })
  ).toBeVisible()
})

/** O dia da casa (vira às 6h de Brasília), como o Hoje do painel. */
function houseDay(now = Date.now()) {
  return new Date(now - 6 * 3_600_000).toLocaleDateString('sv-SE', {
    timeZone: 'America/Sao_Paulo'
  })
}

test('interesse de hoje contra o normal do mesmo dia da semana', async ({
  page
}) => {
  const pub = await createPub({
    subscription: { plan: 'pro' },
    bar: { created_at: new Date(Date.now() - 60 * 86_400_000) }
  })
  const day = houseDay()
  const start = new Date(`${day}T00:00:30-03:00`).getTime()
  const interest = async (weeksAgo: number) => {
    const fan = await createUser()
    const at = new Date(start - weeksAgo * 7 * 86_400_000)
    await insert('bar_commercial_event', {
      id: randomUUID(),
      bar_id: pub.barId,
      actor_user_id: fan.id,
      type: 'whatsapp_opened',
      occurred_at: at,
      commercial_day: at.toLocaleDateString('sv-SE', {
        timeZone: 'America/Sao_Paulo'
      })
    })
  }
  // Hoje 2 pessoas; uma em cada um dos quatro mesmos dias de antes.
  for (const weeksAgo of [0, 0, 1, 2, 3, 4]) await interest(weeksAgo)
  const weekday = [
    'domingo',
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado'
  ][new Date(`${day}T12:00:00Z`).getUTCDay()]

  await signIn(page, pub.user)
  await page.goto('/admin')
  const card = page.getByRole('region', { name: 'Interesse de hoje' })
  await expect(card).toContainText('+100%')
  await expect(card).toContainText(
    `Interesse acima do seu normal de ${weekday}`
  )
})

test('bar novo: sem duas semanas, o interesse de hoje ainda não compara', async ({
  page
}) => {
  const pub = await createPub()
  await signIn(page, pub.user)
  await page.goto('/admin')
  const card = page.getByRole('region', { name: 'Interesse de hoje' })
  await expect(card).toContainText('—')
  await expect(card).toContainText('menos de duas')
})
