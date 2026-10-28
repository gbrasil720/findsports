import { describe, expect, it } from 'bun:test'
import { descriptionSubmission } from './bar-description'

describe('descrição em revisão (WEB-478)', () => {
  it('texto novo ou alterado vai para a revisão; a publicada fica', () => {
    const patch = descriptionSubmission(
      'Telão e chope',
      '  Telão, chope e petisco '
    )
    expect(patch).not.toHaveProperty('description')
    expect(patch).toMatchObject({
      descriptionPending: 'Telão, chope e petisco',
      descriptionReview: 'pending',
      descriptionRejectionReason: null
    })
  })

  it('bar novo: a descrição espera a revisão, nada no ar', () => {
    expect(descriptionSubmission(null, 'Bar de bairro')).toMatchObject({
      descriptionPending: 'Bar de bairro',
      descriptionReview: 'pending'
    })
  })

  it('mandar de volta a publicada desfaz o pedido, sem revisão', () => {
    expect(descriptionSubmission('Telão e chope', 'Telão e chope ')).toEqual({
      descriptionPending: null,
      descriptionReview: null,
      descriptionRejectionReason: null,
      descriptionSubmittedAt: null
    })
  })

  it('apagar tira do ar na hora: tirar texto não põe nada no ar', () => {
    expect(descriptionSubmission('Telão e chope', '   ')).toEqual({
      description: null,
      descriptionPending: null,
      descriptionReview: null,
      descriptionRejectionReason: null,
      descriptionSubmittedAt: null
    })
  })
})
