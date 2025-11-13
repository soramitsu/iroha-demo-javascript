import { afterEach, vi } from 'vitest'

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    }
  } as Storage
}

const storage = createMemoryStorage()
globalThis.localStorage = storage
if (typeof globalThis.window !== 'undefined') {
  ;(globalThis.window as unknown as Window).localStorage = storage
}

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.localStorage?.clear()
})
