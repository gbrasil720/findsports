import { afterEach, beforeEach, expect, test } from 'bun:test'
import { usePortalContainer } from '@findsports_oficial/ui/components/portal'
import { JSDOM } from 'jsdom'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProductFrame } from './product-frame'

let dom: JSDOM
const roots: Root[] = []

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
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  dom.window.close()
})

test('ProductFrame shares its shell node with portal primitives', async () => {
  let containerFromContext: HTMLElement | null | undefined
  function Probe() {
    const container = usePortalContainer()
    useEffect(() => {
      containerFromContext = (
        container && 'current' in container ? container.current : container
      ) as HTMLElement | null | undefined
    }, [container])
    return null
  }

  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)

  await act(async () => {
    root.render(
      <ProductFrame header={null}>
        <Probe />
      </ProductFrame>
    )
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(containerFromContext).toBe(document.querySelector('.onside-app'))
})
