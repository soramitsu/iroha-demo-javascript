<template>
  <div class="offline-shell">
    <section class="offline-overview" :aria-label="t('Offline wallet')">
      <div class="offline-balance">
        <span>{{ t("Offline balance") }}</span>
        <strong>{{ offline.wallet.balance }}</strong>
        <small>{{ activeOfflineAssetLabel }}</small>
      </div>
      <dl class="offline-readiness">
        <div>
          <dt>{{ t("Status") }}</dt>
          <dd>
            <StatusBadge :tone="hardwareStatus.ok ? 'success' : 'warning'" dot>
              {{ hardwareStatus.label }}
            </StatusBadge>
          </dd>
        </div>
        <div>
          <dt>{{ t("Last sync") }}</dt>
          <dd>{{ formatDate(offline.wallet.syncedAtMs) || t("Never") }}</dd>
        </div>
        <div>
          <dt>{{ t("Offline history") }}</dt>
          <dd>{{ t("{count} entries", { count: reversedHistory.length }) }}</dd>
        </div>
      </dl>
    </section>
    <p
      v-if="offlineBalanceReconciliationRequired"
      class="offline-message"
      role="alert"
    >
      {{
        t(
          "This offline balance is locked because an online move finalized but local reconciliation failed.",
        )
      }}
    </p>

    <SegmentedControl
      class="offline-mode-control"
      data-testid="offline-mode-control"
      :model-value="activeMode"
      :label="t('Offline')"
      :options="offlineModeOptions"
      @update:model-value="setActiveMode"
    />

    <div class="offline-workspace">
      <section
        v-show="activeMode === 'setup'"
        class="card offline-task"
        data-testid="offline-mode-setup"
        aria-labelledby="offline-setup-heading"
      >
        <header class="offline-task-header">
          <div>
            <p class="section-label">{{ t("Ready") }}</p>
            <h2 id="offline-setup-heading">{{ t("Offline wallet") }}</h2>
            <p class="helper">{{ hardwareStatus.detail }}</p>
          </div>
          <StatusBadge
            :tone="offline.hasHardwareWallet ? 'success' : 'neutral'"
          >
            {{
              offline.hasHardwareWallet
                ? t("Registered")
                : t("Fallback to software keys")
            }}
          </StatusBadge>
        </header>

        <div class="offline-setup-summary">
          <div>
            <span class="meta-label">{{ t("Wallet status") }}</span>
            <strong>
              {{
                offline.hasHardwareWallet
                  ? t("Yes · {date}", {
                      date: formatDate(offline.hardware.registeredAtMs),
                    })
                  : t("Not registered")
              }}
            </strong>
          </div>
          <div>
            <span class="meta-label">{{ t("Offline limits") }}</span>
            <strong>{{
              t("{count} entries", { count: allowances.length })
            }}</strong>
          </div>
        </div>

        <div class="actions offline-task-actions">
          <AppButton
            v-if="shouldOfferHardwareRegistration"
            data-testid="offline-primary-action"
            :loading="hardwareBusy"
            :disabled="hardwareBusy"
            @click="registerHardware"
          >
            {{ t("Register secure offline wallet") }}
          </AppButton>
          <AppButton
            v-else
            data-testid="offline-primary-action"
            :loading="readinessLoading"
            disabled
          >
            {{ t("Allowance sync unavailable") }}
          </AppButton>
          <AppButton
            variant="ghost"
            :disabled="hardwareBusy"
            @click="checkHardware"
          >
            {{ t("Recheck") }}
          </AppButton>
        </div>
        <p
          v-if="hardwareMessage || syncMessage || readinessMessage"
          class="offline-message"
          role="status"
        >
          {{ hardwareMessage || syncMessage || readinessMessage }}
        </p>
      </section>

      <section
        v-show="activeMode === 'request'"
        class="card offline-task offline-request-card"
        data-testid="offline-mode-request"
        aria-labelledby="offline-request-heading"
      >
        <header class="offline-task-header">
          <div>
            <p class="section-label">{{ t("Receive") }}</p>
            <h2 id="offline-request-heading">
              {{ t("Request offline payment") }}
            </h2>
            <p class="helper">{{ t("Generate invoice") }}</p>
          </div>
        </header>
        <div class="form-grid offline-form-grid">
          <label>
            {{ t("Amount") }}
            <input v-model="invoiceForm.amount" type="text" />
          </label>
          <label>
            {{ t("Memo (optional)") }}
            <input v-model="invoiceForm.memo" />
          </label>
          <label>
            {{ t("Validity (minutes)") }}
            <input
              v-model.number="invoiceForm.validityMinutes"
              type="number"
              min="1"
              max="1440"
            />
          </label>
        </div>
        <div class="actions offline-task-actions">
          <AppButton
            class="icon-cta"
            data-testid="offline-primary-action"
            :disabled="!canGenerateInvoice"
            @click="generateInvoice"
          >
            {{ t("Generate invoice") }}
          </AppButton>
        </div>
        <div v-if="invoicePayload" class="offline-result">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-if="invoiceQr" class="qr" v-html="invoiceQr"></div>
          <div class="offline-result-copy">
            <StatusBadge tone="success" dot>{{ t("Ready") }}</StatusBadge>
            <AppButton variant="secondary" @click="copyInvoicePayload">
              {{ t("Copy invoice JSON") }}
            </AppButton>
          </div>
          <TechnicalDisclosure :summary="t('Invoice details')">
            <pre class="qr-payload">{{ invoicePayloadPreview }}</pre>
          </TechnicalDisclosure>
        </div>
        <p v-if="invoiceMessage" class="offline-message" role="status">
          {{ invoiceMessage }}
        </p>
      </section>

      <section
        v-show="activeMode === 'pay'"
        class="card offline-task offline-send-card"
        data-testid="offline-mode-pay"
        aria-labelledby="offline-pay-heading"
      >
        <header class="offline-task-header">
          <div>
            <p class="section-label">{{ t("Send") }}</p>
            <h2 id="offline-pay-heading">{{ t("Create payment") }}</h2>
            <p class="helper">{{ t("Invoice payload") }}</p>
          </div>
          <div class="offline-scan-actions">
            <AppButton variant="secondary" @click="openScannerSheet('invoice')">
              {{ t("Scan invoice") }}
            </AppButton>
            <AppButton variant="ghost" @click="invoiceScanner.openFilePicker">
              {{ t("Upload invoice QR") }}
            </AppButton>
          </div>
        </header>
        <div class="form-grid offline-form-grid">
          <label class="offline-wide-field">
            {{ t("Invoice payload") }}
            <textarea v-model="invoiceInput" rows="4"></textarea>
          </label>
          <label>
            {{ t("Memo (optional)") }}
            <input v-model="paymentMemo" />
          </label>
        </div>
        <div class="actions offline-task-actions">
          <AppButton
            data-testid="offline-primary-action"
            :loading="sendingPayment"
            :disabled="
              !invoiceInput || sendingPayment || offlineBalanceMutationLocked
            "
            @click="createPayment"
          >
            {{ t("Create payment") }}
          </AppButton>
        </div>
        <p
          v-if="paymentMessage || invoiceScanner.message"
          class="offline-message"
          role="status"
        >
          {{ paymentMessage || invoiceScanner.message }}
        </p>
        <div v-if="paymentPayload" class="offline-result">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-if="paymentQr" class="qr" v-html="paymentQr"></div>
          <div class="offline-result-copy">
            <StatusBadge tone="success" dot>{{ t("Ready") }}</StatusBadge>
            <AppButton variant="secondary" @click="copyPaymentPayload">
              {{ t("Copy payment JSON") }}
            </AppButton>
          </div>
          <TechnicalDisclosure :summary="t('Payment details')">
            <pre class="qr-payload">{{ paymentPayloadPreview }}</pre>
          </TechnicalDisclosure>
        </div>
      </section>

      <section
        v-show="activeMode === 'accept'"
        class="card offline-task offline-accept-card"
        data-testid="offline-mode-accept"
        aria-labelledby="offline-accept-heading"
      >
        <header class="offline-task-header">
          <div>
            <p class="section-label">{{ t("Receive") }}</p>
            <h2 id="offline-accept-heading">
              {{ t("Accept offline payment") }}
            </h2>
            <p class="helper">{{ t("Payment payload") }}</p>
          </div>
          <div class="offline-scan-actions">
            <AppButton variant="secondary" @click="openScannerSheet('payment')">
              {{ t("Scan payment") }}
            </AppButton>
            <AppButton variant="ghost" @click="paymentScanner.openFilePicker">
              {{ t("Upload payment QR") }}
            </AppButton>
          </div>
        </header>
        <label class="offline-payload-field">
          {{ t("Payment payload") }}
          <textarea v-model="paymentInput" rows="4"></textarea>
        </label>
        <div class="actions offline-task-actions">
          <AppButton
            data-testid="offline-primary-action"
            :loading="acceptingPayment"
            :disabled="
              !paymentInput || acceptingPayment || offlineBalanceMutationLocked
            "
            @click="acceptPayment"
          >
            {{ t("Accept payment") }}
          </AppButton>
        </div>
        <p
          v-if="acceptMessage || paymentScanner.message"
          class="offline-message"
          role="status"
        >
          {{ acceptMessage || paymentScanner.message }}
        </p>
      </section>

      <section
        v-show="activeMode === 'online'"
        class="card offline-task offline-move-card"
        data-testid="offline-mode-online"
        aria-labelledby="offline-online-heading"
      >
        <header class="offline-task-header">
          <div>
            <p class="section-label">{{ t("Offline") }}</p>
            <h2 id="offline-online-heading">
              {{ t("Move funds to online wallet") }}
            </h2>
          </div>
          <StatusBadge>{{
            t("{balance} units", { balance: offline.wallet.balance })
          }}</StatusBadge>
        </header>
        <div class="form-grid offline-form-grid">
          <label>
            {{ t("Amount (blank = all)") }}
            <input v-model="onlineForm.amount" type="text" />
          </label>
          <label>
            {{ t("Destination Account") }}
            <input
              :value="activeAccountDisplayId"
              data-testid="offline-online-destination-input"
              disabled
            />
          </label>
        </div>
        <p class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{
            formatTransactionFee(
              transactionFeeHintForEndpoint(session.connection.toriiUrl),
              t,
            )
          }}</strong>
        </p>
        <div class="actions offline-task-actions">
          <AppButton
            data-testid="offline-primary-action"
            :loading="movingOnline"
            :disabled="movingOnline || !canSubmitOnlineMove"
            @click="moveToOnline"
          >
            {{ t("Unshield to wallet") }}
          </AppButton>
        </div>
        <p
          v-if="!confidentialTransfersSupported"
          class="offline-message"
          data-testid="offline-write-prerequisite"
          role="status"
        >
          {{ confidentialTransferPrerequisite }}
        </p>
        <p v-if="onlineShieldCapabilityMessage" class="offline-message">
          {{ onlineShieldCapabilityMessage }}
        </p>
        <p
          v-if="offlineReadiness && !offlineReadiness.ready"
          class="offline-message"
          role="status"
        >
          {{ offlineReadinessSummary }}
        </p>
        <p
          v-else-if="onlineShieldSupported && onlineShieldPolicyMode"
          class="offline-message"
        >
          {{
            t("Unshield policy mode: {mode}.", { mode: onlineShieldPolicyMode })
          }}
        </p>
        <p v-if="onlineShieldSupported" class="offline-message">
          {{
            t(
              "Offline moves are self-only unshield operations and never publish a memo.",
            )
          }}
        </p>
        <p v-if="moveMessage" class="offline-message" role="status">
          {{ moveMessage }}
        </p>
      </section>
    </div>

    <div class="offline-disclosures">
      <TechnicalDisclosure :summary="t('Diagnostics')">
        <dl class="offline-diagnostics">
          <div>
            <dt>{{ t("Status") }}</dt>
            <dd>{{ hardwareStatus.detail }}</dd>
          </div>
          <div>
            <dt>{{ t("I105 Account ID") }}</dt>
            <dd class="mono">{{ activeAccountDisplayId || t("—") }}</dd>
          </div>
          <div>
            <dt>{{ t("Asset") }}</dt>
            <dd class="mono">{{ activeOfflineAssetLabel }}</dd>
          </div>
          <div>
            <dt>{{ t("Next policy expiry") }}</dt>
            <dd>
              {{ formatDate(offline.wallet.nextPolicyExpiryMs) || t("—") }}
            </dd>
          </div>
          <div>
            <dt>{{ t("Policy refresh") }}</dt>
            <dd>{{ formatDate(offline.wallet.nextRefreshMs) || t("—") }}</dd>
          </div>
          <div>
            <dt>{{ t("Network readiness") }}</dt>
            <dd>{{ offlineReadinessSummary }}</dd>
          </div>
        </dl>
        <ul
          v-if="offlineReadiness?.blockers.length"
          class="helper offline-readiness-blockers"
        >
          <li v-for="blocker in offlineReadiness.blockers" :key="blocker.code">
            {{ blocker.message }}
          </li>
        </ul>
        <p class="section-label offline-limits-label">
          {{ t("Offline limits") }}
        </p>
        <ResponsiveTable v-if="allowances.length" :label="t('Offline limits')">
          <thead>
            <tr>
              <th>{{ t("Asset") }}</th>
              <th>{{ t("Remaining") }}</th>
              <th>{{ t("Policy expires") }}</th>
              <th>{{ t("Refresh at") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in allowances" :key="item.certificate_id_hex">
              <td>{{ formatAssetReferenceLabel(item.asset_id, t("—")) }}</td>
              <td>{{ item.remaining_amount }}</td>
              <td>{{ formatDate(item.policy_expires_at_ms) || t("—") }}</td>
              <td>{{ formatDate(item.refresh_at_ms) || t("—") }}</td>
            </tr>
          </tbody>
        </ResponsiveTable>
        <p v-else class="helper">{{ t("No allowances synced yet.") }}</p>
      </TechnicalDisclosure>

      <TechnicalDisclosure :summary="t('Offline history')">
        <ResponsiveTable
          v-if="offline.wallet.history.length"
          :label="t('Offline history')"
        >
          <thead>
            <tr>
              <th>{{ t("Direction") }}</th>
              <th>{{ t("Amount") }}</th>
              <th>{{ t("Peer") }}</th>
              <th>{{ t("Counter") }}</th>
              <th>{{ t("Time") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in reversedHistory" :key="record.txId">
              <td>
                <StatusBadge
                  :tone="
                    record.direction === 'incoming' ? 'success' : 'neutral'
                  "
                >
                  {{ record.direction }}
                </StatusBadge>
              </td>
              <td>{{ record.amount }}</td>
              <td>{{ record.peer }}</td>
              <td>{{ record.counterLabel }}</td>
              <td>{{ formatDate(record.timestampMs) || t("—") }}</td>
            </tr>
          </tbody>
        </ResponsiveTable>
        <p v-else class="helper">{{ t("No offline transfers yet.") }}</p>
      </TechnicalDisclosure>
    </div>

    <QrScannerSheet
      :open="Boolean(activeScanner)"
      :title="scannerSheetTitle"
      :description="t('or upload a QR image')"
      :close-label="t('Cancel')"
      @close="closeScannerSheet"
    >
      <div class="offline-scanner-frame">
        <video
          v-if="activeScanner === 'invoice'"
          ref="invoiceScanner.videoRef"
          autoplay
          muted
          playsinline
        ></video>
        <video
          v-else-if="activeScanner === 'payment'"
          ref="paymentScanner.videoRef"
          autoplay
          muted
          playsinline
        ></video>
      </div>
      <p v-if="activeScannerMessage" class="offline-message" role="status">
        {{ activeScannerMessage }}
      </p>
      <template #actions>
        <AppButton variant="secondary" @click="openActiveScannerFilePicker">
          {{ t("Upload QR image") }}
        </AppButton>
      </template>
    </QrScannerSheet>

    <input
      ref="invoiceScanner.fileInputRef"
      type="file"
      accept="image/*"
      class="sr-only"
      :aria-label="t('Upload QR image')"
      @change="invoiceScanner.decodeFile"
    />
    <input
      ref="paymentScanner.fileInputRef"
      type="file"
      accept="image/*"
      class="sr-only"
      :aria-label="t('Upload QR image')"
      @change="paymentScanner.decodeFile"
    />
  </div>
</template>

<script setup lang="ts">
import QRCode from "qrcode";
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  ref,
  toRef,
  watch,
} from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import {
  AppButton,
  QrScannerSheet,
  ResponsiveTable,
  SegmentedControl,
  StatusBadge,
  TechnicalDisclosure,
} from "@/components/ui";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { buildOfflineStorageKey, useOfflineStore } from "@/stores/offline";
import {
  fetchOfflineReadiness,
  type OfflineReadinessSnapshot,
} from "@/services/offline";
import {
  applyWithdrawToOnline,
  createInvoice,
  createPaymentPayload,
  encodeInvoice,
  parseInvoice,
  parsePaymentPayload,
} from "@/utils/offline";
import { transferAsset } from "@/services/iroha";
import { useQrScanner } from "@/composables/useQrScanner";
import { useShieldCapability } from "@/composables/useShieldCapability";
import { isPositiveWholeAmount } from "@/utils/confidential";
import type { OfflineAllowanceItem } from "@/types/iroha";
import { getPublicAccountId } from "@/utils/accountId";
import {
  extractAssetDefinitionId,
  formatAssetDefinitionLabel,
  formatAssetReferenceLabel,
  formatOpaqueAssetLiteralsInText,
  shouldReplaceConfiguredAssetDefinitionId,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  buildTrustedEndpointIdentityScope,
  type EndpointIdentityScope,
} from "@/utils/endpointScope";
import {
  appendTransactionFee,
  formatTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";
import { assertFinalizedSubmissionResult } from "@/utils/transactionFinality";

const session = useSessionStore();
const endpointStore = useEndpointStore();
const offline = useOfflineStore();
const activeAccount = computed(() => session.activeAccount);
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value, session.connection.networkPrefix),
);
const activeOfflineAssetId = computed(() =>
  session.connection.assetDefinitionId.trim(),
);
const activeOfflineEndpointIdentity = computed<EndpointIdentityScope | null>(
  () => {
    const inspection = endpointStore.inspection;
    if (
      endpointStore.state !== "ready" ||
      !inspection ||
      !activeAccountDisplayId.value ||
      !activeOfflineAssetId.value
    ) {
      return null;
    }
    try {
      return buildTrustedEndpointIdentityScope(inspection);
    } catch {
      return null;
    }
  },
);
const activeOfflinePersistenceScope = computed(() => {
  const endpointIdentity = activeOfflineEndpointIdentity.value;
  const accountId = activeAccountDisplayId.value.trim();
  const assetDefinitionId = activeOfflineAssetId.value;
  if (!endpointIdentity || !accountId || !assetDefinitionId) {
    return null;
  }
  return {
    endpointIdentity,
    accountId,
    assetDefinitionId,
  };
});
const activeOfflinePersistenceKey = computed(() => {
  const scope = activeOfflinePersistenceScope.value;
  return scope ? buildOfflineStorageKey(scope) : "";
});
const offlineStorePersistenceKey = computed(() => {
  const scope = offline.persistenceScope;
  return scope ? buildOfflineStorageKey(scope) : "";
});
const { localeStore, t } = useAppI18n();
type OfflineMode = "setup" | "request" | "pay" | "accept" | "online";
type OfflineScannerKind = "invoice" | "payment";

const activeMode = ref<OfflineMode>(
  Number(offline.wallet.balance) > 0 ? "request" : "setup",
);
const activeScanner = ref<OfflineScannerKind | null>(null);
const offlineModeOptions = computed(() => [
  { value: "setup", label: t("Wallet") },
  { value: "request", label: t("Request offline payment") },
  { value: "pay", label: t("Create payment") },
  { value: "accept", label: t("Accept offline payment") },
  { value: "online", label: t("Move funds to online wallet") },
]);
const activeOfflineAssetLabel = computed(() =>
  activeOfflineAssetId.value
    ? formatAssetDefinitionLabel(
        activeOfflineAssetId.value,
        activeOfflineAssetId.value,
      )
    : t("Asset not set"),
);
const canGenerateInvoice = computed(() =>
  Boolean(
    activeAccount.value &&
      session.connection.assetDefinitionId &&
      invoiceForm.amount,
  ),
);

const hardwareBusy = ref(false);
const hardwareStatus = ref({
  ok: false,
  label: t("Not checked"),
  detail: t("Pending detection"),
});
const hardwareMessage = ref("");
const shouldOfferHardwareRegistration = computed(
  () => hardwareStatus.value.ok && !offline.hasHardwareWallet,
);

const invoiceForm = reactive({
  amount: "",
  memo: "",
  validityMinutes: 10,
});
const invoicePayload = ref("");
const invoiceQr = ref("");
const invoiceMessage = ref("");
const invoiceInput = ref("");

const paymentMemo = ref("");
const paymentPayload = ref("");
const paymentQr = ref("");
const paymentMessage = ref("");
const paymentInput = ref("");
const allowances = ref<OfflineAllowanceItem[]>([]);
const offlineReadiness = ref<OfflineReadinessSnapshot | null>(null);
const offlineReadinessContext = ref("");
const readinessMessage = ref("");
const readinessLoading = ref(false);
let readinessRequestGeneration = 0;
const currentOfflineReadinessContext = computed(() =>
  JSON.stringify({
    toriiUrl: session.connection.toriiUrl,
    chainId: session.connection.chainId,
    networkPrefix: session.connection.networkPrefix,
    accountId: activeAccountDisplayId.value ?? "",
    assetDefinitionId: activeOfflineAssetId.value,
  }),
);
const currentOfflineMoveContext = computed(() =>
  JSON.stringify({
    readinessContext: currentOfflineReadinessContext.value,
    loadedReadinessContext: offlineReadinessContext.value,
    activePersistenceKey: activeOfflinePersistenceKey.value,
    storePersistenceKey: offlineStorePersistenceKey.value,
    accountRecordId: activeAccount.value?.accountId ?? "",
  }),
);
let onlineMoveGeneration = 0;
const hasCurrentOfflineReadiness = computed(
  () =>
    Boolean(offlineReadinessContext.value) &&
    offlineReadinessContext.value === currentOfflineReadinessContext.value,
);
const offlineReadinessSummary = computed(() => {
  if (readinessLoading.value) {
    return t("Checking offline network readiness…");
  }
  if (!offlineReadiness.value || !hasCurrentOfflineReadiness.value) {
    return readinessMessage.value || t("Offline network readiness is unknown.");
  }
  if (!offlineReadiness.value.ready) {
    return t(
      "Offline network operations are unavailable ({count} blocker(s)).",
      {
        count: offlineReadiness.value.blockers.length,
      },
    );
  }
  if (!offlineReadiness.value.allowanceSupported) {
    return t(
      "Offline proofs are ready, but this release does not expose allowance enumeration.",
    );
  }
  return t("Offline network operations are ready.");
});

const acceptMessage = ref("");
const moveMessage = ref("");
const syncMessage = ref("");

const sendingPayment = ref(false);
const acceptingPayment = ref(false);
const movingOnline = ref(false);
const offlineBalanceMutationLocked = computed(
  () =>
    movingOnline.value ||
    offline.isPersistenceScopeLocked(activeOfflinePersistenceScope.value),
);
const offlineBalanceReconciliationRequired = computed(() =>
  offline.isPersistenceScopeQuarantined(activeOfflinePersistenceScope.value),
);

const onlineForm = reactive({
  amount: "",
  shielded: true,
});
const persistResolvedOnlineShieldAssetDefinitionId = (
  resolvedAssetDefinitionId: string,
) => {
  const normalizedResolvedAssetDefinitionId = extractAssetDefinitionId(
    resolvedAssetDefinitionId,
  ).trim();
  if (
    !normalizedResolvedAssetDefinitionId ||
    !shouldReplaceConfiguredAssetDefinitionId({
      configuredAssetDefinitionId: session.connection.assetDefinitionId,
      detectedAssetDefinitionId: normalizedResolvedAssetDefinitionId,
      knownAssetIds: [resolvedAssetDefinitionId],
    })
  ) {
    return;
  }
  session.$patch({
    connection: {
      ...session.connection,
      assetDefinitionId: normalizedResolvedAssetDefinitionId,
    },
  });
};
const {
  shieldSupported: onlineShieldSupported,
  shieldCapabilityMessage: onlineShieldCapabilityMessage,
  shieldPolicyMode: onlineShieldPolicyMode,
  shieldResolvedAssetId: onlineShieldResolvedAssetId,
} = useShieldCapability({
  toriiUrl: toRef(session.connection, "toriiUrl"),
  accountId: activeAccountDisplayId,
  assetDefinitionId: toRef(session.connection, "assetDefinitionId"),
  shielded: toRef(onlineForm, "shielded"),
  operation: "unshield",
  translate: t,
  onResolvedAssetDefinitionId: persistResolvedOnlineShieldAssetDefinitionId,
});

const invoiceScanner = useQrScanner(
  (payload) => {
    invoiceInput.value = payload;
    paymentMessage.value = t("Invoice scanned.");
    activeScanner.value = null;
  },
  { translate: t },
);
const paymentScanner = useQrScanner(
  (payload) => {
    paymentInput.value = payload;
    acceptMessage.value = t("Payment scanned.");
    activeScanner.value = null;
  },
  { translate: t },
);

const activeScannerMessage = computed(() =>
  activeScanner.value === "invoice"
    ? invoiceScanner.message.value
    : activeScanner.value === "payment"
      ? paymentScanner.message.value
      : "",
);
const scannerSheetTitle = computed(() =>
  activeScanner.value === "payment" ? t("Scan payment") : t("Scan invoice"),
);
const closeScannerSheet = () => {
  if (activeScanner.value === "invoice") {
    invoiceScanner.stop();
  } else if (activeScanner.value === "payment") {
    paymentScanner.stop();
  }
  activeScanner.value = null;
};
const openScannerSheet = async (kind: OfflineScannerKind) => {
  closeScannerSheet();
  activeScanner.value = kind;
  if (kind === "invoice") {
    paymentMessage.value = "";
    invoiceScanner.message.value = "";
  } else {
    acceptMessage.value = "";
    paymentScanner.message.value = "";
  }
  await nextTick();
  if (activeScanner.value === "invoice") {
    await invoiceScanner.start();
  } else if (activeScanner.value === "payment") {
    await paymentScanner.start();
  }
};
const openActiveScannerFilePicker = () => {
  if (activeScanner.value === "invoice") {
    invoiceScanner.openFilePicker();
  } else if (activeScanner.value === "payment") {
    paymentScanner.openFilePicker();
  }
};
const setActiveMode = (value: string) => {
  if (
    value !== "setup" &&
    value !== "request" &&
    value !== "pay" &&
    value !== "accept" &&
    value !== "online"
  ) {
    return;
  }
  closeScannerSheet();
  activeMode.value = value;
};

const reversedHistory = computed(() => [...offline.wallet.history].reverse());
const formatPayloadPreview = (payload: string) => {
  const literal = payload.trim();
  if (!literal) {
    return "";
  }
  try {
    const parsed = JSON.parse(literal) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const next = { ...parsed };
      if (typeof next.asset === "string") {
        next.asset = formatAssetReferenceLabel(next.asset, next.asset);
      }
      if (typeof next.assetDefinitionId === "string") {
        next.assetDefinitionId = formatAssetDefinitionLabel(
          next.assetDefinitionId,
          next.assetDefinitionId,
        );
      }
      return JSON.stringify(next, null, 2);
    }
  } catch {
    // Fall through to string replacement for already-serialized payloads.
  }
  return formatOpaqueAssetLiteralsInText(literal);
};
const invoicePayloadPreview = computed(() =>
  formatPayloadPreview(invoicePayload.value),
);
const paymentPayloadPreview = computed(() =>
  formatPayloadPreview(paymentPayload.value),
);
const normalizedMoveAmount = computed(
  () => onlineForm.amount.trim() || offline.wallet.balance,
);
const normalizedMoveReceiver = computed(
  () => activeAccountDisplayId.value || "",
);
const resolvedOnlineShieldAssetDefinitionId = computed(
  () =>
    extractAssetDefinitionId(onlineShieldResolvedAssetId.value).trim() ||
    extractAssetDefinitionId(session.connection.assetDefinitionId).trim() ||
    session.connection.assetDefinitionId.trim(),
);
const isOnlineShieldAmountValid = computed(() =>
  isPositiveWholeAmount(normalizedMoveAmount.value),
);
const isOnlineReceiverValid = computed(() =>
  Boolean(
    activeAccount.value &&
      normalizedMoveReceiver.value === activeAccountDisplayId.value,
  ),
);
const confidentialTransfersSupported = computed(
  () =>
    endpointStore.writeAllowed &&
    endpointStore.inspection?.features.confidentialTransfers.supported === true,
);
const confidentialTransferPrerequisite = computed(() => {
  if (endpointStore.state === "checking") {
    return t(
      "Wait for endpoint capability inspection to finish. Local offline payment workflows remain available.",
    );
  }
  if (!endpointStore.writeAllowed) {
    return (
      endpointStore.diagnostic ||
      t(
        "Network transfers are blocked until the endpoint identity is verified. Local offline payment workflows remain available.",
      )
    );
  }
  return t(
    "This endpoint does not advertise the required confidential transfer operations. Local offline payment workflows remain available.",
  );
});
const canSubmitOnlineMove = computed(() =>
  Boolean(
    !offlineBalanceMutationLocked.value &&
      confidentialTransfersSupported.value &&
      session.connection.toriiUrl &&
      session.connection.assetDefinitionId &&
      activeAccount.value &&
      activeOfflinePersistenceKey.value &&
      activeOfflinePersistenceKey.value === offlineStorePersistenceKey.value &&
      hasCurrentOfflineReadiness.value &&
      offlineReadiness.value?.ready &&
      onlineShieldSupported.value &&
      isOnlineShieldAmountValid.value &&
      isOnlineReceiverValid.value,
  ),
);

const refreshOfflineReadiness = async () => {
  const requestGeneration = ++readinessRequestGeneration;
  const toriiUrl = session.connection.toriiUrl;
  const assetDefinitionId = activeOfflineAssetId.value;
  const requestContext = currentOfflineReadinessContext.value;
  offlineReadiness.value = null;
  offlineReadinessContext.value = "";
  allowances.value = [];
  readinessMessage.value = "";
  syncMessage.value = "";
  if (!toriiUrl || !assetDefinitionId) {
    readinessLoading.value = false;
    return;
  }
  readinessLoading.value = true;
  try {
    const result = await fetchOfflineReadiness({
      toriiUrl,
      assetDefinitionId,
    });
    if (
      requestGeneration !== readinessRequestGeneration ||
      requestContext !== currentOfflineReadinessContext.value
    ) {
      return;
    }
    offlineReadiness.value = result;
    offlineReadinessContext.value = requestContext;
    allowances.value = result.allowances;
    if (!result.allowanceSupported) {
      syncMessage.value = t(
        "This Torii release does not expose offline allowance enumeration.",
      );
    }
  } catch (error) {
    if (
      requestGeneration !== readinessRequestGeneration ||
      requestContext !== currentOfflineReadinessContext.value
    ) {
      return;
    }
    offlineReadiness.value = null;
    offlineReadinessContext.value = "";
    readinessMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to load offline network readiness."),
    );
  } finally {
    if (
      requestGeneration === readinessRequestGeneration &&
      requestContext === currentOfflineReadinessContext.value
    ) {
      readinessLoading.value = false;
    }
  }
};

