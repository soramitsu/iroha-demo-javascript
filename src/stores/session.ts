import { defineStore } from "pinia";
import { CHAIN_PRESETS, DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import {
  normalizeChainIdValue,
  normalizeNetworkPrefixValue,
} from "@/utils/chainMetadata";
import { normalizeAccountIdLiteralForNetwork } from "@/utils/accountId";
import { isCanonicalAssetDefinitionId } from "@/utils/assetId";
import { normalizeEndpointUrl } from "@/utils/endpoint";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";
import {
  DEFAULT_SIGNING_ALGORITHM,
  normalizeStoredSigningAlgorithm,
} from "@/utils/signingAlgorithms";

export const SESSION_STORAGE_KEY = "iroha-demo:session";
export const SESSION_SCHEMA = "iroha-demo-public-session";
export const SESSION_VERSION = 1 as const;
const MAX_PERSISTED_SESSION_LENGTH = 1_048_576;
const MAX_SESSION_ACCOUNTS = 128;

export type ConnectionConfig = {
  toriiUrl: string;
  chainId: string;
  assetDefinitionId: string;
  networkPrefix: number;
};

export type UserProfile = {
  displayName: string;
  domain: string;
  accountId: string;
  i105AccountId?: string;
  i105DefaultAccountId?: string;
  publicKeyHex: string;
  signingAlgorithm: string;
  hasStoredSecret?: boolean;
  localOnly: boolean;
};

export type AuthorityProfile = {
  accountId: string;
  signingAlgorithm?: string;
  hasStoredSecret?: boolean;
};

export type SessionState = {
  hydrated: boolean;
  connection: ConnectionConfig;
  authority: AuthorityProfile;
  accounts: UserProfile[];
  activeAccountId: string | null;
};

type PersistedPublicAccount = {
  displayName: string;
  domain: string;
  accountId: string;
  publicKeyHex: string;
  signingAlgorithm: string;
  hasStoredSecret: boolean;
  localOnly: boolean;
};

type PersistedPublicSession = {
  schema: typeof SESSION_SCHEMA;
  version: typeof SESSION_VERSION;
  connection: ConnectionConfig;
  authority: {
    accountId: string;
    signingAlgorithm: string;
    hasStoredSecret: boolean;
  };
  accounts: PersistedPublicAccount[];
  activeAccountId: string | null;
};

const DEFAULT_DOMAIN_LABEL = "default";
const defaultUser = (): UserProfile => ({
  displayName: "",
  domain: DEFAULT_DOMAIN_LABEL,
  accountId: "",
  i105AccountId: "",
  i105DefaultAccountId: "",
  publicKeyHex: "",
  signingAlgorithm: DEFAULT_SIGNING_ALGORITHM,
  hasStoredSecret: false,
  localOnly: false,
});

const defaultState = (): SessionState => ({
  hydrated: false,
  connection: normalizeConnection({ ...DEFAULT_CHAIN_PRESET.connection }),
  authority: {
    accountId: "",
    signingAlgorithm: DEFAULT_SIGNING_ALGORITHM,
    hasStoredSecret: false,
  },
  accounts: [],
  activeAccountId: null,
});

const trimString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeRuntimeText = (
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {},
): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be text.`);
  }
  const normalized = value.trim();
  const maximumLength = options.maxLength ?? 2_048;
  if (
    (!options.allowEmpty && normalized.length === 0) ||
    normalized.length > maximumLength ||
    normalized.normalize("NFC") !== normalized ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(normalized)
  ) {
    throw new TypeError(`${label} must be bounded canonical text.`);
  }
  return normalized;
};

const requireRuntimeBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
  return value;
};

const readRuntimeUpdate = (
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): Record<string, unknown> => {
  let prototype: object | null;
  let ownKeys: PropertyKey[];
  try {
    prototype =
      value !== null && typeof value === "object"
        ? Object.getPrototypeOf(value)
        : null;
    ownKeys =
      value !== null && typeof value === "object" ? Reflect.ownKeys(value) : [];
  } catch {
    throw new TypeError(`${label} must be an exact data object.`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null) ||
    ownKeys.length > allowedKeys.length ||
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
  ) {
    throw new TypeError(`${label} contains an unsupported field or shape.`);
  }

  const snapshot: Record<string, unknown> = {};
  for (const key of ownKeys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new TypeError(`${label} must be an exact data object.`);
    }
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.value === undefined
    ) {
      throw new TypeError(`${label} must contain only defined data fields.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
};

