import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore } from '@/stores/theme'

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    setActivePinia(createPinia())
  })

  it('hydrates default theme when none stored', () => {
    const store = useThemeStore()
    store.hydrate()
    expect(store.current).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('persists and restores toggled theme', () => {
    const store = useThemeStore()
    store.hydrate()
    store.toggle()
    expect(store.current).toBe('light')
    expect(localStorage.getItem('iroha-demo:theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    setActivePinia(createPinia())
    const freshStore = useThemeStore()
    freshStore.hydrate()
    expect(freshStore.current).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
