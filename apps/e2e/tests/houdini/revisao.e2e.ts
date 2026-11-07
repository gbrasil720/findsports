import { randomUUID } from 'node:crypto'
import { MEDIA_PUBLIC_ORIGIN } from '../../env'
import { storageState } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { createEvent } from '../../fixtures/going'
import { interceptMediaUploads } from '../../fixtures/media'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'
import { createUser } from '../../fixtures/users'

// Revisão do Houdini (WEB-462, WEB-478): fotos e descrições que os bares
// mandaram. Aprovar põe no ar, recusar pede o motivo; cada decisão vai ao
// Grimório. A fila é de todos os testes em paralelo: tudo filtra pelo bar.

test.use({ storageState: storageState('admin') })

async function barWithPending() {
  const name = `Bar Revisão ${randomUUID().slice(0, 8)}`
  const pub = await createPub({
    bar: {
      name,
      description: 'Chope gelado.',
      description_pending: 'Chope gelado e telão de 120".',
      description_review: 'pending',
      description_submitted_at: new Date()
    }
  })
  const photos = [randomUUID(), randomUUID()].map((photoId, position) => ({
    id: randomUUID(),
    url: `${MEDIA_PUBLIC_ORIGIN}/bars/${pub.barId}/gallery/${photoId}`,
    position
  }))
  for (const p of photos) {
    await insert('bar_photo', {
      ...p,
      bar_id: pub.barId,
      category: 'telao',
      caption: 'O telão do salão',
      status: 'pending',
      cover_requested: p.position === 0
    })
  }
  return { ...pub, name, photos }
}

const grimorio = (barId: string) =>
  query<{ kind: string }>(
    `SELECT kind FROM admin_action WHERE target_type = 'bar' AND target_id = $1 ORDER BY created_at`,
    [barId]
  )

test('aprova a capa, recusa uma foto e a descrição com motivo', async ({
  page
}) => {
  await interceptMediaUploads(page)
  const bar = await barWithPending()
  await page.goto('/houdini/revisao')

  const cards = page.getByRole('article', { name: `Foto de ${bar.name}` })
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('pedida como capa')
  await expect(cards.first()).toContainText('“O telão do salão”')

  await cards.first().getByRole('button', { name: 'Aprovar' }).click()
  await expect(cards).toHaveCount(1)
  await expect
    .poll(async () => {
      const [row] = await query('SELECT photo_url FROM bar WHERE id = $1', [
        bar.barId
      ])
      return row?.photo_url
    })
    .toBe(bar.photos[0]?.url)

  await cards.getByRole('button', { name: 'Recusar' }).click()
  await expect(
    cards.getByRole('button', { name: 'Confirmar recusa' })
  ).toBeDisabled()
  await cards
    .getByRole('button', { name: 'Parece imagem de banco, não do bar.' })
    .click()
  await cards.getByRole('button', { name: 'Confirmar recusa' }).click()
  await expect(cards).toHaveCount(0)

  const description = page.getByRole('article', {
    name: `Descrição de ${bar.name}`
  })
  await expect(description).toContainText('Chope gelado e telão de 120".')
  await expect(description).toContainText('No ar hoje: “Chope gelado.”')
  // No celular os avisos de sucesso ficam por cima do pé da página: o
  // teclado chega ao botão sem depender de onde eles estão.
  await description.getByRole('button', { name: 'Recusar' }).press('Enter')
  await description
    .getByLabel(/Motivo da recusa/)
    .fill('Não dá para confirmar o tamanho do telão.')
  await description
    .getByRole('button', { name: 'Confirmar recusa' })
    .press('Enter')
  await expect(description).toHaveCount(0)

  const [photo] = await query(
    'SELECT status, rejection_reason FROM bar_photo WHERE id = $1',
    [bar.photos[1]?.id]
  )
  expect(photo).toEqual({
    status: 'rejected',
    rejection_reason: 'Parece imagem de banco, não do bar.'
  })
  const [row] = await query(
    'SELECT description, description_review, description_rejection_reason FROM bar WHERE id = $1',
    [bar.barId]
  )
  expect(row).toEqual({
    description: 'Chope gelado.',
    description_review: 'rejected',
    description_rejection_reason: 'Não dá para confirmar o tamanho do telão.'
  })
  expect((await grimorio(bar.barId)).map((e) => e.kind)).toEqual([
    'bar.photo_approve',
    'bar.photo_reject',
    'bar.description_reject'
  ])

  // O Grimório mostra a decisão com o motivo.
  await page.goto('/houdini/grimorio')
  await expect(
    page.getByText(`recusou a descrição de ${bar.name}`)
  ).toBeVisible()
})

test('comentário da avaliação: aprova um, recusa outro com motivo (WEB-451)', async ({
  page
}) => {
  const name = `Bar Comentário ${randomUUID().slice(0, 8)}`
  const pub = await createPub({ bar: { name } })
  const { eventId } = await createEvent(pub.barId, {
    startsAt: new Date(Date.now() - 2 * 86_400_000)
  })
  const comments = [
    {
      name: 'Marina Costa',
      text: 'Som alto e telão enorme.',
      identified: true
    },
    { name: 'Pedro Okada', text: 'Liga para 11 99999-0000.', identified: false }
  ]
  const ids: string[] = []
  for (const c of comments) {
    const fan = await createUser({ name: c.name })
    const id = randomUUID()
    ids.push(id)
    await insert('bar_rating', {
      id,
      bar_id: pub.barId,
      actor_user_id: fan.id,
      event_id: eventId,
      would_return: true,
      stars: 4,
      comment: c.text,
      comment_review: 'pending',
      identified: c.identified
    })
  }
  await page.goto('/houdini/revisao')

  const card = (author: string) =>
    page
      .getByRole('article', { name: `Comentário sobre ${name}` })
      .filter({ hasText: author })
  // O admin vê quem escreveu, e se a pessoa pediu para ficar anônima.
  await expect(card('Marina Costa')).toContainText('aparece com o nome')
  await expect(card('Pedro Okada')).toContainText('anônima para o bar')
  await expect(card('Pedro Okada')).toContainText('não verificada')
  await expect(
    card('Marina Costa').getByRole('img', { name: '4 de 5 estrelas' })
  ).toBeVisible()

  await card('Marina Costa')
    .getByRole('button', { name: 'Aprovar' })
    .press('Enter')
  await expect(card('Marina Costa')).toHaveCount(0)

  await card('Pedro Okada')
    .getByRole('button', { name: 'Recusar' })
    .press('Enter')
  await expect(card('Pedro Okada').getByLabel(/fica no Grimório/)).toBeVisible()
  await card('Pedro Okada')
    .getByRole('button', {
      name: 'Tem dado pessoal (telefone, e-mail, endereço).'
    })
    .press('Enter')
  await card('Pedro Okada')
    .getByRole('button', { name: 'Confirmar recusa' })
    .press('Enter')
  await expect(card('Pedro Okada')).toHaveCount(0)

  const rows = await query(
    'SELECT comment_review, comment_rejection_reason FROM bar_rating WHERE id = ANY($1) ORDER BY comment',
    [ids]
  )
  expect(rows).toEqual([
    {
      comment_review: 'rejected',
      comment_rejection_reason: 'Tem dado pessoal (telefone, e-mail, endereço).'
    },
    { comment_review: 'approved', comment_rejection_reason: null }
  ])
  expect((await grimorio(pub.barId)).map((e) => e.kind)).toEqual([
    'bar.rating_comment_approve',
    'bar.rating_comment_reject'
  ])
})
