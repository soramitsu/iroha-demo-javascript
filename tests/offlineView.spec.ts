import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import OfflineView from "@/views/OfflineView.vue";
import { translate } from "@/i18n/messages";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import { buildOfflineStorageKey, useOfflineStore } from "@/stores/offline";
import { formatAssetDefinitionLabel } from "@/utils/assetId";
import { buildEndpointIdentityScope } from "@/utils/endpointScope";

const ALICE_I105_ACCOUNT_ID = "testuAliceRealI105AccountId";
const BOB_I105_ACCOUNT_ID = "testuBobRealI105AccountId";
const ONLINE_DESTINATION_SELECTOR =
  'input[data-testid="offline-online-destination-input"]';
const finalizedTransfer = (transactionHash = "a".repeat(64)) => ({
  hash: transactionHash,
  finality: {
    status: "finalized" as const,
    transactionHash,
    blockHeight: 17,
    blockHash: "b".repeat(64),
    finalizedBlockHeight: 19,
  },
});
type FinalizedTransfer = ReturnType<typeof finalizedTransfer>;

const transferAssetMock = vi.fn();
const getConfidentialAssetPolicyMock = vi.fn();
const qrScannerStartMock = vi.hoisted(() => vi.fn());
const qrScannerStopMock = vi.hoisted(() => vi.fn());
const fetchOfflineReadinessMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/iroha", () => ({
  getConfidentialAssetPolicy: (input: unknown) =>
    getConfidentialAssetPolicyMock(input),
  transferAsset: (input: unknown) => transferAssetMock(input),
}));

vi.mock("@/services/offline", () => ({
  fetchOfflineReadiness: (input: unknown) => fetchOfflineReadinessMock(input),
}));

vi.mock("@/composables/useQrScanner", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  return {
    useQrScanner: () => ({
      scanning: ref(false),
      message: ref(""),
      videoRef: ref<HTMLVideoElement | null>(null),
      fileInputRef: ref<HTMLInputElement | null>(null),
      start: qrScannerStartMock,
      stop: qrScannerStopMock,
      openFilePicker: vi.fn(),
      decodeFile: vi.fn(),
    }),
  };
});

const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

