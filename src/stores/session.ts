import { defineStore } from "pinia";
import { CHAIN_PRESETS, DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import {
  normalizeChainIdValue,
  normalizeNetworkPrefixValue,
} from "@/utils/chainMetadata";
import { normalizeAccountIdLiteralForNetwork } from "@/utils/accountId";
import { normalizeEndpointUrl } from "@/utils/endpoint";

export const SESSION_STORAGE_KEY = "iroha-demo:session";

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
  privateKeyHex?: string;
  hasStoredSecret?: boolean;
  localOnly: boolean;
};

export type AuthorityProfile = {
  accountId: string;
  privateKeyHex?: string;
  hasStoredSecret?: boolean;
};

export type SessionState = {
  hydrated: boolean;
  connection: ConnectionConfig;
  authority: AuthorityProfile;
  accounts: UserProfile[];
  activeAccountId: string | null;
  customChains: SavedChain[];
};

export type SavedChain = ConnectionConfig & {
  id: string;
  label: string;
};

const DEFAULT_DOMAIN_LABEL = "default";
const LEGACY_EXAMPLE_DOMAIN_LABEL = "wonderland";
const defaultUser = (): UserProfile => ({
  displayName: "",
  domain: DEFAULT_DOMAIN_LABEL,
  accountId: "",
  i105AccountId: "",
  i105DefaultAccountId: "",
  publicKeyHex: "",
  privateKeyHex: "",
  hasStoredSecret: false,
  localOnly: false,
});

const defaultState = (): SessionState => ({
  hydrated: false,
  connection: { ...DEFAULT_CHAIN_PRESET.connection },
  authority: {
    accountId: "",
    privateKeyHex: "",
    hasStoredSecret: false,
  },
  accounts: [],
  activeAccountId: null,
  customChains: [],
});

const trimString = (value: unknown): string => String(value ?? "").trim();

const readLegacyProfileField = (
  profile: Record<string, unknown>,
  key: string,
): string => trimString(profile[key]);

const isLegacyAccountLiteral = (value: string): boolean =>
  trimString(value).includes("@");

const isCanonicalAccountCandidate = (value: string): boolean => {
  const literal = trimString(value);
  return literal.length >= 16 && !isLegacyAccountLiteral(literal);
};

const normalizeDomainLabel = (domain: string, accountId: string): string => {
  const normalized = trimString(domain);
  if (!normalized) {
    return DEFAULT_DOMAIN_LABEL;
  }
  if (
    normalized === LEGACY_EXAMPLE_DOMAIN_LABEL &&
    (!accountId || !isLegacyAccountLiteral(accountId))
  ) {
    return DEFAULT_DOMAIN_LABEL;
  }
  return normalized;
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
      networkPrefix,
    });
    const accountId = trimString(derived.accountId);
    const i105AccountId = trimString(derived.i105AccountId);
    if (!accountId || isLegacyAccountLiteral(accountId)) {
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
  if (derivedAccountId && accountId && !isLegacyAccountLiteral(accountId)) {
    return derivedAccountId;
  }
  if (!isLegacyAccountLiteral(accountId)) {
    return accountId;
  }
  if (derivedAccountId) {
    return derivedAccountId;
  }
  const migratedCandidate = [
    readLegacyProfileField(user, "i105"),
    readLegacyProfileField(user, "ih58"),
    readLegacyProfileField(user, "compressed"),
  ]
    .map((value) => normalizeAccountIdLiteralForNetwork(value, networkPrefix))
    .find(isCanonicalAccountCandidate);
  return migratedCandidate ?? accountId;
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
  options?: { networkPrefix?: number },
): UserProfile => {
  const normalized = { ...defaultUser(), ...user };
  const networkPrefix =
    options?.networkPrefix ?? DEFAULT_CHAIN_PRESET.connection.networkPrefix;
  const derivedAccountAddresses = deriveAccountAddressesFromProfile(
    normalized,
    networkPrefix,
  );
  const resolvedAccountId = resolveAccountIdLiteral(
    normalized,
    networkPrefix,
    derivedAccountAddresses?.accountId,
  );
  return {
    displayName: trimString(normalized.displayName),
    domain: normalizeDomainLabel(normalized.domain, resolvedAccountId),
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
    publicKeyHex: trimString(normalized.publicKeyHex),
    privateKeyHex: trimString(normalized.privateKeyHex),
    hasStoredSecret: Boolean(normalized.hasStoredSecret),
    localOnly: Boolean(normalized.localOnly),
  };
};