const assertNoPrivateKeyField = (
  value: Record<string, unknown>,
  label: string,
): void => {
  if (Object.prototype.hasOwnProperty.call(value, "privateKeyHex")) {
    throw new TypeError(`${label} must not include private key material.`);
  }
};

const isCanonicalAccountCandidate = (value: string): boolean => {
  const literal = trimString(value);
  return literal.length >= 16;
};

const normalizeDomainLabel = (domain: string): string => {
  const normalized = normalizeRuntimeText(domain, "Account domain", {
    allowEmpty: true,
    maxLength: 256,
  });
  return normalized || DEFAULT_DOMAIN_LABEL;
};

const deriveAccountAddressesFromProfile = (
  user: Partial<UserProfile> & Record<string, unknown>,
  networkPrefix: number,
): {
  accountId: string;
  i105AccountId: string;
  i105DefaultAccountId: string;
} | null => {
  if (typeof window === "undefined" || !window.iroha) {
    return null;
  }
  const domain = trimString(user.domain);
  const publicKeyHex = trimString(user.publicKeyHex);
  if (!domain || !publicKeyHex) {
    return null;
  }
  try {
    const derived = window.iroha.deriveAccountAddress({
      domain,
      publicKeyHex,
      signingAlgorithm: normalizeStoredSigningAlgorithm(user.signingAlgorithm),
      networkPrefix,
    });
    const accountId = trimString(derived.accountId);
    const i105AccountId = trimString(derived.i105AccountId);
    if (!accountId) {
      return null;
    }
    return {
      accountId,
      i105AccountId: i105AccountId || accountId,
      i105DefaultAccountId: trimString(derived.i105DefaultAccountId),
    };
  } catch (_error) {
    return null;
  }
};

const resolveAccountIdLiteral = (
  user: Partial<UserProfile> & Record<string, unknown>,
  networkPrefix: number,
  derivedAccountId?: string | null,
): string => {
  const accountId = normalizeAccountIdLiteralForNetwork(
    user.accountId,
    networkPrefix,
  );
  return derivedAccountId || accountId;
};

const resolveVisibleI105AccountId = (
  user: Partial<UserProfile> & Record<string, unknown>,
  accountId: string,
  networkPrefix: number,
  derivedI105AccountId?: string | null,
): string => {
  if (derivedI105AccountId) {
    return derivedI105AccountId;
  }
  const storedI105AccountId = normalizeAccountIdLiteralForNetwork(
    user.i105AccountId,
    networkPrefix,
  );
  if (isCanonicalAccountCandidate(storedI105AccountId)) {
    return storedI105AccountId;
  }
  const storedDefaultI105AccountId = normalizeAccountIdLiteralForNetwork(
    user.i105DefaultAccountId,
    networkPrefix,
  );
  if (isCanonicalAccountCandidate(storedDefaultI105AccountId)) {
    return storedDefaultI105AccountId;
  }
  return normalizeAccountIdLiteralForNetwork(accountId, networkPrefix);
};

