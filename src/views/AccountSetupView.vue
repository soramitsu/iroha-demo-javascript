<template>
  <div v-if="isFirstLaunch" class="account-wizard">
    <section class="account-wizard-intro">
      <div class="account-wizard-copy">
        <p class="section-label">{{ t("Account Setup") }}</p>
        <h2>{{ t("Wallet identity") }}</h2>
        <p class="helper">{{ accountSetupHelperText }}</p>
        <SegmentedControl
          class="account-flow-choice"
          :model-value="accountFlowMode"
          :label="t('Account Setup')"
          :options="accountFlowOptions"
          @update:model-value="selectAccountFlow"
        />
      </div>
      <div class="account-wizard-chips">
        <StatusBadge tone="success" dot>{{ t("Network ready") }}</StatusBadge>
        <StatusBadge>{{ t("Secure backup") }}</StatusBadge>
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
            <div class="wizard-summary-row">
              <p class="meta-label">{{ t("Signing algorithm") }}</p>
              <p class="meta-value">{{ selectedSigningAlgorithmLabel }}</p>
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
            <label class="wizard-field-compact">
              {{ t("Signing algorithm") }}
              <select
                v-model="selectedSigningAlgorithm"
                :disabled="
                  generating ||
                  restoring ||
                  Boolean(generatedKeys) ||
                  signingAlgorithmsUnavailable
                "
              >
                <option
                  v-for="option in signingAlgorithmOptions"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <p v-if="signingAlgorithmCapabilityError" class="helper error">
              {{ signingAlgorithmCapabilityError }}
            </p>
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
              :disabled="
                generating || restoring || signingAlgorithmsUnavailable
              "
              @click="generateRecovery"
            >
              {{
                generating ? t("Generating…") : t("Generate recovery phrase")
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
              <textarea
                v-model.trim="restorePhraseInput"
                rows="4"
                :maxlength="MAX_MNEMONIC_PHRASE_LENGTH"
              ></textarea>
            </label>
            <div class="actions">
              <button
                :disabled="restoring || signingAlgorithmsUnavailable"
                @click="restoreRecovery"
              >
                {{ restoring ? t("Restoring…") : t("Load recovery phrase") }}
              </button>
              <button
                class="secondary"
                :disabled="restoring || signingAlgorithmsUnavailable"
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
            <div class="wizard-review-item">
              <p class="meta-label">{{ t("Signing algorithm") }}</p>
              <p class="meta-value">{{ generatedSigningAlgorithmLabel }}</p>
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
    <SegmentedControl
      v-model="savedWorkspaceMode"
      class="account-workspace-choice"
      :label="t('Saved Wallets')"
      :options="[
        { value: 'wallets', label: t('Saved Wallets') },
        { value: 'add', label: t('Add another wallet') },
      ]"
    />

    <section v-if="savedWorkspaceMode === 'add'" class="card account-primary">
      <header class="card-header">
        <div>
          <h2>
            {{ isRestoreMode ? t("Restore wallet") : t("Create wallet") }}
          </h2>
          <p class="helper">{{ accountSetupHelperText }}</p>
        </div>
      </header>
      <SegmentedControl
        class="account-flow-choice"
        :model-value="accountFlowMode"
        :label="t('Account Setup')"
        :options="accountFlowOptions"
        @update:model-value="selectAccountFlow"
      />

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
        <label class="wizard-field-compact">
          {{ t("Signing algorithm") }}
          <select
            v-model="selectedSigningAlgorithm"
            :disabled="
              generating ||
              restoring ||
              Boolean(generatedKeys) ||
              signingAlgorithmsUnavailable
            "
          >
            <option
              v-for="option in signingAlgorithmOptions"
              :key="option.id"
              :value="option.id"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <p v-if="signingAlgorithmCapabilityError" class="helper error">
          {{ signingAlgorithmCapabilityError }}
        </p>
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
        <div class="wizard-review-item">
          <p class="meta-label">{{ t("Signing algorithm") }}</p>
          <p class="meta-value">{{ generatedSigningAlgorithmLabel }}</p>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="!isRestoreMode && !generatedKeys"
          :disabled="generating || restoring || signingAlgorithmsUnavailable"
          @click="generateRecovery"
        >
          {{ generating ? t("Generating…") : t("Generate recovery phrase") }}
        </button>
        <button
          v-if="generatedKeys"
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
          <textarea
            v-model.trim="restorePhraseInput"
            rows="4"
            :maxlength="MAX_MNEMONIC_PHRASE_LENGTH"
          ></textarea>
        </label>
        <div class="actions">
          <button
            :disabled="restoring || signingAlgorithmsUnavailable"
            @click="restoreRecovery"
          >
            {{ restoring ? t("Restoring…") : t("Load recovery phrase") }}
          </button>
          <button
            class="secondary"
            :disabled="restoring || signingAlgorithmsUnavailable"
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

    <section v-else class="account-saved account-section">
      <header class="card-header">
        <div>
          <h2>{{ t("Saved Wallets") }}</h2>
        </div>
      </header>
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
            <StatusBadge
              :tone="
                account.accountId === session.activeAccountId
                  ? 'success'
                  : 'neutral'
              "
              dot
            >
              {{
                account.accountId === session.activeAccountId
                  ? t("Active")
                  : t("Available")
              }}
            </StatusBadge>
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
        <button class="secondary" @click="openNewWalletSetup">
          {{ t("Add another wallet") }}
        </button>
      </div>
    </section>

    <TechnicalDisclosure
      class="account-connect account-pairing-disclosure"
      :summary="t('IrohaConnect connection')"
    >
      <div class="account-connect-content">
        <p class="helper">
          {{
            t(
              "Scan a wallet-role QR from an app to connect it to this wallet. Every signing request still requires your approval.",
            )
          }}
        </p>
        <div class="connect-reader">
          <div class="actions connect-reader-actions">
            <button
              class="secondary"
              type="button"
              data-testid="account-connect-scan"
              @click="toggleConnectScanner"
            >
              {{
                connectScanner.scanning
                  ? t("Stop scan")
                  : "Scan IrohaConnect QR"
              }}
            </button>
            <button
              class="secondary"
              type="button"
              @click="connectScanner.openFilePicker"
            >
              {{ t("Upload QR image") }}
            </button>
            <input
              ref="connectScanner.fileInputRef"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="sr-only"
              :aria-label="t('Upload QR image')"
              @change="connectScanner.decodeFile"
            />
          </div>

          <div v-if="connectScanner.scanning" class="connect-scanner">
            <video ref="connectScanner.videoRef" autoplay muted playsinline />
          </div>

          <div v-if="scannedConnectSession" class="connect-scanned">
            <div class="kv">
              <span class="kv-label">{{ t("Approval") }}</span>
              <span class="kv-value">
                {{
                  connectApprovalLoading
                    ? t("Approving…")
                    : connectApprovalStatus || t("Ready")
                }}
              </span>
            </div>
            <div class="kv monospace">
              <span class="kv-label">{{ t("Session ID") }}</span>
              <span class="kv-value">{{ scannedConnectSession.sid }}</span>
            </div>
            <div class="kv monospace">
              <span class="kv-label">{{ t("Chain ID") }}</span>
              <span class="kv-value">{{ session.connection.chainId }}</span>
            </div>
            <div class="kv monospace">
              <span class="kv-label">NetworkId</span>
              <span class="kv-value">{{
                scannedConnectSession.networkId
              }}</span>
            </div>
            <div v-if="scannedConnectSession.node" class="kv monospace">
              <span class="kv-label">{{ t("Endpoint") }}</span>
              <span class="kv-value">{{ scannedConnectSession.node }}</span>
            </div>
            <div class="actions">
              <button
                class="secondary"
                type="button"
                @click="copyScannedConnectUri"
              >
                {{ scannedConnectCopied ? "Copied" : "Copy URI" }}
              </button>
            </div>
          </div>

          <p
            v-if="connectScanError || connectScanner.message"
            class="helper"
            :class="{ error: connectScanError }"
          >
            {{ connectScanError || connectScanner.message }}
          </p>
        </div>
        <p
          v-if="!connectPairingAvailable"
          class="helper warning"
          data-testid="account-connect-prerequisite"
        >
          {{ connectPairingPrerequisite }}
        </p>
      </div>
    </TechnicalDisclosure>

    <AppDialog
      :open="Boolean(pendingConnectSession)"
      :eyebrow="t('IrohaConnect connection')"
      :title="t('Approve connection?')"
      :description="
        t(
          'Review the requesting app details before allowing it to send wallet requests.',
        )
      "
      :busy="connectApprovalLoading"
      :show-close="false"
      initial-focus-selector="[data-testid='account-connect-reject']"
      @close="rejectPendingConnection"
    >
      <div class="connect-modal-grid">
        <div
          v-for="detail in pendingConnectionDetails"
          :key="detail.label"
          class="kv"
          :class="{ monospace: detail.monospace }"
        >
          <span class="kv-label">{{ detail.label }}</span>
          <span class="kv-value">{{ detail.value }}</span>
        </div>
      </div>
      <template #actions>
        <button
          type="button"
          class="secondary"
          data-testid="account-connect-reject"
          :disabled="connectApprovalLoading"
          @click="rejectPendingConnection"
        >
          {{ t("Reject") }}
        </button>
        <button
          type="button"
          :disabled="connectApprovalLoading"
          @click="approvePendingConnection"
        >
          {{
            connectApprovalLoading ? t("Approving…") : t("Approve connection")
          }}
        </button>
      </template>
    </AppDialog>

    <AppDialog
      :open="Boolean(pendingConnectRequest)"
      :eyebrow="t('IrohaConnect request')"
      :title="t('Approve signing request?')"
      :description="
        t(
          'Review the exact request before allowing the connected app to use this wallet.',
        )
      "
      :busy="connectRequestLoading"
      :show-close="false"
      initial-focus-selector="[data-testid='account-connect-request-reject']"
      @close="rejectPendingConnectRequest"
    >
      <div v-if="pendingConnectRequest" class="connect-modal-grid">
        <div class="kv">
          <span class="kv-label">{{ t("Request type") }}</span>
          <span class="kv-value">{{ pendingConnectRequest.label }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Payload bytes") }}</span>
          <span class="kv-value">{{ pendingConnectRequest.byteLength }}</span>
        </div>
        <div v-if="pendingConnectRequest.domainTag" class="kv monospace">
          <span class="kv-label">{{ t("Domain") }}</span>
          <span class="kv-value">{{ pendingConnectRequest.domainTag }}</span>
        </div>
        <div
          v-if="pendingConnectRequest.reviewRows.length === 0"
          class="kv monospace"
        >
          <span class="kv-label">{{ t("Signing payload preview") }}</span>
          <span class="kv-value">{{ pendingConnectRequest.preview }}</span>
        </div>
        <div
          v-for="row in pendingConnectRequest.reviewRows"
          :key="row.label"
          class="kv connect-review-row"
          :class="{ monospace: row.monospace, error: row.warning }"
        >
          <span class="kv-label">{{ row.label }}</span>
          <span class="kv-value">{{ row.value }}</span>
        </div>
      </div>
      <p v-if="connectRequestError" class="helper error">
        {{ connectRequestError }}
      </p>
      <template #actions>
        <button
          type="button"
          class="secondary"
          data-testid="account-connect-request-reject"
          :disabled="connectRequestLoading"
          @click="rejectPendingConnectRequest"
        >
          {{ t("Reject") }}
        </button>
        <button
          type="button"
          :disabled="connectRequestLoading"
          @click="approvePendingConnectRequest"
        >
          {{ connectRequestLoading ? t("Approving…") : t("Approve request") }}
        </button>
      </template>
    </AppDialog>
  </div>
  <input
    ref="backupFileInput"
    type="file"
    accept=".json,application/json"
    style="display: none"
    :aria-label="t('Import backup JSON')"
    @change="handleBackupFileSelection"
  />
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import AppDialog from "@/components/ui/AppDialog.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import StatusBadge from "@/components/ui/StatusBadge.vue";
import TechnicalDisclosure from "@/components/ui/TechnicalDisclosure.vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useQrScanner } from "@/composables/useQrScanner";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import {
  approveIrohaConnectRequest,
  approveIrohaConnectSession,
  closeIrohaConnectSession,
  copyTextToClipboard,
  deriveAccountAddress,
  exportConfidentialWalletBackup,
  generateKeyPair,
  getSigningAlgorithms,
  importConfidentialWalletBackup,
  inspectEndpoint,
  isSecureVaultAvailable,
  prepareIrohaConnectSession,
  processIrohaConnectFrame,
  rejectIrohaConnectRequest,
  resetIrohaConnectBoundary,
  setIrohaConnectContext,
  storeAccountSecret,
} from "@/services/iroha";
import {
  generateMnemonicWords,
  MAX_MNEMONIC_PHRASE_LENGTH,
  mnemonicToPrivateKeyHex,
  normalizeMnemonicPhrase,
} from "@/utils/mnemonic";
import {
  buildWalletBackupPayload,
  MAX_WALLET_BACKUP_JSON_BYTES,
  parseWalletBackupPayload,
  type ConfidentialWalletBackupMetadata,
} from "@/utils/walletBackup";
import {
  DEFAULT_SIGNING_ALGORITHM,
  signingAlgorithmLabel,
} from "@/utils/signingAlgorithms";
import { CHAIN_PRESETS, DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import { getAccountDisplayLabel, getPublicAccountId } from "@/utils/accountId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  assertIrohaConnectEndpointCanPair,
  buildIrohaConnectTokenProtocol,
  buildIrohaConnectWebSocketUrl,
  parseIrohaConnectUri,
  type IrohaConnectNetworkContext,
  type ParsedIrohaConnectUri,
  validateIrohaConnectNetworkClaim,
} from "@/utils/irohaConnect";
import {
  connectTransactionReviewRows,
  type ConnectTransactionReviewRow,
} from "@/utils/connectTransactionReview";
import {
  base64ToBytes,
  bytesToBase64,
  decodeConnectFrame,
  readIrohaConnectRelayFrame,
  type ConnectPermissions,
} from "@/utils/soraswapConnectWire";

const session = useSessionStore();
const endpointStore = useEndpointStore();
const router = useRouter();
const { t } = useAppI18n();
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
  networkPrefix: session.connection.networkPrefix,
});
const signingAlgorithmOptions = ref([
  {
    id: DEFAULT_SIGNING_ALGORITHM,
    label: signingAlgorithmLabel(DEFAULT_SIGNING_ALGORITHM),
    isDefault: true,
  },
]);
const selectedSigningAlgorithm = ref(DEFAULT_SIGNING_ALGORITHM);
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

