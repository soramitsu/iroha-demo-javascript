import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore, SESSION_STORAGE_KEY } from '@/stores/session'

const snapshot = () => JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')

describe('session store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('initialises with defaults', () => {
    const store = useSessionStore()
    expect(store.connection.networkPrefix).toBe(42)
    expect(store.user.domain).toBe('wonderland')
    expect(store.hasAccount).toBe(false)
  })

  it('updates slices and persists', () => {
    const store = useSessionStore()
    store.updateConnection({ toriiUrl: 'http://torii', chainId: 'dev' })
    store.updateUser({ accountId: 'ed0120@wonderland', privateKeyHex: 'aa' })
    store.updateAuthority({ accountId: 'authority@wonderland' })
    store.persistState()

    const persisted = snapshot()
    expect(persisted.connection.toriiUrl).toBe('http://torii')
    expect(persisted.user.accountId).toBe('ed0120@wonderland')
    expect(store.hasAccount).toBe(true)
  })

  it('hydrates from saved snapshot', () => {
    const payload = {
      connection: {
        toriiUrl: 'https://torii',
        chainId: 'chain',
        assetDefinitionId: 'rose#wonderland',
        networkPrefix: 10
      },
      user: {
        displayName: 'Alice',
        domain: 'wonderland',
        accountId: 'abc@wonderland',
        publicKeyHex: 'abc',
        privateKeyHex: 'def',
        ih58: 'IH58',
        compressed: 'snx1x',
        compressedWarning: ''
      },
      authority: {
        accountId: 'authority@wonderland',
        privateKeyHex: 'deadbeef'
      }
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))

    const store = useSessionStore()
    store.hydrate()

    expect(store.connection.toriiUrl).toBe('https://torii')
    expect(store.user.displayName).toBe('Alice')
    expect(store.hasAccount).toBe(true)
  })
})
