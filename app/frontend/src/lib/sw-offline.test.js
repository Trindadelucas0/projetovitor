import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

function worker({ hit = null, keys = [] } = {}) {
  const listeners = {}
  const matched = []
  const deleted = []
  const caches = {
    keys: async () => keys,
    delete: async key => { deleted.push(key); return true },
    match: async request => { matched.push(request); return request === '/' ? hit : null },
    open: async () => ({ put: async () => {} })
  }
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    self: { addEventListener: (name, fn) => { listeners[name] = fn }, skipWaiting() {}, clients: { claim: async () => {} } },
    caches, location: { origin: 'https://app.example' }, URL, Promise,
    Request: class { constructor(request) { Object.assign(this, request) } },
    Response: { error: () => ({ error: true }) }, fetch: async () => { throw new Error('offline') }
  })
  return { listeners, matched, deleted }
}

describe('service worker offline', () => {
  it('usa a página inicial salva somente para navegação', async () => {
    const cached = { page: true }
    const w = worker({ hit: cached })
    let response
    w.listeners.fetch({ request: { url: 'https://app.example/treinos', method: 'GET', mode: 'navigate', headers: { has: () => false } }, respondWith: p => { response = p } })
    expect(await response).toBe(cached)
    expect(w.matched).toContain('/')
    const asset = worker({ hit: cached })
    asset.listeners.fetch({ request: { url: 'https://app.example/assets/main.js', method: 'GET', mode: 'cors', headers: { has: () => false } }, respondWith: p => { response = p } })
    expect(await response).toEqual({ error: true })
    expect(asset.matched).not.toContain('/')
  })

  it('remove versões antigas do app sem apagar caches de outras aplicações', async () => {
    const w = worker({ keys: ['avagym-rt-v41-old', 'outro-app-cache'] })
    let done
    w.listeners.activate({ waitUntil: p => { done = p } })
    await done
    expect(w.deleted).toEqual(['avagym-rt-v41-old'])
  })
})