const findSigningAlgorithmOption = (algorithm: string) =>
  signingAlgorithmOptions.value.find((option) => option.id === algorithm);
const signingAlgorithmsUnavailable = computed(
  () => signingAlgorithmOptions.value.length === 0,
);
const signingAlgorithmCapabilityError = computed(() =>
  signingAlgorithmsUnavailable.value
    ? t(
        "This endpoint does not advertise any signing algorithms supported by this app.",
      )
    : "",
);
const selectedSigningAlgorithmLabel = computed(() =>
  signingAlgorithmsUnavailable.value
    ? t("Unavailable")
    : (findSigningAlgorithmOption(selectedSigningAlgorithm.value)?.label ??
      signingAlgorithmLabel(selectedSigningAlgorithm.value)),
);

const assertSigningAlgorithmAvailable = (algorithm: string) => {
  if (signingAlgorithmsUnavailable.value) {
    throw new Error(signingAlgorithmCapabilityError.value);
  }
  if (!findSigningAlgorithmOption(algorithm)) {
    throw new Error(
      t("Select a signing algorithm supported by this endpoint."),
    );
  }
};
const generatedSigningAlgorithmLabel = computed(() =>
  generatedKeys.value
    ? signingAlgorithmLabel(generatedKeys.value.signingAlgorithm)
    : selectedSigningAlgorithmLabel.value,
);