const formatDate = (value?: number | null) => {
  if (!value || value <= 0) return "";
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const copyPayload = async (
  payload: string,
  onSuccess: () => void,
  onFailure: () => void,
) => {
  if (!payload.trim()) {
    return;
  }
  try {
    await navigator.clipboard.writeText(payload);
    onSuccess();
  } catch {
    onFailure();
  }
};

const copyInvoicePayload = async () => {
  await copyPayload(
    invoicePayload.value,
    () => {
      invoiceMessage.value = t("Invoice JSON copied.");
    },
    () => {
      invoiceMessage.value = t(
        "Clipboard access failed. Copy the payload manually.",
      );
    },
  );
};

const copyPaymentPayload = async () => {
  await copyPayload(
    paymentPayload.value,
    () => {
      paymentMessage.value = t("Payment JSON copied.");
    },
    () => {
      paymentMessage.value = t(
        "Clipboard access failed. Copy the payload manually.",
      );
    },
  );
};

const checkHardware = async () => {
  hardwareBusy.value = true;
  hardwareMessage.value = "";
  try {
    const supported =
      (await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()) ??
      false;
    offline.setHardwareSupport(supported);
    hardwareStatus.value = supported
      ? {
          ok: true,
          label: t("Secure hardware available"),
          detail: t("Platform authenticator ready"),
        }
      : {
          ok: false,
          label: t("No platform authenticator"),
          detail: t("Fallback to software keys"),
        };
  } catch (error) {
    hardwareStatus.value = {
      ok: false,
      label: t("Unknown"),
      detail: t("Hardware check failed"),
    };
    hardwareMessage.value = toUserFacingErrorMessage(
      error,
      t("Unable to detect secure hardware."),
    );
  } finally {
    hardwareBusy.value = false;
  }
};

const registerHardware = async () => {
  hardwareMessage.value = "";
  if (!hardwareStatus.value.ok) {
    hardwareMessage.value = t(
      "Secure hardware is not available on this device.",
    );
    return;
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    hardwareMessage.value = t("WebAuthn is not supported in this environment.");
    return;
  }
  hardwareBusy.value = true;
  try {
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: t("Iroha Offline Wallet") },
        user: {
          id: random,
          name: activeAccount.value?.accountId ?? "offline-wallet",
          displayName: activeAccount.value?.displayName ?? t("Offline wallet"),
        },
        challenge: random,
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    offline.registerHardware(credential?.id ?? null);
    hardwareStatus.value = {
      ok: true,
      label: t("Registered"),
      detail: t("Hardware wallet registered"),
    };
    hardwareMessage.value = t("Offline wallet registered on this device.");
  } catch (error) {
    hardwareMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to register wallet."),
    );
  } finally {
    hardwareBusy.value = false;
  }
};