const normalizeUser = (
  user: Partial<UserProfile> & Record<string, unknown>,
  networkPrefix: number,
): UserProfile => {
  assertNoPrivateKeyField(user, "Session account");
  const normalized = { ...defaultUser(), ...user };
  const derivedAccountAddresses = deriveAccountAddressesFromProfile(
    normalized,
    networkPrefix,
  );
  const resolvedAccountId = resolveAccountIdLiteral(
    normalized,
    networkPrefix,
    derivedAccountAddresses?.accountId,
  );
  if (!resolvedAccountId) {
    throw new TypeError(
      "Account ID must be a canonical I105 literal for the active network.",
    );
  }
  const publicKeyHex = normalizeRuntimeText(
    normalized.publicKeyHex,
    "Account public key",
    { maxLength: 16_384 },
  );
  if (!/^(?:[0-9a-f]{2})+$/u.test(publicKeyHex)) {
    throw new TypeError("Account public key must be canonical lowercase hex.");
  }
  return {
    displayName: normalizeRuntimeText(
      normalized.displayName,
      "Account display name",
      { allowEmpty: true, maxLength: 256 },
    ),
    domain: normalizeDomainLabel(normalized.domain),
    accountId: resolvedAccountId,
    i105AccountId: resolveVisibleI105AccountId(
      normalized,
      resolvedAccountId,
      networkPrefix,
      derivedAccountAddresses?.i105AccountId,
    ),
    i105DefaultAccountId:
      derivedAccountAddresses?.i105DefaultAccountId ||
      trimString(normalized.i105DefaultAccountId),
    publicKeyHex,
    signingAlgorithm: normalizeStoredSigningAlgorithm(
      normalized.signingAlgorithm,
    ),
    hasStoredSecret: requireRuntimeBoolean(
      normalized.hasStoredSecret,
      "Account secret flag",
    ),
    localOnly: requireRuntimeBoolean(
      normalized.localOnly,
      "Account local-only flag",
    ),
  };
};

const normalizeAuthority = (
  authority: Partial<AuthorityProfile> & Record<string, unknown>,
  networkPrefix: number,
): AuthorityProfile => {
  assertNoPrivateKeyField(authority, "Session authority");
  const accountIdInput = normalizeRuntimeText(
    authority.accountId,
    "Authority account ID",
    { allowEmpty: true, maxLength: 1_024 },
  );
  const accountId = normalizeAccountIdLiteralForNetwork(
    accountIdInput,
    networkPrefix,
  );
  if (accountIdInput && !accountId) {
    throw new TypeError(
      "Authority account ID must target the active network prefix.",
    );
  }
  return {
    accountId,
    signingAlgorithm: normalizeStoredSigningAlgorithm(
      authority.signingAlgorithm,
    ),
    hasStoredSecret: requireRuntimeBoolean(
      authority.hasStoredSecret,
      "Authority secret flag",
    ),
  };
};

const resolvePresetConnectionForEndpoint = (
  toriiUrl: unknown,
): ConnectionConfig | null => {
  try {
    if (typeof toriiUrl !== "string") {
      return null;
    }
    const normalizedEndpoint = normalizeEndpointUrl(toriiUrl);
    return (
      CHAIN_PRESETS.find(
        (preset) =>
          normalizeEndpointUrl(preset.connection.toriiUrl) ===
          normalizedEndpoint,
      )?.connection ?? null
    );
  } catch (_error) {
    return null;
  }
};

