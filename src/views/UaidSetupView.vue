<template>
  <div class="card-grid uaid-grid">
    <section class="card">
      <header class="card-header">
        <div>
          <h2>SORA Nexus Keygen</h2>
          <p class="helper">Generate a UAID, keypair, and backups straight from this wallet.</p>
        </div>
      </header>

      <div class="form-grid">
        <label>
          Torii URL
          <input v-model.trim="connectionForm.toriiUrl" placeholder="http://127.0.0.1:8080" />
        </label>
        <label>
          Chain ID
          <input v-model.trim="connectionForm.chainId" placeholder="nexus-chain" />
        </label>
      </div>
      <div class="actions">
        <button class="secondary" @click="saveConnection" :disabled="!connectionForm.toriiUrl">
          Save connection
        </button>
      </div>
      <p v-if="connectionMessage" class="helper">{{ connectionMessage }}</p>

      <div class="form-grid keygen-form">
        <label>
          Display Name
          <input v-model.trim="aliasInput" placeholder="Alice" />
        </label>
        <label>
          Domain
          <input v-model.trim="domainInput" placeholder="wonderland" />
        </label>
        <label>
          Recovery Phrase Length
          <select v-model.number="wordCount">
            <option :value="12">12 words</option>
            <option :value="24">24 words</option>
          </select>
        </label>
        <label>
          Identity Metadata (JSON, optional)
          <textarea
            v-model.trim="identityInput"
            rows="3"
            placeholder='{"country":"JP","kyc_id":"..."}'
          ></textarea>
        </label>
      </div>

      <div class="actions">
        <button @click="generateRecovery" :disabled="generating">
          {{ generating ? 'Generating…' : 'Generate recovery phrase' }}
        </button>
        <button class="secondary" @click="registerGeneratedIdentity" :disabled="!canRegisterGenerated">
          {{ onboardingBusy ? 'Registering…' : 'Register identity' }}
        </button>
      </div>
      <p v-if="generateError" class="helper error">{{ generateError }}</p>
      <p v-if="onboardingError" class="helper error">{{ onboardingError }}</p>
      <p v-if="onboardingStatus" class="helper success">{{ onboardingStatus }}</p>

      <div v-if="mnemonicWords.length" class="backup-panel">
        <p class="helper">Write these words down in order. They restore your wallet.</p>
        <div class="mnemonic-grid">
          <span v-for="(word, index) in mnemonicWords" :key="word + index">
            <strong>{{ index + 1 }}.</strong> {{ word }}
          </span>
        </div>
        <div class="backup-actions">
          <button class="secondary" @click="downloadBackup('manual')">Download backup</button>
          <button class="secondary" @click="downloadBackup('icloud')">Store for iCloud Drive</button>
          <button class="secondary" @click="downloadBackup('google')">Store for Google Drive</button>
        </div>
        <label class="backup-confirm">
          <input type="checkbox" v-model="backupConfirmed" />
          <span>I stored my recovery phrase safely.</span>
        </label>
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Manual UAID Entry</h2>
      </header>
      <ol class="uaid-instructions">
        <li>Paste an existing UAID (format <code>uaid:abcdef...</code>).</li>
        <li>Optionally validate it against your Torii endpoint.</li>
      </ol>
      <label>
        UAID Literal
        <input v-model.trim="uaidInput" placeholder="uaid:0f4d…" />
      </label>
      <div class="actions">
        <button @click="handleSave" :disabled="!canSaveManual">Save & Continue</button>
        <button
          class="secondary"
          @click="handleVerify"
          :disabled="!session.connection.toriiUrl || verifying || !uaidInput"
        >
          {{ verifying ? 'Checking…' : 'Verify with Torii' }}
        </button>
      </div>
      <p v-if="error" class="helper error">{{ error }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>IrohaConnect Pairing</h2>
      </header>
      <p class="helper">
        Already have keys on IrohaConnect? Generate a pairing session and approve it on your phone to
        keep signing on mobile while this desktop wallet observes balances.
      </p>
      <div v-if="connectPreview" class="connect-preview">
        <img
          v-if="connectQr"
          :src="connectQr"
          alt="IrohaConnect pairing QR"
          class="connect-qr"
        />
        <div class="kv monospace">
          <span class="kv-label">Session ID</span>
          <span class="kv-value">{{ connectPreview.sidBase64Url }}</span>
        </div>
        <div class="kv monospace">
          <span class="kv-label">Wallet Token</span>
          <span class="kv-value">{{ connectPreview.tokenWallet ?? 'Provided on scan' }}</span>
        </div>
      </div>
      <div class="actions">
        <button @click="startConnectPairing" :disabled="connectLoading">
          {{ connectLoading ? 'Preparing…' : 'Generate pairing QR' }}
        </button>
        <button class="secondary" @click="resetConnect" :disabled="!connectPreview">Reset</button>
      </div>
      <p v-if="connectError" class="helper error">{{ connectError }}</p>
      <p class="helper small">
        The UAID stays on your phone. The desktop wallet will sync permissions once the Connect flow
        exposes signing APIs in upcoming releases.
      </p>
    </section>

    <section class="card" v-if="overview">
      <header class="card-header">
        <h2>Dataspace Bindings</h2>
      </header>
      <div v-if="overview.bindings.dataspaces.length" class="kv-list">
        <div class="kv" v-for="space in overview.bindings.dataspaces" :key="space.id">
          <span class="kv-label">Dataspace</span>
          <span class="kv-value">{{ space.alias || space.id }}</span>
          <span class="kv-label">Accounts</span>
          <span class="kv-value">{{ (space.accounts || []).join(', ') || '—' }}</span>
        </div>
      </div>
      <p v-else class="helper">No dataspaces bound yet. Publish a manifest before transacting.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { useSessionStore } from '@/stores/session'
import {
  createConnectPreview,
  deriveAccountAddress,
  derivePublicKey,
  fetchUaidOverview,
  onboardAccount
} from '@/services/iroha'
import { generateMnemonicWords, mnemonicToPrivateKeyHex, normalizeMnemonicPhrase } from '@/utils/mnemonic'

const session = useSessionStore()
const router = useRouter()

const connectionForm = reactive({
  toriiUrl: session.connection.toriiUrl,
  chainId: session.connection.chainId
})

watch(
  () => session.connection,
  (value) => {
    connectionForm.toriiUrl = value.toriiUrl
    connectionForm.chainId = value.chainId
  },
  { deep: true }
)

const connectionMessage = ref('')
const saveConnection = () => {
  if (!connectionForm.toriiUrl) {
    connectionMessage.value = 'Torii URL is required.'
    return
  }
  session.updateConnection({
    toriiUrl: connectionForm.toriiUrl,
    chainId: connectionForm.chainId
  })
  session.persistState()
  connectionMessage.value = 'Connection saved.'
}

const aliasInput = ref(session.user.displayName || '')
const domainInput = ref(session.user.domain || 'wonderland')
const identityInput = ref('')
const wordCount = ref<12 | 24>(24)
const mnemonicWords = ref<string[]>([])
const generatedKeys = ref<{ privateKeyHex: string; publicKeyHex: string; accountId: string } | null>(
  null
)
const backupConfirmed = ref(false)
const generating = ref(false)
const generateError = ref('')
const onboardingError = ref('')
const onboardingStatus = ref('')
const onboardingBusy = ref(false)

const generateRecovery = async () => {
  generateError.value = ''
  try {
    generating.value = true
    const words = generateMnemonicWords(wordCount.value)
    mnemonicWords.value = words
    const mnemonic = normalizeMnemonicPhrase(words.join(' '))
    const privateKeyHex = mnemonicToPrivateKeyHex(mnemonic)
    const { publicKeyHex } = await derivePublicKey(privateKeyHex)
    const domain = domainInput.value.trim() || 'wonderland'
    const summary = deriveAccountAddress({
      domain,
      publicKeyHex,
      networkPrefix: session.connection.networkPrefix
    })
    generatedKeys.value = {
      privateKeyHex,
      publicKeyHex,
      accountId: summary.accountId
    }
    backupConfirmed.value = false
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    generateError.value = message
    generatedKeys.value = null
  } finally {
    generating.value = false
  }
}

const parseIdentity = () => {
  if (!identityInput.value.trim()) {
    return undefined
  }
  try {
    const parsed = JSON.parse(identityInput.value)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
    throw new Error('Identity metadata must be a JSON object.')
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Invalid identity metadata JSON payload.'
    )
  }
}

