<template>
  <div class="vpn-layout">
    <section class="card vpn-hero-card">
      <header class="card-header vpn-hero-header">
        <div>
          <h2>{{ t("Sora VPN") }}</h2>
          <p class="helper">
            {{ availabilityMessage }}
          </p>
        </div>
        <div class="vpn-hero-actions">
          <button
            v-if="status.repairRequired || availability?.repairRequired"
            class="secondary"
            :disabled="loading || actionPending"
            @click="handleRepair"
          >
            {{ actionPending ? t("Repairing…") : t("Repair VPN") }}
          </button>
          <button
            class="secondary"
            :disabled="loading || actionPending"
            @click="refreshAll"
          >
            {{ loading ? t("Refreshing…") : t("Refresh") }}
          </button>
          <button
            v-if="status.state === 'connected'"
            class="secondary"
            :disabled="actionPending || !canOperate"
            @click="handleDisconnect"
          >
            {{ actionPending ? t("Disconnecting…") : t("Disconnect VPN") }}
          </button>
          <button v-else :disabled="actionDisabled" @click="handleConnect">
            {{ actionPending ? t("Connecting…") : t("Connect VPN") }}
          </button>
        </div>
      </header>

      <div class="vpn-kpis">
        <div class="kv">
          <span class="kv-label">{{ t("Connection state") }}</span>
          <span class="kv-value">{{ t(connectionStateLabel) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("Session duration") }}</span>
          <span class="kv-value">{{ formatDuration(status.durationMs) }}</span>
        </div>
        <div class="kv">
          <span class="kv-label">{{ t("VPN Lease") }}</span>
          <span class="kv-value">{{ leaseLabel }}</span>
        </div>
      </div>
      <details class="technical-details compact">
        <summary>{{ t("VPN details") }}</summary>
        <div class="vpn-kpis">
          <div class="kv">
            <span class="kv-label">{{ t("VPN Helper") }}</span>
            <span class="kv-value">{{ helperLabel }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">{{ t("Controller") }}</span>
            <span class="kv-value">{{ controllerLabel }}</span>
          </div>
        </div>
      </details>

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
        <div class="vpn-inline-meta">
          <span
            class="pill"
            :class="{ positive: availability?.actionsEnabled }"
          >
            {{
              availability?.actionsEnabled
                ? t("VPN ready")
                : t("VPN unavailable")
            }}
          </span>
          <span class="pill">{{ relayLabel }}</span>
          <span class="pill">{{ billingLabel }}</span>
        </div>
      </div>

      <p v-if="actionError" class="wallet-faucet-message wallet-faucet-error">
        {{ actionError }}
      </p>
      <p
        v-else-if="loadError"
        class="wallet-faucet-message wallet-faucet-error"
      >
        {{ loadError }}
      </p>
    </section>

    <section class="card vpn-details-card">
      <details class="technical-details">
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
        </div>
      </details>
    </section>

    <section class="card vpn-profile-card">
      <details class="technical-details">
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
    </section>

    <section class="card vpn-receipts-card">
      <details class="technical-details">
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
      accountId: requestAccountId.value,
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