const normalizeConnection = (
  partial: Partial<ConnectionConfig>,
): ConnectionConfig => {
  const rawToriiUrl = trimString(partial.toriiUrl);
  if (!rawToriiUrl) {
    throw new Error("Saved connection is missing its Torii endpoint.");
  }
  const toriiUrl = normalizeEndpointUrl(rawToriiUrl);
  const normalizedChainId = normalizeChainIdValue(partial?.chainId);
  const normalizedNetworkPrefix = normalizeNetworkPrefixValue(
    partial?.networkPrefix,
  );
  if (!normalizedChainId || normalizedNetworkPrefix === null) {
    throw new Error(
      "Connection requires a canonical chain ID and integer network prefix.",
    );
  }
  const chainId = normalizedChainId;
  const networkPrefix = normalizedNetworkPrefix;
  const hasExplicitAssetDefinitionId = Object.prototype.hasOwnProperty.call(
    partial,
    "assetDefinitionId",
  );
  const rawAssetDefinitionId = hasExplicitAssetDefinitionId
    ? partial.assetDefinitionId
    : "";
  if (
    typeof rawAssetDefinitionId !== "string" ||
    (rawAssetDefinitionId.length > 0 &&
      !isCanonicalAssetDefinitionId(rawAssetDefinitionId))
  ) {
    throw new TypeError(
      "Asset definition ID must be empty or an exact canonical Base58 ID.",
    );
  }
  const assetDefinitionId = rawAssetDefinitionId;
  return {
    toriiUrl,
    chainId,
    networkPrefix,
    assetDefinitionId,
  };
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
) => {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} contains missing or unknown fields.`);
  }
};

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
};

const readCanonicalText = (
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {},
): string => {
  const maxLength = options.maxLength ?? 2_048;
  const containsUnsafeCharacter =
    typeof value === "string" &&
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value);
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    (!options.allowEmpty && value.length === 0) ||
    value.length > maxLength ||
    containsUnsafeCharacter
  ) {
    throw new TypeError(`${label} must be canonical text.`);
  }
  return value;
};

const readBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
  return value;
};

const readSigningAlgorithm = (value: unknown, label: string): string => {
  const algorithm = readCanonicalText(value, label, { maxLength: 128 });
  if (normalizeStoredSigningAlgorithm(algorithm) !== algorithm) {
    throw new TypeError(`${label} must be a canonical signing algorithm.`);
  }
  return algorithm;
};

const readAccountId = (
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean; networkPrefix?: number } = {},
): string => {
  const accountId = readCanonicalText(value, label, {
    allowEmpty: options.allowEmpty,
    maxLength: 1_024,
  });
  if (accountId.includes("@")) {
    throw new TypeError(`${label} uses an unsupported legacy account ID.`);
  }
  if (accountId && options.networkPrefix !== undefined) {
    try {
      if (
        window.iroha.validateCanonicalAccountId({
          accountId,
          networkPrefix: options.networkPrefix,
        }) !== accountId
      ) {
        throw new Error("noncanonical account ID");
      }
    } catch {
      throw new TypeError(
        `${label} must be an exact canonical I105 account ID for the saved network.`,
      );
    }
  }
  return accountId;
};

const parsePersistedConnection = (value: unknown): ConnectionConfig => {
  const connection = readRecord(value, "Saved session connection");
  assertExactKeys(
    connection,
    ["toriiUrl", "chainId", "assetDefinitionId", "networkPrefix"],
    "Saved session connection",
  );
  const toriiUrl = readCanonicalText(
    connection.toriiUrl,
    "Saved session Torii endpoint",
  );
  if (normalizeEndpointUrl(toriiUrl) !== toriiUrl) {
    throw new TypeError("Saved session Torii endpoint must be canonical.");
  }
  const chainId = readCanonicalText(
    connection.chainId,
    "Saved session chain ID",
    { maxLength: 256 },
  );
  if (normalizeChainIdValue(chainId) !== chainId) {
    throw new TypeError("Saved session chain ID must be canonical text.");
  }
  const assetDefinitionId = readCanonicalText(
    connection.assetDefinitionId,
    "Saved session asset definition ID",
    { allowEmpty: true },
  );
  if (assetDefinitionId && !isCanonicalAssetDefinitionId(assetDefinitionId)) {
    throw new TypeError(
      "Saved session asset definition ID must be an exact canonical Base58 ID.",
    );
  }
  if (
    typeof connection.networkPrefix !== "number" ||
    normalizeNetworkPrefixValue(connection.networkPrefix) !==
      connection.networkPrefix
  ) {
    throw new TypeError(
      "Saved session network prefix must be an integer between 0 and 16383.",
    );
  }
  return {
    toriiUrl,
    chainId,
    assetDefinitionId,
    networkPrefix: connection.networkPrefix,
  };
};

const parsePersistedAuthority = (
  value: unknown,
  networkPrefix: number,
): PersistedPublicSession["authority"] => {
  const authority = readRecord(value, "Saved session authority");
  assertExactKeys(
    authority,
    ["accountId", "signingAlgorithm", "hasStoredSecret"],
    "Saved session authority",
  );
  return {
    accountId: readAccountId(
      authority.accountId,
      "Saved session authority account ID",
      { allowEmpty: true, networkPrefix },
    ),
    signingAlgorithm: readSigningAlgorithm(
      authority.signingAlgorithm,
      "Saved session authority signing algorithm",
    ),
    hasStoredSecret: readBoolean(
      authority.hasStoredSecret,
      "Saved session authority secret flag",
    ),
  };
};

const parsePersistedAccount = (
  value: unknown,
  index: number,
  networkPrefix: number,
): PersistedPublicAccount => {
  const label = `Saved session account ${index}`;
  const account = readRecord(value, label);
  assertExactKeys(
    account,
    [
      "displayName",
      "domain",
      "accountId",
      "publicKeyHex",
      "signingAlgorithm",
      "hasStoredSecret",
      "localOnly",
    ],
    label,
  );
  const accountId = readAccountId(account.accountId, `${label} account ID`, {
    networkPrefix,
  });
  if (
    normalizeAccountIdLiteralForNetwork(accountId, networkPrefix) !== accountId
  ) {
    throw new TypeError(
      `${label} account ID must target the saved connection network prefix.`,
    );
  }
  const publicKeyHex = readCanonicalText(
    account.publicKeyHex,
    `${label} public key`,
    { maxLength: 16_384 },
  );
  const signingAlgorithm = readSigningAlgorithm(
    account.signingAlgorithm,
    `${label} signing algorithm`,
  );
  if (!/^(?:[0-9a-f]{2})+$/u.test(publicKeyHex)) {
    throw new TypeError(`${label} public key must be canonical lowercase hex.`);
  }
  let expectedAccountId: string;
  try {
    expectedAccountId = window.iroha.deriveAccountAddress({
      domain: "",
      publicKeyHex,
      signingAlgorithm,
      networkPrefix,
    }).accountId;
  } catch {
    throw new TypeError(
      `${label} public identity is invalid for its signing algorithm.`,
    );
  }
  if (expectedAccountId !== accountId) {
    throw new TypeError(
      `${label} account ID does not match its public key and signing algorithm.`,
    );
  }
  return {
    displayName: readCanonicalText(
      account.displayName,
      `${label} display name`,
      {
        allowEmpty: true,
        maxLength: 256,
      },
    ),
    domain: readCanonicalText(account.domain, `${label} domain`, {
      maxLength: 256,
    }),
    accountId,
    publicKeyHex,
    signingAlgorithm,
    hasStoredSecret: readBoolean(
      account.hasStoredSecret,
      `${label} secret flag`,
    ),
    localOnly: readBoolean(account.localOnly, `${label} local-only flag`),
  };
};

const parsePersistedSession = (raw: string): PersistedPublicSession => {
  if (raw.length > MAX_PERSISTED_SESSION_LENGTH) {
    throw new TypeError("Saved session exceeds the supported size.");
  }
  const payload = readRecord(
    parseJsonWithoutDuplicateObjectKeys(raw, "Saved session"),
    "Saved session",
  );
  assertExactKeys(
    payload,
    [
      "schema",
      "version",
      "connection",
      "authority",
      "accounts",
      "activeAccountId",
    ],
    "Saved session",
  );
  if (
    payload.schema !== SESSION_SCHEMA ||
    payload.version !== SESSION_VERSION
  ) {
    throw new TypeError("Saved session schema or version is unsupported.");
  }
  if (
    !Array.isArray(payload.accounts) ||
    payload.accounts.length > MAX_SESSION_ACCOUNTS
  ) {
    throw new TypeError(
      "Saved session accounts must be an array of at most 128 entries.",
    );
  }
  const connection = parsePersistedConnection(payload.connection);
  const accounts = payload.accounts.map((account, index) =>
    parsePersistedAccount(account, index, connection.networkPrefix),
  );
  const authority = parsePersistedAuthority(
    payload.authority,
    connection.networkPrefix,
  );
  if (
    authority.accountId &&
    normalizeAccountIdLiteralForNetwork(
      authority.accountId,
      connection.networkPrefix,
    ) !== authority.accountId
  ) {
    throw new TypeError(
      "Saved session authority account ID must target the saved connection network prefix.",
    );
  }
  const accountIds = new Set(accounts.map((account) => account.accountId));
  if (accountIds.size !== accounts.length) {
    throw new TypeError("Saved session account IDs must be unique.");
  }
  const activeAccountId =
    payload.activeAccountId === null
      ? null
      : readAccountId(
          payload.activeAccountId,
          "Saved session active account ID",
          { networkPrefix: connection.networkPrefix },
        );
  if (
    (accounts.length === 0 && activeAccountId !== null) ||
    (accounts.length > 0 &&
      (activeAccountId === null || !accountIds.has(activeAccountId)))
  ) {
    throw new TypeError(
      "Saved session active account ID must select exactly one saved account.",
    );
  }
  return {
    schema: SESSION_SCHEMA,
    version: SESSION_VERSION,
    connection,
    authority,
    accounts,
    activeAccountId,
  };
};

const persistedSessionFromState = (state: SessionState): unknown => ({
  schema: SESSION_SCHEMA,
  version: SESSION_VERSION,
  connection: {
    toriiUrl: state.connection.toriiUrl,
    chainId: state.connection.chainId,
    assetDefinitionId: state.connection.assetDefinitionId,
    networkPrefix: state.connection.networkPrefix,
  },
  authority: {
    accountId: state.authority.accountId,
    signingAlgorithm: state.authority.signingAlgorithm,
    hasStoredSecret: state.authority.hasStoredSecret,
  },
  accounts: state.accounts.map((account) => ({
    displayName: account.displayName,
    domain: account.domain,
    accountId: account.accountId,
    publicKeyHex: account.publicKeyHex,
    signingAlgorithm: account.signingAlgorithm,
    hasStoredSecret: account.hasStoredSecret,
    localOnly: account.localOnly,
  })),
  activeAccountId: state.activeAccountId,
});

const serializeSessionState = (state: SessionState): string => {
  const payload = persistedSessionFromState(state);
  return JSON.stringify(parsePersistedSession(JSON.stringify(payload)));
};

const normalizeSessionNetworkPrefix = (value: unknown): number | null => {
  return normalizeNetworkPrefixValue(value);
};

const normalizeAccounts = (
  payload: Pick<SessionState, "accounts" | "activeAccountId">,
  options?: { networkPrefix?: number },
): Pick<SessionState, "accounts" | "activeAccountId"> & {
  accountIdMap: Map<string, string>;
} => {
  if (payload.accounts.length > MAX_SESSION_ACCOUNTS) {
    throw new TypeError(
      `Session accounts must contain at most ${MAX_SESSION_ACCOUNTS} entries.`,
    );
  }
  const accountIdMap = new Map<string, string>();
  const requestedNetworkPrefix =
    options?.networkPrefix ?? DEFAULT_CHAIN_PRESET.connection.networkPrefix;
  const connectionNetworkPrefix = normalizeSessionNetworkPrefix(
    requestedNetworkPrefix,
  );
  if (connectionNetworkPrefix === null) {
    throw new TypeError(
      "Session network prefix must be an integer between 0 and 16383.",
    );
  }

  const normalizeCollection = (
    entries: Array<Partial<UserProfile> & Record<string, unknown>>,
    activeAccountId: string | null,
  ) => {
    const dedupeIndexByKey = new Map<string, number>();
    const orderedAccounts: UserProfile[] = [];
    entries.forEach((account, index) => {
      const originalAccountId = trimString(account.accountId);
      const normalized = normalizeUser(account, connectionNetworkPrefix);
      if (originalAccountId && originalAccountId !== normalized.accountId) {
        accountIdMap.set(originalAccountId, normalized.accountId);
      }
      const dedupeKey = normalized.accountId || `__empty-${index}`;
      const existingIndex = dedupeIndexByKey.get(dedupeKey);
      if (existingIndex !== undefined) {
        throw new TypeError(
          "Session account IDs must remain unique after a network change.",
        );
      }
      dedupeIndexByKey.set(dedupeKey, orderedAccounts.length);
      orderedAccounts.push(normalized);
    });

    const rawActiveAccountId = trimString(activeAccountId);
    const mappedActiveAccountId = rawActiveAccountId
      ? (accountIdMap.get(rawActiveAccountId) ?? rawActiveAccountId)
      : "";
    const resolvedActiveAccountId =
      mappedActiveAccountId &&
      orderedAccounts.some(
        (account) => account.accountId === mappedActiveAccountId,
      )
        ? mappedActiveAccountId
        : null;

    return {
      accounts: orderedAccounts,
      activeAccountId: resolvedActiveAccountId,
    };
  };

  if (payload.accounts.length) {
    return {
      ...normalizeCollection(payload.accounts, payload.activeAccountId ?? null),
      accountIdMap,
    };
  }

  return { accounts: [], activeAccountId: null, accountIdMap };
};

export const useSessionStore = defineStore("session", {
  state: defaultState,
  getters: {
    hasAccount: (state) => {
      const active =
        state.accounts.find(
          (account) => account.accountId === state.activeAccountId,
        ) ?? null;
      return Boolean(active?.accountId && active?.hasStoredSecret);
    },
    activeAccount: (state) =>
      state.accounts.find(
        (account) => account.accountId === state.activeAccountId,
      ) ?? null,
  },
  actions: {
    async hydrate() {
      if (this.hydrated) {
        return;
      }
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = parsePersistedSession(raw);
          this.$patch({
            connection: parsed.connection,
            authority: parsed.authority,
            accounts: parsed.accounts.map((account) => ({
              ...account,
              i105AccountId: account.accountId,
              i105DefaultAccountId: "",
            })),
            activeAccountId: parsed.activeAccountId,
            hydrated: true,
          });
          await this.syncStoredSecrets();
          return;
        } catch (error) {
          console.warn("Failed to parse saved session", error);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
      this.hydrated = true;
      await this.syncStoredSecrets();
    },
    persistState(snapshot?: SessionState) {
      const payload = serializeSessionState(snapshot ?? this.$state);
      localStorage.setItem(SESSION_STORAGE_KEY, payload);
    },
    reset() {
      const fresh = defaultState();
      this.$patch(fresh);
      this.persistState();
    },
    updateConnection(partial: Partial<ConnectionConfig>) {
      const definedPartial = readRuntimeUpdate(
        partial,
        ["toriiUrl", "chainId", "assetDefinitionId", "networkPrefix"],
        "Connection update",
      ) as Partial<ConnectionConfig>;
      const presetConnection =
        definedPartial.toriiUrl !== undefined
          ? resolvePresetConnectionForEndpoint(definedPartial.toriiUrl)
          : null;
      const presetConnectionOverlay = presetConnection
        ? { ...presetConnection }
        : null;
      const nextConnection = normalizeConnection({
        ...this.connection,
        ...(presetConnectionOverlay ?? {}),
        ...definedPartial,
      });

      if (nextConnection.networkPrefix === this.connection.networkPrefix) {
        this.connection = nextConnection;
        return;
      }

      const normalizedAccounts = normalizeAccounts(
        {
          accounts: this.accounts,
          activeAccountId: this.activeAccountId,
        },
        { networkPrefix: nextConnection.networkPrefix },
      );
      const rawAuthorityAccountId = trimString(this.authority.accountId);
      const nextAuthorityAccountId = rawAuthorityAccountId
        ? (normalizedAccounts.accountIdMap.get(rawAuthorityAccountId) ??
          normalizeAccountIdLiteralForNetwork(
            rawAuthorityAccountId,
            nextConnection.networkPrefix,
          ))
        : "";

      this.$patch({
        connection: nextConnection,
        authority: {
          ...this.authority,
          accountId: nextAuthorityAccountId,
        },
        accounts: normalizedAccounts.accounts,
        activeAccountId: normalizedAccounts.activeAccountId,
      });
    },
    updateAuthority(partial: Partial<AuthorityProfile>) {
      assertNoPrivateKeyField(
        partial as Record<string, unknown>,
        "Session authority",
      );
      const exactPartial = readRuntimeUpdate(
        partial,
        ["accountId", "signingAlgorithm", "hasStoredSecret"],
        "Authority update",
      );
      this.authority = normalizeAuthority(
        { ...this.authority, ...exactPartial },
        this.connection.networkPrefix,
      );
    },
    addAccount(account: Partial<UserProfile> & Record<string, unknown>) {
      assertNoPrivateKeyField(account, "Session account");
      const exactAccount = readRuntimeUpdate(
        account,
        [
          "displayName",
          "domain",
          "accountId",
          "i105AccountId",
          "i105DefaultAccountId",
          "publicKeyHex",
          "signingAlgorithm",
          "hasStoredSecret",
          "localOnly",
        ],
        "Account update",
      );
      const normalized = normalizeUser(
        exactAccount,
        this.connection.networkPrefix,
      );
      const existingIndex = this.accounts.findIndex(
        (item) => item.accountId === normalized.accountId,
      );
      if (existingIndex >= 0) {
        this.accounts.splice(existingIndex, 1, {
          ...this.accounts[existingIndex],
          ...normalized,
        });
      } else {
        if (this.accounts.length >= MAX_SESSION_ACCOUNTS) {
          throw new TypeError(
            `Session accounts must contain at most ${MAX_SESSION_ACCOUNTS} entries.`,
          );
        }
        this.accounts.push(normalized);
      }
      this.activeAccountId = normalized.accountId;
    },
    async syncStoredSecrets() {
      if (typeof window === "undefined" || !window.iroha) {
        return;
      }

      let vaultAvailable = false;
      try {
        vaultAvailable = await window.iroha.isSecureVaultAvailable();
      } catch (_error) {
        vaultAvailable = false;
      }

      const accounts = [...this.accounts];
      const flags = vaultAvailable
        ? await window.iroha
            .listAccountSecretFlags({
              accountIds: accounts.map((account) => account.accountId),
              networkPrefix: this.connection.networkPrefix,
            })
            .catch(() => ({}) as Record<string, boolean>)
        : {};
      const authorityFlags =
        vaultAvailable && this.authority.accountId
          ? await window.iroha
              .listAccountSecretFlags({
                accountIds: [this.authority.accountId],
                networkPrefix: this.connection.networkPrefix,
              })
              .catch(() => ({}) as Record<string, boolean>)
          : {};

      this.$patch({
        authority: {
          ...this.authority,
          hasStoredSecret: this.authority.accountId
            ? Boolean(authorityFlags[this.authority.accountId])
            : false,
        },
        accounts: accounts.map((account) => ({
          ...account,
          hasStoredSecret: vaultAvailable
            ? Boolean(flags[account.accountId])
            : false,
        })),
      });
      this.persistState();
    },
    setActiveAccount(accountId: string) {
      const exists = this.accounts.some(
        (account) => account.accountId === accountId,
      );
      if (exists) {
        this.activeAccountId = accountId;
      }
    },
    updateActiveAccount(
      partial: Partial<UserProfile> & Record<string, unknown>,
    ) {
      assertNoPrivateKeyField(partial, "Session account");
      const exactPartial = readRuntimeUpdate(
        partial,
        [
          "displayName",
          "domain",
          "accountId",
          "i105AccountId",
          "i105DefaultAccountId",
          "publicKeyHex",
          "signingAlgorithm",
          "hasStoredSecret",
          "localOnly",
        ],
        "Account update",
      );
      if (!this.activeAccountId && exactPartial.accountId) {
        this.addAccount(exactPartial);
        return;
      }
      const index = this.accounts.findIndex(
        (account) => account.accountId === this.activeAccountId,
      );
      if (index === -1) {
        return;
      }
      const normalized = normalizeUser(
        { ...this.accounts[index], ...exactPartial },
        this.connection.networkPrefix,
      );
      this.accounts.splice(index, 1, normalized);
      this.activeAccountId = normalized.accountId;
    },
    useChainProfile(connection: Partial<ConnectionConfig>) {
      this.updateConnection(connection);
    },
  },
});