const generateInvoice = async () => {
  invoiceMessage.value = "";
  invoicePayload.value = "";
  invoiceQr.value = "";
  if (!activeAccount.value || !session.connection.assetDefinitionId) {
    invoiceMessage.value = t("Configure account and asset first.");
    return;
  }
  if (!invoiceForm.amount) {
    invoiceMessage.value = t("Enter an amount to request.");
    return;
  }
  try {
    const invoice = createInvoice({
      receiver: activeAccount.value.accountId,
      assetId: session.connection.assetDefinitionId,
      amount: invoiceForm.amount.trim(),
      validityMs: invoiceForm.validityMinutes * 60 * 1000,
      memo: invoiceForm.memo,
    });
    invoicePayload.value = encodeInvoice(invoice);
    invoiceQr.value = await QRCode.toString(invoicePayload.value, {
      type: "svg",
      width: 240,
      color: { dark: "#15161b", light: "#ffffff" },
    });
    invoiceMessage.value = t(
      "Invoice ready. Share the QR or copy the JSON payload.",
    );
  } catch (error) {
    invoiceMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to generate invoice."),
    );
  }
};

const createPayment = async () => {
  paymentMessage.value = "";
  paymentPayload.value = "";
  paymentQr.value = "";
  if (offlineBalanceMutationLocked.value) {
    paymentMessage.value = t(
      "Wait for the online move to finish before changing the offline balance.",
    );
    return;
  }
  if (!activeAccount.value || !activeOfflineAssetId.value) {
    paymentMessage.value = t("Configure an account first.");
    return;
  }
  if (!invoiceInput.value.trim()) {
    paymentMessage.value = t("Provide an invoice payload.");
    return;
  }
  sendingPayment.value = true;
  try {
    const invoice = parseInvoice(invoiceInput.value.trim());
    if (invoice.asset !== activeOfflineAssetId.value) {
      throw new Error(
        t("Invoice asset does not match the active offline asset."),
      );
    }
    if (Date.now() > invoice.expires_at_ms) {
      throw new Error(
        t("Invoice expired. Ask the receiver to generate a new invoice."),
      );
    }
    const payload = createPaymentPayload({
      invoice,
      senderAccount: activeAccount.value.accountId,
      counter: offline.wallet.nextCounter,
      channel: "qr",
      memo: paymentMemo.value,
    });
    offline.recordOutgoingPayment(payload);
    paymentPayload.value = JSON.stringify(payload);
    paymentQr.value = await QRCode.toString(paymentPayload.value, {
      type: "svg",
      width: 240,
      color: { dark: "#15161b", light: "#ffffff" },
    });
    paymentMessage.value = t("Payment payload created and recorded locally.");
  } catch (error) {
    paymentMessage.value = toUserFacingErrorMessage(
      error,
      t("Unable to create payment."),
    );
  } finally {
    sendingPayment.value = false;
  }
};