const canRegisterGenerated = computed(() => {
  return Boolean(
    generatedKeys.value &&
      backupConfirmed.value &&
      connectionForm.toriiUrl &&
      connectionForm.chainId &&
      aliasInput.value.trim()
  )
})

const registerGeneratedIdentity = async () => {
  onboardingError.value = ''
  onboardingStatus.value = ''
  if (!generatedKeys.value) {
    onboardingError.value = 'Generate a keypair first.'
    return
  }
  if (!backupConfirmed.value) {
    onboardingError.value = 'Confirm that you stored the recovery phrase.'
    return
  }
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    onboardingError.value = 'Set your Torii URL and chain ID first.'
    return
  }
  onboardingBusy.value = true
  try {
    const identity = parseIdentity()
    const response = await onboardAccount({
      toriiUrl: connectionForm.toriiUrl,
      alias: aliasInput.value.trim() || 'Unnamed',
      accountId: generatedKeys.value.accountId,
      identity
    })
    session.updateConnection({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId
    })
    session.updateUser({
      displayName: aliasInput.value.trim(),
      domain: domainInput.value.trim() || 'wonderland',
      accountId: response.account_id,
      uaid: response.uaid,
      publicKeyHex: generatedKeys.value.publicKeyHex,
      privateKeyHex: generatedKeys.value.privateKeyHex
    })
    session.persistState()
    onboardingStatus.value = `UAID ${response.uaid} queued (tx ${response.tx_hash_hex.slice(0, 12)}…)`
    router.push('/setup')
  } catch (err) {
    onboardingError.value = err instanceof Error ? err.message : String(err)
  } finally {
    onboardingBusy.value = false
  }
}