const loadSigningAlgorithmOptions = async () => {
  try {
    const options = await getSigningAlgorithms(connectionForm.toriiUrl);
    signingAlgorithmOptions.value = options;
  } catch (error) {
    console.warn("Failed to load signing algorithm capabilities", error);
  }
  if (!findSigningAlgorithmOption(selectedSigningAlgorithm.value)) {
    selectedSigningAlgorithm.value =
      signingAlgorithmOptions.value.find((option) => option.isDefault)?.id ??
      signingAlgorithmOptions.value[0]?.id ??
      "";
  }
};

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
    connectionForm.networkPrefix = nextConnection.networkPrefix;
  },
  { deep: true, immediate: true },
);

watch(
  () => connectionForm.toriiUrl,
  () => {
    void loadSigningAlgorithmOptions();
  },
  { immediate: true },
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
  signingAlgorithm: string;
} | null>(null);
const restorePhraseInput = ref("");
const backupConfirmed = ref(false);
const showRestorePanel = ref(false);
const accountFlowMode = ref<"generate" | "restore">("generate");
const savedWorkspaceMode = ref<"wallets" | "add">("wallets");
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
const accountFlowOptions = computed(() => [
  { value: "generate", label: t("Create wallet") },
  { value: "restore", label: t("Restore from recovery phrase") },
]);
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
      signingAlgorithm: generatedKeys.value.signingAlgorithm,
    });
  } catch (_error) {
    return null;
  }
});
const generatedAccountId = computed(
  () => generatedAccountSummary.value?.accountId ?? "",
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
  selectedSigningAlgorithm.value =
    signingAlgorithmOptions.value.find((option) => option.isDefault)?.id ??
    signingAlgorithmOptions.value[0]?.id ??
    "";
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

const openNewWalletSetup = () => {
  startNewRegistration();
  savedWorkspaceMode.value = "add";
};

const selectAccountFlow = (mode: string) => {
  if (mode !== "generate" && mode !== "restore") {
    return;
  }
  if (
    mode === accountFlowMode.value &&
    (mode === "generate" || showRestorePanel.value)
  ) {
    return;
  }
  startNewRegistration();
  if (mode === "restore") {
    accountFlowMode.value = "restore";
    showRestorePanel.value = true;
  }
};

const applyBackupMetadata = (payload: {
  displayName?: string;
  domain?: string;
  signingAlgorithm: string;
  confidentialWallet: ConfidentialWalletBackupMetadata;
}) => {
  if (typeof payload.displayName === "string") {
    aliasInput.value = payload.displayName;
  }
  if (typeof payload.domain === "string" && payload.domain.trim()) {
    domainInput.value = payload.domain;
  }
  selectedSigningAlgorithm.value = payload.signingAlgorithm;
  pendingConfidentialWalletBackup.value = payload.confidentialWallet;
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

const deriveKeysFromRecoveryPhrase = async (
  mnemonic: string,
  signingAlgorithm: string,
) => {
  assertSigningAlgorithmAvailable(signingAlgorithm);
  const seedHex = mnemonicToPrivateKeyHex(mnemonic);
  const pair = await generateKeyPair({
    signingAlgorithm,
    seedHex,
  });
  return {
    privateKeyHex: pair.privateKeyHex,
    publicKeyHex: pair.publicKeyHex,
    signingAlgorithm: pair.signingAlgorithm || signingAlgorithm,
  };
};

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
    generatedKeys.value = await deriveKeysFromRecoveryPhrase(
      mnemonic,
      selectedSigningAlgorithm.value,
    );
    backupConfirmed.value = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    generateError.value = message;
    generatedKeys.value = null;
  } finally {
    generating.value = false;
  }
};