describe("OfflineView move-to-online shield mode", () => {
  beforeEach(() => {
    localStorage.clear();
    transferAssetMock.mockReset();
    getConfidentialAssetPolicyMock.mockReset();
    qrScannerStartMock.mockReset();
    qrScannerStopMock.mockReset();
    fetchOfflineReadinessMock.mockReset().mockResolvedValue({
      required_bridge_abi_version: 21,
      cash_handoff_capability: "cash_handoff_v1",
      max_hops: 8,
      asset_definition_id: "norito:abcdef0123456789",
      asset_scale: 0,
      evaluated_block_height: 100,
      evaluated_block_hash: "hash",
      proof_backend_available: true,
      recursive_lineage_supported: true,
      ready: true,
      blockers: [],
      allowanceSupported: false,
      allowances: [],
    });
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    setActivePinia(createPinia());
  });

  const mountView = (
    assetDefinitionId = "norito:abcdef0123456789",
    offlineBalance = "25",
    endpointOptions?: {
      confidentialTransfers?: boolean;
      writeAllowed?: boolean;
      observedWhenReadOnly?: boolean;
      evidenceSources?: Array<
        | "governance-capabilities-v1"
        | "chain-metadata"
        | "response-headers"
        | "blocked-deployment-fingerprint"
      >;
    },
  ) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    const offline = useOfflineStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId,
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "alice@default",
          i105AccountId: ALICE_I105_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
        },
      ],
      activeAccountId: "alice@default",
    });
    const writeAllowed = endpointOptions?.writeAllowed !== false;
    const confidentialTransfers =
      endpointOptions?.confidentialTransfers !== false;
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: "http://localhost:8080",
        expected: { chainId: "chain", networkPrefix: 369 },
        observed:
          writeAllowed || endpointOptions?.observedWhenReadOnly
            ? { chainId: "chain", networkPrefix: 369 }
            : null,
        identityStatus: writeAllowed ? "matched" : "unverified",
        accessMode: writeAllowed ? "read-write" : "read-only",
        checkedAtMs: 1,
        evidence: (
          endpointOptions?.evidenceSources ??
          (writeAllowed ? ["chain-metadata"] : [])
        ).map((source, index) => ({
          source,
          identity: { chainId: "chain", networkPrefix: 369 },
          observedAtMs: index + 1,
        })),
        diagnostic: {
          code: writeAllowed
            ? "endpoint_identity_matched"
            : "endpoint_identity_unverified",
          message: writeAllowed
            ? "Endpoint identity matched."
            : "Endpoint identity is not verified.",
        },
        features: {
          confidentialTransfers: {
            supported: confidentialTransfers,
            source: "openapi",
            requiredOperations: ["POST /v1/pipeline/transactions"],
            missingOperations: confidentialTransfers
              ? []
              : ["POST /v1/pipeline/transactions"],
          },
        },
      },
    } as any);
    if (writeAllowed) {
      offline.hydrate();
      offline.activatePersistenceScope({
        endpointIdentity: buildEndpointIdentityScope({
          toriiUrl: "http://localhost:8080",
          observedChainId: "chain",
          observedNetworkPrefix: 369,
        }),
        accountId: ALICE_I105_ACCOUNT_ID,
        assetDefinitionId,
      });
    }
    offline.$patch({
      wallet: {
        balance: offlineBalance,
        nextCounter: 0,
        replayLog: [],
        history: [],
        syncedAtMs: null,
        nextPolicyExpiryMs: null,
        nextRefreshMs: null,
      },
    });
    return mount(OfflineView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const getMoveSection = (wrapper: ReturnType<typeof mount>) => {
    const section = wrapper
      .findAll("section.card")
      .find((node) => node.text().includes(t("Move funds to online wallet")));
    if (!section) {
      throw new Error("Move-to-online section not found");
    }
    return section;
  };

  const getSection = (wrapper: ReturnType<typeof mount>, title: string) => {
    const section = wrapper
      .findAll("section.card")
      .find((node) => node.text().includes(title));
    if (!section) {
      throw new Error(`Section not found: ${title}`);
    }
    return section;
  };

  it("does not activate offline persistence from one unverified header observation", async () => {
    mountView(undefined, "0", {
      writeAllowed: false,
      observedWhenReadOnly: true,
      evidenceSources: ["response-headers"],
    });
    await flushPromises();

    const offline = useOfflineStore();
    expect(offline.persistenceScope).toBeNull();
    offline.updateAllowanceSnapshot({
      total: "12",
      syncedAtMs: 1,
      nextPolicyExpiryMs: null,
    });
    expect(localStorage.length).toBe(0);
  });

  it("gates network moves from live readiness while keeping local workflows visible", async () => {
    fetchOfflineReadinessMock.mockResolvedValue({
      required_bridge_abi_version: 21,
      cash_handoff_capability: "cash_handoff_v1",
      max_hops: 8,
      asset_definition_id: "norito:abcdef0123456789",
      asset_scale: null,
      evaluated_block_height: 44_916,
      evaluated_block_hash: "hash",
      proof_backend_available: false,
      recursive_lineage_supported: false,
      ready: false,
      blockers: [
        {
          code: "proof_backend_unavailable",
          message: "The proof backend is unavailable.",
        },
      ],
      allowanceSupported: false,
      allowances: [],
    });

    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    expect(
      moveSection.get(".actions button").attributes("disabled"),
    ).toBeDefined();
    expect(moveSection.text()).toContain(
      t("Offline network operations are unavailable ({count} blocker(s)).", {
        count: 1,
      }),
    );
    expect(wrapper.text()).toContain("The proof backend is unavailable.");

    const requestSection = getSection(wrapper, t("Request offline payment"));
    await requestSection.get('input[type="text"]').setValue("1");
    expect(
      requestSection.get(".actions button").attributes("disabled"),
    ).toBeUndefined();
    expect(transferAssetMock).not.toHaveBeenCalled();
  });

  it("ignores stale readiness after the active asset context changes", async () => {
    const firstAssetDefinitionId = "norito:abcdef0123456789";
    const secondAssetDefinitionId = "norito:fedcba9876543210";
    const readinessResolvers = new Map<
      string,
      Array<(value: Record<string, unknown>) => void>
    >();
    fetchOfflineReadinessMock.mockImplementation(
      ({ assetDefinitionId }: { assetDefinitionId: string }) =>
        new Promise<Record<string, unknown>>((resolve) => {
          const resolvers = readinessResolvers.get(assetDefinitionId) ?? [];
          resolvers.push(resolve);
          readinessResolvers.set(assetDefinitionId, resolvers);
        }),
    );
    getConfidentialAssetPolicyMock.mockImplementation(
      ({ assetDefinitionId }: { assetDefinitionId: string }) =>
        Promise.resolve({
          asset_id: assetDefinitionId,
          block_height: 1,
          current_mode: "Convertible",
          effective_mode: "Convertible",
          allow_shield: true,
          allow_unshield: true,
          vk_transfer: "halo2/ipa::vk_transfer",
          vk_unshield: "halo2/ipa::vk_unshield",
          vk_shield: "halo2/ipa::vk_shield",
          vk_set_hash: null,
          poseidon_params_id: null,
          pedersen_params_id: null,
          pending_transition: null,
        }),
    );

    const wrapper = mountView(firstAssetDefinitionId);
    await vi.waitFor(() => {
      expect(readinessResolvers.get(firstAssetDefinitionId)).toHaveLength(1);
    });

    const session = useSessionStore();
    session.$patch({
      connection: {
        ...session.connection,
        assetDefinitionId: secondAssetDefinitionId,
      },
    });
    await vi.waitFor(() => {
      expect(readinessResolvers.get(secondAssetDefinitionId)).toHaveLength(1);
    });
    useOfflineStore().$patch({
      wallet: {
        balance: "25",
        nextCounter: 0,
        replayLog: [],
        history: [],
        syncedAtMs: null,
        nextPolicyExpiryMs: null,
        nextRefreshMs: null,
      },
    });

    for (const resolve of readinessResolvers.get(firstAssetDefinitionId) ??
      []) {
      resolve({
        ready: true,
        blockers: [],
        allowanceSupported: false,
        allowances: [],
      });
    }
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const submitButton = moveSection.get(".actions button");
    expect(submitButton.attributes("disabled")).toBeDefined();
    (submitButton.element as HTMLButtonElement).disabled = false;
    await submitButton.trigger("click");
    await flushPromises();
    expect(transferAssetMock).not.toHaveBeenCalled();

    for (const resolve of readinessResolvers.get(secondAssetDefinitionId) ??
      []) {
      resolve({
        ready: true,
        blockers: [],
        allowanceSupported: false,
        allowances: [],
      });
    }
    await flushPromises();

    expect(submitButton.attributes("disabled")).toBeUndefined();
    await submitButton.trigger("click");
    await vi.waitFor(() => {
      expect(readinessResolvers.get(secondAssetDefinitionId)).toHaveLength(2);
    });
    readinessResolvers.get(secondAssetDefinitionId)?.[1]?.({
      ready: true,
      blockers: [],
      allowanceSupported: false,
      allowances: [],
    });
    await flushPromises();
    expect(transferAssetMock).toHaveBeenCalledOnce();
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetDefinitionId: secondAssetDefinitionId,
      }),
    );
  });

  it("blocks unadvertised network transfers while local offline workflows remain available", async () => {
    const wrapper = mountView(undefined, undefined, {
      confidentialTransfers: false,
    });
    await flushPromises();

    expect(fetchOfflineReadinessMock).toHaveBeenCalled();
    const moveSection = getMoveSection(wrapper);
    expect(
      moveSection.get('[data-testid="offline-write-prerequisite"]').text(),
    ).toBe(
      t(
        "This endpoint does not advertise the required confidential transfer operations. Local offline payment workflows remain available.",
      ),
    );

    const submitButton = moveSection.get(".actions button");
    expect(submitButton.attributes("disabled")).toBeDefined();
    (submitButton.element as HTMLButtonElement).disabled = false;
    await submitButton.trigger("click");
    await flushPromises();
    expect(transferAssetMock).not.toHaveBeenCalled();

    const requestSection = getSection(wrapper, t("Request offline payment"));
    await requestSection.get('input[type="text"]').setValue("1");
    expect(
      requestSection.get(".actions button").attributes("disabled"),
    ).toBeUndefined();
  });

  it("blocks online moves when endpoint identity is read-only", async () => {
    const wrapper = mountView(undefined, undefined, {
      writeAllowed: false,
    });
    await flushPromises();

    expect(fetchOfflineReadinessMock).toHaveBeenCalled();
    const moveSection = getMoveSection(wrapper);
    expect(
      moveSection.get('[data-testid="offline-write-prerequisite"]').text(),
    ).toBe("Endpoint identity is not verified.");
    expect(
      moveSection.get(".actions button").attributes("disabled"),
    ).toBeDefined();
    expect(transferAssetMock).not.toHaveBeenCalled();
  });

  it("forwards self-only unshield payloads and locks destination to active account", async () => {
    transferAssetMock.mockResolvedValue(finalizedTransfer());
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(ONLINE_DESTINATION_SELECTOR);
    const amountInput = moveSection.findAll('input[type="text"]')[0];
    const submitButton = moveSection.get(".actions button");

    await amountInput.setValue("10");

    expect((receiverInput.element as HTMLInputElement).value).toBe(
      ALICE_I105_ACCOUNT_ID,
    );
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(true);
    expect(submitButton.text()).toBe(t("Unshield to wallet"));

    await submitButton.trigger("click");
    await flushPromises();

    expect(getConfidentialAssetPolicyMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      accountId: ALICE_I105_ACCOUNT_ID,
      assetDefinitionId: "norito:abcdef0123456789",
    });
    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: ALICE_I105_ACCOUNT_ID,
        quantity: "10",
        unshield: true,
      }),
    );
    expect(moveSection.text()).toContain(
      t("Unshield finalized in block {height} and offline balance updated.", {
        height: 17,
      }),
    );
  });

  it("rechecks live readiness immediately before submitting an online move", async () => {
    fetchOfflineReadinessMock
      .mockResolvedValueOnce({
        required_bridge_abi_version: 21,
        cash_handoff_capability: "cash_handoff_v1",
        max_hops: 8,
        asset_definition_id: "norito:abcdef0123456789",
        asset_scale: 0,
        evaluated_block_height: 100,
        evaluated_block_hash: "ready-hash",
        proof_backend_available: true,
        recursive_lineage_supported: true,
        ready: true,
        blockers: [],
        allowanceSupported: false,
        allowances: [],
      })
      .mockResolvedValueOnce({
        required_bridge_abi_version: 21,
        cash_handoff_capability: "cash_handoff_v1",
        max_hops: 8,
        asset_definition_id: "norito:abcdef0123456789",
        asset_scale: 0,
        evaluated_block_height: 101,
        evaluated_block_hash: "blocked-hash",
        proof_backend_available: false,
        recursive_lineage_supported: true,
        ready: false,
        blockers: [
          {
            code: "proof_backend_unavailable",
            message: "The proof backend is unavailable.",
          },
        ],
        allowanceSupported: false,
        allowances: [],
      });
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(fetchOfflineReadinessMock).toHaveBeenCalledTimes(2);
    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(moveSection.text()).toContain(
      t("Offline network operations are unavailable ({count} blocker(s)).", {
        count: 1,
      }),
    );
  });

  it("commits the local debit only after network submission succeeds", async () => {
    let resolveTransfer!: (value: FinalizedTransfer) => void;
    transferAssetMock.mockImplementation(
      () =>
        new Promise<FinalizedTransfer>((resolve) => {
          resolveTransfer = resolve;
        }),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledOnce();
    expect(useOfflineStore().balance).toBe("25");

    resolveTransfer(finalizedTransfer());
    await flushPromises();

    expect(useOfflineStore().balance).toBe("15");
    expect(useOfflineStore().wallet.nextCounter).toBe(1);
    expect(useOfflineStore().wallet.history).toHaveLength(1);
  });

  it("locks local balance mutations while an online move is pending", async () => {
    let resolveTransfer!: (value: FinalizedTransfer) => void;
    transferAssetMock.mockImplementation(
      () =>
        new Promise<FinalizedTransfer>((resolve) => {
          resolveTransfer = resolve;
        }),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    const paySection = getSection(wrapper, t("Create payment"));
    const acceptSection = getSection(wrapper, t("Accept offline payment"));
    await paySection.get("textarea").setValue("{}");
    await acceptSection.get("textarea").setValue("{}");
    const payButton = paySection.get(".actions button");
    const acceptButton = acceptSection.get(".actions button");

    expect(payButton.attributes("disabled")).toBeDefined();
    expect(acceptButton.attributes("disabled")).toBeDefined();
    await payButton.trigger("click");
    await acceptButton.trigger("click");
    expect(useOfflineStore().balance).toBe("25");
    expect(useOfflineStore().wallet.history).toEqual([]);

    resolveTransfer(finalizedTransfer());
    await flushPromises();

    expect(useOfflineStore().balance).toBe("15");
    expect(useOfflineStore().wallet.history).toHaveLength(1);
  });

  it("quarantines the initiating balance when local commit fails after remote success", async () => {
    let resolveTransfer!: (value: FinalizedTransfer) => void;
    transferAssetMock.mockImplementation(
      () =>
        new Promise<FinalizedTransfer>((resolve) => {
          resolveTransfer = resolve;
        }),
    );
    const wrapper = mountView();
    await flushPromises();
    const offline = useOfflineStore();
    const scope = offline.persistenceScope;
    if (!scope) throw new Error("Offline persistence scope missing");
    const storageKey = buildOfflineStorageKey(scope);
    offline.persist();

    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    const persisted = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    persisted.wallet.balance = "24";
    localStorage.setItem(storageKey, JSON.stringify(persisted));
    resolveTransfer(finalizedTransfer());
    await flushPromises();

    expect(offline.balance).toBe("0");
    expect(offline.isPersistenceScopeQuarantined(scope)).toBe(true);
    expect(offline.isPersistenceScopeLocked(scope)).toBe(true);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(moveSection.text()).toContain(
      t(
        "The online move finalized, but the offline balance is locked because local reconciliation failed.",
      ),
    );

    const paySection = getSection(wrapper, t("Create payment"));
    await paySection.get("textarea").setValue("{}");
    expect(
      paySection.get(".actions button").attributes("disabled"),
    ).toBeDefined();
  });

  it("commits an in-flight account A withdrawal only to account A", async () => {
    let resolveTransfer!: (value: FinalizedTransfer) => void;
    transferAssetMock.mockImplementation(
      () =>
        new Promise<FinalizedTransfer>((resolve) => {
          resolveTransfer = resolve;
        }),
    );
    const wrapper = mountView();
    await flushPromises();

    const offline = useOfflineStore();
    const aliceScope = offline.persistenceScope;
    if (!aliceScope) throw new Error("Alice persistence scope missing");
    const aliceStorageKey = buildOfflineStorageKey(aliceScope);
    offline.persist();

    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "alice@default",
        destinationAccountId: ALICE_I105_ACCOUNT_ID,
        quantity: "10",
      }),
    );

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "default",
          accountId: "bob@default",
          i105AccountId: BOB_I105_ACCOUNT_ID,
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
        },
      ],
      activeAccountId: "bob@default",
    });
    await flushPromises();

    const bobScope = offline.persistenceScope;
    if (!bobScope) throw new Error("Bob persistence scope missing");
    expect(bobScope.accountId).toBe(BOB_I105_ACCOUNT_ID);
    const bobStorageKey = buildOfflineStorageKey(bobScope);
    offline.$patch({
      wallet: {
        balance: "7",
        nextCounter: 0,
        replayLog: [],
        history: [],
        syncedAtMs: null,
        nextPolicyExpiryMs: null,
        nextRefreshMs: null,
      },
    });
    offline.persist();

    resolveTransfer(finalizedTransfer("c".repeat(64)));
    await flushPromises();

    expect(offline.persistenceScope?.accountId).toBe(BOB_I105_ACCOUNT_ID);
    expect(offline.wallet).toMatchObject({
      balance: "7",
      nextCounter: 0,
      history: [],
    });
    expect(
      JSON.parse(localStorage.getItem(bobStorageKey) ?? "{}").wallet,
    ).toMatchObject({
      balance: "7",
      nextCounter: 0,
      history: [],
    });
    expect(
      JSON.parse(localStorage.getItem(aliceStorageKey) ?? "{}").wallet,
    ).toMatchObject({
      balance: "15",
      nextCounter: 1,
      history: [expect.objectContaining({ amount: "10" })],
    });
    expect(moveSection.text()).not.toContain(
      t("Transfer submitted and offline balance updated."),
    );
  });

  it("keeps a stale account A transfer failure out of account B state", async () => {
    let rejectTransfer!: (reason: Error) => void;
    transferAssetMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectTransfer = reject;
        }),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "default",
          accountId: "bob@default",
          i105AccountId: BOB_I105_ACCOUNT_ID,
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
        },
      ],
      activeAccountId: "bob@default",
    });
    await flushPromises();
    useOfflineStore().$patch({
      wallet: {
        balance: "7",
        nextCounter: 0,
        replayLog: [],
        history: [],
        syncedAtMs: null,
        nextPolicyExpiryMs: null,
        nextRefreshMs: null,
      },
    });

    rejectTransfer(new Error("stale Alice transfer failed"));
    await flushPromises();

    expect(useOfflineStore().wallet).toMatchObject({
      balance: "7",
      nextCounter: 0,
      history: [],
    });
    expect(moveSection.text()).not.toContain("stale Alice transfer failed");
  });

  it("prevalidates insufficient offline balance before network submission", async () => {
    const wrapper = mountView(undefined, "5");
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(useOfflineStore().wallet).toMatchObject({
      balance: "5",
      nextCounter: 0,
      history: [],
    });
    expect(moveSection.text()).toContain(
      "Insufficient offline balance for this withdrawal.",
    );
  });

  it("does not commit the prepared local debit when network submission fails", async () => {
    transferAssetMock.mockRejectedValue(new Error("Torii rejected transfer"));
    const wrapper = mountView();
    await flushPromises();

    const before = JSON.parse(JSON.stringify(useOfflineStore().wallet));
    const moveSection = getMoveSection(wrapper);
    await moveSection.findAll('input[type="text"]')[0].setValue("10");
    await moveSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(transferAssetMock).toHaveBeenCalledOnce();
    expect(useOfflineStore().wallet).toEqual(before);
    expect(moveSection.text()).toContain("Torii rejected transfer");
  });

  it("isolates a corrected asset from the stale offline balance bucket", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "61CtjvNd9T3THAR65GsMVHr82Bjc",
      block_height: 1,
      current_mode: "Convertible",
      effective_mode: "Convertible",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    transferAssetMock.mockResolvedValue(finalizedTransfer("d".repeat(64)));
    const wrapper = mountView("5OldBucket1111111111111111111");
    const session = useSessionStore();
    await flushPromises();

    expect(session.connection.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );
    expect(useOfflineStore().balance).toBe("0");
    expect(useOfflineStore().persistenceScope?.assetDefinitionId).toBe(
      "61CtjvNd9T3THAR65GsMVHr82Bjc",
    );

    const moveSection = getMoveSection(wrapper);
    const amountInput = moveSection.findAll('input[type="text"]')[0];
    const submitButton = moveSection.get(".actions button");

    await amountInput.setValue("4");
    await submitButton.trigger("click");
    await flushPromises();

    expect(transferAssetMock).not.toHaveBeenCalled();
    expect(moveSection.text()).toContain(
      "Insufficient offline balance for this withdrawal.",
    );
  });

  it("disables the unshield move when policy mode is unsupported", async () => {
    getConfidentialAssetPolicyMock.mockResolvedValue({
      asset_id: "norito:abcdef0123456789",
      block_height: 1,
      current_mode: "TransparentOnly",
      effective_mode: "TransparentOnly",
      allow_shield: true,
      allow_unshield: true,
      vk_transfer: "halo2/ipa::vk_transfer",
      vk_unshield: "halo2/ipa::vk_unshield",
      vk_shield: "halo2/ipa::vk_shield",
      vk_set_hash: null,
      poseidon_params_id: null,
      pedersen_params_id: null,
      pending_transition: null,
    });
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    expect(
      moveSection.get(".actions button").attributes("disabled"),
    ).toBeDefined();
    expect(moveSection.text()).toContain(
      t("{operation} is unavailable: effective policy mode is {mode}.", {
        operation: "Unshield",
        mode: "TransparentOnly",
      }),
    );
  });

  it("states that online moves are always self-only and memo-free", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    expect(moveSection.text()).toContain(
      t(
        "Offline moves are self-only unshield operations and never publish a memo.",
      ),
    );
    expect(moveSection.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it("fails closed when the unshield policy check fails", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error("service unavailable"),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    expect(
      moveSection.get(".actions button").attributes("disabled"),
    ).toBeDefined();
    expect(moveSection.text()).toContain(
      t(
        "{operation} is unavailable because its policy could not be verified: {message}.",
        { operation: "Unshield", message: "service unavailable" },
      ),
    );
  });

  it("disables unshield when the configured asset definition is missing", async () => {
    getConfidentialAssetPolicyMock.mockRejectedValue(
      new Error(
        "Confidential asset policy request failed with status 404 (Not Found)",
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    expect(
      moveSection.get(".actions button").attributes("disabled"),
    ).toBeDefined();
    expect(moveSection.text()).toContain(
      t("{operation} is unavailable for the current asset definition.", {
        operation: "Unshield",
      }),
    );
  });

  it("disables online move submit for non-integer unshield amount", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const amountInput = moveSection.findAll('input[type="text"]')[0];
    const submitButton = moveSection.get(".actions button");

    await amountInput.setValue("10.5");

    expect(submitButton.attributes("disabled")).toBeDefined();
  });

  it("does not allow replacing the self-only online destination", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(ONLINE_DESTINATION_SELECTOR);

    expect((receiverInput.element as HTMLInputElement).value).toBe(
      ALICE_I105_ACCOUNT_ID,
    );
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(true);
  });

  it("keeps the self-only destination fixed and disabled", async () => {
    const wrapper = mountView();
    await flushPromises();

    const moveSection = getMoveSection(wrapper);
    const receiverInput = moveSection.get(ONLINE_DESTINATION_SELECTOR);

    expect((receiverInput.element as HTMLInputElement).value).toBe(
      ALICE_I105_ACCOUNT_ID,
    );
    expect((receiverInput.element as HTMLInputElement).disabled).toBe(true);
  });

  it("rejects offline invoices for a different asset", async () => {
    const wrapper = mountView();
    await flushPromises();

    const paymentSection = getSection(wrapper, t("Create payment"));
    await paymentSection.get("textarea").setValue(
      JSON.stringify({
        invoice_id: "inv-1",
        receiver: "merchant@wonderland",
        asset: "xor#wonderland",
        amount: "5",
        created_at_ms: Date.now(),
        expires_at_ms: Date.now() + 60_000,
      }),
    );

    await paymentSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(paymentSection.text()).toContain(
      t("Invoice asset does not match the active offline asset."),
    );
    expect(transferAssetMock).not.toHaveBeenCalled();
  });

  it("shows humanized norito labels in offline payload previews", async () => {
    const wrapper = mountView();
    await flushPromises();

    const requestSection = getSection(wrapper, t("Request offline payment"));
    await requestSection.get('input[type="text"]').setValue("5");
    await requestSection.get(".icon-cta").trigger("click");
    await flushPromises();

    expect(requestSection.text()).toContain(
      formatAssetDefinitionLabel("norito:abcdef0123456789"),
    );
    expect(requestSection.text()).not.toContain("norito:abcdef0123456789");
  });

  it("rejects offline payments for a different asset", async () => {
    const wrapper = mountView();
    await flushPromises();

    const acceptSection = getSection(wrapper, t("Accept offline payment"));
    await acceptSection.get("textarea").setValue(
      JSON.stringify({
        tx_id: "tx-1",
        from: "merchant@wonderland",
        to: "alice@wonderland",
        asset: "xor#wonderland",
        amount: "5",
        invoice_id: "inv-1",
        counter: 0,
        timestamp_ms: Date.now(),
        channel: "qr",
      }),
    );

    await acceptSection.get(".actions button").trigger("click");
    await flushPromises();

    expect(acceptSection.text()).toContain(
      t("Payment asset does not match the active offline asset."),
    );
  });

  it("shows one active workflow and removes numbered task headings", async () => {
    const wrapper = mountView();
    await flushPromises();

    const modeSections = wrapper.findAll(
      'section[data-testid^="offline-mode-"]',
    );
    expect(modeSections).toHaveLength(5);
    expect(
      modeSections
        .filter((section) => section.isVisible())
        .map((section) => section.attributes("data-testid")),
    ).toEqual(["offline-mode-request"]);
    expect(
      wrapper
        .findAll("h2")
        .map((heading) => heading.text())
        .some((title) => /^[1-5]\./u.test(title)),
    ).toBe(false);
    expect(
      wrapper
        .findAll('[data-testid="offline-primary-action"]')
        .filter((button) => button.isVisible()),
    ).toHaveLength(1);

    const payMode = wrapper
      .findAll(".ui-segmented-option")
      .find((button) => button.text() === t("Create payment"));
    expect(payMode).toBeDefined();
    await payMode?.trigger("click");

    expect(
      wrapper.get('[data-testid="offline-mode-pay"]').attributes("style") ?? "",
    ).not.toContain("display: none");
    expect(
      wrapper
        .findAll('[data-testid="offline-primary-action"]')
        .filter((button) => button.isVisible()),
    ).toHaveLength(1);
  });

  it("opens readiness first for an unfunded offline wallet", async () => {
    const wrapper = mountView(undefined, "0");
    await flushPromises();

    expect(
      wrapper.get('[data-testid="offline-mode-setup"]').attributes("style") ??
        "",
    ).not.toContain("display: none");
    expect(
      wrapper
        .findAll('[data-testid="offline-primary-action"]')
        .filter((button) => button.isVisible()),
    ).toHaveLength(1);
  });

  it("keeps diagnostics and history collapsed by default", async () => {
    const wrapper = mountView();
    await flushPromises();

    const disclosures = wrapper.findAll(".offline-disclosures details");
    expect(disclosures).toHaveLength(2);
    expect(disclosures.map((details) => details.attributes("open"))).toEqual([
      undefined,
      undefined,
    ]);
    expect(disclosures.map((details) => details.get("summary").text())).toEqual(
      [t("Diagnostics"), t("Offline history")],
    );
  });

  it("opens invoice scanning in the shared sheet and stops it on mode change", async () => {
    const wrapper = mountView();
    await flushPromises();

    const payMode = wrapper
      .findAll(".ui-segmented-option")
      .find((button) => button.text() === t("Create payment"));
    await payMode?.trigger("click");
    const paySection = wrapper.get('[data-testid="offline-mode-pay"]');
    const scanButton = paySection
      .findAll("button")
      .find((button) => button.text() === t("Scan invoice"));
    expect(scanButton).toBeDefined();

    await scanButton?.trigger("click");
    await flushPromises();
    expect(qrScannerStartMock).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(".ui-scanner-sheet")).not.toBeNull();

    const requestMode = wrapper
      .findAll(".ui-segmented-option")
      .find((button) => button.text() === t("Request offline payment"));
    await requestMode?.trigger("click");
    expect(qrScannerStopMock).toHaveBeenCalled();
  });
});
