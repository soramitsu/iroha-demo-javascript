<template>
  <div class="card-grid account-grid">
    <section class="card">
      <header class="card-header">
        <div>
          <h2>SORA Nexus Account</h2>
          <p class="helper">
            Generate your account keys, store a recovery phrase, and register
            via Torii.
          </p>
        </div>
      </header>
      <div class="chain-quickpick">
        <p class="helper">Select a preset chain or stay custom.</p>
        <p v-if="chainPresetLabel" class="helper small">
          Selected: {{ chainPresetLabel }}
        </p>
        <div class="preset-row">
          <button
            v-for="preset in chainPresets"
            :key="preset.id"
            class="preset-chip"
            :class="{ active: selectedChainPresetId === preset.id }"
            type="button"
            @click="applyPreset(preset)"
          >
            <span class="chip-title">{{ preset.label }}</span>
            <span class="chip-sub">{{ preset.description }}</span>
          </button>
        </div>
        <p class="helper">
          Need another chain? Add it in Setup → Torii Connection.
        </p>
      </div>
      <div class="form-grid">
        <label>
          Torii URL
          <input
            v-model.trim="connectionForm.toriiUrl"
            placeholder="http://127.0.0.1:8080"
          />
        </label>
        <label>
          Chain ID
          <input
            v-model.trim="connectionForm.chainId"
            placeholder="nexus-chain"
          />
        </label>
      </div>
      <div class="actions">
        <button
          class="secondary"
          :disabled="!connectionForm.toriiUrl"
          @click="saveConnection"
        >
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
        <button :disabled="generating" @click="generateRecovery">
          {{ generating ? "Generating…" : "Generate recovery phrase" }}
        </button>
        <button
          class="secondary"
          :disabled="!canRegisterGenerated"
          @click="registerGeneratedIdentity"
        >
          {{ onboardingBusy ? "Registering…" : "Register account" }}
        </button>
      </div>
      <p v-if="generateError" class="helper error">{{ generateError }}</p>
      <p v-if="onboardingError" class="helper error">{{ onboardingError }}</p>
      <p v-if="onboardingStatus" class="helper success">
        {{ onboardingStatus }}
      </p>

      <div v-if="mnemonicWords.length" class="backup-panel">
        <p class="helper">
          Write these words down in order. They restore your wallet.
        </p>
        <div class="mnemonic-grid">
          <span v-for="(word, index) in mnemonicWords" :key="word + index">
            <strong>{{ index + 1 }}.</strong> {{ word }}
          </span>
        </div>
        <div class="backup-actions">
          <button class="secondary" @click="downloadBackup('manual')">
            Download backup
          </button>
          <button class="secondary" @click="downloadBackup('icloud')">
            Store for iCloud Drive
          </button>
          <button class="secondary" @click="downloadBackup('google')">
            Store for Google Drive
          </button>
        </div>
        <label class="backup-confirm">
          <input v-model="backupConfirmed" type="checkbox" />
          <span>I stored my recovery phrase safely.</span>
        </label>
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>IrohaConnect Pairing</h2>
      </header>
      <p class="helper">
        Already using IrohaConnect on your phone? Generate a pairing session to
        approve desktop access without exporting keys. Signing stays on the
        phone; this app watches balances.
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
        <div v-if="connectPreview.tokenWallet" class="kv monospace">
          <span class="kv-label">Wallet Token</span>
          <span class="kv-value">{{ connectPreview.tokenWallet }}</span>
        </div>
      </div>
      <div class="actions">
        <button :disabled="connectLoading" @click="startConnectPairing">
          {{ connectLoading ? "Preparing…" : "Generate pairing QR" }}
        </button>
        <button
          class="secondary"
          :disabled="!connectPreview"
          @click="resetConnect"
        >
          Reset
        </button>
      </div>
      <p v-if="connectError" class="helper error">{{ connectError }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <div>
          <h2>Saved Accounts</h2>
          <p class="helper">
            Switch between registered profiles or begin a fresh registration.
          </p>
        </div>
      </header>
      <div class="registration-steps">
        <div
          v-for="item in registrationChecklist"
          :key="item.label"
          class="reg-step"
          :class="{ done: item.done }"
        >
          <span class="reg-dot"></span>
          <span>{{ item.label }}</span>
        </div>
      </div>
      <div v-if="session.accounts.length" class="account-roster">
        <article
          v-for="account in session.accounts"
          :key="account.accountId"
          class="account-row"
        >
          <div>
            <p class="account-name">
              {{ account.displayName || account.accountId }}
            </p>
            <p class="helper monospace">{{ account.accountId }}</p>
          </div>
          <div class="account-actions">
            <span
              class="pill"
              :class="{
                positive: account.accountId === session.activeAccountId,
              }"
            >
              {{
                account.accountId === session.activeAccountId
                  ? "Active"
                  : "Available"
              }}
            </span>
            <button
              class="secondary"
              :disabled="account.accountId === session.activeAccountId"
              @click="setActiveAccount(account.accountId)"
            >
              {{
                account.accountId === session.activeAccountId
                  ? "Selected"
                  : "Switch to this account"
              }}
            </button>
          </div>
        </article>
      </div>
      <p v-else class="helper">
        No saved accounts yet. Complete the registration form to add one.
      </p>
      <div class="actions">
        <button class="secondary" @click="startNewRegistration">
          {{
            hasSavedAccounts ? "Register another account" : "Begin registration"
          }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QRCode from "qrcode";
import { useSessionStore } from "@/stores/session";
import {
  createConnectPreview,
  deriveAccountAddress,
  derivePublicKey,
  onboardAccount,
} from "@/services/iroha";
import {
  generateMnemonicWords,
  mnemonicToPrivateKeyHex,
  normalizeMnemonicPhrase,
} from "@/utils/mnemonic";
import { CHAIN_PRESETS } from "@/constants/chains";
import type { ChainPreset } from "@/constants/chains";

const session = useSessionStore();
const router = useRouter();
const chainPresets: ChainPreset[] = CHAIN_PRESETS;
const selectedChainPresetId = ref<string | null>(null);
const chainPresetLabel = computed(() => {
  if (!selectedChainPresetId.value) return "";
  return (
    chainPresets.find((preset) => preset.id === selectedChainPresetId.value)
      ?.label || ""
  );
});

const connectionForm = reactive({
  toriiUrl: session.connection.toriiUrl,
  chainId: session.connection.chainId,
});

watch(
  () => session.connection,
  (value) => {
    connectionForm.toriiUrl = value.toriiUrl;
    connectionForm.chainId = value.chainId;
    const matched = chainPresets.find(
      (preset) =>
        preset.connection.chainId === value.chainId ||
        preset.connection.toriiUrl === value.toriiUrl ||
        preset.connection.assetDefinitionId === value.assetDefinitionId,
    );
    selectedChainPresetId.value = matched?.id ?? null;
  },
  { deep: true, immediate: true },
);

const connectionMessage = ref("");
const applyPreset = (preset: ChainPreset) => {
  selectedChainPresetId.value = preset.id;
  connectionForm.chainId = preset.connection.chainId;
  connectionForm.toriiUrl = preset.connection.toriiUrl;
  session.updateConnection({ ...preset.connection });
  session.persistState();
};
const saveConnection = () => {
  if (!connectionForm.toriiUrl) {
    connectionMessage.value = "Torii URL is required.";
    return;
  }
  session.updateConnection({
    toriiUrl: connectionForm.toriiUrl,
    chainId: connectionForm.chainId,
  });
  session.persistState();
  connectionMessage.value = "Connection saved.";
};

const aliasInput = ref(session.activeAccount?.displayName || "");
const domainInput = ref(session.activeAccount?.domain || "wonderland");
const identityInput = ref("");
const wordCount = ref<12 | 24>(24);
const mnemonicWords = ref<string[]>([]);
const generatedKeys = ref<{
  privateKeyHex: string;
  publicKeyHex: string;
  accountId: string;
  ih58: string;
  compressed: string;
  compressedWarning: string;
} | null>(null);
const backupConfirmed = ref(false);
const generating = ref(false);
const generateError = ref("");
const onboardingError = ref("");
const onboardingStatus = ref("");
const onboardingBusy = ref(false);
const hasSavedAccounts = computed(() => session.accounts.length > 0);
const registrationChecklist = computed(() => [
  {
    label: "Torii configured",
    done: Boolean(connectionForm.toriiUrl && connectionForm.chainId),
  },
  {
    label: "Recovery phrase saved",
    done: mnemonicWords.value.length > 0 && backupConfirmed.value,
  },
  {
    label: "Account registered",
    done: Boolean(onboardingStatus.value || session.hasAccount),
  },
]);

const startNewRegistration = () => {
  aliasInput.value = "";
  domainInput.value = "wonderland";
  identityInput.value = "";
  mnemonicWords.value = [];
  generatedKeys.value = null;
  backupConfirmed.value = false;
  onboardingStatus.value = "";
  onboardingError.value = "";
};

const setActiveAccount = (accountId: string) => {
  session.setActiveAccount(accountId);
  session.persistState();
  const active = session.activeAccount;
  if (active) {
    aliasInput.value = active.displayName;
    domainInput.value = active.domain;
  }
};

watch(
  () => session.activeAccount,
  (account) => {
    if (!account) return;
    aliasInput.value = account.displayName;
    domainInput.value = account.domain;
  },
  { deep: true },
);

const generateRecovery = async () => {
  generateError.value = "";
  try {
    generating.value = true;
    const words = generateMnemonicWords(wordCount.value);
    mnemonicWords.value = words;
    const mnemonic = normalizeMnemonicPhrase(words.join(" "));
    const privateKeyHex = mnemonicToPrivateKeyHex(mnemonic);
    const { publicKeyHex } = await derivePublicKey(privateKeyHex);
    const domain = domainInput.value.trim() || "wonderland";
    const summary = deriveAccountAddress({
      domain,
      publicKeyHex,
      networkPrefix: session.connection.networkPrefix,
    });
    generatedKeys.value = {
      privateKeyHex,
      publicKeyHex,
      accountId: summary.accountId,
      ih58: summary.ih58,
      compressed: summary.compressed,
      compressedWarning: summary.compressedWarning,
    };
    backupConfirmed.value = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    generateError.value = message;
    generatedKeys.value = null;
  } finally {
    generating.value = false;
  }
};

const parseIdentity = () => {
  if (!identityInput.value.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(identityInput.value);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    throw new Error("Identity metadata must be a JSON object.");
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Invalid identity metadata JSON payload.",
    );
  }
};

