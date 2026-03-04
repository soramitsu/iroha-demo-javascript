import { defineStore } from "pinia";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

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
  publicKeyHex: string;
  privateKeyHex: string;
  ih58: string;
  compressed: string;
  compressedWarning: string;
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

const defaultUser = (): UserProfile => ({
  displayName: "",
  domain: "wonderland",
  accountId: "",
  publicKeyHex: "",
  privateKeyHex: "",
  ih58: "",
  compressed: "",
  compressedWarning: "",
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

const normalizeUser = (user: Partial<UserProfile>): UserProfile => ({
  ...defaultUser(),
  ...user,
});

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

const normalizeAccounts = (
  payload: Partial<SessionState> & { user?: UserProfile },
): Pick<SessionState, "accounts" | "activeAccountId"> => {
  if (Array.isArray(payload.accounts) && payload.accounts.length) {
    const accounts = payload.accounts.map((account) => normalizeUser(account));
    const activeAccountId =
      payload.activeAccountId &&
      accounts.some((acct) => acct.accountId === payload.activeAccountId)
        ? payload.activeAccountId
        : (accounts[0]?.accountId ?? null);
    return { accounts, activeAccountId };
  }

  if (payload.user?.accountId) {
    const legacyAccount = normalizeUser(payload.user);
    return {
      accounts: [legacyAccount],
      activeAccountId: legacyAccount.accountId,
    };
  }

  return { accounts: [], activeAccountId: null };
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
          this.$patch({
            ...base,
            connection: normalizeConnection(parsed.connection),
            authority: { ...base.authority, ...(parsed.authority ?? {}) },
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
    updateAuthority(partial: Partial<AuthorityProfile>) {
      this.authority = { ...this.authority, ...partial };
    },
    addAccount(account: UserProfile) {
      const normalized = normalizeUser(account);
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
    updateActiveAccount(partial: Partial<UserProfile>) {
      if (!this.activeAccountId && partial.accountId) {
        this.addAccount(normalizeUser(partial));
        return;
      }
      const index = this.accounts.findIndex(
        (account) => account.accountId === this.activeAccountId,
      );
      if (index === -1) {
        return;
      }
      this.accounts.splice(index, 1, { ...this.accounts[index], ...partial });
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
