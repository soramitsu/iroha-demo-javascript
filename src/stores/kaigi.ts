import { x25519 } from "@noble/curves/ed25519";
import { defineStore } from "pinia";
import type { KaigiSignalKeyPair } from "@/types/iroha";
import {
  buildEndpointIdentityScope,
  type EndpointIdentityScope,
  type EndpointIdentityScopeInput,
} from "@/utils/endpointScope";
import { normalizeAccountIdLiteralForNetwork } from "@/utils/accountId";
import {
  computeKaigiMeetingExpiryMs,
  deriveKaigiMeetingCode,
  requireKaigiCallId,
  requireKaigiInviteSecretBase64Url,
} from "@/utils/kaigiInvite";

export const KAIGI_STORAGE_KEY = "iroha-demo:kaigi:host-sessions:v1";
const MAX_HOST_SESSIONS = 64;
const RETIRED_KAIGI_STORAGE_KEYS = [
  KAIGI_STORAGE_KEY,
  "iroha-demo:kaigi",
  "iroha-demo:kaigi:v2",
] as const;

export type KaigiHostSessionRecord = {
  endpointScope: EndpointIdentityScope;
  accountId: string;
  callId: string;
  meetingCode: string;
  inviteSecretBase64Url: string;
  hostKaigiKeys: KaigiSignalKeyPair;
  createdAtMs: number;
  scheduledStartMs: number;
  expiresAtMs: number;
  title?: string;
  live: boolean;
  privacyMode: "transparent";
};

type KaigiStoreState = {
  hydrated: boolean;
  hostSessions: KaigiHostSessionRecord[];
};

const defaultState = (): KaigiStoreState => ({
  hydrated: false,
  hostSessions: [],
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const requireCanonicalText = (
  value: unknown,
  label: string,
  maxLength: number,
): string => {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    value.length > maxLength ||
    /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  ) {
    throw new Error(`${label} must be canonical text.`);
  }
  return value;
};

const requireAccountId = (value: unknown, networkPrefix: number): string => {
  const accountId = requireCanonicalText(value, "accountId", 1_024);
  if (
    normalizeAccountIdLiteralForNetwork(accountId, networkPrefix) !== accountId
  ) {
    throw new Error("accountId must be a canonical account literal.");
  }
  return accountId;
};

const requirePositiveSafeInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
};

const requireCanonicalKey = (value: unknown, label: string): Uint8Array => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new Error(`${label} must encode exactly 32 bytes as base64url.`);
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`${label} must encode exactly 32 bytes as base64url.`);
  }
  if (bytes.length !== 32 || bytesToBase64Url(bytes) !== value) {
    throw new Error(`${label} must encode exactly 32 bytes as base64url.`);
  }
  return bytes;
};

const requireEndpointScope = (value: unknown): EndpointIdentityScope => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "origin",
      "chainId",
      "networkPrefix",
      "genesisHash",
      "storageSegment",
    ])
  ) {
    throw new Error("endpointScope is invalid.");
  }
  const origin = requireCanonicalText(
    value.origin,
    "endpointScope.origin",
    2_048,
  );
  const chainId = requireCanonicalText(
    value.chainId,
    "endpointScope.chainId",
    256,
  );
  const genesisHash = requireCanonicalText(
    value.genesisHash,
    "endpointScope.genesisHash",
    64,
  );
  const storageSegment = requireCanonicalText(
    value.storageSegment,
    "endpointScope.storageSegment",
    4_096,
  );
  if (typeof value.networkPrefix !== "number") {
    throw new Error("endpointScope.networkPrefix is invalid.");
  }
  const canonical = buildEndpointIdentityScope({
    toriiUrl: origin,
    observedChainId: chainId,
    observedNetworkPrefix: value.networkPrefix,
    observedGenesisHash: genesisHash,
  });
  if (
    canonical.origin !== origin ||
    canonical.chainId !== chainId ||
    canonical.networkPrefix !== value.networkPrefix ||
    canonical.genesisHash !== genesisHash ||
    canonical.storageSegment !== storageSegment
  ) {
    throw new Error("endpointScope is not canonical.");
  }
  return canonical;
};

