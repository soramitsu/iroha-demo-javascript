<template>
  <div class="vpn-layout">
    <RouteHeaderAction>
      <AppButton
        variant="secondary"
        :disabled="loading || actionPending"
        @click="refreshAll"
      >
        {{ loading ? t("Refreshing…") : t("Refresh") }}
      </AppButton>
    </RouteHeaderAction>

    <section
      class="vpn-control-surface"
      :data-state="status.state"
      aria-labelledby="vpn-heading"
      :aria-busy="loading || actionPending"
    >
      <header class="vpn-control-header">
        <div>
          <p class="vpn-kicker">{{ t(connectionStateLabel) }}</p>
          <h2 id="vpn-heading">{{ t("Connection") }}</h2>
          <p class="helper">{{ availabilityMessage }}</p>
        </div>
        <div class="vpn-primary-actions">
          <button
            v-if="status.repairRequired || availability?.repairRequired"
            type="button"
            data-ui-primary-action
            :disabled="loading || actionPending"
            @click="handleRepair"
          >
            {{ actionPending ? t("Repairing…") : t("Repair VPN") }}
          </button>
          <button
            v-else-if="status.state === 'connected'"
            type="button"
            class="secondary"
            data-ui-primary-action
            :disabled="actionPending || !canOperate"
            @click="handleDisconnect"
          >
            {{ actionPending ? t("Disconnecting…") : t("Disconnect VPN") }}
          </button>
          <button
            v-else
            type="button"
            data-ui-primary-action
            :disabled="actionDisabled"
            @click="handleConnect"
          >
            {{ actionPending ? t("Connecting…") : t("Connect VPN") }}
          </button>
        </div>
      </header>

      <div class="vpn-state-panel">
        <div class="vpn-state-mark" aria-hidden="true">
          <span></span>
        </div>
        <div class="vpn-state-copy" role="status" aria-live="polite">
          <span class="kv-label">{{ t("Connection state") }}</span>
          <strong>{{ t(connectionStateLabel) }}</strong>
          <span class="vpn-relay mono">{{ relayLabel }}</span>
        </div>
      </div>

      <dl class="vpn-kpis">
        <div class="kv">
          <dt class="kv-label">{{ t("Session duration") }}</dt>
          <dd class="kv-value">{{ formatDuration(status.durationMs) }}</dd>
        </div>
        <div class="kv">
          <dt class="kv-label">{{ t("VPN Lease") }}</dt>
          <dd class="kv-value">{{ leaseLabel }}</dd>
        </div>
        <div class="kv">
          <dt class="kv-label">{{ t("Traffic in") }}</dt>
          <dd class="kv-value">{{ formatBytes(status.bytesIn) }}</dd>
        </div>
        <div class="kv">
          <dt class="kv-label">{{ t("Traffic out") }}</dt>
          <dd class="kv-value">{{ formatBytes(status.bytesOut) }}</dd>
        </div>
      </dl>

      <div class="vpn-controls">
        <label class="vpn-field">
          <span class="vpn-field-label">{{ t("Exit class") }}</span>
          <select
            :value="selectedExitClass"
            :disabled="actionPending || !profile"
            @change="handleExitClassChange"
          >
            <option
              v-for="exitClass in supportedExitClasses"
              :key="exitClass"
              :value="exitClass"
            >
              {{ t(exitClassLabel(exitClass)) }}
            </option>
          </select>
        </label>
        <div
          class="vpn-readiness"
          :class="{ 'is-ready': availability?.actionsEnabled }"
        >
          <span class="vpn-readiness-dot" aria-hidden="true"></span>
          <span>
            {{
              availability?.actionsEnabled
                ? t("VPN ready")
                : t("VPN unavailable")
            }}
          </span>
          <span class="vpn-billing">{{ billingLabel }}</span>
        </div>
      </div>

      <div class="vpn-control-footer">
        <p v-if="canOperate" class="transaction-fee-note">
          <span>{{ t("Fee") }}</span>
          <strong>{{
            formatTransactionFee(
              transactionFeeHintForEndpoint(session.connection.toriiUrl),
              t,
            )
          }}</strong>
        </p>
        <p v-if="actionError" class="vpn-error" role="alert">
          {{ actionError }}
        </p>
        <p v-else-if="loadError" class="vpn-error" role="alert">
          {{ loadError }}
        </p>
      </div>
    </section>

    <section class="vpn-diagnostics" :aria-label="t('VPN details')">
      <details class="vpn-diagnostic-section">
        <summary>{{ t("Session details") }}</summary>
        <div class="vpn-details-grid">
          <div class="vpn-detail">
            <span class="helper">{{ t("Session ID") }}</span>
            <span class="mono">{{
              status.sessionId || t("No VPN session yet.")
            }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Relay endpoint") }}</span>
            <span class="mono">{{ status.relayEndpoint || relayLabel }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Connected at") }}</span>
            <span>{{ formatTimestamp(status.connectedAtMs) }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Expires at") }}</span>
            <span>{{ formatTimestamp(status.expiresAtMs) }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Traffic in") }}</span>
            <span>{{ formatBytes(status.bytesIn) }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Traffic out") }}</span>
            <span>{{ formatBytes(status.bytesOut) }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("System tunnel") }}</span>
            <span>{{ systemTunnelStatusLabel }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Reconcile state") }}</span>
            <span>{{ status.reconcileState || t("Steady") }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Tunnel interface") }}</span>
            <span class="mono">{{ systemTunnelInterfaceLabel }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Primary network service") }}</span>
            <span>{{ systemTunnelServiceLabel }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("VPN Helper") }}</span>
            <span>{{ helperLabel }}</span>
          </div>
          <div class="vpn-detail">
            <span class="helper">{{ t("Controller") }}</span>
            <span>{{ controllerLabel }}</span>
          </div>
        </div>
      </details>

      <details class="vpn-diagnostic-section">
        <summary>{{ t("Network profile") }}</summary>
        <div class="vpn-profile-columns">
          <div>
            <p class="helper">{{ t("Server-pushed routes") }}</p>
            <ul v-if="routePushes.length" class="vpn-list">
              <li
                v-for="routeItem in routePushes"
                :key="routeItem"
                class="mono"
              >
                {{ routeItem }}
              </li>
            </ul>
            <p v-else class="helper">{{ t("No pushed routes configured.") }}</p>
          </div>
          <div>
            <p class="helper">{{ t("DNS servers") }}</p>
            <ul v-if="dnsServers.length" class="vpn-list">
              <li v-for="dnsServer in dnsServers" :key="dnsServer" class="mono">
                {{ dnsServer }}
              </li>
            </ul>
            <p v-else class="helper">{{ t("No DNS servers configured.") }}</p>
          </div>
          <div>
            <p class="helper">{{ t("Excluded routes") }}</p>
            <ul v-if="excludedRoutes.length" class="vpn-list">
              <li
                v-for="routeItem in excludedRoutes"
                :key="routeItem"
                class="mono"
              >
                {{ routeItem }}
              </li>
            </ul>
            <p v-else class="helper">
              {{ t("No excluded routes configured.") }}
            </p>
          </div>
          <div>
            <p class="helper">{{ t("Tunnel addresses") }}</p>
            <ul v-if="tunnelAddresses.length" class="vpn-list">
              <li
                v-for="address in tunnelAddresses"
                :key="address"
                class="mono"
              >
                {{ address }}
              </li>
            </ul>
            <p v-else class="helper">
              {{ t("No tunnel addresses configured.") }}
            </p>
            <p class="helper vpn-mtu-label">
              {{ t("Tunnel MTU") }}: {{ mtuLabel }}
            </p>
          </div>
        </div>
      </details>

      <details class="vpn-diagnostic-section">
        <summary>{{ t("Recent VPN receipts") }}</summary>
        <div v-if="receipts.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t("Session ID") }}</th>
                <th>{{ t("Exit class") }}</th>
                <th>{{ t("Duration") }}</th>
                <th>{{ t("Traffic") }}</th>
                <th>{{ t("Status") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="receipt in receipts" :key="receipt.sessionId">
                <td class="mono">{{ receipt.sessionId }}</td>
                <td>{{ t(exitClassLabel(receipt.exitClass)) }}</td>
                <td>{{ formatDuration(receipt.durationMs) }}</td>
                <td>
                  {{ formatBytes(receipt.bytesIn) }} /
                  {{ formatBytes(receipt.bytesOut) }}
                </td>
                <td>{{ receipt.status }} · {{ receipt.receiptSource }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="wallet-empty">
          <p class="wallet-empty-title">{{ t("No VPN receipts yet.") }}</p>
          <p class="helper">{{ t("Connect VPN") }}</p>
        </div>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAppI18n } from "@/composables/useAppI18n";
import { AppButton, RouteHeaderAction } from "@/components/ui";
import {
  connectVpn,
  disconnectVpn,
  getVpnAvailability,
  getVpnProfile,
  getVpnStatus,
  listVpnReceipts,
  repairVpn,
} from "@/services/iroha";
import { useSessionStore } from "@/stores/session";
import { useVpnStore } from "@/stores/vpn";
import type {
  VpnAuthContext,
  VpnAvailability,
  VpnExitClass,
  VpnProfile,
  VpnReceipt,
  VpnStatus,
} from "@/types/iroha";
import { getPublicAccountId } from "@/utils/accountId";
import { toUserFacingErrorMessage } from "@/utils/errorMessage";
import {
  formatTransactionFee,
  transactionFeeHintForEndpoint,
} from "@/utils/transactionFee";

const session = useSessionStore();
const vpnStore = useVpnStore();
const { localeStore, t } = useAppI18n();

if (!vpnStore.hydrated) {
  vpnStore.hydrate();
}

const emptyStatus = (): VpnStatus => ({
  state: "idle",
  sessionId: null,
  exitClass: null,
  relayEndpoint: null,
  connectedAtMs: null,
  expiresAtMs: null,
  durationMs: 0,
  bytesIn: 0,
  bytesOut: 0,
  routePushes: [],
  excludedRoutes: [],
  dnsServers: [],
  tunnelAddresses: [],
  mtuBytes: 0,
  helperStatus: "idle",
  controllerInstalled: false,
  controllerVersion: null,
  controllerKind: null,
  reconcileState: null,
  repairRequired: false,
  remoteSessionActive: false,
  systemTunnelActive: false,
  systemTunnelKind: null,
  systemTunnelInterface: null,
  systemTunnelService: null,
  errorMessage: null,
  lastReceipt: null,
});

const activeAccount = computed(() => session.activeAccount);
const requestAccountId = computed(
  () =>
    getPublicAccountId(activeAccount.value, session.connection.networkPrefix) ||
    activeAccount.value?.accountId ||
    "",
);
const toriiUrl = computed(() => session.connection.toriiUrl);
const availability = ref<VpnAvailability | null>(vpnStore.helperHealth);
const profile = ref<VpnProfile | null>(vpnStore.lastProfile);
const status = ref<VpnStatus>(emptyStatus());
const receipts = ref<VpnReceipt[]>(vpnStore.receipts);
const loading = ref(false);
const actionPending = ref(false);
const loadError = ref("");
const actionError = ref("");
const requestGeneration = ref(0);
let refreshTimer: number | null = null;

const selectedExitClass = computed({
  get: () => vpnStore.selectedExitClass,
  set: (value: VpnExitClass) => vpnStore.setSelectedExitClass(value),
});

const supportedExitClasses = computed<VpnExitClass[]>(() => {
  const values = profile.value?.supportedExitClasses ?? ["standard"];
  return values.filter(
    (value): value is VpnExitClass =>
      value === "standard" ||
      value === "low-latency" ||
      value === "high-security",
  );
});

const canOperate = computed(() =>
  Boolean(toriiUrl.value && requestAccountId.value),
);

const authContext = computed<Partial<VpnAuthContext> | undefined>(() => {
  if (!toriiUrl.value || !requestAccountId.value) {
    return undefined;
  }
  return {
    toriiUrl: toriiUrl.value,
    accountId: requestAccountId.value,
    networkPrefix: session.connection.networkPrefix,
  };
});

const actionDisabled = computed(
  () =>
    actionPending.value ||
    !canOperate.value ||
    !availability.value?.actionsEnabled ||
    !profile.value?.available,
);

const availabilityMessage = computed(() => {
  if (!canOperate.value) {
    return t("Set up network and wallet first.");
  }
  return t(availability.value?.message || "VPN helper is ready.");
});

const helperLabel = computed(() =>
  availability.value
    ? `${availability.value.helperVersion} · ${availability.value.platform}`
    : t("Checking VPN helper…"),
);

const controllerLabel = computed(() => {
  if (!availability.value?.controllerInstalled) {
    return t("Controller missing");
  }
  const bits = [
    availability.value.controllerKind || t("Unknown"),
    availability.value.controllerVersion || t("Version pending"),
  ];
  return bits.join(" · ");
});

const relayLabel = computed(
  () => profile.value?.relayEndpoint || t("Relay endpoint pending."),
);

const billingLabel = computed(
  () => profile.value?.displayBillingLabel || t("Billing label pending."),
);

const leaseLabel = computed(() =>
  profile.value ? `${profile.value.leaseSecs}s` : t("Lease pending."),
);

const routePushes = computed(() =>
  status.value.routePushes.length
    ? status.value.routePushes
    : (profile.value?.routePushes ?? []),
);

const excludedRoutes = computed(() =>
  status.value.excludedRoutes.length
    ? status.value.excludedRoutes
    : (profile.value?.excludedRoutes ?? []),
);

const dnsServers = computed(() =>
  status.value.dnsServers.length
    ? status.value.dnsServers
    : (profile.value?.dnsServers ?? []),
);

const tunnelAddresses = computed(() =>
  status.value.tunnelAddresses.length
    ? status.value.tunnelAddresses
    : (profile.value?.tunnelAddresses ?? []),
);

const mtuLabel = computed(
  () => `${status.value.mtuBytes || profile.value?.mtuBytes || 0}`,
);

const systemTunnelInterfaceLabel = computed(
  () =>
    status.value.systemTunnelInterface ||
    availability.value?.systemTunnelInterface ||
    t("Not configured"),
);

const systemTunnelServiceLabel = computed(() => {
  const service =
    status.value.systemTunnelService || availability.value?.systemTunnelService;
  if (service) {
    return service;
  }
  const kind =
    status.value.systemTunnelKind || availability.value?.systemTunnelKind;
  return kind === "linux-helperd" ? t("Not required") : t("Not configured");
});

const systemTunnelStatusLabel = computed(() => {
  if (status.value.systemTunnelActive) {
    return t("System tunnel active");
  }
  if (status.value.repairRequired || availability.value?.repairRequired) {
    return t("VPN repair required");
  }
  if (availability.value?.systemTunnelConfigured) {
    return t("System tunnel inactive");
  }
  return t("Not configured");
});

const connectionStateLabel = computed(() => {
  switch (status.value.state) {
    case "connecting":
      return "VPN connecting";
    case "connected":
      return "VPN connected";
    case "disconnecting":
      return "VPN disconnecting";
    case "reconciling":
      return "VPN reconciling";
    case "remote-delete-pending":
      return "VPN remote cleanup pending";
    case "repair-needed":
      return "VPN repair required";
    case "error":
      return "VPN error";
    default:
      return "VPN idle";
  }
});

const formatTimestamp = (value: number | null) => {
  if (!value) {
    return t("—");
  }
  return new Intl.DateTimeFormat(localeStore.current, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatDuration = (durationMs: number) => {
  if (!durationMs) {
    return t("0s");
  }
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const formatBytes = (value: number) =>
  new Intl.NumberFormat(localeStore.current, {
    maximumFractionDigits: value >= 1024 ? 1 : 0,
  }).format(value >= 1024 ? value / 1024 : value) +
  (value >= 1024 ? " KB" : " B");

const exitClassLabel = (value: VpnExitClass) => {
  switch (value) {
    case "low-latency":
      return "Low latency";
    case "high-security":
      return "High security";
    default:
      return "Standard";
  }
};

const syncStatusOnly = async () => {
  try {
    status.value = await getVpnStatus(authContext.value);
  } catch (error) {
    status.value = {
      ...emptyStatus(),
      state: "error",
      errorMessage: toUserFacingErrorMessage(error),
      helperStatus: "error",
      controllerInstalled: availability.value?.controllerInstalled ?? false,
      controllerVersion: availability.value?.controllerVersion ?? null,
      controllerKind: availability.value?.controllerKind ?? null,
      repairRequired: availability.value?.repairRequired ?? false,
      systemTunnelActive: false,
      systemTunnelKind: availability.value?.systemTunnelKind ?? null,
      systemTunnelInterface: availability.value?.systemTunnelInterface ?? null,
      systemTunnelService: availability.value?.systemTunnelService ?? null,
      lastReceipt: receipts.value[0] ?? null,
    };
  }
};

const refreshAll = async () => {
  if (!toriiUrl.value) {
    availability.value = null;
    profile.value = null;
    status.value = emptyStatus();
    receipts.value = vpnStore.receipts;
    return;
  }
  loading.value = true;
  loadError.value = "";
  const generation = ++requestGeneration.value;
  try {
    const [nextAvailability, nextProfile, nextStatus, nextReceipts] =
      await Promise.all([
        getVpnAvailability({ toriiUrl: toriiUrl.value }),
        getVpnProfile({ toriiUrl: toriiUrl.value }),
        getVpnStatus(authContext.value),
        listVpnReceipts(authContext.value),
      ]);
    if (generation !== requestGeneration.value) {
      return;
    }
    availability.value = nextAvailability;
    profile.value = nextProfile;
    status.value = nextStatus;
    receipts.value = nextReceipts;
    vpnStore.setHelperHealth(nextAvailability);
    vpnStore.setLastProfile(nextProfile);
    vpnStore.setReceipts(nextReceipts);
    if (
      nextProfile &&
      !nextProfile.supportedExitClasses.includes(selectedExitClass.value)
    ) {
      selectedExitClass.value = nextProfile.defaultExitClass;
    }
  } catch (error) {
    if (generation !== requestGeneration.value) {
      return;
    }
    loadError.value = toUserFacingErrorMessage(
      error,
      t("Failed to load VPN state."),
    );
  } finally {
    if (generation === requestGeneration.value) {
      loading.value = false;
    }
  }
};

const handleConnect = async () => {
  if (!canOperate.value || !activeAccount.value) {
    return;
  }
  actionPending.value = true;
  actionError.value = "";
  try {
    status.value = await connectVpn({
      toriiUrl: toriiUrl.value,
      chainId: session.connection.chainId,
      accountId: requestAccountId.value,
      networkPrefix: session.connection.networkPrefix,
      privateKeyHex: activeAccount.value.privateKeyHex,
      exitClass: selectedExitClass.value,
    });
    receipts.value = await listVpnReceipts(authContext.value);
    vpnStore.setReceipts(receipts.value);
  } catch (error) {
    actionError.value = toUserFacingErrorMessage(
      error,
      t("Failed to connect VPN."),
    );
  } finally {
    actionPending.value = false;
    await refreshAll();
  }
};

const handleDisconnect = async () => {
  if (!canOperate.value || !activeAccount.value) {
    return;
  }
  actionPending.value = true;
  actionError.value = "";
  try {
    status.value = await disconnectVpn({
      toriiUrl: toriiUrl.value,
      accountId: requestAccountId.value,
      networkPrefix: session.connection.networkPrefix,
      privateKeyHex: activeAccount.value.privateKeyHex,
    });
    receipts.value = await listVpnReceipts(authContext.value);
    vpnStore.setReceipts(receipts.value);
  } catch (error) {
    actionError.value = toUserFacingErrorMessage(
      error,
      t("Failed to disconnect VPN."),
    );
  } finally {
    actionPending.value = false;
    await refreshAll();
  }
};

const handleRepair = async () => {
  actionPending.value = true;
  actionError.value = "";
  try {
    status.value = await repairVpn(authContext.value ?? {});
  } catch (error) {
    actionError.value = toUserFacingErrorMessage(
      error,
      t("Failed to repair VPN."),
    );
  } finally {
    actionPending.value = false;
    await refreshAll();
  }
};

const handleExitClassChange = (event: Event) => {
  selectedExitClass.value = (event.target as HTMLSelectElement)
    .value as VpnExitClass;
};

watch(
  () => `${toriiUrl.value}::${requestAccountId.value}`,
  () => {
    void refreshAll();
  },
  { immediate: true },
);

onMounted(() => {
  refreshTimer = window.setInterval(() => {
    void syncStatusOnly();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (refreshTimer != null) {
    window.clearInterval(refreshTimer);
  }
});
</script>

<style scoped>
.vpn-layout {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 24px;
  max-width: 1100px;
}

.vpn-control-surface {
  display: grid;
  gap: 24px;
  padding: clamp(20px, 3vw, 34px);
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 22px;
  background: var(--frost-panel-raised);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: var(--frost-filter-panel);
  backdrop-filter: var(--frost-filter-panel);
}

.vpn-control-header,
.vpn-primary-actions,
.vpn-controls,
.vpn-readiness,
.vpn-control-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vpn-control-header,
.vpn-controls {
  justify-content: space-between;
}

.vpn-control-header {
  align-items: flex-start;
}

.vpn-control-header h2 {
  margin: 4px 0 8px;
}

.vpn-control-header .helper {
  max-width: 58ch;
}

.vpn-kicker {
  margin: 0;
  color: var(--iroha-accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.vpn-primary-actions {
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.vpn-primary-actions button {
  min-height: 44px;
}

.vpn-primary-actions .ghost {
  background: transparent;
  box-shadow: none;
}

.vpn-state-panel {
  display: flex;
  align-items: center;
  gap: 22px;
  min-height: 132px;
  padding: clamp(18px, 3vw, 28px);
  border-block: 1px solid var(--panel-border);
  background: var(--frost-panel-soft);
  -webkit-backdrop-filter: var(--frost-filter-soft);
  backdrop-filter: var(--frost-filter-soft);
}

.vpn-state-mark {
  display: grid;
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  background: var(--surface-strong);
}

.vpn-state-mark span {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--iroha-muted);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--iroha-muted) 13%, transparent);
}

.vpn-control-surface[data-state="connected"] .vpn-state-mark span {
  background: var(--color-success);
  box-shadow: 0 0 0 6px
    color-mix(in srgb, var(--color-success) 15%, transparent);
}

.vpn-control-surface:is(
    [data-state="connecting"],
    [data-state="reconciling"],
    [data-state="disconnecting"]
  )
  .vpn-state-mark
  span {
  background: var(--iroha-accent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--iroha-accent) 15%, transparent);
}

.vpn-control-surface:is([data-state="error"], [data-state="repair-needed"])
  .vpn-state-mark
  span {
  background: var(--color-danger);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-danger) 15%, transparent);
}

.vpn-state-copy {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.vpn-state-copy strong {
  font-size: clamp(1.25rem, 2.8vw, 1.8rem);
}

.vpn-relay {
  color: var(--iroha-muted);
  overflow-wrap: anywhere;
}

.vpn-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border-block: 1px solid var(--panel-border);
}

.vpn-kpis .kv {
  min-width: 0;
  padding: 15px 18px;
}

.vpn-kpis .kv + .kv {
  border-inline-start: 1px solid var(--panel-border);
}

.vpn-kpis dd {
  margin: 5px 0 0;
  font-variant-numeric: tabular-nums;
}

.vpn-controls {
  gap: 24px;
}

.vpn-field {
  display: grid;
  flex: 0 1 320px;
  gap: 7px;
}

.vpn-field-label {
  color: var(--iroha-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.vpn-readiness {
  min-width: 0;
  justify-content: flex-end;
  color: var(--iroha-muted);
  font-size: 0.82rem;
}

.vpn-readiness-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--iroha-muted);
}

.vpn-readiness.is-ready .vpn-readiness-dot {
  background: var(--color-success);
}

.vpn-billing {
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--panel-border);
  overflow-wrap: anywhere;
}

.vpn-control-footer {
  align-items: flex-start;
  justify-content: space-between;
}

.vpn-control-footer .transaction-fee-note {
  flex: 0 0 auto;
  margin: 0;
}

.vpn-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.84rem;
  text-align: end;
}

.vpn-diagnostics {
  overflow: hidden;
  border-block: 1px solid var(--panel-border);
}

.vpn-diagnostic-section {
  margin: 0;
  border: 0;
  background: transparent;
}

.vpn-diagnostic-section + .vpn-diagnostic-section {
  border-top: 1px solid var(--panel-border);
}

.vpn-diagnostic-section > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 12px 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 750;
  list-style: none;
}

.vpn-diagnostic-section > summary::-webkit-details-marker {
  display: none;
}

.vpn-diagnostic-section > summary::after {
  content: "+";
  color: var(--iroha-muted);
  font-size: 1.1rem;
  font-weight: 400;
}

.vpn-diagnostic-section[open] > summary::after {
  content: "−";
}

.vpn-details-grid,
.vpn-profile-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  padding: 0 4px 24px;
}

.vpn-detail,
.vpn-profile-columns > div {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding: 14px 16px;
  border-top: 1px solid var(--panel-border);
}

.vpn-detail span:last-child,
.vpn-profile-columns li {
  overflow-wrap: anywhere;
}

.vpn-profile-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.vpn-list {
  display: grid;
  gap: 5px;
  margin: 8px 0 0;
  padding-inline-start: 18px;
}

.vpn-diagnostic-section > .table-wrap,
.vpn-diagnostic-section > .wallet-empty {
  margin-bottom: 24px;
}

.mono {
  unicode-bidi: plaintext;
}

@media (max-width: 860px) {
  .vpn-control-header,
  .vpn-controls,
  .vpn-control-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .vpn-primary-actions,
  .vpn-readiness {
    justify-content: flex-start;
  }

  .vpn-field {
    flex-basis: auto;
  }

  .vpn-kpis,
  .vpn-details-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vpn-kpis .kv:nth-child(3) {
    border-inline-start: 0;
  }

  .vpn-kpis .kv:nth-child(n + 3) {
    border-top: 1px solid var(--panel-border);
  }

  .vpn-error {
    text-align: start;
  }
}

@media (max-width: 560px) {
  .vpn-control-surface {
    padding-inline: 18px;
  }

  .vpn-primary-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
  }

  .vpn-state-panel {
    align-items: flex-start;
    gap: 16px;
    padding-inline: 14px;
  }

  .vpn-state-mark {
    width: 48px;
    height: 48px;
  }

  .vpn-readiness {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .vpn-billing {
    flex-basis: 100%;
    padding: 8px 0 0;
    border: 0;
  }

  .vpn-details-grid,
  .vpn-profile-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
