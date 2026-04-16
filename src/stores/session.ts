import { defineStore } from "pinia";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { normalizeTairaAccountIdLiteral } from "@/utils/accountId";

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
  privateKeyHex: string;
  localOnly: boolean;
};

export type AuthorityProfile = {
  accountId: string;
  privateKeyHex: string;
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
const MAX_NETWORK_PREFIX = 0x3fff;

const defaultUser = (): UserProfile => ({
  displayName: "",
  domain: DEFAULT_DOMAIN_LABEL,
  accountId: "",
  i105AccountId: "",
  i105DefaultAccountId: "",
  publicKeyHex: "",
  privateKeyHex: "",
  localOnly: false,
});

const defaultState = (): SessionState => ({
  hydrated: false,
  connection: { ...TAIRA_CHAIN_PRESET.connection },
  authority: {
    accountId: "",
    privateKeyHex: "",
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
  derivedAccountId?: string | null,
): string => {
  const accountId = normalizeTairaAccountIdLiteral(user.accountId);
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
    .map(normalizeTairaAccountIdLiteral)
    .find(isCanonicalAccountCandidate);
  return migratedCandidate ?? accountId;
};

const resolveVisibleI105AccountId = (
  user: Partial<UserProfile> & Record<string, unknown>,
  accountId: string,
  derivedI105AccountId?: string | null,
): string => {
  if (derivedI105AccountId) {
    return derivedI105AccountId;
  }
  const storedI105AccountId = normalizeTairaAccountIdLiteral(
    user.i105AccountId,
  );
  if (isCanonicalAccountCandidate(storedI105AccountId)) {
    return storedI105AccountId;
  }
  const storedDefaultI105AccountId = normalizeTairaAccountIdLiteral(
    user.i105DefaultAccountId,
  );
  if (isCanonicalAccountCandidate(storedDefaultI105AccountId)) {
    return storedDefaultI105AccountId;
  }
  return normalizeTairaAccountIdLiteral(accountId);
};

const normalizeUser = (
  user: Partial<UserProfile> & Record<string, unknown>,
  options?: { networkPrefix?: number },
): UserProfile => {
  const normalized = { ...defaultUser(), ...user };
  const derivedAccountAddresses = deriveAccountAddressesFromProfile(
    normalized,
    options?.networkPrefix ?? TAIRA_CHAIN_PRESET.connection.networkPrefix,
  );
  const resolvedAccountId = resolveAccountIdLiteral(
    normalized,
    derivedAccountAddresses?.accountId,
  );
  return {
    displayName: trimString(normalized.displayName),
    domain: normalizeDomainLabel(normalized.domain, resolvedAccountId),
    accountId: resolvedAccountId,
    i105AccountId: resolveVisibleI105AccountId(
      normalized,
      resolvedAccountId,
      derivedAccountAddresses?.i105AccountId,
    ),
    i105DefaultAccountId:
      derivedAccountAddresses?.i105DefaultAccountId ||
      trimString(normalized.i105DefaultAccountId),
    publicKeyHex: trimString(normalized.publicKeyHex),
    privateKeyHex: trimString(normalized.privateKeyHex),
    localOnly: Boolean(normalized.localOnly),
  };
};

const normalizeConnection = (
  partial?: Partial<ConnectionConfig>,
): ConnectionConfig => {
  const assetDefinitionId = String(
    partial?.assetDefinitionId ??
      TAIRA_CHAIN_PRESET.connection.assetDefinitionId,
  ).trim();
  return {
    ...TAIRA_CHAIN_PRESET.connection,
    assetDefinitionId:
      assetDefinitionId || TAIRA_CHAIN_PRESET.connection.assetDefinitionId,
  };
};

const normalizeSessionNetworkPrefix = (value: unknown): number | null => {
  const normalized = Number(value);
  if (
    !Number.isInteger(normalized) ||
    normalized < 0 ||
    normalized > MAX_NETWORK_PREFIX
  ) {
    return null;
  }
  return normalized;
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
      return Boolean(active?.accountId && active?.privateKeyHex);
    },
    activeAccount: (state) =>
      state.accounts.find(
        (account) => account.accountId === state.activeAccountId,
      ) ?? null,
  },
  actions: {
    hydrate() {
      if (this.hydrated) {
        return;
      }
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const normalizedAccounts = normalizeAccounts(parsed);
          const base = defaultState();
          const authority = { ...base.authority, ...(parsed.authority ?? {}) };
          const rawAuthorityAccountId = trimString(authority.accountId);
          const migratedAuthorityAccountId = rawAuthorityAccountId
            ? (normalizedAccounts.accountIdMap.get(rawAuthorityAccountId) ??
              rawAuthorityAccountId)
            : "";
          this.$patch({
            ...base,
            connection: normalizeConnection(parsed.connection),
            authority: {
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
          return;
        } catch (error) {
          console.warn("Failed to parse saved session", error);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
      this.hydrated = true;
    },
    persistState(snapshot?: SessionState) {
      const payload = JSON.stringify(snapshot ?? this.$state);
      localStorage.setItem(SESSION_STORAGE_KEY, payload);
    },
    reset() {
      const fresh = defaultState();
      this.$patch(fresh);
      this.persistState();
    },
    updateConnection(partial: Partial<ConnectionConfig>) {
      this.connection = normalizeConnection({ ...this.connection, ...partial });
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
      this.authority = { ...this.authority, ...partial };
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
      // Custom chains are intentionally disabled in TAIRA-only builds.
      this.connection = normalizeConnection({
        assetDefinitionId:
          chain.assetDefinitionId ?? this.connection.assetDefinitionId,
      });
    },
    removeCustomChain(id: string) {
      this.customChains = this.customChains.filter((chain) => chain.id !== id);
    },
    useChainProfile(connection: Partial<ConnectionConfig>) {
      this.connection = normalizeConnection({
        ...this.connection,
        ...connection,
      });
    },
  },
});