const normalizeHostSession = (value: unknown): KaigiHostSessionRecord => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(
      value,
      [
        "endpointScope",
        "accountId",
        "callId",
        "meetingCode",
        "inviteSecretBase64Url",
        "hostKaigiKeys",
        "createdAtMs",
        "scheduledStartMs",
        "expiresAtMs",
        "live",
        "privacyMode",
      ],
      ["title"],
    )
  ) {
    throw new Error("Kaigi host session has missing or unknown fields.");
  }
  if (
    !isPlainRecord(value.hostKaigiKeys) ||
    !hasExactKeys(value.hostKaigiKeys, [
      "publicKeyBase64Url",
      "privateKeyBase64Url",
    ])
  ) {
    throw new Error("Kaigi host key pair is invalid.");
  }

  const endpointScope = requireEndpointScope(value.endpointScope);
  const accountId = requireAccountId(
    value.accountId,
    endpointScope.networkPrefix,
  );
  const callId = requireKaigiCallId(value.callId);
  const meetingCode = requireCanonicalText(
    value.meetingCode,
    "meetingCode",
    255,
  );
  if (deriveKaigiMeetingCode(callId) !== meetingCode) {
    throw new Error("meetingCode must match callId.");
  }
  const inviteSecretBase64Url = requireKaigiInviteSecretBase64Url(
    value.inviteSecretBase64Url,
  );
  const publicKeyBytes = requireCanonicalKey(
    value.hostKaigiKeys.publicKeyBase64Url,
    "hostKaigiKeys.publicKeyBase64Url",
  );
  const privateKeyBytes = requireCanonicalKey(
    value.hostKaigiKeys.privateKeyBase64Url,
    "hostKaigiKeys.privateKeyBase64Url",
  );
  if (
    bytesToBase64Url(x25519.getPublicKey(privateKeyBytes)) !==
    bytesToBase64Url(publicKeyBytes)
  ) {
    throw new Error("Kaigi host public and private keys do not match.");
  }
  const createdAtMs = requirePositiveSafeInteger(
    value.createdAtMs,
    "createdAtMs",
  );
  const scheduledStartMs = requirePositiveSafeInteger(
    value.scheduledStartMs,
    "scheduledStartMs",
  );
  const expiresAtMs = requirePositiveSafeInteger(
    value.expiresAtMs,
    "expiresAtMs",
  );
  if (
    computeKaigiMeetingExpiryMs(scheduledStartMs) !== expiresAtMs ||
    createdAtMs >= expiresAtMs
  ) {
    throw new Error("Kaigi host session timestamps are inconsistent.");
  }
  if (value.live !== true || value.privacyMode !== "transparent") {
    throw new Error("Kaigi host session policy fields are invalid.");
  }
  const title = Object.prototype.hasOwnProperty.call(value, "title")
    ? requireCanonicalText(value.title, "title", 256)
    : undefined;

  return {
    endpointScope,
    accountId,
    callId,
    meetingCode,
    inviteSecretBase64Url,
    hostKaigiKeys: {
      publicKeyBase64Url: bytesToBase64Url(publicKeyBytes),
      privateKeyBase64Url: bytesToBase64Url(privateKeyBytes),
    },
    createdAtMs,
    scheduledStartMs,
    expiresAtMs,
    ...(title ? { title } : {}),
    live: true,
    privacyMode: value.privacyMode,
  };
};

export const useKaigiStore = defineStore("kaigi", {
  state: (): KaigiStoreState => defaultState(),
  actions: {
    hydrate() {
      if (this.hydrated) {
        return;
      }
      for (const retiredKey of RETIRED_KAIGI_STORAGE_KEYS) {
        localStorage.removeItem(retiredKey);
      }
      this.hydrated = true;
    },
    saveHostSession(session: KaigiHostSessionRecord) {
      const normalized = normalizeHostSession(session);
      const next = this.hostSessions.filter(
        (entry) =>
          !(
            entry.endpointScope.storageSegment ===
              normalized.endpointScope.storageSegment &&
            entry.accountId === normalized.accountId &&
            entry.callId === normalized.callId
          ),
      );
      next.unshift(normalized);
      this.hostSessions = next.slice(0, MAX_HOST_SESSIONS);
    },
    removeHostSession(
      endpointIdentity: EndpointIdentityScopeInput,
      accountId: string,
      callId: string,
    ) {
      const scope = buildEndpointIdentityScope(endpointIdentity);
      const canonicalAccountId = requireAccountId(
        accountId,
        scope.networkPrefix,
      );
      const canonicalCallId = requireKaigiCallId(callId);
      this.hostSessions = this.hostSessions.filter(
        (entry) =>
          !(
            entry.endpointScope.storageSegment === scope.storageSegment &&
            entry.accountId === canonicalAccountId &&
            entry.callId === canonicalCallId
          ),
      );
    },
    pruneExpired(nowMs = Date.now()) {
      const timestamp = requirePositiveSafeInteger(nowMs, "nowMs");
      this.hostSessions = this.hostSessions.filter(
        (entry) => entry.expiresAtMs > timestamp,
      );
    },
  },
  getters: {
    findLatestActiveHostSession:
      (state) =>
      (
        endpointIdentity: EndpointIdentityScopeInput,
        accountId: string,
        nowMs = Date.now(),
      ): KaigiHostSessionRecord | null => {
        try {
          const scope = buildEndpointIdentityScope(endpointIdentity);
          const canonicalAccountId = requireAccountId(
            accountId,
            scope.networkPrefix,
          );
          const timestamp = requirePositiveSafeInteger(nowMs, "nowMs");
          return (
            state.hostSessions.find(
              (entry) =>
                entry.endpointScope.storageSegment === scope.storageSegment &&
                entry.accountId === canonicalAccountId &&
                entry.expiresAtMs > timestamp,
            ) ?? null
          );
        } catch {
          return null;
        }
      },
  },
});