const acceptPayment = async () => {
  acceptMessage.value = "";
  if (offlineBalanceMutationLocked.value) {
    acceptMessage.value = t(
      "Wait for the online move to finish before changing the offline balance.",
    );
    return;
  }
  if (!activeAccount.value || !activeOfflineAssetId.value) {
    acceptMessage.value = t("Configure an account first.");
    return;
  }
  if (!paymentInput.value.trim()) {
    acceptMessage.value = t("Provide a payment payload.");
    return;
  }
  acceptingPayment.value = true;
  try {
    const payload = parsePaymentPayload(paymentInput.value.trim());
    if (payload.asset !== activeOfflineAssetId.value) {
      throw new Error(
        t("Payment asset does not match the active offline asset."),
      );
    }
    if (payload.to !== activeAccount.value.accountId) {
      throw new Error(t("Payment is addressed to a different account."));
    }
    offline.recordIncomingPayment(payload);
    acceptMessage.value = t("Payment recorded to offline wallet.");
  } catch (error) {
    acceptMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to record payment."),
    );
  } finally {
    acceptingPayment.value = false;
  }
};

const moveToOnline = async () => {
  moveMessage.value = "";
  if (!confidentialTransfersSupported.value) {
    moveMessage.value = confidentialTransferPrerequisite.value;
    return;
  }
  if (!session.connection.toriiUrl || !activeAccount.value) {
    moveMessage.value = t("Configure Torii and account first.");
    return;
  }
  if (!hasCurrentOfflineReadiness.value || !offlineReadiness.value?.ready) {
    moveMessage.value = offlineReadinessSummary.value;
    return;
  }
  const requestPersistenceKey = activeOfflinePersistenceKey.value;
  const requestPersistenceScope = activeOfflinePersistenceScope.value;
  if (
    !requestPersistenceScope ||
    !requestPersistenceKey ||
    requestPersistenceKey !== offlineStorePersistenceKey.value
  ) {
    moveMessage.value = t("Offline network readiness is unknown.");
    return;
  }
  if (!onlineShieldSupported.value) {
    moveMessage.value =
      onlineShieldCapabilityMessage.value || t("Private exit is unavailable.");
    return;
  }
  const amount = normalizedMoveAmount.value;
  const receiver = normalizedMoveReceiver.value;
  if (!amount || Number(amount) <= 0) {
    moveMessage.value = t(
      "Unshield amount must be a whole number greater than zero.",
    );
    return;
  }
  if (receiver !== activeAccountDisplayId.value) {
    moveMessage.value = t(
      "Private exit requires destination to be your active account.",
    );
    return;
  }
  if (!isPositiveWholeAmount(amount)) {
    moveMessage.value = t(
      "Unshield amount must be a whole number greater than zero.",
    );
    return;
  }

  const requestGeneration = ++onlineMoveGeneration;
  const requestContext = currentOfflineMoveContext.value;
  const requestWallet = JSON.parse(
    JSON.stringify(offline.wallet),
  ) as typeof offline.wallet;
  const requestHardware = JSON.parse(
    JSON.stringify(offline.hardware),
  ) as typeof offline.hardware;
  const requestToriiUrl = session.connection.toriiUrl;
  const requestChainId = session.connection.chainId;
  const requestNetworkPrefix = session.connection.networkPrefix;
  const requestAssetDefinitionId = resolvedOnlineShieldAssetDefinitionId.value;
  const requestAccountId = activeAccount.value.accountId;
  const requestPrivateKeyHex = activeAccount.value.privateKeyHex;
  const isCurrentRequest = () =>
    requestGeneration === onlineMoveGeneration &&
    requestContext === currentOfflineMoveContext.value &&
    requestPersistenceKey === activeOfflinePersistenceKey.value &&
    requestPersistenceKey === offlineStorePersistenceKey.value;

  if (!offline.lockPersistenceScope(requestPersistenceScope)) {
    moveMessage.value = offline.isPersistenceScopeQuarantined(
      requestPersistenceScope,
    )
      ? t(
          "This offline balance is locked because an online move finalized but local reconciliation failed.",
        )
      : t(
          "Wait for the online move to finish before changing the offline balance.",
        );
    return;
  }
  movingOnline.value = true;
  let remoteMoveFinalized = false;
  let localMoveCommitted = false;
  try {
    const freshReadiness = await fetchOfflineReadiness({
      toriiUrl: requestToriiUrl,
      assetDefinitionId: requestAssetDefinitionId,
    });
    if (!isCurrentRequest()) {
      return;
    }
    offlineReadiness.value = freshReadiness;
    offlineReadinessContext.value = currentOfflineReadinessContext.value;
    allowances.value = freshReadiness.allowances;
    if (!freshReadiness.ready) {
      moveMessage.value = offlineReadinessSummary.value;
      return;
    }

    const preparedWithdrawal = applyWithdrawToOnline(requestWallet, {
      accountId: requestAccountId,
      receiver,
      amount,
      memo: "",
    });
    const result = await transferAsset({
      toriiUrl: requestToriiUrl,
      chainId: requestChainId,
      networkPrefix: requestNetworkPrefix,
      assetDefinitionId: requestAssetDefinitionId,
      accountId: requestAccountId,
      destinationAccountId: receiver,
      quantity: amount,
      privateKeyHex: requestPrivateKeyHex,
      unshield: true,
    });
    assertFinalizedSubmissionResult(result);
    remoteMoveFinalized = true;
    localMoveCommitted = offline.commitWalletForScope({
      scope: requestPersistenceScope,
      expectedWallet: requestWallet,
      wallet: preparedWithdrawal.state,
      fallbackHardware: requestHardware,
    });
    if (!localMoveCommitted) {
      if (isCurrentRequest()) {
        moveMessage.value = t(
          "The online move finalized, but the offline balance is locked because local reconciliation failed.",
        );
      }
      return;
    }
    if (!isCurrentRequest()) {
      return;
    }
    session.updateActiveAccount({ localOnly: false });
    moveMessage.value = appendTransactionFee(
      t("Unshield finalized in block {height} and offline balance updated.", {
        height: result.finality.blockHeight,
      }),
      result,
      t,
      transactionFeeHintForEndpoint(requestToriiUrl),
    );
  } catch (error) {
    if (remoteMoveFinalized && !localMoveCommitted) {
      offline.quarantinePersistenceScope(requestPersistenceScope);
    }
    if (isCurrentRequest()) {
      moveMessage.value =
        remoteMoveFinalized && !localMoveCommitted
          ? t(
              "The online move finalized, but the offline balance is locked because local reconciliation failed.",
            )
          : toUserFacingErrorMessage(error, t("Failed to move funds online."));
    }
  } finally {
    if (!remoteMoveFinalized || localMoveCommitted) {
      offline.unlockPersistenceScope(requestPersistenceScope);
    }
    if (isCurrentRequest()) {
      movingOnline.value = false;
    }
  }
};

