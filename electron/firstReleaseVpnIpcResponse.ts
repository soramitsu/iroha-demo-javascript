import type {
  VpnAvailability,
  VpnProfile,
  VpnReceipt,
  VpnStatus,
} from "../src/types/iroha";
import { requireFirstReleaseIpcInputObject } from "./firstReleaseIpcInput";
import {
  requireFirstReleaseInputArray,
  requireFirstReleaseInputText,
} from "./firstReleaseReadInput";
import {
  parseExactVpnProfile,
  parseExactVpnReceipt,
} from "./vpnResponseSchema";

const VPN_EXIT_CLASSES = ["standard", "low-latency", "high-security"] as const;
const VPN_STATES = [
  "idle",
  "connecting",
  "connected",
  "disconnecting",
  "reconciling",
  "remote-expiry-pending",
  "repair-needed",
  "error",
] as const;
const VPN_AVAILABILITY_STATES = [
  "ready",
  "unsupported",
  "unavailable",
  "error",
] as const;

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
};

const requireUnsignedInteger = (value: unknown, label: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < 0
  ) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

const requireEnum = <T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T => {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${label} returned an unsupported value.`);
  }
  return value as T;
};

const requireNullableText = (value: unknown, label: string): string | null =>
  value === null ? null : requireFirstReleaseInputText(value, label, 4_096);

const requireNullableUnsignedInteger = (
  value: unknown,
  label: string,
): number | null =>
  value === null ? null : requireUnsignedInteger(value, label);

const requireTextArray = (
  value: unknown,
  label: string,
  maximumItems: number,
): string[] =>
  requireFirstReleaseInputArray(value, label, maximumItems).map(
    (entry, index) =>
      requireFirstReleaseInputText(entry, `${label}[${index}]`, 4_096),
  );

export const parseFirstReleaseVpnAvailabilityIpcResponse = (
  value: unknown,
): VpnAvailability => {
  const record = requireFirstReleaseIpcInputObject<
    Record<keyof VpnAvailability, unknown>
  >(value, {
    label: "VPN availability IPC response",
    required: [
      "platformSupported",
      "helperManaged",
      "helperReady",
      "serverReachable",
      "profileAvailable",
      "actionsEnabled",
      "status",
      "message",
      "helperVersion",
      "platform",
      "controllerInstalled",
      "controllerVersion",
      "controllerKind",
      "controllerPath",
      "repairRequired",
      "systemTunnelConfigured",
      "systemTunnelActive",
      "systemTunnelKind",
      "systemTunnelInterface",
      "systemTunnelService",
    ],
  });
  return {
    platformSupported: requireBoolean(
      record.platformSupported,
      "VPN availability.platformSupported",
    ),
    helperManaged: requireBoolean(
      record.helperManaged,
      "VPN availability.helperManaged",
    ),
    helperReady: requireBoolean(
      record.helperReady,
      "VPN availability.helperReady",
    ),
    serverReachable: requireBoolean(
      record.serverReachable,
      "VPN availability.serverReachable",
    ),
    profileAvailable: requireBoolean(
      record.profileAvailable,
      "VPN availability.profileAvailable",
    ),
    actionsEnabled: requireBoolean(
      record.actionsEnabled,
      "VPN availability.actionsEnabled",
    ),
    status: requireEnum(
      record.status,
      VPN_AVAILABILITY_STATES,
      "VPN availability.status",
    ),
    message: requireFirstReleaseInputText(
      record.message,
      "VPN availability.message",
      4_096,
    ),
    helperVersion: requireFirstReleaseInputText(
      record.helperVersion,
      "VPN availability.helperVersion",
      1_024,
    ),
    platform: requireFirstReleaseInputText(
      record.platform,
      "VPN availability.platform",
      128,
    ),
    controllerInstalled: requireBoolean(
      record.controllerInstalled,
      "VPN availability.controllerInstalled",
    ),
    controllerVersion: requireNullableText(
      record.controllerVersion,
      "VPN availability.controllerVersion",
    ),
    controllerKind: requireNullableText(
      record.controllerKind,
      "VPN availability.controllerKind",
    ),
    controllerPath: requireNullableText(
      record.controllerPath,
      "VPN availability.controllerPath",
    ),
    repairRequired: requireBoolean(
      record.repairRequired,
      "VPN availability.repairRequired",
    ),
    systemTunnelConfigured: requireBoolean(
      record.systemTunnelConfigured,
      "VPN availability.systemTunnelConfigured",
    ),
    systemTunnelActive: requireBoolean(
      record.systemTunnelActive,
      "VPN availability.systemTunnelActive",
    ),
    systemTunnelKind: requireNullableText(
      record.systemTunnelKind,
      "VPN availability.systemTunnelKind",
    ),
    systemTunnelInterface: requireNullableText(
      record.systemTunnelInterface,
      "VPN availability.systemTunnelInterface",
    ),
    systemTunnelService: requireNullableText(
      record.systemTunnelService,
      "VPN availability.systemTunnelService",
    ),
  };
};

export const parseFirstReleaseVpnProfileIpcResponse = (
  value: unknown,
): VpnProfile | null => {
  if (value === null) return null;
  const profile = parseExactVpnProfile(value);
  const supportedExitClasses = profile.supportedExitClasses.map((entry) =>
    requireEnum(entry, VPN_EXIT_CLASSES, "VPN profile.supportedExitClasses"),
  );
  return {
    ...profile,
    supportedExitClasses,
    defaultExitClass: requireEnum(
      profile.defaultExitClass,
      VPN_EXIT_CLASSES,
      "VPN profile.defaultExitClass",
    ),
    flowLabelBits: 24,
    routePushes: [...profile.routePushes],
    excludedRoutes: [...profile.excludedRoutes],
    dnsServers: [...profile.dnsServers],
    tunnelAddresses: [...profile.tunnelAddresses],
  };
};

export const parseFirstReleaseVpnReceiptIpcResponse = (
  value: unknown,
): VpnReceipt => {
  const receipt = parseExactVpnReceipt(value);
  return {
    ...receipt,
    exitClass: requireEnum(
      receipt.exitClass,
      VPN_EXIT_CLASSES,
      "VPN receipt.exitClass",
    ),
    receiptSource: requireEnum(
      receipt.receiptSource,
      ["torii", "relay", "wsv"] as const,
      "VPN receipt.receiptSource",
    ),
    settleLeaseInstruction: receipt.settleLeaseInstruction
      ? { ...receipt.settleLeaseInstruction }
      : null,
  };
};

export const parseFirstReleaseVpnReceiptListIpcResponse = (
  value: unknown,
): VpnReceipt[] =>
  requireFirstReleaseInputArray(value, "VPN receipt IPC response", 24).map(
    parseFirstReleaseVpnReceiptIpcResponse,
  );

export const parseFirstReleaseVpnStatusIpcResponse = (
  value: unknown,
): VpnStatus => {
  const record = requireFirstReleaseIpcInputObject<
    Record<keyof VpnStatus, unknown>
  >(value, {
    label: "VPN status IPC response",
    required: [
      "state",
      "sessionId",
      "exitClass",
      "relayEndpoint",
      "connectedAtMs",
      "expiresAtMs",
      "durationMs",
      "bytesIn",
      "bytesOut",
      "routePushes",
      "excludedRoutes",
      "dnsServers",
      "tunnelAddresses",
      "mtuBytes",
      "helperStatus",
      "controllerInstalled",
      "controllerVersion",
      "controllerKind",
      "reconcileState",
      "repairRequired",
      "remoteSessionActive",
      "systemTunnelActive",
      "systemTunnelKind",
      "systemTunnelInterface",
      "systemTunnelService",
      "errorMessage",
      "lastReceipt",
    ],
  });
  return {
    state: requireEnum(record.state, VPN_STATES, "VPN status.state"),
    sessionId: requireNullableText(record.sessionId, "VPN status.sessionId"),
    exitClass:
      record.exitClass === null
        ? null
        : requireEnum(
            record.exitClass,
            VPN_EXIT_CLASSES,
            "VPN status.exitClass",
          ),
    relayEndpoint: requireNullableText(
      record.relayEndpoint,
      "VPN status.relayEndpoint",
    ),
    connectedAtMs: requireNullableUnsignedInteger(
      record.connectedAtMs,
      "VPN status.connectedAtMs",
    ),
    expiresAtMs: requireNullableUnsignedInteger(
      record.expiresAtMs,
      "VPN status.expiresAtMs",
    ),
    durationMs: requireUnsignedInteger(
      record.durationMs,
      "VPN status.durationMs",
    ),
    bytesIn: requireUnsignedInteger(record.bytesIn, "VPN status.bytesIn"),
    bytesOut: requireUnsignedInteger(record.bytesOut, "VPN status.bytesOut"),
    routePushes: requireTextArray(
      record.routePushes,
      "VPN status.routePushes",
      64,
    ),
    excludedRoutes: requireTextArray(
      record.excludedRoutes,
      "VPN status.excludedRoutes",
      64,
    ),
    dnsServers: requireTextArray(record.dnsServers, "VPN status.dnsServers", 8),
    tunnelAddresses: requireTextArray(
      record.tunnelAddresses,
      "VPN status.tunnelAddresses",
      8,
    ),
    mtuBytes: requireUnsignedInteger(record.mtuBytes, "VPN status.mtuBytes"),
    helperStatus: requireFirstReleaseInputText(
      record.helperStatus,
      "VPN status.helperStatus",
      1_024,
    ),
    controllerInstalled: requireBoolean(
      record.controllerInstalled,
      "VPN status.controllerInstalled",
    ),
    controllerVersion: requireNullableText(
      record.controllerVersion,
      "VPN status.controllerVersion",
    ),
    controllerKind: requireNullableText(
      record.controllerKind,
      "VPN status.controllerKind",
    ),
    reconcileState: requireNullableText(
      record.reconcileState,
      "VPN status.reconcileState",
    ),
    repairRequired: requireBoolean(
      record.repairRequired,
      "VPN status.repairRequired",
    ),
    remoteSessionActive: requireBoolean(
      record.remoteSessionActive,
      "VPN status.remoteSessionActive",
    ),
    systemTunnelActive: requireBoolean(
      record.systemTunnelActive,
      "VPN status.systemTunnelActive",
    ),
    systemTunnelKind: requireNullableText(
      record.systemTunnelKind,
      "VPN status.systemTunnelKind",
    ),
    systemTunnelInterface: requireNullableText(
      record.systemTunnelInterface,
      "VPN status.systemTunnelInterface",
    ),
    systemTunnelService: requireNullableText(
      record.systemTunnelService,
      "VPN status.systemTunnelService",
    ),
    errorMessage: requireNullableText(
      record.errorMessage,
      "VPN status.errorMessage",
    ),
    lastReceipt:
      record.lastReceipt === null
        ? null
        : parseFirstReleaseVpnReceiptIpcResponse(record.lastReceipt),
  };
};
