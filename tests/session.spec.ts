import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  SESSION_SCHEMA,
  SESSION_STORAGE_KEY,
  SESSION_VERSION,
  useSessionStore,
} from "@/stores/session";
import {
  DEFAULT_CHAIN_PRESET,
  MINAMOTO_CHAIN_PRESET,
  TAIRA_CHAIN_PRESET,
} from "@/constants/chains";

const ALICE_PUBLIC_KEY_HEX =
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const BOB_PUBLIC_KEY_HEX =
  "a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0";
const accountIdFor = (publicKeyHex: string, networkPrefix: number) =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from(
      publicKeyHex.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)),
    ),
  }).toI105(networkPrefix);
const ALICE_ACCOUNT_ID = accountIdFor(ALICE_PUBLIC_KEY_HEX, 369);
const BOB_ACCOUNT_ID = accountIdFor(BOB_PUBLIC_KEY_HEX, 369);

const persistedAccount = (overrides: Record<string, unknown> = {}) => ({
  displayName: "Alice",
  domain: "default",
  accountId: ALICE_ACCOUNT_ID,
  publicKeyHex: ALICE_PUBLIC_KEY_HEX,
  signingAlgorithm: "ed25519",
  hasStoredSecret: true,
  localOnly: false,
  ...overrides,
});

const persistedSession = (overrides: Record<string, unknown> = {}) => ({
  schema: SESSION_SCHEMA,
  version: SESSION_VERSION,
  connection: {
    toriiUrl: "https://torii.example",
    chainId: "chain",
    assetDefinitionId: "61CtjvNd9T3THAR65GsMVHr82Bjc",
    networkPrefix: 369,
  },
  authority: {
    accountId: "",
    signingAlgorithm: "ed25519",
    hasStoredSecret: false,
  },
  accounts: [persistedAccount()],
  activeAccountId: ALICE_ACCOUNT_ID,
  ...overrides,
});

const snapshot = () =>
  JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}") as Record<
    string,
    unknown
  >;

const hydratePayload = async (payload: unknown) => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  const store = useSessionStore();
  await store.hydrate();
  return store;
};

