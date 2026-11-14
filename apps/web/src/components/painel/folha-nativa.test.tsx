import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { Dialogo } from '@/components/dialogo/dialogo'
import { FolhaNativa } from './folha-nativa'

let dom: JSDOM
let root: Root | undefined

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  for (const key of ['window', 'document', 'navigator'] as const) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true
    })
  }
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  // O JSDOM tem `<dialog>` sem `showModal`. Como no navegador, fechar dispara
  // `close` no próprio `<dialog>`: é esse evento que o React repassa à folha.
  Object.assign(dom.window.HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
    close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      this.dispatchEvent(new dom.window.Event('close'))
    }
  })
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = undefined
  dom.window.close()
})

function Tela({ onCloseFolha }: { onCloseFolha: () => void }) {
  const [confirmando, setConfirmando] = useState(false)
  return (
    <FolhaNativa
      className="pn-sheet"
      aria-label="Jogo aberto"
      onClose={onCloseFolha}
    >
      <button type="button" onClick={() => setConfirmando(true)}>
        Desfazer
      </button>
      <Dialogo
        open={confirmando}
        onClose={() => setConfirmando(false)}
        labelledBy="t"
      >
        <h2 id="t">Desfazer a chegada?</h2>
        <button type="button" onClick={() => setConfirmando(false)}>
          Sim, desfazer
        </button>
      </Dialogo>
    </FolhaNativa>
  )
}

function botao(nome: string) {
  const achado = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === nome
  )
  if (!achado) throw new Error(`sem o botão ${nome}`)
  return achado
}

test('confirmar uma caixa de dentro não fecha a folha (WEB-515)', () => {
  const onCloseFolha = mock(() => {})
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<Tela onCloseFolha={onCloseFolha} />))

  const folha = document.querySelector<HTMLDialogElement>(
    'dialog[aria-label="Jogo aberto"]'
  )
  expect(folha?.open).toBe(true)

  act(() => botao('Desfazer').click())
  const caixa = document.querySelector<HTMLDialogElement>('dialog.dlg3')
  expect(caixa?.open).toBe(true)

  act(() => botao('Sim, desfazer').click())
  expect(caixa?.open).toBe(false)
  expect(onCloseFolha).not.toHaveBeenCalled()
  expect(folha?.open).toBe(true)

  // O fechamento da própria folha ainda chega.
  act(() => folha?.close())
  expect(onCloseFolha).toHaveBeenCalledTimes(1)
})