watch(currentOfflineReadinessContext, () => {
  void refreshOfflineReadiness();
});

watch(
  currentOfflineMoveContext,
  (nextContext, previousContext) => {
    if (nextContext === previousContext) return;
    onlineMoveGeneration += 1;
    movingOnline.value = false;
    moveMessage.value = "";
  },
  { flush: "sync" },
);

watch(
  () => {
    const scope = activeOfflinePersistenceScope.value;
    return scope
      ? `${scope.endpointIdentity.storageSegment}:${scope.accountId}:${scope.assetDefinitionId}`
      : "";
  },
  () => {
    offline.activatePersistenceScope(activeOfflinePersistenceScope.value);
    if (Number(offline.wallet.balance) > 0 && activeMode.value === "setup") {
      activeMode.value = "request";
    }
  },
  { immediate: true },
);

onMounted(() => {
  checkHardware();
  void refreshOfflineReadiness();
});
</script>

<style scoped>
.offline-shell {
  display: grid;
  gap: 18px;
  max-width: 1080px;
  margin-inline: auto;
}

.offline-overview {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.6fr);
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.offline-balance {
  display: grid;
  align-content: center;
  min-height: 136px;
  padding: 24px 28px;
  border-inline-end: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-accent-soft) 48%, transparent);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.offline-balance > span,