const canRegisterGenerated = computed(() => {
  return Boolean(
    generatedKeys.value &&
      backupConfirmed.value &&
      connectionForm.toriiUrl &&
      connectionForm.chainId &&
      aliasInput.value.trim(),
  );
});

const registerGeneratedIdentity = async () => {
  onboardingError.value = "";
  onboardingStatus.value = "";
  if (!generatedKeys.value) {
    onboardingError.value = "Generate a keypair first.";
    return;
  }
  if (!backupConfirmed.value) {
    onboardingError.value = "Confirm that you stored the recovery phrase.";
    return;
  }
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    onboardingError.value = "Set your Torii URL and chain ID first.";
    return;
  }
  onboardingBusy.value = true;
  try {
    const identity = parseIdentity();
    const response = await onboardAccount({
      toriiUrl: connectionForm.toriiUrl,
      alias: aliasInput.value.trim() || "Unnamed",
      accountId: generatedKeys.value.accountId,
      identity,
    });
    session.updateConnection({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId,
    });
    session.addAccount({
      displayName: aliasInput.value.trim(),
      domain: domainInput.value.trim() || "wonderland",
      accountId: response.account_id,
      publicKeyHex: generatedKeys.value.publicKeyHex,
      privateKeyHex: generatedKeys.value.privateKeyHex,
      ih58: generatedKeys.value.ih58,
      compressed: generatedKeys.value.compressed,
      compressedWarning: generatedKeys.value.compressedWarning,
    });
    session.persistState();
    onboardingStatus.value = `Account ${response.account_id} queued (tx ${response.tx_hash_hex.slice(0, 12)}…)`;
    router.push("/setup");
  } catch (err) {
    onboardingError.value = err instanceof Error ? err.message : String(err);
  } finally {
    onboardingBusy.value = false;
  }
};

