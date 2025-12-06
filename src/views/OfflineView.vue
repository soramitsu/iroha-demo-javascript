<template>
  <div class="card-grid offline-grid">
    <section class="card">
      <header class="card-header">
        <h2>Offline wallet & hardware</h2>
        <span class="status-pill" :class="{ ok: hardwareStatus.ok }">
          {{ hardwareStatus.label }}
        </span>
      </header>
      <p class="helper">
        Register a hardware-backed offline wallet (e.g., macOS Secure Enclave) to keep your offline
        keys safer. Registration stays on-device; no data is sent to Torii.
      </p>
      <div class="form-grid">
        <div>
          <p class="meta-label">Status</p>
          <p class="meta-value">{{ hardwareStatus.detail }}</p>
        </div>
        <div>
          <p class="meta-label">Registered</p>
          <p class="meta-value">
            {{
              offline.hasHardwareWallet
                ? `Yes · ${formatDate(offline.hardware.registeredAtMs)}`
                : 'Not registered'
            }}
          </p>
        </div>
      </div>
      <div class="actions">
        <button @click="registerHardware" :disabled="hardwareBusy || !hardwareStatus.ok">
          {{ hardwareBusy ? 'Registering…' : 'Register secure offline wallet' }}
        </button>
        <button class="secondary" @click="checkHardware" :disabled="hardwareBusy">Recheck</button>
      </div>
      <p v-if="hardwareMessage" class="helper">{{ hardwareMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Offline balance</h2>
        <span class="pill" :class="{ positive: Number(offline.wallet.balance) > 0 }">
          {{ offline.wallet.balance }} units
        </span>
      </header>
      <div class="form-grid">
        <div>
          <p class="meta-label">Last sync</p>
          <p class="meta-value">{{ formatDate(offline.wallet.syncedAtMs) || 'Never' }}</p>
        </div>
        <div>
          <p class="meta-label">Next policy expiry</p>
          <p class="meta-value">{{ formatDate(offline.wallet.nextPolicyExpiryMs) || '—' }}</p>
        </div>
        <div>
          <p class="meta-label">Policy refresh</p>
          <p class="meta-value">{{ formatDate(offline.wallet.nextRefreshMs) || '—' }}</p>
        </div>
      </div>
      <div class="actions">
        <button @click="syncAllowances" :disabled="syncingAllowances || !canSync">
          {{ syncingAllowances ? 'Syncing…' : 'Sync offline allowance' }}
        </button>
      </div>
      <p v-if="syncMessage" class="helper">{{ syncMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Offline allowances</h2>
        <span class="pill">{{ allowances.length }} entries</span>
      </header>
      <p class="helper">
        Allowances come from Torii offline policies. Sync to refresh remaining amounts and expiry.
      </p>
      <table class="table" v-if="allowances.length">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Remaining</th>
            <th>Policy expires</th>
            <th>Refresh at</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in allowances" :key="item.certificate_id_hex">
            <td>{{ item.asset_id }}</td>
            <td>{{ item.remaining_amount }}</td>
            <td>{{ formatDate(item.policy_expires_at_ms) || '—' }}</td>
            <td>{{ formatDate(item.refresh_at_ms) || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="helper">No allowances synced yet.</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Request offline payment</h2>
        <button class="secondary icon-cta" @click="generateInvoice" :disabled="!canGenerateInvoice">
          <span>Generate invoice</span>
        </button>
      </header>
      <div class="form-grid">
        <label>
          Amount
          <input v-model="invoiceForm.amount" type="text" placeholder="10.00" />
        </label>
        <label>
          Memo (optional)
          <input v-model="invoiceForm.memo" placeholder="Coffee refill" />
        </label>
        <label>
          Validity (minutes)
          <input v-model.number="invoiceForm.validityMinutes" type="number" min="1" max="1440" />
        </label>
      </div>
      <div v-if="invoicePayload" class="qr-panel">
        <div v-if="invoiceQr" class="qr" v-html="invoiceQr"></div>
        <pre class="qr-payload">{{ invoicePayload }}</pre>
      </div>
      <p v-if="invoiceMessage" class="helper">{{ invoiceMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Send offline payment</h2>
        <div class="actions-row">
          <button class="icon-cta secondary" @click="toggleInvoiceScanner">
            <span>{{ invoiceScanner.scanning ? 'Stop scan' : 'Scan invoice' }}</span>
          </button>
          <button class="icon-cta secondary" @click="invoiceScanner.openFilePicker">
            <span>Upload invoice QR</span>
          </button>
          <input
            ref="invoiceScanner.fileInputRef"
            type="file"
            accept="image/*"
            class="sr-only"
            @change="invoiceScanner.decodeFile"
          />
        </div>
      </header>
      <div v-if="invoiceScanner.scanning" class="scanner">
        <video ref="invoiceScanner.videoRef" autoplay muted playsinline></video>
      </div>
      <label>
        Invoice payload
        <textarea v-model="invoiceInput" rows="3" placeholder='{"invoice_id":"..."}'></textarea>
      </label>
      <label>
        Memo (optional)
        <input v-model="paymentMemo" placeholder="Thanks!" />
      </label>
      <div class="actions">
        <button @click="createPayment" :disabled="!invoiceInput || sendingPayment">
          {{ sendingPayment ? 'Building…' : 'Create payment' }}
        </button>
      </div>
      <p v-if="paymentMessage || invoiceScanner.message" class="helper">
        {{ paymentMessage || invoiceScanner.message }}
      </p>
      <div v-if="paymentPayload" class="qr-panel">
        <div v-if="paymentQr" class="qr" v-html="paymentQr"></div>
        <pre class="qr-payload">{{ paymentPayload }}</pre>
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Accept offline payment</h2>
        <div class="actions-row">
          <button class="icon-cta secondary" @click="togglePaymentScanner">
            <span>{{ paymentScanner.scanning ? 'Stop scan' : 'Scan payment' }}</span>
          </button>
          <button class="icon-cta secondary" @click="paymentScanner.openFilePicker">
            <span>Upload payment QR</span>
          </button>
          <input
            ref="paymentScanner.fileInputRef"
            type="file"
            accept="image/*"
            class="sr-only"
            @change="paymentScanner.decodeFile"
          />
        </div>
      </header>
      <div v-if="paymentScanner.scanning" class="scanner">
        <video ref="paymentScanner.videoRef" autoplay muted playsinline></video>
      </div>
      <label>
        Payment payload
        <textarea v-model="paymentInput" rows="3" placeholder='{"tx_id":"..."}'></textarea>
      </label>
      <div class="actions">
        <button @click="acceptPayment" :disabled="!paymentInput || acceptingPayment">
          {{ acceptingPayment ? 'Recording…' : 'Accept payment' }}
        </button>
      </div>
      <p v-if="acceptMessage || paymentScanner.message" class="helper">
        {{ acceptMessage || paymentScanner.message }}
      </p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Move funds to online wallet</h2>
      </header>
      <div class="form-grid">
        <label>
          Amount (blank = all)
          <input v-model="onlineForm.amount" type="text" />
        </label>
        <label>
          Destination Account
          <input v-model="onlineForm.receiver" placeholder="ed0120...@wonderland" />
        </label>
        <label>
          Memo (optional)
          <input v-model="onlineForm.memo" placeholder="Back to hot wallet" />
        </label>
      </div>
      <div class="actions">
        <button @click="moveToOnline" :disabled="movingOnline">
          {{ movingOnline ? 'Transferring…' : 'Send to online wallet' }}
        </button>
      </div>
      <p v-if="moveMessage" class="helper">{{ moveMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Offline history</h2>
      </header>
      <table class="table" v-if="offline.wallet.history.length">
        <thead>
          <tr>
            <th>Direction</th>
            <th>Amount</th>
            <th>Peer</th>
            <th>Counter</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in reversedHistory" :key="record.txId">
            <td>
              <span class="pill" :class="{ positive: record.direction === 'incoming' }">
                {{ record.direction }}
              </span>
            </td>
            <td>{{ record.amount }}</td>
            <td>{{ record.peer }}</td>
            <td>{{ record.counterLabel }}</td>
            <td>{{ formatDate(record.timestampMs) || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="helper">No offline transfers yet.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import QRCode from 'qrcode'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useOfflineStore } from '@/stores/offline'
import { fetchOfflineAllowances } from '@/services/offline'
import {
  createInvoice,
  createPaymentPayload,
  encodeInvoice,
  parseInvoice,
  parsePaymentPayload
} from '@/utils/offline'
import { transferAsset } from '@/services/iroha'
import { useQrScanner } from '@/composables/useQrScanner'
import type { OfflineAllowanceItem } from '@/types/iroha'

const session = useSessionStore()
const offline = useOfflineStore()
const activeAccount = computed(() => session.activeAccount)
const canSync = computed(() => Boolean(session.connection.toriiUrl && activeAccount.value))
const canGenerateInvoice = computed(
  () => Boolean(activeAccount.value && session.connection.assetDefinitionId && invoiceForm.amount)
)

const hardwareBusy = ref(false)
const hardwareStatus = ref({ ok: false, label: 'Not checked', detail: 'Pending detection' })
const hardwareMessage = ref('')

const invoiceForm = reactive({
  amount: '',
  memo: '',
  validityMinutes: 10
})
const invoicePayload = ref('')
const invoiceQr = ref('')
const invoiceMessage = ref('')
const invoiceInput = ref('')

const paymentMemo = ref('')
const paymentPayload = ref('')
const paymentQr = ref('')
const paymentMessage = ref('')
const paymentInput = ref('')
const allowances = ref<OfflineAllowanceItem[]>([])

const acceptMessage = ref('')
const moveMessage = ref('')
const syncMessage = ref('')

const sendingPayment = ref(false)
const acceptingPayment = ref(false)
const syncingAllowances = ref(false)
const movingOnline = ref(false)

const onlineForm = reactive({
  amount: '',
  receiver: '',
  memo: ''
})

const invoiceScanner = useQrScanner((payload) => {
  invoiceInput.value = payload
  paymentMessage.value = 'Invoice scanned.'
})
const paymentScanner = useQrScanner((payload) => {
  paymentInput.value = payload
  acceptMessage.value = 'Payment scanned.'
})

const reversedHistory = computed(() => [...offline.wallet.history].reverse())

const formatDate = (value?: number | null) => {
  if (!value || value <= 0) return ''
  return new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  )
}

const checkHardware = async () => {
  hardwareBusy.value = true
  hardwareMessage.value = ''
  try {
    const supported =
      (await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()) ??
      false
    offline.setHardwareSupport(supported)
    hardwareStatus.value = supported
      ? { ok: true, label: 'Secure hardware available', detail: 'Platform authenticator ready' }
      : { ok: false, label: 'No platform authenticator', detail: 'Fallback to software keys' }
  } catch (error) {
    hardwareStatus.value = { ok: false, label: 'Unknown', detail: 'Hardware check failed' }
    hardwareMessage.value =
      error instanceof Error ? error.message : 'Unable to detect secure hardware.'
  } finally {
    hardwareBusy.value = false
  }
}

const registerHardware = async () => {
  hardwareMessage.value = ''
  if (!hardwareStatus.value.ok) {
    hardwareMessage.value = 'Secure hardware is not available on this device.'
    return
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    hardwareMessage.value = 'WebAuthn is not supported in this environment.'
    return
  }
  hardwareBusy.value = true
  try {
    const random = new Uint8Array(32)
    crypto.getRandomValues(random)
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Iroha Offline Wallet' },
        user: {
          id: random,
          name: activeAccount.value?.accountId ?? 'offline-wallet',
          displayName: activeAccount.value?.displayName ?? 'Offline wallet'
        },
        challenge: random,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    })) as PublicKeyCredential | null
    offline.registerHardware(credential?.id ?? null)
    hardwareStatus.value = { ok: true, label: 'Registered', detail: 'Hardware wallet registered' }
    hardwareMessage.value = 'Offline wallet registered on this device.'
  } catch (error) {
    hardwareMessage.value = error instanceof Error ? error.message : 'Failed to register wallet.'
  } finally {
    hardwareBusy.value = false
  }
}

const syncAllowances = async () => {
  if (!session.connection.toriiUrl || !activeAccount.value) {
    syncMessage.value = 'Configure Torii and account first.'
    return
  }
  syncingAllowances.value = true
  syncMessage.value = ''
  try {
    const snapshot = await fetchOfflineAllowances({
      toriiUrl: session.connection.toriiUrl,
      controllerId: activeAccount.value.accountId
    })
    offline.updateAllowanceSnapshot({
      total: snapshot.total,
      syncedAtMs: snapshot.syncedAtMs,
      nextPolicyExpiryMs: snapshot.nextPolicyExpiryMs,
      nextRefreshMs: snapshot.nextRefreshMs
    })
    allowances.value = snapshot.allowances
    syncMessage.value = `Offline balance updated: ${snapshot.total}`
  } catch (error) {
    syncMessage.value = error instanceof Error ? error.message : 'Failed to sync allowances.'
  } finally {
    syncingAllowances.value = false
  }
}

const generateInvoice = async () => {
  invoiceMessage.value = ''
  invoicePayload.value = ''
  invoiceQr.value = ''
  if (!activeAccount.value || !session.connection.assetDefinitionId) {
    invoiceMessage.value = 'Configure account and asset first.'
    return
  }
  if (!invoiceForm.amount) {
    invoiceMessage.value = 'Enter an amount to request.'
    return
  }
  try {
    const invoice = createInvoice({
      receiver: activeAccount.value.accountId,
      assetId: session.connection.assetDefinitionId,
      amount: invoiceForm.amount.trim(),
      validityMs: invoiceForm.validityMinutes * 60 * 1000,
      memo: invoiceForm.memo
    })
    invoicePayload.value = encodeInvoice(invoice)
    invoiceQr.value = await QRCode.toString(invoicePayload.value, {
      type: 'svg',
      width: 240,
      color: { dark: '#ffffff', light: '#00000000' }
    })
    invoiceMessage.value = 'Invoice ready. Share the QR or copy the JSON payload.'
  } catch (error) {
    invoiceMessage.value = error instanceof Error ? error.message : 'Failed to generate invoice.'
  }
}

const createPayment = async () => {
  paymentMessage.value = ''
  paymentPayload.value = ''
  paymentQr.value = ''
  if (!activeAccount.value) {
    paymentMessage.value = 'Configure an account first.'
    return
  }
  if (!invoiceInput.value.trim()) {
    paymentMessage.value = 'Provide an invoice payload.'
    return
  }
  sendingPayment.value = true
  try {
    const invoice = parseInvoice(invoiceInput.value.trim())
    if (Date.now() > invoice.expires_at_ms) {
      throw new Error('Invoice expired. Ask the receiver to generate a new invoice.')
    }
    const payload = createPaymentPayload({
      invoice,
      senderAccount: activeAccount.value.accountId,
      counter: offline.wallet.nextCounter,
      channel: 'qr',
      memo: paymentMemo.value
    })
    offline.recordOutgoingPayment(payload)
    paymentPayload.value = JSON.stringify(payload)
    paymentQr.value = await QRCode.toString(paymentPayload.value, {
      type: 'svg',
      width: 240,
      color: { dark: '#ffffff', light: '#00000000' }
    })
    paymentMessage.value = 'Payment payload created and recorded locally.'
  } catch (error) {
    paymentMessage.value = error instanceof Error ? error.message : 'Unable to create payment.'
  } finally {
    sendingPayment.value = false
  }
}

const acceptPayment = async () => {
  acceptMessage.value = ''
  if (!activeAccount.value) {
    acceptMessage.value = 'Configure an account first.'
    return
  }
  if (!paymentInput.value.trim()) {
    acceptMessage.value = 'Provide a payment payload.'
    return
  }
  acceptingPayment.value = true
  try {
    const payload = parsePaymentPayload(paymentInput.value.trim())
    if (payload.to !== activeAccount.value.accountId) {
      throw new Error('Payment is addressed to a different account.')
    }
    offline.recordIncomingPayment(payload)
    acceptMessage.value = 'Payment recorded to offline wallet.'
  } catch (error) {
    acceptMessage.value = error instanceof Error ? error.message : 'Failed to record payment.'
  } finally {
    acceptingPayment.value = false
  }
}

const moveToOnline = async () => {
  moveMessage.value = ''
  if (!session.connection.toriiUrl || !activeAccount.value) {
    moveMessage.value = 'Configure Torii and account first.'
    return
  }
  const amount = onlineForm.amount.trim() || offline.wallet.balance
  const receiver = onlineForm.receiver.trim() || activeAccount.value.accountId
  if (!amount || Number(amount) <= 0) {
    moveMessage.value = 'Enter an amount to move online.'
    return
  }
  const snapshot = structuredClone(offline.wallet)
  movingOnline.value = true
  try {
    offline.withdrawToOnline({
      accountId: activeAccount.value.accountId,
      receiver,
      amount,
      memo: onlineForm.memo
    })
    await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: session.connection.assetDefinitionId,
      accountId: activeAccount.value.accountId,
      destinationAccountId: receiver,
      quantity: amount,
      privateKeyHex: activeAccount.value.privateKeyHex,
      metadata: onlineForm.memo ? { memo: onlineForm.memo } : undefined
    })
    moveMessage.value = 'Transfer submitted and offline balance updated.'
  } catch (error) {
    offline.$patch({ wallet: snapshot })
    offline.persist()
    moveMessage.value = error instanceof Error ? error.message : 'Failed to move funds online.'
  } finally {
    movingOnline.value = false
  }
}

const toggleInvoiceScanner = async () => {
  paymentMessage.value = ''
  await nextTick()
  invoiceScanner.message.value = ''
  invoiceScanner.start()
}

const togglePaymentScanner = async () => {
  acceptMessage.value = ''
  await nextTick()
  paymentScanner.message.value = ''
  paymentScanner.start()
}

watch(
  () => session.activeAccount,
  () => {
    if (activeAccount.value) {
      onlineForm.receiver = activeAccount.value.accountId
    }
  }
)

onMounted(() => {
  checkHardware()
  if (activeAccount.value) {
    onlineForm.receiver = activeAccount.value.accountId
  }
})
</script>

<style scoped>
.offline-grid {
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}

.qr-panel {
  margin-top: 12px;
}

.qr svg {
  width: 220px;
  height: auto;
  display: block;
  margin-bottom: 12px;
}

.qr-payload {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  padding: 12px;
  max-height: 200px;
  overflow: auto;
}

.scanner {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  margin-bottom: 12px;
}

video {
  width: 100%;
  background: black;
}
</style>