.offline-balance > small,
.offline-readiness dt {
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 650;
}

.offline-balance > strong {
  margin-block: 3px;
  font-size: clamp(2.15rem, 5vw, 3.6rem);
  line-height: 1;
  letter-spacing: -0.055em;
}

.offline-balance > small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-readiness {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  padding: 20px 22px;
}

.offline-readiness > div {
  min-width: 0;
  padding: 8px 18px;
  border-inline-start: 1px solid var(--color-border);
}

.offline-readiness > div:first-child {
  border-inline-start: 0;
}

.offline-readiness dt,
.offline-readiness dd {
  margin: 0;
}

.offline-readiness dd {
  margin-top: 8px;
  overflow-wrap: anywhere;
  font-weight: 650;
}

.offline-mode-control {
  width: min(100%, 760px);
  margin-inline: auto;
}

.offline-mode-control :deep(.ui-segmented-option) {
  min-width: 104px;
}

.offline-workspace {
  min-width: 0;
}

.offline-task {
  min-height: 380px;
  margin: 0;
  border-color: var(--color-border);
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.offline-task-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}

.offline-task-header h2,
.offline-task-header p {
  margin: 0;
}

.offline-task-header h2 {
  margin-top: 4px;
}

.offline-task-header .helper {
  margin-top: 7px;
}

