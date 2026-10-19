import { expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'

import { HOME_STRUCTURED_DATA } from '@/lib/structured-data'
import { OnsideFaqList } from './onside-faq'

type Pergunta = { name: string; acceptedAnswer: { text: string } }

const faqPage = HOME_STRUCTURED_DATA['@graph'].find(
  (no) => no['@type'] === 'FAQPage'
) as unknown as { mainEntity: Pergunta[] }

test('o FAQPage do JSON-LD é o texto visível da seção Dúvidas, palavra por palavra', () => {
  const doc = new JSDOM(renderToStaticMarkup(<OnsideFaqList />)).window.document
  const visiveis = [...doc.querySelectorAll('details')].map((item) => ({
    name: item.querySelector('summary')?.textContent ?? '',
    acceptedAnswer: { text: item.querySelector('p')?.textContent ?? '' }
  }))

  expect(visiveis.length).toBeGreaterThan(0)
  expect(
    faqPage.mainEntity.map(({ name, acceptedAnswer }) => ({
      name,
      acceptedAnswer: { text: acceptedAnswer.text }
    }))
  ).toEqual(visiveis)
})

test('a seção Dúvidas da landing usa a lista que gera o JSON-LD', async () => {
  const landing = await Bun.file(
    new URL('./onside-landing.tsx', import.meta.url)
  ).text()
  expect(landing).toContain('<OnsideFaqList />')
  expect(landing).not.toContain('FAQ_ITEMS')
})
