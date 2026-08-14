import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

import {
  buildGoogleMapsUrl,
  loadGoogleMaps,
  resetGoogleMapsLoader
} from './google-maps-loader'

let dom: JSDOM

class MapStub {}
class MarkerStub {}
class CircleStub {}

function installGoogleMapsStub(): void {
  const maps = {
    importLibrary: async (name: string) =>
      name === 'marker'
        ? { Marker: MarkerStub }
        : { Map: MapStub, Circle: CircleStub }
  }
  Object.defineProperty(window, 'google', {
    value: { maps },
    configurable: true
  })
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  Object.defineProperty(globalThis, 'window', {
    value: dom.window,
    configurable: true
  })
  Object.defineProperty(globalThis, 'document', {
    value: dom.window.document,
    configurable: true
  })
})

afterEach(() => {
  resetGoogleMapsLoader()
  dom.window.close()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'document')
})

describe('Google Maps loader', () => {
  test('encodes the public key, callback and optional tracking channel', () => {
    const url = new URL(
      buildGoogleMapsUrl({ apiKey: 'key with spaces', channel: 'onside/web' })
    )
    expect(url.origin).toBe('https://maps.googleapis.com')
    expect(url.searchParams.get('key')).toBe('key with spaces')
    expect(url.searchParams.get('loading')).toBe('async')
    expect(url.searchParams.get('callback')).toBe('__onsideInitMap')
    expect(url.searchParams.get('channel')).toBe('onside/web')
  })

  test('reuses one script and promise for concurrent callers', async () => {
    const first = loadGoogleMaps({ apiKey: 'key' })
    const second = loadGoogleMaps({ apiKey: 'key' })
    expect(first).toBe(second)
    expect(document.querySelectorAll('script')).toHaveLength(1)

    installGoogleMapsStub()
    window.__onsideInitMap?.()
    await expect(first).resolves.toMatchObject({
      Map: MapStub,
      Marker: MarkerStub,
      Circle: CircleStub
    })
    expect(window.__onsideInitMap).toBeUndefined()
  })

  test('imports constructors when only the Google Maps namespace is ready', async () => {
    installGoogleMapsStub()

    await expect(loadGoogleMaps({ apiKey: 'key' })).resolves.toMatchObject({
      Map: MapStub,
      Marker: MarkerStub,
      Circle: CircleStub
    })
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })

  test('waits for the API callback when the script load event fires first', async () => {
    let callbackReady = false
    let importCalls = 0
    const pending = loadGoogleMaps({ apiKey: 'key' })
    const outcome = pending.then(
      () => 'resolved',
      () => 'rejected'
    )

    Object.defineProperty(window, 'google', {
      value: {
        maps: {
          importLibrary: async (name: string) => {
            importCalls += 1
            if (!callbackReady)
              throw new Error('Google bootstrap ainda incompleto')
            return name === 'marker'
              ? { Marker: MarkerStub }
              : { Map: MapStub, Circle: CircleStub }
          }
        }
      },
      configurable: true
    })

    document
      .querySelector('script')
      ?.dispatchEvent(new dom.window.Event('load'))
    await Promise.resolve()
    await Promise.resolve()

    expect(importCalls).toBe(0)
    callbackReady = true
    window.__onsideInitMap?.()
    await expect(outcome).resolves.toBe('resolved')
  })

  test('rejects a partial API instead of exposing invalid constructors', async () => {
    Object.defineProperty(window, 'google', {
      value: {
        maps: {
          importLibrary: async (name: string) =>
            name === 'marker'
              ? { Marker: MarkerStub }
              : { Map: {}, Circle: CircleStub }
        }
      },
      configurable: true
    })

    await expect(loadGoogleMaps({ apiKey: 'key' })).rejects.toThrow(
      'sem os construtores necessários'
    )
  })

  test('cleans a failed script and allows retry', async () => {
    const first = loadGoogleMaps({ apiKey: 'key' })
    document
      .querySelector('script')
      ?.dispatchEvent(new dom.window.Event('error'))
    await expect(first).rejects.toThrow('Falha ao carregar o Google Maps')
    expect(document.querySelectorAll('script')).toHaveLength(0)

    const retry = loadGoogleMaps({ apiKey: 'key' })
    expect(retry).not.toBe(first)
    expect(document.querySelectorAll('script')).toHaveLength(1)
    installGoogleMapsStub()
    window.__onsideInitMap?.()
    await expect(retry).resolves.toMatchObject({ Map: MapStub })
  })

  test('reset rejects an active load and removes its global state', async () => {
    const pending = loadGoogleMaps({ apiKey: 'key' })
    resetGoogleMapsLoader()
    await expect(pending).rejects.toThrow('reiniciado')
    expect(document.querySelectorAll('script')).toHaveLength(0)
    expect(window.__onsideInitMap).toBeUndefined()
  })
})
