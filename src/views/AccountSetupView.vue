<template>
  <div v-if="isFirstLaunch" class="account-wizard">
    <section class="account-wizard-intro">
      <div class="account-wizard-copy">
        <p class="section-label">{{ t("Account Setup") }}</p>
        <h2>{{ t("TAIRA Testnet Account") }}</h2>
        <p class="helper">
          {{
            t(
              "Generate your account keys, store a recovery phrase, and save the wallet locally. On-chain alias registration is optional.",
            )
          }}
        </p>
      </div>
      <div class="account-wizard-chips">
        <span class="pill positive">{{ t("TAIRA locked") }}</span>
        <span class="pill">{{ t("Account Setup") }}</span>
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
            <p class="meta-label">{{ t("Connection") }}</p>
            <p class="meta-value">{{ connectionForm.toriiUrl }}</p>
            <p class="helper meta-sub mono">{{ connectionForm.chainId }}</p>
          </div>
          <div class="wizard-summary-row">
            <p class="meta-label">
              {{ t("Display Name (local only, not on-chain)") }}
            </p>
            <p class="meta-value">{{ aliasInput || t("Not created yet") }}</p>
          </div>
          <div class="wizard-summary-row">
            <p class="meta-label">{{ t("Canonical I105 Account ID") }}</p>
            <p class="meta-value mono">
              {{ generatedVisibleAccountId || t("Not created yet") }}
            </p>
            <p class="helper meta-sub">
              {{
                t(
                  "Use the real TAIRA I105 literal, for example {example}. Do not use @domain, legacy compatibility literals, or i105: forms.",
                  {
                    example: t("Example I105 Account ID"),
                  },
                )
              }}
            </p>
          </div>
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
              <h2>{{ t("Generate recovery phrase") }}</h2>
            </div>
          </header>
          <div class="form-grid wizard-form-grid">
            <label>
              {{ t("Display Name (local only, not on-chain)") }}
              <input v-model.trim="aliasInput" :placeholder="t('Alice')" />
            </label>
            <label>
              {{ t("Domain") }}
              <input v-model.trim="domainInput" :placeholder="t('default')" />
            </label>
            <label class="wizard-field-compact">
              {{ t("Recovery Phrase Length") }}
              <select v-model.number="wordCount">
                <option :value="12">{{ t("12 words") }}</option>
                <option :value="24">{{ t("24 words") }}</option>
              </select>
            </label>
          </div>
          <p class="helper">
            {{
              t(
                "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.",
                {
                  domain: t("default"),
                },
              )
            }}
          </p>
          <div class="actions">
            <button :disabled="generating" @click="generateRecovery">
              {{
                generating ? t("Generating…") : t("Generate recovery phrase")
              }}
            </button>
            <button
              v-if="generatedKeys || mnemonicWords.length"
              class="secondary"
              @click="startNewRegistration"
            >
              {{ t("Reset") }}
            </button>
          </div>
          <p v-if="generateError" class="helper error">{{ generateError }}</p>
        </section>

        <section
          v-if="mnemonicWords.length"
          class="card wizard-stage"
          :class="{
            current: onboardingStage === 'backup',
            complete: backupConfirmed,
          }"
        >
          <header class="card-header">
            <div>
              <h2>{{ t("Download backup") }}</h2>
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
            <button class="secondary" @click="downloadBackup('manual')">
              {{ t("Download backup") }}
            </button>
            <button class="secondary" @click="downloadBackup('icloud')">
              {{ t("Store for iCloud Drive") }}
            </button>
            <button class="secondary" @click="downloadBackup('google')">
              {{ t("Store for Google Drive") }}
            </button>
          </div>
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
              <h2>{{ t("Save identity") }}</h2>
            </div>
          </header>
          <div class="wizard-review-grid">
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Canonical I105 Account ID") }}</p>
              <p class="meta-value mono">{{ generatedVisibleAccountId }}</p>
            </div>
            <div class="wizard-review-item">
              <p class="meta-label">
                {{ t("Display Name (local only, not on-chain)") }}
              </p>
              <p class="meta-value">{{ aliasInput || t("Not created yet") }}</p>
            </div>
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Domain") }}</p>
              <p class="meta-value">{{ normalizedDomain }}</p>
            </div>
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Connection") }}</p>
              <p class="meta-value">{{ connectionForm.toriiUrl }}</p>
            </div>
          </div>
          <div class="actions">
            <button
              :disabled="!canSaveGenerated || onboardingBusy"
              @click="saveGeneratedIdentity"
            >
              {{ t("Save identity") }}
            </button>
            <button
              class="secondary"
              :disabled="onboardingBusy"
              @click="showAliasRegistration = !showAliasRegistration"
            >
              {{ showAliasRegistration ? t("Hide advanced") : t("Advanced") }}
            </button>
            <button class="secondary" @click="startNewRegistration">
              {{ t("Reset") }}
            </button>
          </div>
          <div
            v-if="showAliasRegistration"
            class="backup-panel account-advanced-panel"
          >
            <p class="section-label">
              {{ t("Optional on-chain alias registration") }}
            </p>
            <label>
              {{ t("Alias Metadata (JSON, optional)") }}
              <textarea
                v-model.trim="identityInput"
                rows="3"
                :placeholder="aliasMetadataPlaceholder"
              ></textarea>
            </label>
            <div class="actions">
              <button
                class="secondary"
                :disabled="!canSaveGenerated || onboardingBusy"
                @click="registerGeneratedIdentity"
              >
                {{
                  onboardingBusy
                    ? t("Registering alias…")
                    : t("Register on-chain alias")
                }}
              </button>
            </div>
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
          <h2>{{ t("TAIRA Testnet Account") }}</h2>
          <p class="helper">
            {{
              t(
                "Generate your account keys, store a recovery phrase, and save the wallet locally. On-chain alias registration is optional.",
              )
            }}
          </p>
        </div>
      </header>

      <div class="form-grid wizard-form-grid">
        <label>
          {{ t("Display Name (local only, not on-chain)") }}
          <input v-model.trim="aliasInput" :placeholder="t('Alice')" />
        </label>
        <label>
          {{ t("Domain") }}
          <input v-model.trim="domainInput" :placeholder="t('default')" />
        </label>
        <label class="wizard-field-compact">
          {{ t("Recovery Phrase Length") }}
          <select v-model.number="wordCount">
            <option :value="12">{{ t("12 words") }}</option>
            <option :value="24">{{ t("24 words") }}</option>
          </select>
        </label>
      </div>

      <div v-if="generatedKeys" class="wizard-review-grid account-review-grid">
        <div class="wizard-review-item">
          <p class="meta-label">{{ t("Canonical I105 Account ID") }}</p>
          <p class="meta-value mono">{{ generatedVisibleAccountId }}</p>
        </div>
        <div class="wizard-review-item">
          <p class="meta-label">{{ t("Domain") }}</p>
          <p class="meta-value">{{ normalizedDomain }}</p>
        </div>
      </div>

      <div class="actions">
        <button :disabled="generating" @click="generateRecovery">
          {{ generating ? t("Generating…") : t("Generate recovery phrase") }}
        </button>
        <button
          class="secondary"
          :disabled="!canSaveGenerated || onboardingBusy"
          @click="saveGeneratedIdentity"
        >
          {{ t("Save identity") }}
        </button>
        <button
          class="secondary"
          :disabled="onboardingBusy"
          @click="showAliasRegistration = !showAliasRegistration"
        >
          {{ showAliasRegistration ? t("Hide advanced") : t("Advanced") }}
        </button>
        <button
          v-if="generatedKeys || mnemonicWords.length"
          class="secondary"
          @click="startNewRegistration"
        >
          {{ t("Reset") }}
        </button>
      </div>
      <p v-if="generateError" class="helper error">{{ generateError }}</p>
      <p v-if="onboardingError" class="helper error">{{ onboardingError }}</p>
      <p v-if="onboardingStatus" class="helper success">
        {{ onboardingStatus }}
      </p>
      <div
        v-if="showAliasRegistration && generatedKeys && backupConfirmed"
        class="backup-panel account-advanced-panel"
      >
        <p class="section-label">
          {{ t("Optional on-chain alias registration") }}
        </p>
        <label>
          {{ t("Alias Metadata (JSON, optional)") }}
          <textarea
            v-model.trim="identityInput"
            rows="3"
            :placeholder="aliasMetadataPlaceholder"
          ></textarea>
        </label>
        <div class="actions">
          <button
            class="secondary"
            :disabled="!canSaveGenerated || onboardingBusy"
            @click="registerGeneratedIdentity"
          >
            {{
              onboardingBusy
                ? t("Registering alias…")
                : t("Register on-chain alias")
            }}
          </button>
        </div>
      </div>

      <div v-if="mnemonicWords.length" class="backup-panel">
        <p class="helper">
          {{ t("Write these words down in order. They restore your wallet.") }}
        </p>
        <div class="mnemonic-grid">
          <span v-for="(word, index) in mnemonicWords" :key="word + index">
            <strong>{{ index + 1 }}.</strong> {{ word }}
          </span>
        </div>
        <div class="backup-actions">
          <button class="secondary" @click="downloadBackup('manual')">
            {{ t("Download backup") }}
          </button>
          <button class="secondary" @click="downloadBackup('icloud')">
            {{ t("Store for iCloud Drive") }}
          </button>
          <button class="secondary" @click="downloadBackup('google')">
            {{ t("Store for Google Drive") }}
          </button>
        </div>
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
              {{
                account.displayName ||
                account.i105AccountId ||
                account.accountId
              }}
            </p>
            <p class="helper monospace">
              {{ account.i105AccountId || account.accountId }}
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
              :disabled="account.accountId === session.activeAccountId"
              @click="setActiveAccount(account.accountId)"
            >
              {{
                account.accountId === session.activeAccountId
                  ? t("Selected")
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
        <h2>{{ t("IrohaConnect Pairing") }}</h2>
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
        <div class="kv monospace">
          <span class="kv-label">{{ t("Session ID") }}</span>
          <span class="kv-value">{{ connectPreview.sidBase64Url }}</span>
        </div>
        <div v-if="connectPreview.tokenWallet" class="kv monospace">
          <span class="kv-label">{{ t("Wallet Token") }}</span>
          <span class="kv-value">{{ connectPreview.tokenWallet }}</span>
        </div>
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
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QRCode from "qrcode";
import { useAppI18n } from "@/composables/useAppI18n";
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
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

const session = useSessionStore();
const router = useRouter();
const { t } = useAppI18n();
const DEFAULT_DOMAIN_LABEL = "default";

const connectionForm = reactive({
  toriiUrl: session.connection.toriiUrl,
  chainId: session.connection.chainId,
});

watch(
  () => session.connection,
  (value) => {
    const isTaira =
      value.toriiUrl === TAIRA_CHAIN_PRESET.connection.toriiUrl &&
      value.chainId === TAIRA_CHAIN_PRESET.connection.chainId &&
      value.networkPrefix === TAIRA_CHAIN_PRESET.connection.networkPrefix;
    if (!isTaira) {
      session.updateConnection({
        ...TAIRA_CHAIN_PRESET.connection,
        assetDefinitionId:
          value.assetDefinitionId ||
          TAIRA_CHAIN_PRESET.connection.assetDefinitionId,
      });
      session.persistState();
      connectionForm.toriiUrl = TAIRA_CHAIN_PRESET.connection.toriiUrl;
      connectionForm.chainId = TAIRA_CHAIN_PRESET.connection.chainId;
    } else {
      connectionForm.toriiUrl = value.toriiUrl;
      connectionForm.chainId = value.chainId;
    }
  },
  { deep: true, immediate: true },
);

const aliasInput = ref(session.activeAccount?.displayName || "");
const domainInput = ref(session.activeAccount?.domain || DEFAULT_DOMAIN_LABEL);
const identityInput = ref("");
const aliasMetadataPlaceholder = '{"country":"JP","kyc_id":"..."}';
const wordCount = ref<12 | 24>(24);
const mnemonicWords = ref<string[]>([]);
const generatedKeys = ref<{
  privateKeyHex: string;
  publicKeyHex: string;
} | null>(null);
const backupConfirmed = ref(false);
const showAliasRegistration = ref(false);
const generating = ref(false);
const generateError = ref("");
const onboardingError = ref("");
const onboardingStatus = ref("");
const onboardingBusy = ref(false);
const hasSavedAccounts = computed(() => session.accounts.length > 0);
const isFirstLaunch = computed(() => !hasSavedAccounts.value);
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
const generatedVisibleAccountId = computed(
  () =>
    generatedAccountSummary.value?.i105AccountId ??
    generatedAccountSummary.value?.accountId ??
    "",
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
const onboardingSteps = computed(() => [
  {
    step: "01",
    label: t("Generate recovery phrase"),
    done: Boolean(generatedKeys.value),
    current: onboardingStage.value === "identity",
  },
  {
    step: "02",
    label: t("Recovery phrase saved"),
    done: backupConfirmed.value,
    current: onboardingStage.value === "backup",
  },
  {
    step: "03",
    label: t("Save identity"),
    done: Boolean(onboardingStatus.value || session.hasAccount),
    current: onboardingStage.value === "register",
  },
]);
const registrationChecklist = computed(() => [
  {
    label: t("TAIRA connection ready"),
    done: Boolean(connectionForm.toriiUrl && connectionForm.chainId),
  },
  {
    label: t("Recovery phrase saved"),
    done: mnemonicWords.value.length > 0 && backupConfirmed.value,
  },
  {
    label: t("Account saved"),
    done: Boolean(onboardingStatus.value || session.hasAccount),
  },
]);

const startNewRegistration = () => {
  aliasInput.value = "";
  domainInput.value = DEFAULT_DOMAIN_LABEL;
  identityInput.value = "";
  mnemonicWords.value = [];
  generatedKeys.value = null;
  backupConfirmed.value = false;
  showAliasRegistration.value = false;
  generateError.value = "";
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

const parseIdentity = () => {
  if (!identityInput.value.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(identityInput.value);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    throw new Error(t("Identity metadata must be a JSON object."));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : t("Invalid identity metadata JSON payload."),
    );
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

const persistGeneratedIdentity = (localOnly: boolean) => {
  if (!generatedKeys.value || !generatedAccountId.value) {
    return;
  }
  session.updateConnection({
    toriiUrl: connectionForm.toriiUrl,
    chainId: connectionForm.chainId,
  });
  session.addAccount({
    displayName: aliasInput.value.trim(),
    domain: normalizedDomain.value,
    accountId: generatedAccountId.value,
    i105AccountId: generatedVisibleAccountId.value,
    i105DefaultAccountId:
      generatedAccountSummary.value?.i105DefaultAccountId ?? "",
    publicKeyHex: generatedKeys.value.publicKeyHex,
    privateKeyHex: generatedKeys.value.privateKeyHex,
    localOnly,
  });
  session.persistState();
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
      "TAIRA connection is unavailable. Reload and try again.",
    );
    return;
  }
  persistGeneratedIdentity(true);
  onboardingStatus.value = t("Account {accountId} saved locally.", {
    accountId: generatedVisibleAccountId.value || generatedAccountId.value,
  });
  await router.push("/wallet");
};

const registerGeneratedIdentity = async () => {
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
      "TAIRA connection is unavailable. Reload and try again.",
    );
    return;
  }
  onboardingBusy.value = true;
  try {
    const identity = parseIdentity();
    const response = await onboardAccount({
      toriiUrl: connectionForm.toriiUrl,
      alias: aliasInput.value.trim() || t("Unnamed"),
      accountId: generatedAccountId.value,
      identity,
    });
    persistGeneratedIdentity(false);
    onboardingStatus.value = t(
      "On-chain alias {accountId} queued (tx {txHash}…)",
      {
        accountId: response.account_id,
        txHash: response.tx_hash_hex.slice(0, 12),
      },
    );
    await router.push("/wallet");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/status 409\b/i.test(message)) {
      persistGeneratedIdentity(false);
      await router.push("/wallet");
      return;
    }
    if (
      /status 403\b/i.test(message) ||
      message.includes("UAID onboarding is disabled") ||
      message.includes("UAID alias registration is disabled")
    ) {
      persistGeneratedIdentity(true);
      onboardingStatus.value = t(
        "On-chain alias registration is unavailable on this Torii endpoint. The wallet was still saved locally.",
      );
      await router.push("/wallet");
      return;
    }
    onboardingError.value = message;
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
const connectGeneration = ref(0);

const startConnectPairing = async () => {
  connectError.value = "";
  if (!connectionForm.toriiUrl || !connectionForm.chainId) {
    connectError.value = t(
      "TAIRA connection is unavailable. Reload and try again.",
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
