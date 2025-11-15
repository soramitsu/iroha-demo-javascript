import { defineStore } from 'pinia'

export const SESSION_STORAGE_KEY = 'iroha-demo:session'

export type ConnectionConfig = {
  toriiUrl: string
  chainId: string
  assetDefinitionId: string
  networkPrefix: number
}

export type UserProfile = {
  displayName: string
  domain: string
  accountId: string
  publicKeyHex: string
  privateKeyHex: string
  ih58: string
  compressed: string
  compressedWarning: string
}

export type AuthorityProfile = {
  accountId: string
  privateKeyHex: string
}

export type SessionState = {
  hydrated: boolean
  connection: ConnectionConfig
  user: UserProfile
  authority: AuthorityProfile
}

const defaultState = (): SessionState => ({
  hydrated: false,
  connection: {
    toriiUrl: '',
    chainId: '',
    assetDefinitionId: '',
    networkPrefix: 42
  },
  user: {
    displayName: '',
    domain: 'wonderland',
    accountId: '',
    publicKeyHex: '',
    privateKeyHex: '',
    ih58: '',
    compressed: '',
    compressedWarning: ''
  },
  authority: {
    accountId: '',
    privateKeyHex: ''
  }
})

export const useSessionStore = defineStore('session', {
  state: defaultState,
  getters: {
    hasAccount: (state) => Boolean(state.user.accountId && state.user.privateKeyHex)
  },
  actions: {
    hydrate() {
      if (this.hydrated) {
        return
      }
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          this.$patch({ ...defaultState(), ...parsed, hydrated: true })
          return
        } catch (error) {
          console.warn('Failed to parse saved session', error)
          localStorage.removeItem(SESSION_STORAGE_KEY)
        }
      }
      this.hydrated = true
    },
    persistState(snapshot?: SessionState) {
      const payload = JSON.stringify(snapshot ?? this.$state)
      localStorage.setItem(SESSION_STORAGE_KEY, payload)
    },
    reset() {
      const fresh = defaultState()
      this.$patch(fresh)
      this.persistState()
    },
    updateConnection(partial: Partial<ConnectionConfig>) {
      this.connection = { ...this.connection, ...partial }
    },
    updateUser(partial: Partial<UserProfile>) {
      this.user = { ...this.user, ...partial }
    },
    updateAuthority(partial: Partial<AuthorityProfile>) {
      this.authority = { ...this.authority, ...partial }
    }
  }
})