.offline-setup-summary,
.offline-diagnostics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: var(--color-border);
}

.offline-setup-summary > div,
.offline-diagnostics > div {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 16px;
  background: var(--color-surface-raised);
}

.offline-setup-summary strong,
.offline-diagnostics dd {
  overflow-wrap: anywhere;
}

.offline-diagnostics {
  margin: 0;
}

.offline-diagnostics dt,
.offline-diagnostics dd {
  margin: 0;
}

.offline-diagnostics dt {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.offline-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.offline-wide-field,
.offline-payload-field {
  grid-column: 1 / -1;
}

.offline-payload-field {
  display: grid;
  gap: 7px;
}

.offline-task-actions {
  justify-content: flex-end;
  margin-top: 22px;
}

.offline-scan-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.offline-message {
  margin: 14px 0 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.offline-result {
  display: grid;
  grid-template-columns: minmax(210px, 0.62fr) minmax(0, 1.38fr);
  gap: 22px;
  align-items: center;
  margin-top: 24px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface-soft);
  box-shadow: var(--shadow-inset);
}

.offline-result-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.offline-result :deep(.ui-disclosure) {
  grid-column: 2;
}

.qr :deep(svg) {
  width: min(100%, 240px);
  height: auto;
  display: block;
  margin-inline: auto;
}

.qr-payload {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  border-radius: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-inset);
  box-shadow: var(--shadow-inset);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.offline-disclosures {
  display: grid;
  gap: 10px;
}

.offline-limits-label {
  margin: 20px 0 10px;
}

.offline-scanner-frame {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-panel);
  background: var(--color-media-stage);
}