const restoreFromPhrase = async (
  phrase: string,
  signingAlgorithm = selectedSigningAlgorithm.value,
) => {
  const normalizedPhrase = normalizeMnemonicPhrase(phrase);
  if (!normalizedPhrase) {
    throw new Error(t("Enter a recovery phrase."));
  }

  const wordTotal = normalizedPhrase.split(" ").filter(Boolean).length;
  if (wordTotal !== 12 && wordTotal !== 24) {
    throw new Error(t("Recovery phrase must contain 12 or 24 words."));
  }

  mnemonicWords.value = [];
  recoveryMnemonic.value = normalizedPhrase;
  selectedSigningAlgorithm.value = signingAlgorithm;
  generatedKeys.value = await deriveKeysFromRecoveryPhrase(
    normalizedPhrase,
    signingAlgorithm,
  );
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
    if (file.size > MAX_WALLET_BACKUP_JSON_BYTES) {
      throw new Error(t("Invalid backup file."));
    }
    const payload = parseWalletBackupPayload(await file.text());
    selectedSigningAlgorithm.value = payload.signingAlgorithm;
    await restoreFromPhrase(payload.mnemonic, payload.signingAlgorithm);
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
      !signingAlgorithmsUnavailable.value &&
      connectionForm.toriiUrl &&
      connectionForm.chainId,
  );
});

