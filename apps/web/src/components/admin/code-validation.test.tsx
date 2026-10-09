import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, type ReactNode, type Ref } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { ValidatedReservation } from '@/domain/reservation-validation'
import { CodeValidation, type ValidationAccess } from './code-validation'

mock.module('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    search: _search,
    ...rest
  }: {
    to?: string
    children?: ReactNode
    search?: unknown
    className?: string
  }) => (
    <a href={String(to ?? '')} {...rest}>
      {children}
    </a>
  )
}))

// O diálogo do base-ui decide na carga do módulo se existe DOM, e aqui o
// JSDOM só nasce depois: ele não renderiza nada. O que estes testes travam é
// o fluxo — pedir confirmação antes de gravar —, não o diálogo em si; foco,
// Escape e fundo são do componente compartilhado e foram conferidos no
// navegador.
type DialogPart = { children?: ReactNode }
mock.module('@findsports_oficial/ui/components/dialog', () => ({
  Dialog: ({ open, children }: DialogPart & { open?: boolean }) =>
    open ? (
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    ) : null,
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

// Mesmo caso do campo de casas: o `input-otp` mede a tela com APIs que o
// JSDOM não tem (`elementFromPoint`, `ResizeObserver`). Por baixo ele é um
// `<input>` só, e é isso que o dublê entrega; as casas foram conferidas no
// navegador.
type OtpProps = {
  ref?: Ref<HTMLInputElement>
  id?: string
  name?: string
  value?: string
  onChange?: (value: string) => void
  maxLength?: number
  pattern?: string
  autoFocus?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}
mock.module('@findsports_oficial/ui/components/input-otp', () => ({
  InputOTP: ({
    ref,
    id,
    name,
    value,
    onChange,
    maxLength,
    pattern,
    autoFocus,
    'aria-invalid': invalid,
    'aria-describedby': describedBy
  }: OtpProps) => (
    <input
      ref={ref}
      id={id}
      name={name}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      maxLength={maxLength}
      pattern={pattern}
      // biome-ignore lint/a11y/noAutofocus: repete o comportamento do campo real.
      autoFocus={autoFocus}
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  ),
  InputOTPGroup: () => null,
  InputOTPSlot: () => null
}))

const HOUR = 3_600_000
const NOW = new Date('2026-09-12T20:00:00.000Z').getTime()

const reservation: ValidatedReservation = {
  codeId: '7d0b3f0e-6c55-4c0e-9d63-3b0c0a7a1c11',
  code: 'AB3K9X',
  guestName: 'Marina Souza',
  reservationStatus: 'confirmed',
  partySize: 3,
  offerSnapshot: 'Chopp em dobro',
  usedCount: 0,
  maxUses: 3,
  event: {
    championship: 'Brasileirão',
    participants: ['Corinthians', 'Palmeiras'],
    participantFreeText: null,
    startsAt: new Date(NOW - HOUR).toISOString()
  },
  window: {
    opensAt: new Date(NOW - 4 * HOUR).toISOString(),
    closesAt: new Date(NOW + 5 * HOUR).toISOString()
  }
}

const networkError = () => new TypeError('Failed to fetch')
const refusal = (code: string) =>
  Object.assign(new Error('texto do servidor'), { data: { code } })

let dom: JSDOM
let root: Root | undefined

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://onside.test/admin/validate'
  })
  for (const key of ['window', 'document', 'navigator'] as const) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true
    })
  }
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  // O React decide na carga do módulo se o navegador tem evento `input`, e
  // aqui ele é carregado antes de o JSDOM existir: cai no caminho de IE e
  // chama estes dois métodos a cada foco em campo de texto.
  Object.assign(dom.window.HTMLInputElement.prototype, {
    attachEvent() {},
    detachEvent() {}
  })
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = undefined
  dom.window.close()
})

type Api = {
  lookup: ReturnType<typeof mock>
  registerArrival: ReturnType<typeof mock>
  undoArrival: ReturnType<typeof mock>
}

function fakeApi(overrides: Partial<Api> = {}): Api {
  let usedCount = 0
  return {
    lookup: mock(async () => reservation),
    registerArrival: mock(async ({ requestId }: { requestId: string }) => {
      usedCount += 1
      return { useId: requestId, usedCount, maxUses: 3, undone: false }
    }),
    undoArrival: mock(async () => {
      usedCount -= 1
      return { usedCount, maxUses: 3 }
    }),
    ...overrides
  }
}

