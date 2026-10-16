import { describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AdminEvent } from './admin-model'
import { EventDeleteDialog } from './event-delete-dialog'

// Mesmo dublê de `code-validation.test.tsx`: o diálogo do base-ui não
// renderiza sem DOM na carga do módulo. Aqui se trava o texto, não o diálogo.
type DialogPart = { children?: ReactNode }
mock.module('@findsports_oficial/ui/components/dialog', () => ({
  Dialog: ({ open, children }: DialogPart & { open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: DialogPart) => <div>{children}</div>,
  DialogTitle: ({ children }: DialogPart) => <h2>{children}</h2>,
  DialogDescription: ({ children }: DialogPart) => <p>{children}</p>,
  DialogClose: ({ children }: DialogPart) => (
    <button type="button">{children}</button>
  ),
  DialogBackdrop: () => null,
  DialogPortal: ({ children }: DialogPart) => <>{children}</>,
  DialogTrigger: ({ children }: DialogPart) => (
    <button type="button">{children}</button>
  )
}))

type Deletion = NonNullable<AdminEvent['deletion']>

const NOTHING: Deletion = {
  pendingReservations: 0,
  confirmedReservations: 0,
  ratings: 0,
  closedReservations: 0,
  hasAttendance: false
}

function renderizar(deletion: AdminEvent['deletion'], error?: string) {
  const event = {
    id: 'jogo',
    championship: 'Brasileirão',
    participantFreeText: null,
    participants: [
      { team: { name: 'Palmeiras' } },
      { team: { name: 'Santos' } }
    ],
    deletion
  } as AdminEvent
  const markup = renderToStaticMarkup(
    <EventDeleteDialog
      event={event}
      isDeleting={false}
      error={error}
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  )
  const doc = new JSDOM(markup).window.document
  return {
    text: doc.body.textContent ?? '',
    buttons: [...doc.querySelectorAll('button')].map((b) => b.textContent)
  }
}

describe('EventDeleteDialog', () => {
  test('sem nada para apagar junto, só confirma a exclusão', () => {
    for (const deletion of [NOTHING, null]) {
      const { text, buttons } = renderizar(deletion)
      expect(text).toContain('Excluir este jogo?')
      expect(text).toContain(
        'Palmeiras × Santos sai da sua grade e do seu perfil. Não dá para desfazer.'
      )
      expect(text).not.toContain('Também apaga')
      expect(buttons).toEqual(['Excluir jogo', 'Cancelar'])
    }
  })

  test('diz o que vai junto, com número só nos códigos', () => {
    const { text, buttons } = renderizar({
      ...NOTHING,
      closedReservations: 2,
      hasAttendance: true
    })
    expect(text).toContain(
      'Também apaga 2 códigos desmarcados (de quem desistiu de ir) e o interesse que os torcedores marcaram neste jogo.'
    )
    expect(buttons).toEqual(['Excluir jogo', 'Cancelar'])

    // ADR 0003: do interesse, o bar nunca vê quantos.
    expect(renderizar({ ...NOTHING, hasAttendance: true }).text).toContain(
      'Também apaga o interesse que os torcedores marcaram neste jogo.'
    )
  })

  test('bloqueado explica o motivo e a saída, sem botão de excluir', () => {
    const { text, buttons } = renderizar(
      {
        pendingReservations: 1,
        confirmedReservations: 2,
        ratings: 1,
        closedReservations: 3,
        hasAttendance: true
      },
      'erro que não aparece'
    )
    expect(text).toContain('Este jogo não pode ser excluído')
    expect(text).toContain(
      'Este jogo tem 1 pedido antigo de reserva, 2 códigos de quem vai e 1 avaliação.'
    )
    expect(text).toContain('expira sozinho no fim do jogo.')
    expect(text).toContain('só a pessoa desmarca, até o início do jogo.')
    expect(text).toContain('não podem ser apagadas.')
    expect(text).not.toContain('Também apaga')
    expect(text).not.toContain('erro que não aparece')
    expect(buttons).toEqual(['Entendi'])
  })

  test('a recusa do servidor aparece enquanto a grade não recarrega', () => {
    const { text } = renderizar(NOTHING, 'Não foi possível excluir o jogo.')
    expect(text).toContain('Não foi possível excluir o jogo.')
  })
})