const downloadBackup = (target: "manual" | "icloud" | "google") => {
  if (!mnemonicWords.value.length) {
    return;
  }
  const payload = {
    mnemonic: mnemonicWords.value.join(" "),
    wordCount: wordCount.value,
    createdAt: new Date().toISOString(),
    target,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const filename =
    target === "icloud"
      ? "iroha-icloud-backup.json"
      : target === "google"
        ? "iroha-google-backup.json"
        : "iroha-backup.json";
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const connectPreview = ref<Awaited<
  ReturnType<typeof createConnectPreview>
> | null>(null);
const connectQr = ref("");
const connectLoading = ref(false);
const connectError = ref("");

const startConnectPairing = async () => {
  connectError.value = "";
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    connectError.value = "Set your Torii URL and chain ID first.";
    return;
  }
  connectLoading.value = true;
  try {
    const preview = await createConnectPreview({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId,
    });
    connectPreview.value = preview;
    connectQr.value = preview.walletUri
      ? await QRCode.toDataURL(preview.walletUri)
      : "";
  } catch (err) {
    connectError.value = err instanceof Error ? err.message : String(err);
    connectPreview.value = null;
    connectQr.value = "";
  } finally {
    connectLoading.value = false;
  }
};

const resetConnect = () => {
  connectPreview.value = null;
  connectQr.value = "";
  connectError.value = "";
};
</script>

<style scoped>
.account-grid {
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
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
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
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
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.registration-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.reg-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.82);
}

.reg-step.done {
  border-color: rgba(255, 118, 118, 0.8);
  background: rgba(255, 255, 255, 0.06);
}

.reg-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--panel-border);
}

.reg-step.done .reg-dot {
  background: var(--iroha-accent);
  box-shadow: 0 0 0 3px rgba(255, 76, 102, 0.25);
}

.account-roster {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
}

.account-name {
  margin: 0 0 4px;
  font-weight: 700;
}

.account-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chain-quickpick {
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 2px;
  min-width: 140px;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.preset-chip.active {
  border-color: var(--iroha-accent);
  box-shadow: 0 8px 24px rgba(255, 76, 102, 0.22);
}

.chip-title {
  font-weight: 700;
}

.chip-sub {
  font-size: 0.82rem;
  color: var(--iroha-muted);
}

.helper.small {
  margin: 0;
}
</style>
