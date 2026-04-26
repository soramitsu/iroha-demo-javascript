<template>
  <div v-if="isFirstLaunch" class="account-wizard">
    <section class="account-wizard-intro">
      <div class="account-wizard-copy">
        <p class="section-label">{{ t("Account Setup") }}</p>
        <h2>{{ t("Create wallet") }}</h2>
        <p class="helper">{{ accountSetupHelperText }}</p>
      </div>
      <div class="account-wizard-chips">
        <span class="pill positive">{{ t("Network ready") }}</span>
        <span class="pill">{{ t("Secure backup") }}</span>
      </div>
    </section>

    <div class="account-wizard-shell">
      <aside class="account-wizard-rail">
        <section class="account-wizard-panel">
          <div class="account-step-list">
            <article
              v-for="item in onboardingSteps"
              :key="item.step"
              class="account-step"
              :class="{ current: item.current, done: item.done }"
            >
              <span class="account-step-number">{{ item.step }}</span>
              <p class="account-step-label">{{ item.label }}</p>
            </article>
          </div>
        </section>
        <section class="account-wizard-panel account-wizard-summary">
          <div class="wizard-summary-row">
            <p class="meta-label">{{ t("Wallet status") }}</p>
            <p class="meta-value">
              {{
                generatedKeys
                  ? t("Recovery phrase ready")
                  : t("Not created yet")
              }}
            </p>
          </div>
          <div class="wizard-summary-row">
            <p class="meta-label">{{ t("Wallet name") }}</p>
            <p class="meta-value">{{ aliasInput || t("Not created yet") }}</p>
          </div>
          <details class="technical-details compact">
            <summary>{{ t("Wallet details") }}</summary>
            <div class="wizard-summary-row">
              <p class="meta-label">{{ t("Connection") }}</p>
              <p class="meta-value">{{ connectionForm.toriiUrl }}</p>
              <p class="helper meta-sub mono">{{ connectionForm.chainId }}</p>
            </div>
            <div class="wizard-summary-row">
              <p class="meta-label">{{ t("I105 Account ID") }}</p>
              <p class="meta-value mono">
                {{ generatedVisibleAccountId || t("Not created yet") }}
              </p>
            </div>
          </details>
        </section>
      </aside>

      <div class="account-wizard-flow">
        <section
          class="card wizard-stage"
          :class="{
            current: onboardingStage === 'identity',
            complete: Boolean(generatedKeys),
          }"
        >
          <header class="card-header">
            <div>
              <h2>{{ identityStageTitle }}</h2>
              <p v-if="identityStageHelperText" class="helper">
                {{ identityStageHelperText }}
              </p>
            </div>
          </header>
          <div class="form-grid wizard-form-grid">
            <label>
              {{ t("Wallet name") }}
              <input v-model.trim="aliasInput" />
            </label>
            <label v-if="!isRestoreMode" class="wizard-field-compact">
              {{ t("Recovery Phrase Length") }}
              <select v-model.number="wordCount">
                <option :value="12">{{ t("12 words") }}</option>
                <option :value="24">{{ t("24 words") }}</option>
              </select>
            </label>
          </div>
          <details class="technical-details">
            <summary>{{ t("Advanced wallet details") }}</summary>
            <label>
              {{ t("Domain") }}
              <input v-model.trim="domainInput" />
            </label>
            <p class="helper">
              {{
                t(
                  "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not an on-chain dataspace alias.",
                  {
                    domain: t("default"),
                  },
                )
              }}
            </p>
          </details>
          <div class="actions">
            <button
              v-if="!isRestoreMode"
              :disabled="generating || restoring"
              @click="generateRecovery"
            >
              {{
                generating ? t("Generating…") : t("Generate recovery phrase")
              }}
            </button>
            <button
              v-else
              class="secondary"
              :disabled="generating || restoring"
              @click="startNewRegistration"
            >
              {{ t("Create recovery phrase") }}
            </button>
            <button
              class="secondary"
              :disabled="generating || restoring"
              @click="toggleRestorePanel"
            >
              {{
                showRestorePanel
                  ? t("Hide restore")
                  : generatedKeys && isRestoreMode
                    ? t("Edit recovery phrase")
                    : t("Restore wallet")
              }}
            </button>
            <button
              v-if="hasPendingSetupState"
              class="secondary"
              @click="startNewRegistration"
            >
              {{ t("Reset") }}
            </button>
          </div>
          <p v-if="generateError" class="helper error">{{ generateError }}</p>
          <div v-if="showRestorePanel" class="backup-panel restore-panel">
            <label>
              {{ t("Recovery Phrase") }}
              <textarea v-model.trim="restorePhraseInput" rows="4"></textarea>
            </label>
            <div class="actions">
              <button :disabled="restoring" @click="restoreRecovery">
                {{ restoring ? t("Restoring…") : t("Load recovery phrase") }}
              </button>
              <button
                class="secondary"
                :disabled="restoring"
                @click="openBackupImportPicker"
              >
                {{ t("Import backup JSON") }}
              </button>
            </div>
            <p v-if="restoreError" class="helper error">{{ restoreError }}</p>
          </div>
        </section>

        <section
          v-if="showBackupPanel"
          class="card wizard-stage"
          :class="{
            current: onboardingStage === 'backup',
            complete: backupConfirmed,
          }"
        >
          <header class="card-header">
            <div>
              <h2>{{ t("Back up recovery phrase") }}</h2>
              <p class="helper">
                {{
                  t(
                    "Write these words down in order. They restore your wallet.",
                  )
                }}
              </p>
            </div>
          </header>
          <div class="mnemonic-grid">
            <span v-for="(word, index) in mnemonicWords" :key="word + index">
              <strong>{{ index + 1 }}.</strong> {{ word }}
            </span>
          </div>
          <div class="backup-actions">
            <button class="secondary" @click="copyRecoveryPhrase">
              {{ t("Copy phrase") }}
            </button>
            <button class="secondary" @click="downloadBackup('icloud')">
              {{ t("Store for iCloud Drive") }}
            </button>
            <button class="secondary" @click="downloadBackup('google')">
              {{ t("Store for Google Drive") }}
            </button>
          </div>
          <p v-if="backupCopyMessage" class="helper success">
            {{ backupCopyMessage }}
          </p>
          <p v-if="backupCopyError" class="helper error">
            {{ backupCopyError }}
          </p>
          <label class="backup-confirm">
            <input v-model="backupConfirmed" type="checkbox" />
            <span>{{ t("I stored my recovery phrase safely.") }}</span>
          </label>
        </section>

        <section
          v-if="generatedKeys && backupConfirmed"
          class="card wizard-stage"
          :class="{ current: onboardingStage === 'register' }"
        >
          <header class="card-header">
            <div>
              <h2>{{ finalizeIdentityLabel }}</h2>
            </div>
          </header>
          <div class="wizard-review-grid">
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Wallet name") }}</p>
              <p class="meta-value">{{ aliasInput || t("Not created yet") }}</p>
            </div>
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Connection") }}</p>
              <p class="meta-value">{{ activeNetworkLabel }}</p>
            </div>
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("I105 Account ID") }}</p>
              <p class="meta-value mono">{{ generatedVisibleAccountId }}</p>
            </div>
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Domain") }}</p>
              <p class="meta-value">{{ normalizedDomain }}</p>
            </div>
          </div>
          <div class="actions">
            <button
              :disabled="!canSaveGenerated"
              @click="saveGeneratedIdentity"
            >
              {{ finalizeIdentityLabel }}
            </button>
            <button class="secondary" @click="startNewRegistration">
              {{ t("Reset") }}
            </button>
          </div>
          <p v-if="onboardingError" class="helper error">
            {{ onboardingError }}
          </p>
          <p v-if="onboardingStatus" class="helper success">
            {{ onboardingStatus }}
          </p>
        </section>
      </div>
    </div>
  </div>

  <div v-else class="card-grid account-grid">
    <section class="card account-primary">
      <header class="card-header">
        <div>
          <h2>{{ t("Create wallet") }}</h2>
          <p class="helper">{{ accountSetupHelperText }}</p>
        </div>
      </header>

      <div class="form-grid wizard-form-grid">
        <label>
          {{ t("Wallet name") }}
          <input v-model.trim="aliasInput" />
        </label>
        <label v-if="!isRestoreMode" class="wizard-field-compact">
          {{ t("Recovery Phrase Length") }}
          <select v-model.number="wordCount">
            <option :value="12">{{ t("12 words") }}</option>
            <option :value="24">{{ t("24 words") }}</option>
          </select>
        </label>
      </div>
      <details class="technical-details">
        <summary>{{ t("Advanced wallet details") }}</summary>
        <label>
          {{ t("Domain") }}
          <input v-model.trim="domainInput" />
        </label>
      </details>

      <div v-if="generatedKeys" class="wizard-review-grid account-review-grid">
        <div class="wizard-review-item">
          <p class="meta-label">{{ t("I105 Account ID") }}</p>
          <p class="meta-value mono">{{ generatedVisibleAccountId }}</p>
        </div>
        <div class="wizard-review-item">
          <p class="meta-label">{{ t("Domain") }}</p>
          <p class="meta-value">{{ normalizedDomain }}</p>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="!isRestoreMode"
          :disabled="generating || restoring"
          @click="generateRecovery"
        >
          {{ generating ? t("Generating…") : t("Generate recovery phrase") }}
        </button>
        <button
          v-else
          class="secondary"
          :disabled="generating || restoring"
          @click="startNewRegistration"
        >
          {{ t("Create recovery phrase") }}
        </button>
        <button
          class="secondary"
          :disabled="generating || restoring"
          @click="toggleRestorePanel"
        >
          {{
            showRestorePanel
              ? t("Hide restore")
              : generatedKeys && isRestoreMode
                ? t("Edit recovery phrase")
                : t("Restore wallet")
          }}
        </button>
        <button
          class="secondary"
          :disabled="!canSaveGenerated"
          @click="saveGeneratedIdentity"
        >
          {{ finalizeIdentityLabel }}
        </button>
        <button
          v-if="hasPendingSetupState"
          class="secondary"
          @click="startNewRegistration"
        >
          {{ t("Reset") }}
        </button>
      </div>
      <p v-if="generateError" class="helper error">{{ generateError }}</p>
      <div v-if="showRestorePanel" class="backup-panel restore-panel">
        <label>
          {{ t("Recovery Phrase") }}
          <textarea v-model.trim="restorePhraseInput" rows="4"></textarea>
        </label>
        <div class="actions">
          <button :disabled="restoring" @click="restoreRecovery">
            {{ restoring ? t("Restoring…") : t("Load recovery phrase") }}
          </button>
          <button
            class="secondary"
            :disabled="restoring"
            @click="openBackupImportPicker"
          >
            {{ t("Import backup JSON") }}
          </button>
        </div>
        <p v-if="restoreError" class="helper error">{{ restoreError }}</p>
      </div>
      <p v-if="onboardingError" class="helper error">{{ onboardingError }}</p>
      <p v-if="onboardingStatus" class="helper success">
        {{ onboardingStatus }}
      </p>

      <div v-if="showBackupPanel" class="backup-panel">
        <p class="meta-label">{{ t("Back up recovery phrase") }}</p>
        <p class="helper">
          {{ t("Write these words down in order. They restore your wallet.") }}
        </p>
        <div class="mnemonic-grid">
          <span v-for="(word, index) in mnemonicWords" :key="word + index">
            <strong>{{ index + 1 }}.</strong> {{ word }}
          </span>
        </div>
        <div class="backup-actions">
          <button class="secondary" @click="copyRecoveryPhrase">
            {{ t("Copy phrase") }}
          </button>
          <button class="secondary" @click="downloadBackup('icloud')">
            {{ t("Store for iCloud Drive") }}
          </button>
          <button class="secondary" @click="downloadBackup('google')">
            {{ t("Store for Google Drive") }}
          </button>
        </div>
        <p v-if="backupCopyMessage" class="helper success">
          {{ backupCopyMessage }}
        </p>
        <p v-if="backupCopyError" class="helper error">
          {{ backupCopyError }}
        </p>
        <label class="backup-confirm">
          <input v-model="backupConfirmed" type="checkbox" />
          <span>{{ t("I stored my recovery phrase safely.") }}</span>
        </label>
      </div>
    </section>

    <section class="card account-saved">
      <header class="card-header">
        <div>
          <h2>{{ t("Saved Wallets") }}</h2>
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
              {{ getAccountLabel(account) }}
            </p>
            <p class="helper monospace">
              {{
                getPublicAccountId(account, session.connection.networkPrefix)
              }}
            </p>
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
                  ? t("Active")
                  : t("Available")
              }}
            </span>
            <button
              class="secondary"
              @click="setActiveAccount(account.accountId)"
            >
              {{
                account.accountId === session.activeAccountId
                  ? t("Open wallet")
                  : t("Switch to this account")
              }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="account-roster-empty">
        <p class="helper">
          {{
            t(
              "No saved wallets yet. Complete the wallet setup form to add one.",
            )
          }}
        </p>
      </div>
      <div class="actions">
        <button class="secondary" @click="startNewRegistration">
          {{ t("Add another wallet") }}
        </button>
      </div>
    </section>

    <section class="card account-connect">
      <header class="card-header">
        <h2>{{ t("Phone pairing") }}</h2>
      </header>
      <p class="helper">
        {{
          t(
            "Already using IrohaConnect on your phone? Generate a pairing session to approve desktop access without exporting keys. Signing stays on the phone; this app watches balances.",
          )
        }}
      </p>
      <div v-if="connectPreview" class="connect-preview">
        <img
          v-if="connectQr"
          :src="connectQr"
          :alt="t('IrohaConnect pairing QR')"
          class="connect-qr"
        />
        <details class="technical-details compact">
          <summary>{{ t("Pairing details") }}</summary>
          <div class="kv monospace">
            <span class="kv-label">{{ t("Session ID") }}</span>
            <span class="kv-value">{{ connectPreview.sidBase64Url }}</span>
          </div>
          <div v-if="connectPreview.tokenWallet" class="kv monospace">
            <span class="kv-label">{{ t("Wallet Token") }}</span>
            <span class="kv-value">{{ connectPreview.tokenWallet }}</span>
          </div>
        </details>
      </div>
      <div class="actions">
        <button :disabled="connectLoading" @click="startConnectPairing">
          {{ connectLoading ? t("Preparing…") : t("Generate pairing QR") }}
        </button>
        <button
          class="secondary"
          :disabled="!connectPreview"
          @click="resetConnect"
        >
          {{ t("Reset") }}
        </button>
      </div>
      <p v-if="connectError" class="helper error">{{ connectError }}</p>
    </section>
  </div>
  <input
    ref="backupFileInput"
    type="file"
    accept=".json,application/json"
    style="display: none"
    @change="handleBackupFileSelection"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QRCode from "qrcode";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import {
  createConnectPreview,
  copyTextToClipboard,
  deriveAccountAddress,
  derivePublicKey,
  exportConfidentialWalletBackup,
  importConfidentialWalletBackup,
  isSecureVaultAvailable,
  storeAccountSecret,
} from "@/services/iroha";
import {
  generateMnemonicWords,
  mnemonicToPrivateKeyHex,
  normalizeMnemonicPhrase,
} from "@/utils/mnemonic";
import {
  buildWalletBackupPayload,
  parseWalletBackupPayload,
  type ConfidentialWalletBackupMetadata,
} from "@/utils/walletBackup";
import { CHAIN_PRESETS, DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import { getAccountDisplayLabel, getPublicAccountId } from "@/utils/accountId";

const session = useSessionStore();
const router = useRouter();
const { t } = useAppI18n();
const CONNECT_LAUNCH_PROTOCOL = "irohaconnect";
const DEFAULT_DOMAIN_LABEL = "default";
const getAccountLabel = (account: (typeof session.accounts)[number]) =>
  getAccountDisplayLabel(
    account,
    account.accountId,
    session.connection.networkPrefix,
  );

const connectionForm = reactive({
  toriiUrl: session.connection.toriiUrl,
  chainId: session.connection.chainId,
});
const activeNetworkPreset = computed(() =>
  CHAIN_PRESETS.find(
    (preset) =>
      preset.connection.toriiUrl === session.connection.toriiUrl &&
      preset.connection.chainId === session.connection.chainId &&
      preset.connection.networkPrefix === session.connection.networkPrefix,
  ),
);
const activeNetworkLabel = computed(
  () => activeNetworkPreset.value?.label ?? t("Custom endpoint"),
);

watch(
  () => session.connection,
  (value) => {
    const nextConnection = {
      toriiUrl: value.toriiUrl || DEFAULT_CHAIN_PRESET.connection.toriiUrl,
      chainId: value.chainId || DEFAULT_CHAIN_PRESET.connection.chainId,
      networkPrefix:
        value.networkPrefix ?? DEFAULT_CHAIN_PRESET.connection.networkPrefix,
      assetDefinitionId:
        value.assetDefinitionId ||
        DEFAULT_CHAIN_PRESET.connection.assetDefinitionId,
    };
    connectionForm.toriiUrl = nextConnection.toriiUrl;
    connectionForm.chainId = nextConnection.chainId;
  },
  { deep: true, immediate: true },
);

const aliasInput = ref(session.activeAccount?.displayName || "");
const domainInput = ref(session.activeAccount?.domain || DEFAULT_DOMAIN_LABEL);
const wordCount = ref<12 | 24>(24);
const mnemonicWords = ref<string[]>([]);
const recoveryMnemonic = ref("");
const backupFileInput = ref<HTMLInputElement | null>(null);
const generatedKeys = ref<{
  privateKeyHex: string;
  publicKeyHex: string;
} | null>(null);
const restorePhraseInput = ref("");
const backupConfirmed = ref(false);
const showRestorePanel = ref(false);
const accountFlowMode = ref<"generate" | "restore">("generate");
const generating = ref(false);
const restoring = ref(false);
const generateError = ref("");
const restoreError = ref("");
const onboardingError = ref("");
const onboardingStatus = ref("");
const backupCopyMessage = ref("");
const backupCopyError = ref("");
const pendingConfidentialWalletBackup =
  ref<ConfidentialWalletBackupMetadata | null>(null);
const hasSavedAccounts = computed(() => session.accounts.length > 0);
const isFirstLaunch = computed(() => !hasSavedAccounts.value);
const isRestoreMode = computed(() => accountFlowMode.value === "restore");
const accountSetupHelperText = computed(() =>
  isRestoreMode.value
    ? t("Restore your wallet from a recovery phrase and save it locally.")
    : t(
        "Generate your account keys, store a recovery phrase, and save the wallet locally.",
      ),
);
const identityStageTitle = computed(() =>
  isRestoreMode.value
    ? t("Restore from recovery phrase")
    : t("Generate recovery phrase"),
);
const identityStageHelperText = computed(() =>
  isRestoreMode.value
    ? t(
        "Paste a 12- or 24-word recovery phrase to derive the same wallet keys locally.",
      )
    : "",
);
const finalizeIdentityLabel = computed(() =>
  isRestoreMode.value ? t("Restore wallet") : t("Save identity"),
);
const normalizedDomain = computed(
  () => domainInput.value.trim() || DEFAULT_DOMAIN_LABEL,
);
const generatedAccountSummary = computed(() => {
  if (!generatedKeys.value) {
    return null;
  }
  try {
    return deriveAccountAddress({
      domain: normalizedDomain.value,
      publicKeyHex: generatedKeys.value.publicKeyHex,
      networkPrefix: session.connection.networkPrefix,
    });
  } catch (_error) {
    return null;
  }
});
const generatedAccountId = computed(
  () => generatedAccountSummary.value?.accountId ?? "",
);
const generatedStoredI105AccountId = computed(
  () =>
    generatedAccountSummary.value?.i105AccountId ??
    generatedAccountSummary.value?.accountId ??
    "",
);
const generatedVisibleAccountId = computed(() =>
  getPublicAccountId(
    generatedAccountSummary.value,
    session.connection.networkPrefix,
  ),
);
const onboardingStage = computed<"identity" | "backup" | "register">(() => {
  if (!generatedKeys.value) {
    return "identity";
  }
  if (!backupConfirmed.value) {
    return "backup";
  }
  return "register";
});
const recoveryStepLabel = computed(() =>
  isRestoreMode.value
    ? t("Recovery phrase confirmed")
    : t("Recovery phrase saved"),
);
const onboardingSteps = computed(() => [
  {
    step: "01",
    label: identityStageTitle.value,
    done: Boolean(generatedKeys.value),
    current: onboardingStage.value === "identity",
  },
  {
    step: "02",
    label: recoveryStepLabel.value,
    done: backupConfirmed.value,
    current: onboardingStage.value === "backup",
  },
  {
    step: "03",
    label: finalizeIdentityLabel.value,
    done: Boolean(onboardingStatus.value || session.hasAccount),
    current: onboardingStage.value === "register",
  },
]);
const showBackupPanel = computed(
  () => mnemonicWords.value.length > 0 && !isRestoreMode.value,
);
const copyableRecoveryPhrase = computed(() =>
  normalizeMnemonicPhrase(
    mnemonicWords.value.join(" ") || recoveryMnemonic.value,
  ),
);
const registrationChecklist = computed(() => [
  {
    label: t("Network connection ready"),
    done: Boolean(connectionForm.toriiUrl && connectionForm.chainId),
  },
  {
    label: recoveryStepLabel.value,
    done:
      backupConfirmed.value &&
      (isRestoreMode.value || mnemonicWords.value.length > 0),
  },
  {
    label: t("Account saved"),
    done: Boolean(onboardingStatus.value || session.hasAccount),
  },
]);
const hasPendingSetupState = computed(() =>
  Boolean(
    generatedKeys.value ||
      mnemonicWords.value.length ||
      restorePhraseInput.value.trim() ||
      showRestorePanel.value,
  ),
);

const startNewRegistration = () => {
  aliasInput.value = "";
  domainInput.value = DEFAULT_DOMAIN_LABEL;
  wordCount.value = 24;
  mnemonicWords.value = [];
  recoveryMnemonic.value = "";
  generatedKeys.value = null;
  restorePhraseInput.value = "";
  backupConfirmed.value = false;
  showRestorePanel.value = false;
  accountFlowMode.value = "generate";
  generating.value = false;
  restoring.value = false;
  generateError.value = "";
  restoreError.value = "";
  onboardingStatus.value = "";
  onboardingError.value = "";
  backupCopyMessage.value = "";
  backupCopyError.value = "";
  pendingConfidentialWalletBackup.value = null;
};

const applyBackupMetadata = (payload: {
  displayName?: string;
  domain?: string;
  confidentialWallet?: ConfidentialWalletBackupMetadata;
}) => {
  if (typeof payload.displayName === "string") {
    aliasInput.value = payload.displayName;
  }
  if (typeof payload.domain === "string" && payload.domain.trim()) {
    domainInput.value = payload.domain;
  }
  pendingConfidentialWalletBackup.value = payload.confidentialWallet ?? null;
};

const toggleRestorePanel = () => {
  if (showRestorePanel.value) {
    startNewRegistration();
    return;
  }
  startNewRegistration();
  accountFlowMode.value = "restore";
  showRestorePanel.value = true;
};

const openBackupImportPicker = () => {
  restoreError.value = "";
  if (!backupFileInput.value) {
    return;
  }
  backupFileInput.value.value = "";
  backupFileInput.value.click();
};

const setActiveAccount = async (accountId: string) => {
  session.setActiveAccount(accountId);
  session.persistState();
  const active = session.activeAccount;
  if (active) {
    aliasInput.value = active.displayName;
    domainInput.value = active.domain;
  }
  if (session.hasAccount) {
    await router.push("/wallet");
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
  restoreError.value = "";
  onboardingError.value = "";
  onboardingStatus.value = "";
  backupCopyMessage.value = "";
  backupCopyError.value = "";
  accountFlowMode.value = "generate";
  showRestorePanel.value = false;
  restorePhraseInput.value = "";
  try {
    generating.value = true;
    const words = generateMnemonicWords(wordCount.value);
    mnemonicWords.value = words;
    const mnemonic = normalizeMnemonicPhrase(words.join(" "));
    recoveryMnemonic.value = mnemonic;
    const privateKeyHex = mnemonicToPrivateKeyHex(mnemonic);
    const { publicKeyHex } = await derivePublicKey(privateKeyHex);
    generatedKeys.value = {
      privateKeyHex,
      publicKeyHex,
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

const restoreFromPhrase = async (phrase: string) => {
  const normalizedPhrase = normalizeMnemonicPhrase(phrase);
  if (!normalizedPhrase) {
    throw new Error(t("Enter a recovery phrase."));
  }

  const wordTotal = normalizedPhrase.split(" ").filter(Boolean).length;
  if (wordTotal !== 12 && wordTotal !== 24) {
    throw new Error(t("Recovery phrase must contain 12 or 24 words."));
  }

  const privateKeyHex = mnemonicToPrivateKeyHex(normalizedPhrase);
  const { publicKeyHex } = await derivePublicKey(privateKeyHex);
  mnemonicWords.value = [];
  recoveryMnemonic.value = normalizedPhrase;
  generatedKeys.value = {
    privateKeyHex,
    publicKeyHex,
  };
  wordCount.value = wordTotal as 12 | 24;
  backupConfirmed.value = true;
  restorePhraseInput.value = "";
  showRestorePanel.value = false;
};

const restoreRecovery = async () => {
  restoreError.value = "";
  generateError.value = "";
  onboardingError.value = "";
  onboardingStatus.value = "";
  backupCopyMessage.value = "";
  backupCopyError.value = "";
  accountFlowMode.value = "restore";

  try {
    restoring.value = true;
    await restoreFromPhrase(restorePhraseInput.value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    restoreError.value =
      message === "Invalid recovery phrase"
        ? t("Invalid recovery phrase")
        : message;
    generatedKeys.value = null;
  } finally {
    restoring.value = false;
  }
};

const handleBackupFileSelection = async (event: Event) => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  restoreError.value = "";
  generateError.value = "";
  onboardingError.value = "";
  onboardingStatus.value = "";
  backupCopyMessage.value = "";
  backupCopyError.value = "";
  accountFlowMode.value = "restore";

  try {
    restoring.value = true;
    const payload = parseWalletBackupPayload(await file.text());
    await restoreFromPhrase(payload.mnemonic);
    applyBackupMetadata(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    restoreError.value =
      message === "Invalid recovery phrase"
        ? t("Invalid recovery phrase")
        : message;
    generatedKeys.value = null;
  } finally {
    restoring.value = false;
    if (input) {
      input.value = "";
    }
  }
};

const canSaveGenerated = computed(() => {
  return Boolean(
    generatedKeys.value &&
      generatedAccountId.value &&
      backupConfirmed.value &&
      connectionForm.toriiUrl &&
      connectionForm.chainId,
  );
});

const persistGeneratedIdentity = async (localOnly: boolean) => {
  if (!generatedKeys.value || !generatedAccountId.value) {
    return;
  }
  const vaultAvailable = await isSecureVaultAvailable().catch(() => false);
  if (!vaultAvailable) {
    throw new Error(
      t("Secure OS-backed key storage is unavailable on this device."),
    );
  }
  await storeAccountSecret({
    accountId: generatedAccountId.value,
    privateKeyHex: generatedKeys.value.privateKeyHex,
  });
  if (pendingConfidentialWalletBackup.value && recoveryMnemonic.value) {
    await importConfidentialWalletBackup({
      toriiUrl: connectionForm.toriiUrl,
      accountId: generatedAccountId.value,
      mnemonic: recoveryMnemonic.value,
      confidentialWallet: pendingConfidentialWalletBackup.value,
    });
  }
  session.updateConnection({
    toriiUrl: connectionForm.toriiUrl,
    chainId: connectionForm.chainId,
  });
  session.addAccount({
    displayName: aliasInput.value.trim(),
    domain: normalizedDomain.value,
    accountId: generatedAccountId.value,
    i105AccountId: generatedStoredI105AccountId.value,
    i105DefaultAccountId:
      generatedAccountSummary.value?.i105DefaultAccountId ?? "",
    publicKeyHex: generatedKeys.value.publicKeyHex,
    hasStoredSecret: true,
    localOnly,
  });
  session.persistState();
  pendingConfidentialWalletBackup.value = null;
};

const saveGeneratedIdentity = async () => {
  onboardingError.value = "";
  onboardingStatus.value = "";
  if (!generatedKeys.value) {
    onboardingError.value = t("Generate a keypair first.");
    return;
  }
  if (!generatedAccountId.value) {
    onboardingError.value = t("Generate a keypair first.");
    return;
  }
  if (!backupConfirmed.value) {
    onboardingError.value = t("Confirm that you stored the recovery phrase.");
    return;
  }
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    onboardingError.value = t(
      "Network connection is unavailable. Reload and try again.",
    );
    return;
  }
  await persistGeneratedIdentity(true);
  onboardingStatus.value = isRestoreMode.value
    ? t("Wallet {accountId} restored locally.", {
        accountId: generatedVisibleAccountId.value || generatedAccountId.value,
      })
    : t("Account {accountId} saved locally.", {
        accountId: generatedVisibleAccountId.value || generatedAccountId.value,
      });
  await router.push("/wallet");
};

const downloadBackup = async (target: "manual" | "icloud" | "google") => {
  if (!recoveryMnemonic.value) {
    return;
  }
  onboardingError.value = "";
  let confidentialWallet: ConfidentialWalletBackupMetadata | undefined;
  if (generatedAccountId.value) {
    confidentialWallet = await exportConfidentialWalletBackup({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      accountId: generatedAccountId.value,
      mnemonic: recoveryMnemonic.value,
    }).catch((error) => {
      console.warn("Failed to export confidential wallet backup state", error);
      return pendingConfidentialWalletBackup.value ?? undefined;
    });
  }
  const payload = buildWalletBackupPayload({
    mnemonic: recoveryMnemonic.value,
    wordCount: wordCount.value,
    target,
    displayName: aliasInput.value.trim(),
    domain: normalizedDomain.value,
    confidentialWallet,
  });
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

const copyRecoveryPhrase = async () => {
  const phrase = copyableRecoveryPhrase.value;
  if (!phrase) {
    backupCopyMessage.value = "";
    backupCopyError.value = t("Nothing to copy yet.");
    return;
  }
  try {
    await copyTextToClipboard(phrase);
    backupCopyError.value = "";
    backupCopyMessage.value = t("Recovery phrase copied to clipboard.");
  } catch (_error) {
    backupCopyMessage.value = "";
    backupCopyError.value = t(
      "Clipboard access failed. Copy the phrase manually.",
    );
  }
};

const connectPreview = ref<Awaited<
  ReturnType<typeof createConnectPreview>
> | null>(null);
const connectQr = ref("");
const connectLoading = ref(false);
const connectError = ref("");
const connectGeneration = ref(0);

const startConnectPairing = async () => {
  connectError.value = "";
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    connectError.value = t(
      "Network connection is unavailable. Reload and try again.",
    );
    return;
  }
  const currentGeneration = connectGeneration.value + 1;
  connectGeneration.value = currentGeneration;
  connectLoading.value = true;
  try {
    const preview = await createConnectPreview({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId,
      launchProtocol: CONNECT_LAUNCH_PROTOCOL,
    });
    const nextConnectQr = preview.walletUri
      ? await QRCode.toDataURL(preview.walletUri)
      : "";
    if (currentGeneration !== connectGeneration.value) {
      return;
    }
    connectPreview.value = preview;
    connectQr.value = nextConnectQr;
  } catch (err) {
    if (currentGeneration !== connectGeneration.value) {
      return;
    }
    connectError.value = err instanceof Error ? err.message : String(err);
    connectPreview.value = null;
    connectQr.value = "";
  } finally {
    if (currentGeneration === connectGeneration.value) {
      connectLoading.value = false;
    }
  }
};

const resetConnect = () => {
  connectGeneration.value += 1;
  connectLoading.value = false;
  connectPreview.value = null;
  connectQr.value = "";
  connectError.value = "";
};
</script>

<style scoped>
.account-grid {
  grid-template-columns: minmax(420px, 1.08fr) minmax(320px, 0.92fr);
  align-items: start;
}

.account-saved {
  grid-column: 1 / -1;
}

.account-primary,
.account-connect,
.account-saved {
  min-height: 100%;
}

.keygen-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.keygen-form label:last-child {
  grid-column: 1 / -1;
}

.keygen-form label textarea {
  resize: vertical;
}

.backup-panel {
  margin-top: 16px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--glass-border);
  background:
    linear-gradient(130deg, rgba(255, 255, 255, 0.08), transparent 70%),
    rgba(255, 255, 255, 0.03);
}

.mnemonic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 12px;
}

.mnemonic-grid span {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
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

.restore-panel textarea {
  resize: vertical;
  min-height: 112px;
}

.error {
  color: #b91c1c;
}

.success {
  color: #16a34a;
}

.connect-preview {
  margin-bottom: 16px;
  display: grid;
  gap: 14px;
  justify-items: center;
}

.connect-qr {
  width: min(220px, 100%);
  aspect-ratio: 1 / 1;
  object-fit: contain;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
}

.monospace {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.registration-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.reg-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 14px;
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
  display: grid;
  gap: 12px;
}

.account-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
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
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chain-quickpick {
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
}

@media (max-width: 1080px) {
  .account-grid {
    grid-template-columns: 1fr;
  }

  .keygen-form {
    grid-template-columns: 1fr;
  }

  .keygen-form label:last-child {
    grid-column: auto;
  }

  .registration-steps {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .account-row {
    grid-template-columns: 1fr;
  }

  .account-actions {
    justify-content: flex-start;
  }
}
</style>