const persistGeneratedIdentity = async (localOnly: boolean) => {
  const accountSummary = generatedAccountSummary.value;
  if (!generatedKeys.value || !accountSummary?.accountId) {
    return;
  }
  const accountId = accountSummary.accountId;
  const i105AccountId = accountSummary.i105AccountId || accountId;
  const i105DefaultAccountId = accountSummary.i105DefaultAccountId || "";
  const vaultAvailable = await isSecureVaultAvailable().catch(() => false);
  if (!vaultAvailable) {
    throw new Error(
      t("Secure OS-backed key storage is unavailable on this device."),
    );
  }
  await storeAccountSecret({
    accountId,
    networkPrefix: connectionForm.networkPrefix,
    privateKeyHex: generatedKeys.value.privateKeyHex,
    signingAlgorithm: generatedKeys.value.signingAlgorithm,
  });
  if (pendingConfidentialWalletBackup.value && recoveryMnemonic.value) {
    await importConfidentialWalletBackup({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId,
      networkPrefix: connectionForm.networkPrefix,
      accountId,
      mnemonic: recoveryMnemonic.value,
      confidentialWallet: pendingConfidentialWalletBackup.value,
    });
  }
  session.updateConnection({
    toriiUrl: connectionForm.toriiUrl,
    chainId: connectionForm.chainId,
    networkPrefix: session.connection.networkPrefix,
    assetDefinitionId: session.connection.assetDefinitionId,
  });
  session.addAccount({
    displayName: aliasInput.value.trim(),
    domain: normalizedDomain.value,
    accountId,
    i105AccountId,
    i105DefaultAccountId,
    publicKeyHex: generatedKeys.value.publicKeyHex,
    signingAlgorithm: generatedKeys.value.signingAlgorithm,
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
  try {
    assertSigningAlgorithmAvailable(generatedKeys.value.signingAlgorithm);
  } catch (error) {
    onboardingError.value =
      error instanceof Error ? error.message : String(error);
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
  try {
    await persistGeneratedIdentity(true);
  } catch (error) {
    onboardingError.value = toUserFacingErrorMessage(
      error,
      t("Secure OS-backed key storage is unavailable on this device."),
    );
    return;
  }
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
  if (!generatedAccountId.value) {
    onboardingError.value = t("Generate a keypair first.");
    return;
  }
  let confidentialWallet: ConfidentialWalletBackupMetadata;
  try {
    confidentialWallet = await exportConfidentialWalletBackup({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      networkPrefix: session.connection.networkPrefix,
      accountId: generatedAccountId.value,
      mnemonic: recoveryMnemonic.value,
    });
  } catch (error) {
    onboardingError.value = toUserFacingErrorMessage(
      error,
      t("Invalid backup file."),
    );
    return;
  }
  const payload = buildWalletBackupPayload({
    mnemonic: recoveryMnemonic.value,
    wordCount: wordCount.value,
    target,
    displayName: aliasInput.value.trim(),
    domain: normalizedDomain.value,
    signingAlgorithm:
      generatedKeys.value?.signingAlgorithm ?? selectedSigningAlgorithm.value,
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

const connectApprovalGeneration = ref(0);
const scannedConnectSession = ref<ParsedIrohaConnectUri | null>(null);
const pendingConnectSession = ref<ParsedIrohaConnectUri | null>(null);
const connectScanError = ref("");
const scannedConnectCopied = ref(false);
const connectApprovalLoading = ref(false);
const connectApprovalStatus = ref("");
let scannedConnectSocket: WebSocket | null = null;
let scannedConnectExpectedAppSequence = 1;
let scannedConnectExpectedServerSequence = 1;
let scannedConnectApproved = false;
let scannedConnectOpenApprovalInFlight = false;
let scannedConnectBoundaryInitialized = false;
let scannedConnectBoundarySessionToken = "";
let scannedConnectApprovedAccountId = "";
let scannedConnectNetworkContext: IrohaConnectNetworkContext | null = null;
let scannedConnectContextKey = "";
const pendingConnectRequest = shallowRef<{
  socket: WebSocket;
  parsed: ParsedIrohaConnectUri;
  requestToken: string;
  requestType: "sign_request_raw" | "sign_request_tx";
  domainTag: string | null;
  byteLength: number;
  preview: string;
  label: string;
  reviewRows: ConnectTransactionReviewRow[];
} | null>(null);
const connectRequestLoading = ref(false);
const connectRequestError = ref("");

const connectPairingAvailable = computed(
  () =>
    endpointStore.state === "ready" &&
    endpointStore.writeAllowed &&
    endpointStore.inspection?.features.irohaConnectSessions.supported === true,
);
const connectPairingPrerequisite = computed(() => {
  if (endpointStore.state !== "ready") {
    return t("Wait for endpoint capability inspection to finish.");
  }
  if (!endpointStore.writeAllowed) {
    return (
      endpointStore.diagnostic ||
      t("Writes are blocked until the endpoint identity is verified.")
    );
  }
  return t(
    "The active endpoint does not advertise IrohaConnect session writes.",
  );
});

interface IrohaConnectDetail {
  label: string;
  value: string;
  monospace?: boolean;
}

const activeConnectAccountId = computed(
  () =>
    getPublicAccountId(
      session.activeAccount,
      session.connection.networkPrefix,
    ) || "",
);
const connectContextKey = computed(() =>
  JSON.stringify([
    session.connection.toriiUrl,
    session.connection.chainId,
    session.connection.networkPrefix,
    session.activeAccountId,
  ]),
);

const displayOptional = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return t("Not provided");
  }
  return String(value);
};

const pendingConnectionDetails = computed<IrohaConnectDetail[]>(() => {
  const parsed = pendingConnectSession.value;
  if (!parsed) {
    return [];
  }
  return [
    {
      label: t("Active account"),
      value: activeConnectAccountId.value || t("No active wallet"),
      monospace: true,
    },
    { label: t("Session ID"), value: parsed.sid, monospace: true },
    {
      label: t("Chain ID"),
      value: session.connection.chainId,
      monospace: true,
    },
    {
      label: "NetworkId",
      value: displayOptional(parsed.networkId),
      monospace: true,
    },
    {
      label: t("Endpoint"),
      value: parsed.node || session.connection.toriiUrl,
      monospace: true,
    },
    {
      label: t("Wallet token"),
      value: parsed.token ? t("Present") : t("Missing"),
    },
    {
      label: t("Relay token"),
      value: parsed.relayToken ? t("Present") : t("Missing"),
    },
  ];
});

const clearScannedConnectState = () => {
  if (scannedConnectBoundarySessionToken) {
    closeIrohaConnectSession({
      sessionToken: scannedConnectBoundarySessionToken,
    });
  }
  if (scannedConnectBoundaryInitialized) {
    resetIrohaConnectBoundary();
  }
  scannedConnectSocket = null;
  scannedConnectExpectedAppSequence = 1;
  scannedConnectExpectedServerSequence = 1;
  scannedConnectApproved = false;
  scannedConnectOpenApprovalInFlight = false;
  scannedConnectBoundaryInitialized = false;
  scannedConnectBoundarySessionToken = "";
  scannedConnectApprovedAccountId = "";
  scannedConnectNetworkContext = null;
  scannedConnectContextKey = "";
  pendingConnectRequest.value = null;
  connectRequestLoading.value = false;
  connectRequestError.value = "";
};

const closeScannedConnectSocket = (reason = "approval complete") => {
  const socket = scannedConnectSocket;
  clearScannedConnectState();
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close(1000, reason);
  }
};

const closeSpecificConnectSocket = (
  socket: WebSocket,
  reason = "approval complete",
) => {
  if (scannedConnectSocket === socket) {
    clearScannedConnectState();
  }
  if (socket.readyState !== WebSocket.CLOSED) {
    socket.close(1000, reason);
  }
};

const handleScannedSocketTermination = (socket: WebSocket, reason: string) => {
  if (socket !== scannedConnectSocket) {
    return;
  }
  clearScannedConnectState();
  connectApprovalStatus.value = "";
  connectScanError.value = reason;
};

const waitForConnectSocketOpen = (socket: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("IrohaConnect approval timed out."));
    }, 10_000);
    socket.addEventListener(
      "open",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("IrohaConnect relay connection failed."));
      },
      { once: true },
    );
    socket.addEventListener(
      "close",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("IrohaConnect relay connection closed."));
      },
      { once: true },
    );
  });