const downloadBackup = (target: 'manual' | 'icloud' | 'google') => {
  if (!mnemonicWords.value.length) {
    return
  }
  const payload = {
    mnemonic: mnemonicWords.value.join(' '),
    wordCount: wordCount.value,
    createdAt: new Date().toISOString(),
    target
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  const filename =
    target === 'icloud'
      ? 'iroha-icloud-backup.json'
      : target === 'google'
        ? 'iroha-google-backup.json'
        : 'iroha-backup.json'
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const uaidInput = ref(session.user.uaid)
const verifying = ref(false)
const overview = ref<Awaited<ReturnType<typeof fetchUaidOverview>> | null>(null)
const error = ref('')

watch(
  () => session.user.uaid,
  (value) => {
    if (!uaidInput.value && value) {
      uaidInput.value = value
    }
  }
)

const canSaveManual = computed(() => Boolean(uaidInput.value?.trim()))

const normalizeUaid = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase().startsWith('uaid:')) {
    return trimmed.toLowerCase()
  }
  if (trimmed.length === 64) {
    return `uaid:${trimmed.toLowerCase()}`
  }
  return trimmed
}

const handleVerify = async () => {
  if (!session.connection.toriiUrl || !uaidInput.value) {
    error.value = 'Configure Torii first, then try again.'
    return
  }
  verifying.value = true
  error.value = ''
  try {
    overview.value = await fetchUaidOverview({
      toriiUrl: session.connection.toriiUrl,
      uaid: uaidInput.value
    })
    const canonical = overview.value.bindings.uaid
    session.updateUser({ uaid: canonical })
    session.persistState()
  } catch (err) {
    overview.value = null
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    verifying.value = false
  }
}

const handleSave = () => {
  const normalized = normalizeUaid(uaidInput.value ?? '')
  if (!normalized) {
    error.value = 'Enter a valid UAID.'
    return
  }
  session.updateUser({ uaid: normalized })
  session.persistState()
  router.push('/setup')
}

const connectPreview = ref<Awaited<ReturnType<typeof createConnectPreview>> | null>(null)
const connectQr = ref('')
const connectLoading = ref(false)
const connectError = ref('')

const startConnectPairing = async () => {
  connectError.value = ''
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    connectError.value = 'Set your Torii URL and chain ID first.'
    return
  }
  connectLoading.value = true
  try {
    const preview = await createConnectPreview({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId
    })
    connectPreview.value = preview
    connectQr.value = preview.walletUri ? await QRCode.toDataURL(preview.walletUri) : ''
  } catch (err) {
    connectError.value = err instanceof Error ? err.message : String(err)
    connectPreview.value = null
    connectQr.value = ''
  } finally {
    connectLoading.value = false
  }
}

const resetConnect = () => {
  connectPreview.value = null
  connectQr.value = ''
  connectError.value = ''
}
</script>

<style scoped>
.uaid-grid {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.uaid-instructions {
  margin-top: 0;
  padding-left: 20px;
  color: var(--iroha-muted);
}

.keygen-form label textarea {
  resize: vertical;
}

.backup-panel {
  margin-top: 16px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.mnemonic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 12px;
}

.mnemonic-grid span {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
}

.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.backup-confirm {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.85rem;
}

.error {
  color: #b91c1c;
}

.success {
  color: #16a34a;
}

.connect-preview {
  margin-bottom: 16px;
  text-align: center;
}

.connect-qr {
  width: 180px;
  height: 180px;
  object-fit: contain;
  margin-bottom: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
}

.monospace {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.helper.small {
  font-size: 0.8rem;
  color: var(--iroha-muted);
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
