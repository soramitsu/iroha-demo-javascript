import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountSwitcher from '@/components/AccountSwitcher.vue'
import { useSessionStore } from '@/stores/session'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

describe('AccountSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders accounts and switches the active account', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useSessionStore()
    store.$patch({
      accounts: [
        {
          displayName: 'Alice',
          domain: 'wonderland',
          accountId: 'alice@wonderland',
          publicKeyHex: 'pub1',
          privateKeyHex: 'priv1',
          ih58: 'ih58-1',
          compressed: '',
          compressedWarning: ''
        },
        {
          displayName: 'Bob',
          domain: 'wonderland',
          accountId: 'bob@wonderland',
          publicKeyHex: 'pub2',
          privateKeyHex: 'priv2',
          ih58: 'ih58-2',
          compressed: '',
          compressedWarning: ''
        }
      ],
      activeAccountId: 'alice@wonderland'
    })
    const setSpy = vi.spyOn(store, 'setActiveAccount')
    const persistSpy = vi.spyOn(store, 'persistState')

    const wrapper = mount(AccountSwitcher, {
      global: {
        plugins: [pinia]
      }
    })

    expect(wrapper.text()).toContain('Active account')
    const selector = wrapper.get('select')
    await selector.setValue('bob@wonderland')

    expect(setSpy).toHaveBeenCalledWith('bob@wonderland')
    expect(persistSpy).toHaveBeenCalled()
  })

  it('shows empty state when no accounts exist', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(AccountSwitcher, {
      global: {
        plugins: [pinia]
      }
    })

    expect(wrapper.text()).toContain('No saved accounts yet')
    expect(wrapper.text()).toContain('Start registration')
  })
})