describe("session store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.clear();
    delete (window as { iroha?: unknown }).iroha;
    setActivePinia(createPinia());
  });

  it("initialises with defaults", () => {
    const store = useSessionStore();

    expect(store.connection).toEqual(DEFAULT_CHAIN_PRESET.connection);
    expect(store.accounts).toEqual([]);
    expect(store.activeAccount).toBeNull();
    expect(store.hasAccount).toBe(false);
  });

  it("persists one explicit public-session DTO without secrets or runtime state", () => {
    const store = useSessionStore();
    store.addAccount({
      displayName: "Alice",
      domain: "default",
      accountId: ALICE_ACCOUNT_ID,
      publicKeyHex: ALICE_PUBLIC_KEY_HEX,
      hasStoredSecret: true,
      localOnly: false,
    });
    store.updateAuthority({
      accountId: BOB_ACCOUNT_ID,
      hasStoredSecret: true,
    });

    store.persistState();

    const persisted = snapshot();
    expect(Object.keys(persisted).sort()).toEqual(
      [
        "schema",
        "version",
        "connection",
        "authority",
        "accounts",
        "activeAccountId",
      ].sort(),
    );
    expect(persisted.schema).toBe(SESSION_SCHEMA);
    expect(persisted.version).toBe(SESSION_VERSION);
    expect(persisted).not.toHaveProperty("hydrated");
    expect(persisted).not.toHaveProperty("customChains");
    expect(persisted.authority).toEqual({
      accountId: BOB_ACCOUNT_ID,
      signingAlgorithm: "ed25519",
      hasStoredSecret: true,
    });
    expect(persisted.accounts).toEqual([
      {
        displayName: "Alice",
        domain: "default",
        accountId: ALICE_ACCOUNT_ID,
        publicKeyHex: ALICE_PUBLIC_KEY_HEX,
        signingAlgorithm: "ed25519",
        hasStoredSecret: true,
        localOnly: false,
      },
    ]);
    expect(JSON.stringify(store.$state)).not.toContain("privateKeyHex");
    expect(JSON.stringify(persisted)).not.toContain("privateKeyHex");
  });

  it("rejects private keys at the session-state boundary", () => {
    const store = useSessionStore();

    expect(() =>
      store.addAccount({
        displayName: "Alice",
        domain: "default",
        accountId: ALICE_ACCOUNT_ID,
        publicKeyHex: ALICE_PUBLIC_KEY_HEX,
        privateKeyHex: "cd".repeat(32),
        hasStoredSecret: true,
        localOnly: false,
      }),
    ).toThrow("Session account must not include private key material.");
    expect(() =>
      store.updateAuthority({
        accountId: BOB_ACCOUNT_ID,
        privateKeyHex: "ef".repeat(32),
        hasStoredSecret: true,
      } as never),
    ).toThrow("Session authority must not include private key material.");
    expect(store.accounts).toEqual([]);
    expect(JSON.stringify(store.$state)).not.toContain("cd".repeat(32));
    expect(JSON.stringify(store.$state)).not.toContain("ef".repeat(32));
  });

  it("hydrates the exact current DTO without rewriting account identifiers", async () => {
    const payload = persistedSession();

    const store = await hydratePayload(payload);

    expect(store.connection).toEqual(payload.connection);
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0]?.accountId).toBe(ALICE_ACCOUNT_ID);
    expect(store.accounts[0]?.i105AccountId).toBe(ALICE_ACCOUNT_ID);
    expect(store.activeAccountId).toBe(ALICE_ACCOUNT_ID);
    expect(store.activeAccount?.hasStoredSecret).toBe(true);
    expect(store.activeAccount).not.toHaveProperty("privateKeyHex");
  });

  it("rejects an account literal for a different network prefix", async () => {
    const accountId = accountIdFor(ALICE_PUBLIC_KEY_HEX, 753);
    const store = await hydratePayload(
      persistedSession({
        accounts: [persistedAccount({ accountId })],
        activeAccountId: accountId,
      }),
    );

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("accepts an empty account set only with a null active account", async () => {
    const store = await hydratePayload(
      persistedSession({ accounts: [], activeAccountId: null }),
    );

    expect(store.accounts).toEqual([]);
    expect(store.activeAccountId).toBeNull();
  });

  it.each([
    ["an unversioned payload", { connection: persistedSession().connection }],
    ["a different schema", persistedSession({ schema: "other-session" })],
    ["a different version", persistedSession({ version: 2 })],
    [
      "a legacy user field",
      { ...persistedSession(), user: persistedAccount() },
    ],
    ["an unknown root field", { ...persistedSession(), unknown: true }],
    [
      "a missing root field",
      (() => {
        const payload = persistedSession();
        delete (payload as { authority?: unknown }).authority;
        return payload;
      })(),
    ],
  ])("rejects %s as a whole", async (_label, payload) => {
    const store = await hydratePayload(payload);

    expect(store.connection).toEqual(DEFAULT_CHAIN_PRESET.connection);
    expect(store.accounts).toEqual([]);
    expect(store.activeAccountId).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("rejects duplicate JSON object keys before parsing", async () => {
    const raw = JSON.stringify(persistedSession()).replace(
      `"version":${SESSION_VERSION}`,
      `"version":${SESSION_VERSION},"version":${SESSION_VERSION}`,
    );
    localStorage.setItem(SESSION_STORAGE_KEY, raw);

    const store = useSessionStore();
    await store.hydrate();

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("rejects duplicate nested JSON object keys before parsing", async () => {
    const raw = JSON.stringify(persistedSession()).replace(
      '"displayName":"Alice"',
      '"displayName":"Alice","displayName":"Mallory"',
    );
    localStorage.setItem(SESSION_STORAGE_KEY, raw);

    const store = useSessionStore();
    await store.hydrate();

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("rejects an oversized saved session before JSON parsing", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, " ".repeat(1_048_577));

    const store = useSessionStore();
    await store.hydrate();

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    [
      "connection extras",
      persistedSession({
        connection: {
          ...persistedSession().connection,
          endpoint: "https://legacy.example",
        },
      }),
    ],
    [
      "authority secrets",
      persistedSession({
        authority: {
          ...persistedSession().authority,
          privateKeyHex: "",
        },
      }),
    ],
    [
      "account secrets",
      persistedSession({
        accounts: [persistedAccount({ privateKeyHex: "" })],
      }),
    ],
    [
      "legacy account fields",
      persistedSession({
        accounts: [persistedAccount({ ih58: "legacy" })],
      }),
    ],
    [
      "missing account fields",
      persistedSession({
        accounts: [
          (() => {
            const account = persistedAccount();
            delete (account as { localOnly?: unknown }).localOnly;
            return account;
          })(),
        ],
      }),
    ],
  ])("rejects exact-shape violation: %s", async (_label, payload) => {
    const store = await hydratePayload(payload);

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["string network prefix", { networkPrefix: "369" }],
    ["fractional network prefix", { networkPrefix: 369.5 }],
    ["noncanonical endpoint", { toriiUrl: "https://torii.example/" }],
    ["empty chain ID", { chainId: "" }],
    ["retired asset alias", { assetDefinitionId: "xor#universal" }],
    [
      "invalid asset checksum",
      { assetDefinitionId: "4Zust3cNxsgov3757wxRW7DtR8n6" },
    ],
  ])("rejects invalid connection type/value: %s", async (_label, change) => {
    const store = await hydratePayload(
      persistedSession({
        connection: { ...persistedSession().connection, ...change },
      }),
    );

    expect(store.connection).toEqual(DEFAULT_CHAIN_PRESET.connection);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["legacy account ID", { accountId: "alice@wonderland" }],
    ["noncanonical account ID", { accountId: ` ${ALICE_ACCOUNT_ID}` }],
    ["wrong boolean type", { localOnly: 0 }],
    ["noncanonical signing algorithm", { signingAlgorithm: " Ed25519 " }],
    ["missing public key", { publicKeyHex: "" }],
  ])("rejects invalid account type/value: %s", async (_label, change) => {
    const account = persistedAccount(change);
    const store = await hydratePayload(
      persistedSession({
        accounts: [account],
        activeAccountId: account.accountId,
      }),
    );

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("rejects duplicate account IDs instead of merging them", async () => {
    const store = await hydratePayload(
      persistedSession({
        accounts: [persistedAccount(), persistedAccount({ displayName: "B" })],
      }),
    );

    expect(store.accounts).toEqual([]);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["missing", null],
    ["unknown", BOB_ACCOUNT_ID],
    ["wrong type", 42],
  ])(
    "rejects a %s active-account selector without falling back",
    async (_label, id) => {
      const store = await hydratePayload(
        persistedSession({ activeAccountId: id }),
      );

      expect(store.accounts).toEqual([]);
      expect(store.activeAccountId).toBeNull();
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    },
  );

  it("adds, updates, and switches accounts at runtime", () => {
    const store = useSessionStore();
    store.addAccount({
      displayName: "Alice",
      domain: "default",
      accountId: ALICE_ACCOUNT_ID,
      publicKeyHex: ALICE_PUBLIC_KEY_HEX,
      hasStoredSecret: true,
      localOnly: false,
    });
    store.addAccount({
      displayName: "Bob",
      domain: "default",
      accountId: BOB_ACCOUNT_ID,
      publicKeyHex: BOB_PUBLIC_KEY_HEX,
      hasStoredSecret: true,
      localOnly: true,
    });

    store.setActiveAccount(ALICE_ACCOUNT_ID);
    store.updateActiveAccount({ displayName: "Renamed" });

    expect(store.accounts).toHaveLength(2);
    expect(store.activeAccount?.displayName).toBe("Renamed");
    expect(store.hasAccount).toBe(true);
  });

  it("keeps current endpoint and preset update behavior", () => {
    const store = useSessionStore();
    store.updateConnection({
      toriiUrl: " http://127.0.0.1:8080/ ",
      chainId: "custom-chain",
      networkPrefix: 99,
    });
    expect(store.connection.toriiUrl).toBe("http://127.0.0.1:8080");

    store.updateConnection({
      toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
    });
    expect(store.connection).toEqual(TAIRA_CHAIN_PRESET.connection);

    store.updateConnection({
      toriiUrl: MINAMOTO_CHAIN_PRESET.connection.toriiUrl,
      chainId: "checked-chain",
      networkPrefix: 42,
    });
    expect(store.connection.toriiUrl).toBe(
      MINAMOTO_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(store.connection.chainId).toBe("checked-chain");
    expect(store.connection.networkPrefix).toBe(42);

    store.updateConnection({
      toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
    });
    expect(store.connection).toEqual(TAIRA_CHAIN_PRESET.connection);
  });

  it("rejects invalid runtime connection updates without mutating state", () => {
    const store = useSessionStore();
    const before = { ...store.connection };

    expect(() =>
      store.updateConnection({
        toriiUrl: "ftp://not-torii.example",
        chainId: "custom-chain",
        networkPrefix: 42,
      }),
    ).toThrow("http:// or https://");
    expect(store.connection).toEqual(before);

    expect(() =>
      store.updateConnection({
        toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
        chainId: 7,
      } as never),
    ).toThrow("canonical chain ID");
    expect(() =>
      store.updateConnection({ networkPrefix: "369" } as never),
    ).toThrow("integer network prefix");
    expect(() =>
      store.updateConnection({
        legacyEndpoint: "https://legacy.example",
      } as never),
    ).toThrow("unsupported field or shape");
    expect(store.connection).toEqual(before);
  });

  it("rejects coercive and exotic runtime account updates", () => {
    const store = useSessionStore();
    const base = {
      displayName: "Alice",
      domain: "default",
      accountId: ALICE_ACCOUNT_ID,
      publicKeyHex: ALICE_PUBLIC_KEY_HEX,
      hasStoredSecret: true,
      localOnly: false,
    };

    expect(() =>
      store.addAccount({ ...base, hasStoredSecret: "true" } as never),
    ).toThrow("secret flag must be a boolean");
    expect(() =>
      store.addAccount({ ...base, displayName: 42 } as never),
    ).toThrow("display name must be text");
    expect(() =>
      store.addAccount({ ...base, legacyAddress: ALICE_ACCOUNT_ID } as never),
    ).toThrow("unsupported field or shape");

    const accessor = { ...base } as Record<string, unknown>;
    Object.defineProperty(accessor, "displayName", {
      enumerable: true,
      get: () => "Mallory",
    });
    expect(() => store.addAccount(accessor)).toThrow("defined data fields");
    expect(store.accounts).toEqual([]);
  });

  it("rejects invalid runtime authority flags", () => {
    const store = useSessionStore();

    expect(() =>
      store.updateAuthority({ hasStoredSecret: 1 } as never),
    ).toThrow("secret flag must be a boolean");
    expect(store.authority.hasStoredSecret).toBe(false);
  });
});