async function render(
  api: Api,
  options: {
    access?: ValidationAccess
    now?: number
    undoWindowMs?: number
  } = {}
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <CodeValidation
        access={options.access ?? { status: 'ready', eligible: true }}
        now={options.now ?? NOW}
        lookup={api.lookup as never}
        registerArrival={api.registerArrival as never}
        undoArrival={api.undoArrival as never}
        undoWindowMs={options.undoWindowMs}
      />
    )
  })
  return container
}

const input = () => document.querySelector('input') as HTMLInputElement
const status = () =>
  document.querySelector('[role="status"]')?.textContent ?? ''
const alertText = () =>
  document.querySelector('[role="alert"]')?.textContent ?? ''

function button(label: string) {
  return [...document.querySelectorAll('button')].find((candidate) =>
    (
      candidate.getAttribute('aria-label') ??
      candidate.textContent ??
      ''
    ).includes(label)
  ) as HTMLButtonElement | undefined
}

/**
 * Digitação no campo de casas. O React é carregado antes de o JSDOM existir e
 * cai no caminho sem evento `input`: ali a mudança de valor é percebida no
 * `keyup` do campo em foco. Os dois eventos vão juntos para o teste valer nos
 * dois caminhos.
 */
async function type(value: string) {
  const field = input()
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  )?.set
  await act(async () => {
    field.focus()
    setter?.call(field, value)
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    field.dispatchEvent(new dom.window.Event('keyup', { bubbles: true }))
  })
}

async function submit() {
  await act(async () => {
    document
      .querySelector('form')
      ?.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
  })
}

async function click(label: string, times = 1) {
  const target = button(label)
  if (!target) throw new Error(`botão "${label}" não está na tela`)
  await act(async () => {
    for (let i = 0; i < times; i++) target.click()
  })
}

/** O `+1` abre a confirmação; a chegada só é enviada depois dela. */
async function arrive(times = 1) {
  await click('Registrar chegada')
  await click('Confirmar chegada', times)
}

/** Os `requestId` enviados, na ordem das chamadas. */
function requestIds(api: Api): string[] {
  return api.registerArrival.mock.calls.map(
    ([input]) => (input as { requestId: string }).requestId
  )
}

async function find(api: Api, options?: Parameters<typeof render>[1]) {
  await render(api, options)
  await type('ab3k9x')
  await submit()
}

