<template>
  <div class="offline-shell">
    <section class="card offline-hardware-card">
      <header class="card-header">
        <h2>{{ t("Offline wallet & hardware") }}</h2>
        <span class="status-pill" :class="{ ok: hardwareStatus.ok }">
          {{ hardwareStatus.label }}
        </span>
      </header>
      <div class="form-grid">
        <div>
          <p class="meta-label">{{ t("Status") }}</p>
          <p class="meta-value">{{ hardwareStatus.detail }}</p>
        </div>
        <div>
          <p class="meta-label">{{ t("Registered") }}</p>
          <p class="meta-value">
            {{
              offline.hasHardwareWallet
                ? t("Yes · {date}", {
                    date: formatDate(offline.hardware.registeredAtMs),
                  })
                : t("Not registered")
            }}
          </p>
        </div>
      </div>
      <div class="actions">
        <button
          :disabled="hardwareBusy || !hardwareStatus.ok"
          @click="registerHardware"
        >
          {{
            hardwareBusy
              ? t("Registering…")
              : t("Register secure offline wallet")
          }}
        </button>
        <button
          class="secondary"
          :disabled="hardwareBusy"
          @click="checkHardware"
        >
          {{ t("Recheck") }}
        </button>
      </div>
      <p v-if="hardwareMessage" class="helper">{{ hardwareMessage }}</p>
    </section>

    <section class="card offline-balance-card">
      <header class="card-header">
        <h2>{{ t("Offline balance") }}</h2>
        <span
          class="pill"
          :class="{ positive: Number(offline.wallet.balance) > 0 }"
        >
          {{ t("{balance} units", { balance: offline.wallet.balance }) }}
        </span>
      </header>
      <div class="form-grid">
        <div>
          <p class="meta-label">{{ t("Last sync") }}</p>
          <p class="meta-value">
            {{ formatDate(offline.wallet.syncedAtMs) || t("Never") }}
          </p>
        </div>
        <div>
          <p class="meta-label">{{ t("Next policy expiry") }}</p>
          <p class="meta-value">
            {{ formatDate(offline.wallet.nextPolicyExpiryMs) || t("—") }}
          </p>
        </div>
        <div>
          <p class="meta-label">{{ t("Policy refresh") }}</p>
          <p class="meta-value">
            {{ formatDate(offline.wallet.nextRefreshMs) || t("—") }}
          </p>
        </div>
      </div>
      <div class="actions">
        <button
          :disabled="syncingAllowances || !canSync"
          @click="syncAllowances"
        >
          {{ syncingAllowances ? t("Syncing…") : t("Sync offline allowance") }}
        </button>
      </div>
      <p v-if="syncMessage" class="helper">{{ syncMessage }}</p>
    </section>

    <section class="card offline-allowances-card">
      <header class="card-header">
        <h2>{{ t("Offline allowances") }}</h2>
        <span class="pill">{{
          t("{count} entries", { count: allowances.length })
        }}</span>
      </header>
      <div v-if="allowances.length" class="table-wrap">
        <table class="table">
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
        </table>
      </div>
      <p v-else class="helper">{{ t("No allowances synced yet.") }}</p>
    </section>

    <section class="card offline-request-card">
      <header class="card-header">
        <h2>{{ t("Request offline payment") }}</h2>
        <button
          class="secondary icon-cta"
          :disabled="!canGenerateInvoice"
          @click="generateInvoice"
        >
          <span>{{ t("Generate invoice") }}</span>
        </button>
      </header>
      <div class="form-grid">
        <label>
          {{ t("Amount") }}
          <input v-model="invoiceForm.amount" type="text" placeholder="10.00" />
        </label>
        <label>
          {{ t("Memo (optional)") }}
          <input v-model="invoiceForm.memo" :placeholder="t('Coffee refill')" />
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
      <div v-if="invoicePayload" class="qr-panel">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="invoiceQr" class="qr" v-html="invoiceQr"></div>
        <div class="actions">
          <button class="secondary" @click="copyInvoicePayload">
            {{ t("Copy invoice JSON") }}
          </button>
        </div>
        <pre class="qr-payload">{{ invoicePayloadPreview }}</pre>
      </div>
      <p v-if="invoiceMessage" class="helper">{{ invoiceMessage }}</p>
    </section>

    <section class="card offline-send-card">
      <header class="card-header">
        <h2>{{ t("Send offline payment") }}</h2>
        <div class="actions-row">
          <button class="icon-cta secondary" @click="toggleInvoiceScanner">
            <span>{{
              invoiceScanner.scanning ? t("Stop scan") : t("Scan invoice")
            }}</span>
          </button>
          <button
            class="icon-cta secondary"
            @click="invoiceScanner.openFilePicker"
          >
            <span>{{ t("Upload invoice QR") }}</span>
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
        {{ t("Invoice payload") }}
        <textarea
          v-model="invoiceInput"
          rows="3"
          placeholder='{"invoice_id":"..."}'
        ></textarea>
      </label>
      <label>
        {{ t("Memo (optional)") }}
        <input v-model="paymentMemo" :placeholder="t('Thanks!')" />
      </label>
      <div class="actions">
        <button
          :disabled="!invoiceInput || sendingPayment"
          @click="createPayment"
        >
          {{ sendingPayment ? t("Building…") : t("Create payment") }}
        </button>
      </div>
      <p v-if="paymentMessage || invoiceScanner.message" class="helper">
        {{ paymentMessage || invoiceScanner.message }}
      </p>
      <div v-if="paymentPayload" class="qr-panel">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="paymentQr" class="qr" v-html="paymentQr"></div>
        <div class="actions">
          <button class="secondary" @click="copyPaymentPayload">
            {{ t("Copy payment JSON") }}
          </button>
        </div>
        <pre class="qr-payload">{{ paymentPayloadPreview }}</pre>
      </div>
    </section>

    <section class="card offline-accept-card">
      <header class="card-header">
        <h2>{{ t("Accept offline payment") }}</h2>
        <div class="actions-row">
          <button class="icon-cta secondary" @click="togglePaymentScanner">
            <span>{{
              paymentScanner.scanning ? t("Stop scan") : t("Scan payment")
            }}</span>
          </button>
          <button
            class="icon-cta secondary"
            @click="paymentScanner.openFilePicker"
          >
            <span>{{ t("Upload payment QR") }}</span>
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
        {{ t("Payment payload") }}
        <textarea
          v-model="paymentInput"
          rows="3"
          placeholder='{"tx_id":"..."}'
        ></textarea>
      </label>
      <div class="actions">
        <button
          :disabled="!paymentInput || acceptingPayment"
          @click="acceptPayment"
        >
          {{ acceptingPayment ? t("Recording…") : t("Accept payment") }}
        </button>
      </div>
      <p v-if="acceptMessage || paymentScanner.message" class="helper">
        {{ acceptMessage || paymentScanner.message }}
      </p>
    </section>

    <section class="card offline-move-card">
      <header class="card-header">
        <h2>{{ t("Move funds to online wallet") }}</h2>
      </header>
      <div class="form-grid">
        <label>
          {{ t("Amount (blank = all)") }}
          <input v-model="onlineForm.amount" type="text" />
        </label>
        <label>
          {{ t("Destination Account") }}
          <input
            v-model="onlineForm.receiver"
            :placeholder="t('Example I105 Account ID')"
            :disabled="onlineDestinationLocked"
          />
        </label>
        <label>
          {{ t("Memo (optional)") }}
          <input
            v-model="onlineForm.memo"
            :placeholder="t('Back to hot wallet')"
          />
        </label>
        <label class="shield-option">
          <input
            v-model="onlineForm.shielded"
            type="checkbox"
            :disabled="!onlineShieldSupported"
          />
          <span>{{ t("Shield transfer") }}</span>
        </label>
      </div>
      <div class="actions">
        <button
          :disabled="movingOnline || !canSubmitOnlineMove"
          @click="moveToOnline"
        >
          {{
            movingOnline
              ? t("Transferring…")
              : onlineForm.shielded
                ? t("Shield to online wallet")
                : t("Send to online wallet")
          }}
        </button>
      </div>
      <p v-if="onlineShieldCapabilityMessage" class="helper">
        {{ onlineShieldCapabilityMessage }}
      </p>
      <p
        v-else-if="
          onlineForm.shielded && onlineShieldSupported && onlineShieldPolicyMode
        "
        class="helper"
      >
        {{ t("Shield policy mode: {mode}.", { mode: onlineShieldPolicyMode }) }}
      </p>
      <p
        v-else-if="
          !onlineForm.shielded &&
          onlineShieldSupported &&
          onlineShieldPolicyMode
        "
        class="helper"
      >
        {{
          t(
            "Shielding is optional. Leave it off to avoid shield transactions, but you will not get privacy for this transfer.",
          )
        }}
      </p>
      <p v-if="moveMessage" class="helper">{{ moveMessage }}</p>
    </section>

    <section class="card offline-history-card">
      <header class="card-header">
        <h2>{{ t("Offline history") }}</h2>
      </header>
      <div v-if="offline.wallet.history.length" class="table-wrap">
        <table class="table">
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
                <span
                  class="pill"
                  :class="{ positive: record.direction === 'incoming' }"
                >
                  {{ record.direction }}
                </span>
              </td>
              <td>{{ record.amount }}</td>
              <td>{{ record.peer }}</td>
              <td>{{ record.counterLabel }}</td>
              <td>{{ formatDate(record.timestampMs) || t("—") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="helper">{{ t("No offline transfers yet.") }}</p>
    </section>
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
  toRaw,
  watch,
} from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import { useOfflineStore } from "@/stores/offline";
import { fetchOfflineAllowances } from "@/services/offline";
import {
  createInvoice,
  createPaymentPayload,
  encodeInvoice,
  parseInvoice,
  parsePaymentPayload,
} from "@/utils/offline";
import { transferAsset } from "@/services/iroha";
import { useQrScanner } from "@/composables/useQrScanner";
import { useShieldCapability } from "@/composables/useShieldCapability";
import { useShieldedDestinationLock } from "@/composables/useShieldedDestinationLock";
import { isPositiveWholeAmount } from "@/utils/confidential";
import type { OfflineAllowanceItem } from "@/types/iroha";
import { getPublicAccountId } from "@/utils/accountId";
import {
  formatAssetDefinitionLabel,
  formatAssetReferenceLabel,
  formatOpaqueAssetLiteralsInText,
} from "@/utils/assetId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";

const session = useSessionStore();
const offline = useOfflineStore();
const activeAccount = computed(() => session.activeAccount);
const activeAccountDisplayId = computed(() =>
  getPublicAccountId(activeAccount.value),
);
const activeOfflineAssetId = computed(() =>
  session.connection.assetDefinitionId.trim(),
);
const { localeStore, t } = useAppI18n();
const canSync = computed(() =>
  Boolean(
    session.connection.toriiUrl &&
      activeAccount.value &&
      activeOfflineAssetId.value,
  ),
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

const acceptMessage = ref("");
const moveMessage = ref("");
const syncMessage = ref("");

const sendingPayment = ref(false);
const acceptingPayment = ref(false);
const syncingAllowances = ref(false);
const movingOnline = ref(false);

const onlineForm = reactive({
  amount: "",
  receiver: "",
  memo: "",
  shielded: false,
});
const {
  shieldSupported: onlineShieldSupported,
  shieldCapabilityMessage: onlineShieldCapabilityMessage,
  shieldPolicyMode: onlineShieldPolicyMode,
} = useShieldCapability({
  toriiUrl: toRef(session.connection, "toriiUrl"),
  assetDefinitionId: toRef(session.connection, "assetDefinitionId"),
  shielded: toRef(onlineForm, "shielded"),
  translate: t,
});

const invoiceScanner = useQrScanner(
  (payload) => {
    invoiceInput.value = payload;
    paymentMessage.value = t("Invoice scanned.");
  },
  { translate: t },
);
const paymentScanner = useQrScanner(
  (payload) => {
    paymentInput.value = payload;
    acceptMessage.value = t("Payment scanned.");
  },
  { translate: t },
);

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
const { destinationLocked: onlineDestinationLocked } =
  useShieldedDestinationLock({
    shielded: toRef(onlineForm, "shielded"),
    destination: toRef(onlineForm, "receiver"),
    accountId: activeAccountDisplayId,
  });
const normalizedMoveAmount = computed(
  () => onlineForm.amount.trim() || offline.wallet.balance,
);
const normalizedMoveReceiver = computed(
  () => onlineForm.receiver.trim() || activeAccountDisplayId.value || "",
);
const isOnlineTransparentAmountValid = computed(
  () => Number(normalizedMoveAmount.value) > 0,
);
const isOnlineShieldAmountValid = computed(() =>
  isPositiveWholeAmount(normalizedMoveAmount.value),
);
const isOnlineReceiverValid = computed(() => {
  if (!onlineForm.shielded) {
    return Boolean(normalizedMoveReceiver.value);
  }
  return Boolean(
    activeAccount.value &&
      normalizedMoveReceiver.value === activeAccountDisplayId.value,
  );
});
const canSubmitOnlineMove = computed(() =>
  Boolean(
    session.connection.toriiUrl &&
      session.connection.assetDefinitionId &&
      activeAccount.value &&
      (onlineForm.shielded
        ? isOnlineShieldAmountValid.value
        : isOnlineTransparentAmountValid.value) &&
      isOnlineReceiverValid.value,
  ),
);

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

const syncAllowances = async () => {
  if (
    !session.connection.toriiUrl ||
    !activeAccount.value ||
    !activeOfflineAssetId.value
  ) {
    syncMessage.value = t("Configure Torii and account first.");
    return;
  }
  syncingAllowances.value = true;
  syncMessage.value = "";
  try {
    const snapshot = await fetchOfflineAllowances({
      toriiUrl: session.connection.toriiUrl,
      controllerId: activeAccount.value.accountId,
      assetDefinitionId: activeOfflineAssetId.value,
    });
    offline.updateAllowanceSnapshot({
      total: snapshot.total,
      syncedAtMs: snapshot.syncedAtMs,
      nextPolicyExpiryMs: snapshot.nextPolicyExpiryMs,
      nextRefreshMs: snapshot.nextRefreshMs,
    });
    allowances.value = snapshot.allowances;
    syncMessage.value = t("Offline balance updated: {total}", {
      total: snapshot.total,
    });
  } catch (error) {
    syncMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to sync allowances."),
    );
  } finally {
    syncingAllowances.value = false;
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
      color: { dark: "#ffffff", light: "#00000000" },
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
      color: { dark: "#ffffff", light: "#00000000" },
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
  if (!session.connection.toriiUrl || !activeAccount.value) {
    moveMessage.value = t("Configure Torii and account first.");
    return;
  }
  if (onlineForm.shielded && !onlineShieldSupported.value) {
    moveMessage.value =
      onlineShieldCapabilityMessage.value || t("Shield mode is unavailable.");
    return;
  }
  const amount = normalizedMoveAmount.value;
  const receiver = normalizedMoveReceiver.value;
  if (!amount || Number(amount) <= 0) {
    moveMessage.value = onlineForm.shielded
      ? t("Shield amount must be a whole number greater than zero.")
      : t("Enter an amount to move online.");
    return;
  }
  if (onlineForm.shielded && receiver !== activeAccountDisplayId.value) {
    moveMessage.value = t(
      "Shield mode requires destination to be your active account.",
    );
    return;
  }
  if (onlineForm.shielded && !isPositiveWholeAmount(amount)) {
    moveMessage.value = t(
      "Shield amount must be a whole number greater than zero.",
    );
    return;
  }
  const snapshot = structuredClone(toRaw(offline.wallet));
  movingOnline.value = true;
  try {
    offline.withdrawToOnline({
      accountId: activeAccount.value.accountId,
      receiver,
      amount,
      memo: onlineForm.memo,
    });
    await transferAsset({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      assetDefinitionId: session.connection.assetDefinitionId,
      accountId: activeAccount.value.accountId,
      destinationAccountId: receiver,
      quantity: amount,
      privateKeyHex: activeAccount.value.privateKeyHex,
      metadata: onlineForm.memo ? { memo: onlineForm.memo } : undefined,
      shielded: onlineForm.shielded,
    });
    if (onlineForm.shielded) {
      session.updateActiveAccount({ localOnly: false });
    }
    moveMessage.value = onlineForm.shielded
      ? t("Shield transfer submitted and offline balance updated.")
      : t("Transfer submitted and offline balance updated.");
  } catch (error) {
    offline.$patch({ wallet: snapshot });
    offline.persist();
    moveMessage.value = toUserFacingErrorMessage(
      error,
      t("Failed to move funds online."),
    );
  } finally {
    movingOnline.value = false;
  }
};

const toggleInvoiceScanner = async () => {
  paymentMessage.value = "";
  await nextTick();
  invoiceScanner.message.value = "";
  invoiceScanner.start();
};

const togglePaymentScanner = async () => {
  acceptMessage.value = "";
  await nextTick();
  paymentScanner.message.value = "";
  paymentScanner.start();
};

watch(
  () => session.activeAccount,
  () => {
    if (activeAccount.value) {
      onlineForm.receiver = activeAccountDisplayId.value;
    }
  },
);

onMounted(() => {
  checkHardware();
  if (activeAccount.value) {
    onlineForm.receiver = activeAccountDisplayId.value;
  }
});
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
  box-shadow: none;
}
</style>