const requireCurrentScannedConnection = (socket: WebSocket) => {
  if (
    socket !== scannedConnectSocket ||
    socket.readyState !== WebSocket.OPEN ||
    !scannedConnectContextKey ||
    scannedConnectContextKey !== connectContextKey.value ||
    !scannedConnectNetworkContext
  ) {
    throw new Error(
      "The active wallet changed while IrohaConnect approval was pending.",
    );
  }
  return scannedConnectNetworkContext;
};

const approveOpenConnectFrame = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  appPublicKeyHex: string,
  requestedNetworkId: string,
  permissions: ConnectPermissions | null,
) => {
  const network = requireCurrentScannedConnection(socket);
  if (!parsed.relayToken) {
    throw new Error("IrohaConnect relay token is missing.");
  }
  if (
    scannedConnectOpenApprovalInFlight ||
    scannedConnectApproved ||
    scannedConnectBoundarySessionToken
  ) {
    throw new Error("IrohaConnect relay sent a duplicate Open frame.");
  }
  scannedConnectOpenApprovalInFlight = true;
  if (appPublicKeyHex !== parsed.appPublicKeyHex) {
    throw new Error(
      "The IrohaConnect Open frame app key does not match the scanned session.",
    );
  }
  if (requestedNetworkId !== parsed.networkId) {
    throw new Error(
      "The IrohaConnect Open frame NetworkId does not match the scanned session.",
    );
  }
  validateIrohaConnectNetworkClaim({ networkId: requestedNetworkId }, network, {
    label: "The IrohaConnect relay request",
    requireNetworkId: true,
  });
  const accountId = scannedConnectApprovedAccountId;
  if (!accountId) {
    throw new Error("Choose an active wallet before approving IrohaConnect.");
  }
  const prepared = await prepareIrohaConnectSession({
    context: {
      toriiUrl: network.toriiUrl,
      chainId: network.chainId,
      networkPrefix: network.networkPrefix,
      networkId: network.networkId,
      accountId,
    },
    sid: parsed.sid,
    appPublicKeyHex,
    nonceBase64Url: parsed.nonceBase64Url,
    relayToken: parsed.relayToken,
    requestedNetworkId,
    permissions,
  });
  requireCurrentScannedConnection(socket);
  const approved = await approveIrohaConnectSession(prepared);
  requireCurrentScannedConnection(socket);
  scannedConnectBoundarySessionToken = approved.sessionToken;
  socket.send(base64ToBytes(approved.frameBase64));
  scannedConnectApproved = true;
  connectApprovalStatus.value = accountId;
  connectScanner.message.value = t("IrohaConnect approved.");
};

const queueConnectSigningRequest = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  request: Extract<
    ReturnType<typeof processIrohaConnectFrame>,
    { kind: "request" }
  >,
) => {
  requireCurrentScannedConnection(socket);
  if (pendingConnectRequest.value) {
    throw new Error(
      "IrohaConnect returned a second pending request from the preload boundary.",
    );
  }
  pendingConnectRequest.value = {
    socket,
    parsed,
    requestToken: request.requestToken,
    requestType: request.requestType,
    domainTag: request.domainTag,
    byteLength: request.byteLength,
    preview: request.payloadPreviewHex,
    label:
      request.requestType === "sign_request_raw"
        ? t("Raw message signature")
        : t("Transaction signature"),
    reviewRows: request.review
      ? connectTransactionReviewRows(request.review)
      : [],
  };
  connectRequestError.value = "";
};

const handleProcessedConnectFrame = (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  processed: ReturnType<typeof processIrohaConnectFrame>,
) => {
  requireCurrentScannedConnection(socket);
  if (processed.kind === "response") {
    socket.send(base64ToBytes(processed.frameBase64));
    if (processed.error) {
      connectApprovalStatus.value = processed.error;
    }
    return;
  }
  if (processed.kind === "request") {
    queueConnectSigningRequest(socket, parsed, processed);
    return;
  }
  if (processed.kind === "closed") {
    closeSpecificConnectSocket(socket, processed.reason);
  }
};