const normalizeAuthority = (
  authority: Partial<AuthorityProfile> & Record<string, unknown>,
  options?: { networkPrefix?: number },
): AuthorityProfile => ({
  accountId: normalizeAccountIdLiteralForNetwork(
    authority.accountId,
    options?.networkPrefix ?? DEFAULT_CHAIN_PRESET.connection.networkPrefix,
  ),
  privateKeyHex: trimString(authority.privateKeyHex),
  hasStoredSecret: Boolean(authority.hasStoredSecret),
});

const resolvePresetConnectionForEndpoint = (
  toriiUrl: unknown,
): ConnectionConfig | null => {
  try {
    const normalizedEndpoint = normalizeEndpointUrl(String(toriiUrl ?? ""));
    const presets = [DEFAULT_CHAIN_PRESET, ...CHAIN_PRESETS];
    return (
      presets.find(
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
  partial?: Partial<ConnectionConfig>,
  options?: { preferPresetMetadata?: boolean },
): ConnectionConfig => {
  let toriiUrl = DEFAULT_CHAIN_PRESET.connection.toriiUrl;
  let endpointValid = true;
  try {
    toriiUrl = normalizeEndpointUrl(
      String(partial?.toriiUrl ?? DEFAULT_CHAIN_PRESET.connection.toriiUrl),
    );
  } catch (_error) {
    endpointValid = false;
  }
  const endpointPresetConnection = endpointValid
    ? resolvePresetConnectionForEndpoint(toriiUrl)
    : null;
  const fallbackConnection =
    endpointPresetConnection ?? DEFAULT_CHAIN_PRESET.connection;
  const normalizedChainId = normalizeChainIdValue(partial?.chainId);
  const normalizedNetworkPrefix = normalizeNetworkPrefixValue(
    partial?.networkPrefix,
  );
  const preferredChainId = options?.preferPresetMetadata
    ? (endpointPresetConnection?.chainId ?? normalizedChainId)
    : (normalizedChainId ?? endpointPresetConnection?.chainId);
  const preferredNetworkPrefix = options?.preferPresetMetadata
    ? (endpointPresetConnection?.networkPrefix ?? normalizedNetworkPrefix)
    : (normalizedNetworkPrefix ?? endpointPresetConnection?.networkPrefix);
  const chainId = endpointValid
    ? (preferredChainId ?? fallbackConnection.chainId)
    : fallbackConnection.chainId;
  const networkPrefix = endpointValid
    ? (preferredNetworkPrefix ?? fallbackConnection.networkPrefix)
    : fallbackConnection.networkPrefix;
  const assetDefinitionId = String(
    endpointValid
      ? (partial?.assetDefinitionId ?? fallbackConnection.assetDefinitionId)
      : fallbackConnection.assetDefinitionId,
  ).trim();
  return {
    ...fallbackConnection,
    toriiUrl,
    chainId,
    networkPrefix,
    assetDefinitionId:
      assetDefinitionId || fallbackConnection.assetDefinitionId,
  };
};

const serializeSessionState = (state: SessionState) =>
  JSON.stringify({
    ...state,
    authority: {
      ...state.authority,
      privateKeyHex: "",
    },
    accounts: state.accounts.map((account) => ({
      ...account,
      privateKeyHex: "",
    })),
  });

const normalizeSessionNetworkPrefix = (value: unknown): number | null => {
  return normalizeNetworkPrefixValue(value);
};

const normalizeAccounts = (
  payload: Partial<SessionState> & { user?: UserProfile },
  options?: { networkPrefix?: number },
): Pick<SessionState, "accounts" | "activeAccountId"> & {
  accountIdMap: Map<string, string>;
} => {
  const accountIdMap = new Map<string, string>();
  const connectionNetworkPrefix =
    normalizeSessionNetworkPrefix(options?.networkPrefix) ??
    normalizeConnection(payload.connection).networkPrefix;

  const normalizeCollection = (
    entries: Array<Partial<UserProfile> & Record<string, unknown>>,
    activeAccountId: string | null,
  ) => {
    const dedupeIndexByKey = new Map<string, number>();
    const orderedAccounts: UserProfile[] = [];
    entries.forEach((account, index) => {
      const originalAccountId = trimString(account.accountId);
      const normalized = normalizeUser(account, {
        networkPrefix: connectionNetworkPrefix,
      });
      if (originalAccountId && originalAccountId !== normalized.accountId) {
        accountIdMap.set(originalAccountId, normalized.accountId);
      }
      const dedupeKey = normalized.accountId || `__empty-${index}`;
      const existingIndex = dedupeIndexByKey.get(dedupeKey);
      if (existingIndex !== undefined) {
        orderedAccounts[existingIndex] = {
          ...orderedAccounts[existingIndex],
          ...normalized,
        };
        return;
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
        : (orderedAccounts[0]?.accountId ?? null);

    return {
      accounts: orderedAccounts,
      activeAccountId: resolvedActiveAccountId,
    };
  };

  if (Array.isArray(payload.accounts) && payload.accounts.length) {
    return {
      ...normalizeCollection(payload.accounts, payload.activeAccountId ?? null),
      accountIdMap,
    };
  }

  if (payload.user?.accountId) {
    return {
      ...normalizeCollection([payload.user], payload.user.accountId),
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
          const parsed = JSON.parse(raw);
          const normalizedConnection = normalizeConnection(parsed.connection, {
            preferPresetMetadata: true,
          });
          const normalizedAccounts = normalizeAccounts(parsed, {
            networkPrefix: normalizedConnection.networkPrefix,
          });
          const base = defaultState();
          const authority = normalizeAuthority(
            {
              ...base.authority,
              ...(parsed.authority ?? {}),
            },
            {
              networkPrefix: normalizedConnection.networkPrefix,
            },
          );
          const rawAuthorityAccountId = trimString(authority.accountId);
          const migratedAuthorityAccountId = rawAuthorityAccountId
            ? (normalizedAccounts.accountIdMap.get(rawAuthorityAccountId) ??
              rawAuthorityAccountId)
            : "";
          this.$patch({
            ...base,
            connection: normalizedConnection,
            authority: {
              ...base.authority,
              ...authority,
              accountId: migratedAuthorityAccountId,
            },
            accounts: normalizedAccounts.accounts,
            activeAccountId: normalizedAccounts.activeAccountId,
            hydrated: true,
            customChains: [],
          });
          if (!this.activeAccountId && this.accounts[0]) {
            this.activeAccountId = this.accounts[0].accountId;
          }
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
      const definedPartial = Object.fromEntries(
        Object.entries(partial).filter(([, value]) => value !== undefined),
      ) as Partial<ConnectionConfig>;
      const presetConnection =
        definedPartial.toriiUrl !== undefined &&
        definedPartial.chainId === undefined &&
        definedPartial.networkPrefix === undefined
          ? resolvePresetConnectionForEndpoint(definedPartial.toriiUrl)
          : null;
      const nextConnection = normalizeConnection({
        ...this.connection,
        ...(presetConnection ?? {}),
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
      const migratedAuthorityAccountId = rawAuthorityAccountId
        ? (normalizedAccounts.accountIdMap.get(rawAuthorityAccountId) ??
          rawAuthorityAccountId)
        : "";

      this.$patch({
        connection: nextConnection,
        authority: {
          ...this.authority,
          accountId: migratedAuthorityAccountId,
        },
        accounts: normalizedAccounts.accounts,
        activeAccountId: normalizedAccounts.activeAccountId,
      });
    },
    syncChainNetworkPrefix(networkPrefix: number) {
      const normalizedPrefix = normalizeSessionNetworkPrefix(networkPrefix);
      if (
        normalizedPrefix === null ||
        normalizedPrefix === this.connection.networkPrefix
      ) {
        return false;
      }

      const normalizedAccounts = normalizeAccounts(
        {
          accounts: this.accounts,
          activeAccountId: this.activeAccountId,
        },
        { networkPrefix: normalizedPrefix },
      );
      const rawAuthorityAccountId = trimString(this.authority.accountId);
      const migratedAuthorityAccountId = rawAuthorityAccountId
        ? (normalizedAccounts.accountIdMap.get(rawAuthorityAccountId) ??
          rawAuthorityAccountId)
        : "";

      this.$patch({
        connection: {
          ...this.connection,
          networkPrefix: normalizedPrefix,
        },
        authority: {
          ...this.authority,
          accountId: migratedAuthorityAccountId,
        },
        accounts: normalizedAccounts.accounts,
        activeAccountId: normalizedAccounts.activeAccountId,
      });
      return true;
    },
    updateAuthority(partial: Partial<AuthorityProfile>) {
      this.authority = normalizeAuthority(
        { ...this.authority, ...partial },
        { networkPrefix: this.connection.networkPrefix },
      );
    },
    addAccount(account: UserProfile) {
      const normalized = normalizeUser(account, {
        networkPrefix: this.connection.networkPrefix,
      });
      const existingIndex = this.accounts.findIndex(
        (item) => item.accountId === normalized.accountId,
      );
      if (existingIndex >= 0) {
        this.accounts.splice(existingIndex, 1, {
          ...this.accounts[existingIndex],
          ...normalized,
        });
      } else {
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
            })
            .catch(() => ({}) as Record<string, boolean>)
        : {};
      const authorityFlags =
        vaultAvailable && this.authority.accountId
          ? await window.iroha
              .listAccountSecretFlags({
                accountIds: [this.authority.accountId],
              })
              .catch(() => ({}) as Record<string, boolean>)
          : {};

      this.$patch({
        authority: {
          ...this.authority,
          privateKeyHex: "",
          hasStoredSecret: this.authority.accountId
            ? Boolean(authorityFlags[this.authority.accountId])
            : false,
        },
        accounts: accounts.map((account) => ({
          ...account,
          privateKeyHex: "",
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
      if (!this.activeAccountId && partial.accountId) {
        this.addAccount(
          normalizeUser(partial, {
            networkPrefix: this.connection.networkPrefix,
          }),
        );
        return;
      }
      const index = this.accounts.findIndex(
        (account) => account.accountId === this.activeAccountId,
      );
      if (index === -1) {
        return;
      }
      const normalized = normalizeUser(
        { ...this.accounts[index], ...partial },
        {
          networkPrefix: this.connection.networkPrefix,
        },
      );
      this.accounts.splice(index, 1, normalized);
      this.activeAccountId = normalized.accountId;
    },
    addCustomChain(chain: Partial<SavedChain> & Partial<ConnectionConfig>) {
      // Saved chain profile management is disabled; Settings owns the active endpoint.
      this.updateConnection({
        assetDefinitionId:
          chain.assetDefinitionId ?? this.connection.assetDefinitionId,
      });
    },
    removeCustomChain(id: string) {
      this.customChains = this.customChains.filter((chain) => chain.id !== id);
    },
    useChainProfile(connection: Partial<ConnectionConfig>) {
      this.updateConnection(connection);
    },
  },
});