.offline-scanner-frame video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: var(--color-media-stage);
}

.shield-option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.shield-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
}

@media (max-width: 760px) {
  .offline-overview,
  .offline-result {
    grid-template-columns: minmax(0, 1fr);
  }

  .offline-balance {
    min-height: 116px;
    border-inline-end: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .offline-readiness {
    grid-template-columns: minmax(0, 1fr);
    padding: 10px 18px;
  }

  .offline-readiness > div {
    padding: 12px 4px;
    border-inline-start: 0;
    border-top: 1px solid var(--color-border);
  }

  .offline-readiness > div:first-child {
    border-top: 0;
  }

  .offline-mode-control {
    width: 100%;
    grid-auto-flow: row;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .offline-mode-control :deep(.ui-segmented-option) {
    min-width: 0;
  }

  .offline-task {
    min-height: 0;
  }

  .offline-task-header {
    flex-direction: column;
  }

  .offline-scan-actions,
  .offline-task-actions {
    width: 100%;
    justify-content: stretch;
  }

  .offline-scan-actions :deep(.ui-button),
  .offline-task-actions :deep(.ui-button) {
    flex: 1 1 100%;
  }

  .offline-setup-summary,
  .offline-diagnostics,
  .offline-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .offline-result :deep(.ui-disclosure) {
    grid-column: 1;
  }

  .offline-result-copy {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
