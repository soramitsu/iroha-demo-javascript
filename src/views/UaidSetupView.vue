<template>
  <div class="card-grid uaid-grid">
    <section class="card">
      <header class="card-header">
        <h2>Step 1 · Register UAID on Nexus</h2>
      </header>
      <ol class="uaid-instructions">
        <li>Open the Nexus onboarding portal and complete the UAID registration flow.</li>
        <li>Copy the issued UAID (format: <code>uaid:abcdef...</code>).</li>
        <li>Paste the UAID below and optionally validate it against your Torii endpoint.</li>
      </ol>
      <label>
        UAID Literal
        <input v-model.trim="uaidInput" placeholder="uaid:0f4d…" />
      </label>
      <p class="helper">Need help? See <code>docs/space-directory.md</code> in the Nexus repo.</p>
      <div class="actions">
        <button @click="handleSave" :disabled="!canSave">Save & Continue</button>
        <button class="secondary" @click="handleVerify" :disabled="!session.connection.toriiUrl || verifying || !uaidInput">
          {{ verifying ? 'Checking…' : 'Verify with Torii' }}
        </button>
      </div>
      <p v-if="error" class="helper error">{{ error }}</p>
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
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { fetchUaidOverview } from '@/services/iroha'

const session = useSessionStore()
const router = useRouter()
const uaidInput = ref(session.user.uaid)
const verifying = ref(false)
const overview = ref<Awaited<ReturnType<typeof fetchUaidOverview>> | null>(null)
const error = ref('')

const canSave = computed(() => Boolean(uaidInput.value?.trim()))

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

.error {
  color: #b91c1c;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
