<template>
  <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">
    <section class="card">
      <header class="card-header">
        <h2>Torii Connection</h2>
        <span class="status-pill" :class="pingIndicator.class">
          {{ pingIndicator.label }}
        </span>
      </header>
      <div class="form-grid">
        <label>
          Torii URL
          <input v-model="connectionForm.toriiUrl" placeholder="http://127.0.0.1:8080" />
        </label>
        <label>
          Chain ID
          <input v-model="connectionForm.chainId" placeholder="dev-chain" />
        </label>
        <label>
          Asset Definition ID
          <input v-model="connectionForm.assetDefinitionId" placeholder="rose#wonderland" />
        </label>
        <label>
          Network Prefix
          <input type="number" min="0" max="255" v-model.number="connectionForm.networkPrefix" />
        </label>
      </div>
      <div class="actions">
        <button @click="handlePing" :disabled="pingLoading">Check health</button>
        <button class="secondary" @click="saveConnection">Save</button>
      </div>
      <p v-if="pingMessage" class="helper">{{ pingMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Key Material</h2>
      </header>
      <div class="form-grid">
        <label>
          Display Name
          <input v-model="userForm.displayName" placeholder="Alice" />
        </label>
        <label>
          Domain
          <input v-model="userForm.domain" placeholder="wonderland" />
        </label>
        <label>
          Private Key (hex)
          <textarea v-model="userForm.privateKeyHex" rows="2" placeholder="64 hex chars"></textarea>
        </label>
        <label>
          Public Key
          <textarea v-model="userForm.publicKeyHex" rows="2" placeholder="auto-derived" readonly></textarea>
        </label>
        <label>
          Account ID
          <input v-model="userForm.accountId" readonly />
        </label>
        <div class="grid-2">
          <div class="kv">
            <span class="kv-label">IH58</span>
            <span class="kv-value">{{ userForm.ih58 || '—' }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">Compressed</span>
            <span class="kv-value">{{ userForm.compressed || '—' }}</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button @click="handleGenerate" :disabled="generating">Generate pair</button>
        <button class="secondary" @click="handleDerivePublic" :disabled="!userForm.privateKeyHex">Derive from private key</button>
        <button class="secondary" @click="saveUser">Save identity</button>
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Register Account</h2>
        <p class="helper">Requires authority credentials — Torii receives a direct Norito transaction.</p>
      </header>
      <div class="form-grid">
        <label>
          Authority Account ID
          <input v-model="authorityForm.accountId" placeholder="ed0120..@wonderland" />
        </label>
        <label>
          Authority Private Key (hex)
          <textarea v-model="authorityForm.privateKeyHex" rows="2"></textarea>
        </label>
        <label>
          Account Metadata (JSON)
          <textarea v-model="metadataInput" rows="4" :placeholder="metadataPlaceholder"></textarea>
        </label>
      </div>
      <div class="actions">
        <button @click="handleRegister" :disabled="registering || !canRegister">
          {{ registering ? 'Submitting…' : 'Register account' }}
        </button>
        <button class="secondary" @click="saveAuthority">Save authority</button>
      </div>
      <p v-if="registerMessage" class="helper">{{ registerMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import { useSessionStore } from '@/stores/session'
import {
  deriveAccountAddress,
  derivePublicKey,
  generateKeyPair,
  pingTorii,
  registerAccount
} from '@/services/iroha'

type PingState = 'idle' | 'ok' | 'error'

const session = useSessionStore()

const connectionForm = reactive({ ...session.connection })
const userForm = reactive({ ...session.user })
const authorityForm = reactive({ ...session.authority })
const metadataPlaceholder = '{\n  "nickname": "Alice"\n}'
const metadataInput = ref(JSON.stringify({ nickname: session.user.displayName || '' }, null, 2))

const pingState = ref<PingState>('idle')
const pingMessage = ref('')
const pingLoading = ref(false)
const generating = ref(false)
const registering = ref(false)
const registerMessage = ref('')

watch(
  () => session.connection,
  (value) => Object.assign(connectionForm, value),
  { deep: true }
)

watch(
  () => session.user,
  (value) => Object.assign(userForm, value),
  { deep: true }
)

watch(
  () => session.authority,
  (value) => Object.assign(authorityForm, value),
  { deep: true }
)

watch(
  () => [userForm.domain, userForm.publicKeyHex],
  () => {
    if (!userForm.publicKeyHex || !userForm.domain) return
    try {
      const summary = deriveAccountAddress({
        domain: userForm.domain,
        publicKeyHex: userForm.publicKeyHex,
        networkPrefix: connectionForm.networkPrefix
      })
      Object.assign(userForm, summary)
    } catch (error) {
      console.warn('Failed to derive address', error)
    }
  },
  { deep: true }
)

const pingIndicator = computed(() => {
  switch (pingState.value) {
    case 'ok':
      return { label: 'Healthy', class: 'status-pill ok' }
    case 'error':
      return { label: 'Offline', class: 'status-pill error' }
    default:
      return { label: 'Idle', class: 'status-pill' }
  }
})

const canRegister = computed(
  () =>
    Boolean(
      connectionForm.toriiUrl &&
        connectionForm.chainId &&
        userForm.accountId &&
        authorityForm.accountId &&
        authorityForm.privateKeyHex
    )
)

const metadataSchema = z
  .record(z.any())
  .catch(() => ({}))

const saveConnection = () => {
  session.updateConnection({ ...connectionForm })
}

const saveUser = () => {
  session.updateUser({ ...userForm })
}

const saveAuthority = () => {
  session.updateAuthority({ ...authorityForm })
}

const handlePing = async () => {
  pingLoading.value = true
  pingMessage.value = ''
  try {
    const result = await pingTorii(connectionForm.toriiUrl)
    pingState.value = result ? 'ok' : 'error'
    pingMessage.value = result ? 'Torii responded successfully.' : 'No response from Torii.'
  } catch (error) {
    pingState.value = 'error'
    pingMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    pingLoading.value = false
  }
}

const handleGenerate = async () => {
  generating.value = true
  try {
    const pair = await generateKeyPair()
    userForm.privateKeyHex = pair.privateKeyHex
    userForm.publicKeyHex = pair.publicKeyHex
    if (!userForm.domain) {
      userForm.domain = 'wonderland'
    }
    const summary = deriveAccountAddress({
      domain: userForm.domain,
      publicKeyHex: pair.publicKeyHex,
      networkPrefix: connectionForm.networkPrefix
    })
    Object.assign(userForm, summary)
    saveUser()
  } finally {
    generating.value = false
  }
}

const handleDerivePublic = () => {
  if (!userForm.privateKeyHex) return
  try {
    const derived = derivePublicKey(userForm.privateKeyHex)
    userForm.publicKeyHex = derived.publicKeyHex
    const summary = deriveAccountAddress({
      domain: userForm.domain || 'wonderland',
      publicKeyHex: derived.publicKeyHex,
      networkPrefix: connectionForm.networkPrefix
    })
    Object.assign(userForm, summary)
  } catch (error) {
    registerMessage.value = error instanceof Error ? error.message : String(error)
  }
}

const handleRegister = async () => {
  if (!canRegister.value) return
  registering.value = true
  registerMessage.value = ''
  try {
    const metadata = metadataSchema.parse(JSON.parse(metadataInput.value || '{}'))
    const result = await registerAccount({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId,
      accountId: userForm.accountId,
      metadata,
      authorityAccountId: authorityForm.accountId,
      authorityPrivateKeyHex: authorityForm.privateKeyHex
    })
    registerMessage.value = `Submitted transaction ${result.hash}`
  } catch (error) {
    registerMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    registering.value = false
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.helper {
  margin-top: 12px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}
</style>
