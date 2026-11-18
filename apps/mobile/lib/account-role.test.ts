import { expect, test } from 'bun:test'
import { accountKind, leavesRoute, roleToStore } from './account-role'

test('com sessão, o papel é o do servidor, não o guardado', () => {
  expect(accountKind('fan', 'pub', false)).toBe('fan')
  expect(accountKind('pub', 'fan', true)).toBe('pub')
  expect(accountKind('admin', 'fan', false)).toBeNull()
})

test('conta sem dados: vale o papel guardado da última sessão boa', () => {
  expect(accountKind(undefined, 'fan', true)).toBe('fan')
  expect(accountKind(undefined, 'pub', true)).toBe('pub')
})

test('conta sem dados e sem papel guardado: nenhum, sem chutar', () => {
  expect(accountKind(undefined, null, true)).toBeNull()
  expect(accountKind(undefined, 'admin', true)).toBeNull()
})

test('visitante não herda o papel guardado', () => {
  expect(accountKind(undefined, 'fan', false)).toBeNull()
  expect(accountKind(undefined, 'pub', false)).toBeNull()
})

const offline = new TypeError('Network request failed')

test('sessão boa grava o papel', () => {
  const state = (role: string) => ({
    data: { user: { role } },
    error: null,
    isPending: false
  })
  expect(roleToStore(state('fan'))).toBe('fan')
  expect(roleToStore(state('pub'))).toBe('pub')
  expect(roleToStore(state('admin'))).toBeNull()
})

test('o servidor tirou da conta: apaga', () => {
  expect(roleToStore({ data: null, error: null, isPending: false })).toBeNull()
  expect(
    roleToStore({
      data: null,
      error: { status: 401, statusText: 'Unauthorized' },
      isPending: false
    })
  ).toBeNull()
})

test('lendo, ou sem resposta do servidor: deixa como está', () => {
  expect(
    roleToStore({ data: null, error: null, isPending: true })
  ).toBeUndefined()
  expect(
    roleToStore({
      data: null,
      error: null,
      isPending: false,
      isRefetching: true
    })
  ).toBeUndefined()
  expect(
    roleToStore({ data: null, error: offline, isPending: false })
  ).toBeUndefined()
  expect(
    roleToStore({
      data: null,
      error: { status: 502, statusText: 'Bad Gateway' },
      isPending: false
    })
  ).toBeUndefined()
})

test('bar sem dados em tela do torcedor volta à abertura', () => {
  for (const segment of ['(fan)', 'avisos', 'amigos', 'vou', 'hoje'])
    expect(leavesRoute('pub', true, segment)).toBe(true)
})

test('torcedor sem dados em tela do bar volta à abertura', () => {
  for (const segment of ['(bar)', 'quem-vai', 'novo-jogo', 'plano'])
    expect(leavesRoute('fan', true, segment)).toBe(true)
})

test('cada papel fica nas suas telas e nas dos dois', () => {
  expect(leavesRoute('fan', true, '(fan)')).toBe(false)
  expect(leavesRoute('pub', true, '(bar)')).toBe(false)
  for (const segment of [undefined, 'bar', 'configuracoes', 'legal'])
    for (const kind of ['fan', 'pub'] as const)
      expect(leavesRoute(kind, true, segment)).toBe(false)
})

test('papel desconhecido só fica na abertura e nas telas dos dois', () => {
  expect(leavesRoute(null, true, '(fan)')).toBe(true)
  expect(leavesRoute(null, true, '(bar)')).toBe(true)
  expect(leavesRoute(null, true, 'bar')).toBe(false)
})

test('com sessão ou visitante, a guarda não mexe', () => {
  expect(leavesRoute('pub', false, '(fan)')).toBe(false)
  expect(leavesRoute(null, false, '(bar)')).toBe(false)
})
