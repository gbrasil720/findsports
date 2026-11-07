import { describe, expect, test } from 'bun:test'
import {
  contagemDaRevisao,
  type FotoDoDono,
  moverFoto,
  problemaDoArquivo,
  vizinha
} from './espaco-fotos-model'

const foto = (
  id: string,
  category: FotoDoDono['category'],
  status: FotoDoDono['status'] = 'approved'
): FotoDoDono => ({
  id,
  url: `https://media.onside.sh/${id}`,
  category,
  caption: null,
  coverRequested: false,
  status,
  rejectionReason: status === 'rejected' ? 'Imagem de banco.' : null
})

// Na ordem do dono (`position`), com as categorias misturadas.
const FOTOS = [
  foto('c1', 'comida'),
  foto('t1', 'telao'),
  foto('t2', 'telao', 'pending'),
  foto('b1', 'balcao', 'rejected'),
  foto('t3', 'telao')
]

describe('fotos do Meu espaço (WEB-462)', () => {
  test('conta publicadas, em revisão e recusadas', () => {
    expect(contagemDaRevisao(FOTOS)).toEqual({
      publicadas: 3,
      emRevisao: 1,
      recusadas: 1
    })
  })

  test('arrastar põe a foto no lugar da outra, dentro da categoria', () => {
    expect(moverFoto(FOTOS, 't3', 't1')).toEqual(['t3', 't1', 't2', 'b1', 'c1'])
    expect(moverFoto(FOTOS, 't1', 't3')).toEqual(['t2', 't3', 't1', 'b1', 'c1'])
  })

  test('entre categorias, sobre si mesma ou com id que sumiu, não muda', () => {
    expect(moverFoto(FOTOS, 't1', 'c1')).toBeNull()
    expect(moverFoto(FOTOS, 't1', 't1')).toBeNull()
    expect(moverFoto(FOTOS, 'x', 't1')).toBeNull()
  })

  test('as setas andam só dentro da categoria', () => {
    expect(vizinha(FOTOS, 't1', -1)).toBeNull()
    expect(vizinha(FOTOS, 't1', 1)).toBe('t2')
    expect(vizinha(FOTOS, 't3', 1)).toBeNull()
    expect(vizinha(FOTOS, 'c1', 1)).toBeNull()
  })

  test('arquivo: só JPG, PNG ou WebP de até 5 MB', () => {
    expect(problemaDoArquivo({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(problemaDoArquivo({ type: 'image/gif', size: 1000 })).toBe(
      'Formato inválido. Use JPG, PNG ou WebP.'
    )
    expect(
      problemaDoArquivo({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })
    ).toBe('Arquivo muito grande. Máximo 5MB.')
  })
})