describe('acesso', () => {
  test('sem Elite não oferece campo e aponta para os planos', async () => {
    await render(fakeApi(), { access: { status: 'ready', eligible: false } })
    expect(document.querySelector('input')).toBeNull()
    expect(document.querySelector('a[href="/plan"]')).not.toBeNull()
  })

  test('falha ao conferir o plano oferece tentar de novo', async () => {
    const retry = mock(() => {})
    await render(fakeApi(), { access: { status: 'error', retry } })
    expect(alertText()).toContain('Não foi possível conferir o seu plano')
    await click('Tentar de novo')
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('busca do código', () => {
  test('o campo tem rótulo, dica e começa com o foco', async () => {
    await render(fakeApi())
    const field = input()
    expect(
      document.querySelector(`label[for="${field.id}"]`)?.textContent
    ).toBe('Código')
    const hint = document.getElementById(
      field.getAttribute('aria-describedby') ?? ''
    )
    expect(hint?.textContent).toContain('6 letras e números')
    expect(document.activeElement).toBe(field)
    // Sem seletor de bar: o código resolve o bar sozinho.
    expect(document.querySelector('select')).toBeNull()
  })

  test('envia o código normalizado e mostra o resumo da reserva', async () => {
    const api = fakeApi()
    await find(api)

    expect(api.lookup).toHaveBeenCalledWith({ code: 'AB3K9X' })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Reserva de Marina Souza')
    expect(text).toContain('Corinthians × Palmeiras')
    expect(text).toContain('Chopp em dobro')
    expect(text).toContain('0 de 3 validados')
  })

  test('resultado é anunciado e o foco vai para o resumo', async () => {
    await find(fakeApi())
    expect(status()).toBe(
      'Reserva de Marina Souza encontrada. 0 de 3 validados.'
    )
    expect(document.activeElement?.textContent).toBe('Reserva de Marina Souza')
  })

  test('código malformado não vai ao servidor e o erro fica preso ao campo', async () => {
    const api = fakeApi()
    await render(api)
    await type('ab')
    await submit()

    expect(api.lookup).not.toHaveBeenCalled()
    expect(alertText()).toBe('O código tem 6 letras e números.')
    const field = input()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toContain(
      document.querySelector('[role="alert"]')?.id ?? 'sem-id'
    )
    expect(document.activeElement).toBe(field)
  })

  // `null` é a resposta do servidor (WEB-316); `NOT_FOUND` era a de antes e
  // volta num rollback. A tela diz o mesmo nos dois casos.
  test.each([
    ['null', async () => null],
    [
      'NOT_FOUND',
      async () => {
        throw refusal('NOT_FOUND')
      }
    ]
  ])('código desconhecido (%s) mostra a recusa e devolve o foco ao campo', async (_, answer) => {
    const api = fakeApi({ lookup: mock(answer) })
    await find(api)

    expect(alertText()).toBe(
      'Código não encontrado, recusado ou cancelado. Confira com o torcedor.'
    )
    expect(document.body.textContent).not.toContain('texto do servidor')
    expect(document.activeElement).toBe(input())
    expect(button('Registrar chegada')).toBeUndefined()
  })
})

describe('confirmação da chegada', () => {
  test('+1 pede confirmação e não envia nada antes dela', async () => {
    const api = fakeApi()
    await find(api)
    await click('Registrar chegada')

    expect(api.registerArrival).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Registrar chegada?')
    expect(dialog?.textContent).toContain('Reserva de Marina Souza')
    expect(dialog?.textContent).toContain('1 de 3 validados')
    expect(document.body.textContent).toContain('0 de 3 validados')
  })

  test('cancelar fecha sem registrar', async () => {
    const api = fakeApi()
    await find(api)
    await click('Registrar chegada')
    await click('Cancelar')

    expect(api.registerArrival).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.textContent).toContain('0 de 3 validados')
  })

  test('confirmar registra e fecha', async () => {
    const api = fakeApi()
    await find(api)
    await arrive()

    expect(api.registerArrival).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('registro de chegada', () => {
  test('+1 avança o contador, anuncia e oferece desfazer', async () => {
    const api = fakeApi()
    await find(api)
    await arrive()

    expect(api.registerArrival).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('1 de 3 validados')
    expect(status()).toBe('Chegada registrada. 1 de 3 validados.')
    expect(button('Desfazer a última chegada')).toBeDefined()
    expect(document.activeElement).toBe(button('Registrar chegada') ?? null)
  })

  test('toque duplo envia um pedido só', async () => {
    const api = fakeApi()
    await find(api)
    await arrive(3)

    expect(api.registerArrival).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('1 de 3 validados')
  })

  test('cada chegada usa um requestId novo', async () => {
    const api = fakeApi()
    await find(api)
    await arrive()
    await arrive()

    const [first, second] = requestIds(api)
    expect(first).not.toBe(second)
  })

  test('repetir depois de queda de rede reusa o mesmo requestId', async () => {
    let attempt = 0
    const api = fakeApi({
      registerArrival: mock(async ({ requestId }: { requestId: string }) => {
        attempt += 1
        if (attempt === 1) throw networkError()
        return { useId: requestId, usedCount: 1, maxUses: 3, undone: false }
      })
    })
    await find(api)
    await arrive()
    expect(alertText()).toContain('Não foi possível registrar a chegada')

    await arrive()
    const [first, second] = requestIds(api)
    expect(second).toBe(first)
    expect(document.body.textContent).toContain('1 de 3 validados')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  test('chegada além da reserva mostra erro útil', async () => {
    const api = fakeApi({
      registerArrival: mock(async () => {
        throw refusal('CONFLICT')
      })
    })
    await find(api)
    await arrive()

    expect(alertText()).toBe('As 3 pessoas desta reserva já foram validadas.')
  })

  test('reserva completa tira o +1, diz que acabou e mantém o desfazer', async () => {
    const api = fakeApi({
      lookup: mock(async () => ({ ...reservation, usedCount: 2 })),
      registerArrival: mock(async ({ requestId }: { requestId: string }) => ({
        useId: requestId,
        usedCount: 3,
        maxUses: 3,
        undone: false
      }))
    })
    await find(api)
    await arrive()

    expect(button('Registrar chegada')).toBeUndefined()
    expect(document.body.textContent).toContain('Reserva completa')
    expect(document.body.textContent).toContain(
      'As 3 pessoas desta reserva já foram validadas.'
    )
    expect(status()).toBe(
      'Chegada registrada. 3 de 3 validados. Reserva completa.'
    )
    expect(button('Desfazer a última chegada')).toBeDefined()
    expect(document.activeElement).toBe(button('Validar outro código') ?? null)
  })
})

describe('desfazer', () => {
  test('reverte a última chegada e devolve o foco ao +1', async () => {
    const api = fakeApi()
    await find(api)
    await arrive()
    const [requestId] = requestIds(api)
    await click('Desfazer a última chegada')

    expect(api.undoArrival).toHaveBeenCalledWith({ useId: requestId })
    expect(document.body.textContent).toContain('0 de 3 validados')
    expect(status()).toBe('Chegada desfeita. 0 de 3 validados.')
    expect(button('Desfazer a última chegada')).toBeUndefined()
    expect(document.activeElement).toBe(button('Registrar chegada') ?? null)
  })

  test('some quando o prazo curto acaba', async () => {
    await find(fakeApi(), { undoWindowMs: 40 })
    await arrive()
    expect(button('Desfazer a última chegada')).toBeDefined()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })
    expect(button('Desfazer a última chegada')).toBeUndefined()
    expect(document.body.textContent).toContain('1 de 3 validados')
  })

  test('recusa por prazo tira o botão e explica', async () => {
    const api = fakeApi({
      undoArrival: mock(async () => {
        throw refusal('PRECONDITION_FAILED')
      })
    })
    await find(api)
    await arrive()
    await click('Desfazer a última chegada')

    expect(alertText()).toBe('O prazo para desfazer esta chegada acabou.')
    expect(button('Desfazer a última chegada')).toBeUndefined()
  })
})

describe('janela de validação', () => {
  test('código que ainda não abriu mostra quando vale e não oferece +1', async () => {
    await find(fakeApi(), { now: NOW - 6 * HOUR })

    const text = document.body.textContent ?? ''
    expect(text).toContain('Este código ainda não abriu')
    expect(text).toMatch(/Ele vale de .+\d{2}:\d{2} até .+\d{2}:\d{2}\./)
    expect(button('Registrar chegada')).toBeUndefined()
  })

  test('reserva fora da janela é anunciada junto com o motivo', async () => {
    await find(fakeApi(), { now: NOW + 6 * HOUR })

    expect(status()).toMatch(
      /^Reserva de Marina Souza encontrada\. 0 de 3 validados\. Este código expirou\. Ele valia até .+\.$/
    )
  })

  test('código expirado mostra até quando valia e não oferece +1', async () => {
    await find(fakeApi(), { now: NOW + 6 * HOUR })

    const text = document.body.textContent ?? ''
    expect(text).toContain('Este código expirou')
    expect(text).toMatch(/Ele valia até .+\d{2}:\d{2}\./)
    expect(button('Registrar chegada')).toBeUndefined()
  })
})

describe('estado da reserva', () => {
  test('reserva pendente resolve, explica e não oferece +1', async () => {
    const api = fakeApi({
      lookup: mock(async () => ({
        ...reservation,
        reservationStatus: 'pending' as const
      }))
    })
    await find(api)

    const text = document.body.textContent ?? ''
    expect(text).toContain('Reserva de Marina Souza')
    expect(text).toContain('Esta reserva ainda não foi confirmada')
    expect(button('Registrar chegada')).toBeUndefined()
    expect(status()).toContain('Esta reserva ainda não foi confirmada.')
  })

  test('reserva cancelada com código ainda ativo não oferece +1', async () => {
    const api = fakeApi({
      lookup: mock(async () => ({
        ...reservation,
        reservationStatus: 'cancelled' as const
      }))
    })
    await find(api)

    expect(document.body.textContent).toContain('Esta reserva foi cancelada')
    expect(button('Registrar chegada')).toBeUndefined()
  })

  test('reserva que deixou de estar confirmada entre a busca e o +1', async () => {
    const api = fakeApi({
      registerArrival: mock(async () => {
        throw refusal('UNPROCESSABLE_CONTENT')
      })
    })
    await find(api)
    await arrive()

    expect(alertText()).toBe(
      'Esta reserva não está confirmada. Busque o código de novo.'
    )
  })
})

test('validar outro código limpa a tela e volta ao campo', async () => {
  await find(fakeApi())
  await arrive()
  await click('Validar outro código')

  expect(document.body.textContent).not.toContain('Marina Souza')
  expect(status()).toBe('')
  expect(input().value).toBe('')
  expect(document.activeElement).toBe(input())
})
