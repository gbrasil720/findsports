import { randomUUID } from 'node:crypto'
import { MEDIA_PUBLIC_ORIGIN } from '../../env'
import { storageState } from '../../fixtures/auth'
import { insert, query } from '../../fixtures/db'
import { interceptMediaUploads } from '../../fixtures/media'
import { createPub } from '../../fixtures/pubs'
import { expect, test } from '../../fixtures/test'

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