const handleScannedConnectMessage = async (
  socket: WebSocket,
  parsed: ParsedIrohaConnectUri,
  event: MessageEvent,
) => {
  try {
    requireCurrentScannedConnection(socket);
    const bytes = await readIrohaConnectRelayFrame(event.data);
    requireCurrentScannedConnection(socket);
    const frame = decodeConnectFrame(bytes);
    if (frame.sid !== parsed.sid || frame.direction !== "app_to_wallet") {
      throw new Error(
        "IrohaConnect relay sent a frame with invalid session or direction.",
      );
    }
    if (frame.control?.type === "server_event") {
      if (frame.seq !== scannedConnectExpectedServerSequence) {
        throw new Error(
          `IrohaConnect relay sent server event sequence ${frame.seq}; expected ${scannedConnectExpectedServerSequence}.`,
        );
      }
      scannedConnectExpectedServerSequence += 1;
      return;
    }
    if (scannedConnectApproved) {
      if (!scannedConnectBoundarySessionToken) {
        throw new Error("IrohaConnect preload session is unavailable.");
      }
      handleProcessedConnectFrame(
        socket,
        parsed,
        processIrohaConnectFrame({
          sessionToken: scannedConnectBoundarySessionToken,
          frameBase64: bytesToBase64(bytes),
        }),
      );
      return;
    }
    if (frame.seq !== scannedConnectExpectedAppSequence) {
      throw new Error(
        `IrohaConnect app sent sequence ${frame.seq}; expected ${scannedConnectExpectedAppSequence}.`,
      );
    }
    scannedConnectExpectedAppSequence += 1;

    if (frame.kind !== "control" || frame.control?.type !== "open") {
      throw new Error("IrohaConnect first app frame must be Open sequence 1.");
    }
    await approveOpenConnectFrame(
      socket,
      parsed,
      frame.control.appPublicKeyHex,
      frame.control.constraints.networkId,
      frame.control.permissions,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    connectScanError.value = reason;
    closeSpecificConnectSocket(socket, reason);
  }
};

const approveScannedConnectSession = async (parsed: ParsedIrohaConnectUri) => {
  const approvalGeneration = connectApprovalGeneration.value + 1;
  connectApprovalGeneration.value = approvalGeneration;
  const approvalContextKey = connectContextKey.value;
  const isCurrentApproval = () =>
    approvalGeneration === connectApprovalGeneration.value &&
    approvalContextKey === connectContextKey.value;
  connectApprovalLoading.value = true;
  connectApprovalStatus.value = "";
  connectScanError.value = "";
  closeScannedConnectSocket();
  let approvalSocket: WebSocket | null = null;

  try {
    if (!parsed.token) {
      throw new Error("IrohaConnect wallet token is missing.");
    }
    if (!parsed.relayToken) {
      throw new Error("IrohaConnect relay token is missing.");
    }
    const activeAccount = session.activeAccount;
    if (!activeAccount) {
      throw new Error("Choose an active wallet before approving IrohaConnect.");
    }
    const inspection = await inspectEndpoint({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      networkPrefix: session.connection.networkPrefix,
    });
    if (!isCurrentApproval()) {
      return;
    }
    const network = validateIrohaConnectNetworkClaim(
      parsed,
      {
        ...session.connection,
        networkId: assertIrohaConnectEndpointCanPair(inspection),
      },
      {
        requireNetworkId: true,
        requireNode: true,
      },
    );
    const accountId =
      getPublicAccountId(activeAccount, network.networkPrefix) || "";
    if (!accountId) {
      throw new Error("Choose an active wallet before approving IrohaConnect.");
    }
    const validatedSession: ParsedIrohaConnectUri = {
      ...parsed,
      node: network.toriiUrl,
    };
    setIrohaConnectContext({
      toriiUrl: network.toriiUrl,
      chainId: network.chainId,
      networkPrefix: network.networkPrefix,
      networkId: network.networkId,
      accountId,
    });
    scannedConnectBoundaryInitialized = true;

    const socket = new WebSocket(
      buildIrohaConnectWebSocketUrl(validatedSession),
      [buildIrohaConnectTokenProtocol(parsed.token)],
    );
    approvalSocket = socket;
    socket.binaryType = "arraybuffer";
    scannedConnectSocket = socket;
    scannedConnectNetworkContext = network;
    scannedConnectContextKey = approvalContextKey;
    scannedConnectApprovedAccountId = accountId;
    socket.addEventListener("message", (event) => {
      void handleScannedConnectMessage(socket, validatedSession, event);
    });
    socket.addEventListener("error", () => {
      handleScannedSocketTermination(
        socket,
        "IrohaConnect relay connection failed.",
      );
    });
    socket.addEventListener("close", () => {
      handleScannedSocketTermination(
        socket,
        "IrohaConnect relay connection closed.",
      );
    });
    await waitForConnectSocketOpen(socket);
    if (
      !isCurrentApproval() ||
      socket !== scannedConnectSocket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      closeSpecificConnectSocket(socket, "wallet context changed");
      return;
    }
    connectApprovalStatus.value = t("Waiting for wallet request...");
    connectScanner.message.value = t("Waiting for wallet request...");
  } catch (error) {
    if (approvalSocket) {
      closeSpecificConnectSocket(approvalSocket);
    }
    if (!isCurrentApproval()) {
      return;
    }
    connectApprovalStatus.value = "";
    connectScanError.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    if (isCurrentApproval()) {
      connectApprovalLoading.value = false;
    }
  }
};

const approvePendingConnection = async () => {
  const parsed = pendingConnectSession.value;
  if (!parsed) {
    return;
  }
  await approveScannedConnectSession(parsed);
  if (!connectScanError.value) {
    pendingConnectSession.value = null;
  }
};

const rejectPendingConnection = () => {
  pendingConnectSession.value = null;
  connectApprovalStatus.value = t("Rejected");
  connectScanner.message.value = t("IrohaConnect connection rejected.");
};

const approvePendingConnectRequest = async () => {
  const pending = pendingConnectRequest.value;
  if (!pending || connectRequestLoading.value) {
    return;
  }
  connectRequestLoading.value = true;
  connectRequestError.value = "";
  try {
    requireCurrentScannedConnection(pending.socket);
    const sessionToken = scannedConnectBoundarySessionToken;
    if (!sessionToken) {
      throw new Error("IrohaConnect preload session is unavailable.");
    }
    const result = await approveIrohaConnectRequest({
      sessionToken,
      requestToken: pending.requestToken,
    });
    requireCurrentScannedConnection(pending.socket);
    if (sessionToken !== scannedConnectBoundarySessionToken) {
      throw new Error("IrohaConnect preload session changed while approving.");
    }
    pending.socket.send(base64ToBytes(result.frameBase64));
    pendingConnectRequest.value = null;
    connectApprovalStatus.value = result.signed
      ? scannedConnectApprovedAccountId
      : t("Rejected");
  } catch (error) {
    if (
      pending.socket === scannedConnectSocket &&
      pendingConnectRequest.value === pending
    ) {
      connectRequestError.value =
        error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (pending.socket === scannedConnectSocket) {
      connectRequestLoading.value = false;
    }
  }
};

const rejectPendingConnectRequest = () => {
  const pending = pendingConnectRequest.value;
  if (!pending || connectRequestLoading.value) {
    return;
  }
  try {
    requireCurrentScannedConnection(pending.socket);
    if (!scannedConnectBoundarySessionToken) {
      throw new Error("IrohaConnect preload session is unavailable.");
    }
    const result = rejectIrohaConnectRequest({
      sessionToken: scannedConnectBoundarySessionToken,
      requestToken: pending.requestToken,
    });
    pending.socket.send(base64ToBytes(result.frameBase64));
    pendingConnectRequest.value = null;
    connectRequestError.value = "";
    connectApprovalStatus.value = t("Rejected");
  } catch (error) {
    connectRequestError.value =
      error instanceof Error ? error.message : String(error);
  }
};

const connectScanner = useQrScanner(
  (payload) => {
    connectScanError.value = "";
    scannedConnectCopied.value = false;
    connectApprovalStatus.value = "";
    try {
      const parsed = parseIrohaConnectUri(payload);
      if (parsed.role !== "wallet") {
        throw new Error("Scan the wallet-role IrohaConnect QR from the app.");
      }
      connectApprovalGeneration.value += 1;
      closeScannedConnectSocket("new pairing scanned");
      scannedConnectSession.value = parsed;
      connectScanner.stop();
      pendingConnectSession.value = parsed;
      connectScanner.message.value = t(
        "Review connection details before approving.",
      );
    } catch (error) {
      scannedConnectSession.value = null;
      pendingConnectSession.value = null;
      connectScanError.value =
        error instanceof Error ? error.message : String(error);
    }
  },
  { translate: t },
);

const toggleConnectScanner = async () => {
  connectScanError.value = "";
  scannedConnectCopied.value = false;
  if (connectScanner.scanning.value) {
    connectScanner.stop();
    return;
  }
  await nextTick();
  connectScanner.message.value = "";
  connectScanner.start();
};

const copyScannedConnectUri = async () => {
  if (!scannedConnectSession.value) {
    return;
  }
  try {
    await copyTextToClipboard(scannedConnectSession.value.canonicalUri);
    scannedConnectCopied.value = true;
    connectScanError.value = "";
  } catch (_error) {
    scannedConnectCopied.value = false;
    connectScanError.value = t(
      "Clipboard access failed. Copy the phrase manually.",
    );
  }
};

const resetConnect = () => {
  connectApprovalGeneration.value += 1;
  scannedConnectSession.value = null;
  pendingConnectSession.value = null;
  connectScanError.value = "";
  scannedConnectCopied.value = false;
  connectApprovalLoading.value = false;
  connectApprovalStatus.value = "";
  closeScannedConnectSocket();
  connectScanner.stop();
  connectScanner.message.value = "";
};

watch(connectContextKey, resetConnect, { flush: "sync" });
watch(
  connectPairingAvailable,
  (available) => {
    if (!available) {
      resetConnect();
    }
  },
  { flush: "sync" },
);

onBeforeUnmount(() => {
  closeScannedConnectSocket();
});
</script>

<style scoped>
.account-workspace-choice {
  grid-column: 1 / -1;
}

.account-wizard-intro,
.wizard-stage.card,
.account-primary.card,
.account-saved {
  border-color: var(--frost-border);
  background: var(--frost-panel-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.account-wizard-rail {
  border-color: var(--frost-border);
  background: var(--frost-panel);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.account-grid {
  grid-template-columns: minmax(440px, 1.15fr) minmax(300px, 0.85fr);
  grid-template-areas:
    "primary saved"
    "pairing saved";
  align-items: start;
  gap: 24px 32px;
}

.account-primary {
  grid-area: primary;
}

.account-saved {
  grid-area: saved;
  padding: var(--space-5);
  border: 1px solid var(--frost-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-raised);
}

.account-connect {
  grid-area: pairing;
}

.account-section {
  min-width: 0;
  padding: 4px 0;
}

.account-flow-choice {
  margin-top: 18px;
}

.account-connect-content {
  display: grid;
  gap: 16px;
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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-inset);
}

.mnemonic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
  font-family: var(--mono-font);
  margin-bottom: 12px;
}

.mnemonic-grid span {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-control);
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
  color: var(--color-danger);
}

.success {
  color: var(--color-success);
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
  border-radius: var(--radius-control);
  background: var(--color-qr-surface);
  padding: 12px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-control);
}

.connect-reader {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-inset);
}

