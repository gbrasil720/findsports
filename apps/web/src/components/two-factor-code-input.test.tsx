import { expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'

import { TwoFactorCodeInput } from './two-factor-code-input'

test('aceita apenas dígitos no código de dois fatores', () => {
  const markup = renderToStaticMarkup(
    <TwoFactorCodeInput id="code" value="" onChange={() => undefined} />
  )
  const input = new JSDOM(markup).window.document.querySelector('input')

  expect(input?.pattern).toBe('^[0-9]+$')

  if (!input) throw new Error('Input OTP não renderizado.')
  input.value = '123456'
  expect(input.checkValidity()).toBe(true)
  input.value = 'abc123'
  expect(input.checkValidity()).toBe(false)
})