.connect-reader-actions {
  margin: 0;
}

.connect-scanner {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-media-stage);
}

.connect-scanner video {
  display: block;
  width: 100%;
  min-height: 220px;
  object-fit: cover;
  background: var(--color-media-stage);
}

.connect-scanned {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid
    color-mix(in srgb, var(--color-accent) 34%, var(--color-border));
  border-radius: var(--radius-control);
  background: var(--color-accent-soft);
}

.connect-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.connect-modal-grid .kv {
  min-width: 0;
}

.connect-modal-grid .kv.connect-review-row {
  grid-column: 1 / -1;
}

.connect-modal-grid .kv.connect-review-row .kv-value {
  white-space: pre-line;
}

.connect-modal-grid .kv:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.monospace {
  font-family: var(--mono-font);
  word-break: break-all;
}

.account-roster {
  display: grid;
  gap: 0;
  padding-inline: var(--space-4);
  border-block: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
  overflow: hidden;
}

.account-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
}

.account-row:last-child {
  border-bottom: 0;
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
    grid-template-areas:
      "saved"
      "primary"
      "pairing";
  }

  .keygen-form {
    grid-template-columns: 1fr;
  }

  .keygen-form label:last-child {
    grid-column: auto;
  }
}

@media (max-width: 760px) {
  .account-row {
    grid-template-columns: 1fr;
  }

  .account-actions {
    justify-content: flex-start;
  }

  .connect-modal-grid {
    grid-template-columns: 1fr;
  }

  .account-flow-choice {
    width: 100%;
  }
}
</style>
